import { useEffect, useRef, useState } from "react";

import {
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";

import { db } from "../firebase/firebaseConfig";

const SERVIDORES = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302",
    },
    {
      urls: "stun:stun1.l.google.com:19302",
    },
  ],
};

export default function CamaraCelular() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const conexionRef = useRef(null);

  const [estado, setEstado] = useState(
    "Listo para conectar"
  );

  const [transmitiendo, setTransmitiendo] =
    useState(false);

  const parametros = new URLSearchParams(
    window.location.search
  );

  const sesionId = parametros.get(
    "camaraCelular"
  );

  const ownerUid = parametros.get(
    "owner"
  );

  function detener() {
    streamRef.current
      ?.getTracks()
      .forEach((track) => track.stop());

    conexionRef.current?.close();

    streamRef.current = null;
    conexionRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setTransmitiendo(false);

    setEstado("Transmisión detenida");
  }

  useEffect(() => {
    return () => {
      streamRef.current
        ?.getTracks()
        .forEach((track) => track.stop());

      conexionRef.current?.close();
    };
  }, []);

  async function iniciar() {
    if (!ownerUid || !sesionId) {
      setEstado(
        "Enlace de conexión inválido."
      );
      return;
    }

    if (
      !navigator.mediaDevices?.getUserMedia
    ) {
      setEstado(
        "El navegador no permite acceder a la cámara."
      );
      return;
    }

    try {
      setEstado(
        "Solicitando cámara trasera..."
      );

      const referencia = doc(
        db,
        "usuarios",
        ownerUid,
        "sesionesCamara",
        sesionId
      );

      const snapshot = await getDoc(
        referencia
      );

      if (!snapshot.exists()) {
        throw new Error(
          "La sesión no existe."
        );
      }

      const datos = snapshot.data();

      if (
        !datos.oferta ||
        Date.now() > Number(
          datos.venceEn || 0
        )
      ) {
        throw new Error(
          "La sesión ha expirado."
        );
      }

      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: false,

          video: {
            facingMode: {
              ideal: "environment",
            },

            width: {
              ideal: 1920,
            },

            height: {
              ideal: 1080,
            },
          },
        });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject =
          stream;

        await videoRef.current.play();
      }

      const pc = new RTCPeerConnection(
        SERVIDORES
      );

      conexionRef.current = pc;

      stream
        .getTracks()
        .forEach((track) => {
          pc.addTrack(track, stream);
        });

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "connected"
        ) {
          setEstado(
            "🔴 Transmitiendo a POS Init"
          );
        }

        if (
          pc.connectionState === "disconnected"
        ) {
          setEstado(
            "Conexión interrumpida"
          );
        }

        if (
          pc.connectionState === "failed"
        ) {
          setEstado(
            "Falló la conexión por internet"
          );
        }
      };

      await pc.setRemoteDescription(
        new RTCSessionDescription(
          datos.oferta
        )
      );

      const respuesta =
        await pc.createAnswer();

      await pc.setLocalDescription(
        respuesta
      );

      await new Promise((resolver) => {
        if (
          pc.iceGatheringState ===
          "complete"
        ) {
          resolver();
          return;
        }

        const timeout = setTimeout(
          resolver,
          8000
        );

        pc.addEventListener(
          "icegatheringstatechange",
          () => {
            if (
              pc.iceGatheringState ===
              "complete"
            ) {
              clearTimeout(timeout);
              resolver();
            }
          }
        );
      });

      await updateDoc(referencia, {
        respuesta: {
          type:
            pc.localDescription.type,

          sdp:
            pc.localDescription.sdp,
        },

        estado: "conectando",
      });

      setTransmitiendo(true);

      setEstado(
        "Conectando con la computadora..."
      );
    } catch (error) {
      console.error(
        "POS Init - Cámara celular:",
        error
      );

      detener();

      setEstado(
        `Error: ${error.message}`
      );
    }
  }

  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh",
        overflow: "hidden",
        background: "#020817",
        color: "#fff",
        fontFamily:
          "Arial, sans-serif",
        zIndex: 99999,
      }}
    >
      {/* VIDEO A PANTALLA COMPLETA */}

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          background: "#000",
        }}
      />

      {/* SOMBRA SUPERIOR */}

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 160,
          background:
            "linear-gradient(to bottom, rgba(0,0,0,.85), transparent)",
          pointerEvents: "none",
        }}
      />

      {/* ENCABEZADO */}

      <header
        style={{
          position: "absolute",
          top: "max(18px, env(safe-area-inset-top))",
          left: 18,
          right: 18,
          display: "flex",
          justifyContent:
            "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div>
          <strong
            style={{
              fontSize: 22,
              fontWeight: 900,
            }}
          >
            📱 POS Init
          </strong>

          <div
            style={{
              fontSize: 12,
              opacity: 0.8,
              marginTop: 4,
            }}
          >
            Escáner inalámbrico
          </div>
        </div>

        <span
          style={{
            padding: "8px 12px",
            borderRadius: 30,
            background:
              transmitiendo
                ? "rgba(16,185,129,.9)"
                : "rgba(30,41,59,.9)",
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          {transmitiendo
            ? "● ACTIVA"
            : "○ SIN CONECTAR"}
        </span>
      </header>

      {/* GUÍA PARA ESCANEAR */}

      <div
        style={{
          position: "absolute",
          left: "8%",
          right: "8%",
          top: "50%",
          transform:
            "translateY(-50%)",
          height: 170,
          border:
            "2px solid #22d3ee",
          borderRadius: 22,
          boxShadow:
            "0 0 0 999px rgba(0,0,0,.12)",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "8%",
            right: "8%",
            top: "50%",
            height: 2,
            background: "#22d3ee",
            boxShadow:
              "0 0 16px #22d3ee",
          }}
        />
      </div>

      {/* INDICACIÓN */}

      <div
        style={{
          position: "absolute",
          top: "calc(50% + 110px)",
          left: 20,
          right: 20,
          textAlign: "center",
          fontSize: 14,
          fontWeight: 700,
          textShadow:
            "0 2px 8px #000",
          pointerEvents: "none",
        }}
      >
        Coloca el código de barras
        dentro del recuadro
      </div>

      {/* PANEL INFERIOR */}

      <footer
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding:
            "24px 20px max(28px, env(safe-area-inset-bottom))",
          background:
            "linear-gradient(to top, rgba(0,0,0,.95), rgba(0,0,0,.3))",
        }}
      >
        <p
          role="status"
          style={{
            textAlign: "center",
            fontSize: 14,
            marginBottom: 16,
          }}
        >
          {estado}
        </p>

        {!transmitiendo ? (
          <button
            type="button"
            onClick={iniciar}
            style={{
              width: "100%",
              padding: 17,
              background:
                "linear-gradient(135deg, #06b6d4, #2563eb)",
              color: "#fff",
              border: "none",
              borderRadius: 16,
              fontSize: 17,
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            📷 Iniciar cámara
          </button>
        ) : (
          <button
            type="button"
            onClick={detener}
            style={{
              width: "100%",
              padding: 17,
              background: "#dc2626",
              color: "#fff",
              border: "none",
              borderRadius: 16,
              fontSize: 17,
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            ⏹ Detener transmisión
          </button>
        )}
      </footer>
    </main>
  );
}