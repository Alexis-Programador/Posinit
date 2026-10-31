import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

const SERVIDORES = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export default function CamaraCelular() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const conexionRef = useRef(null);
  const canalRef = useRef(null);
  const controlesRef = useRef(null);

  const ultimoRef = useRef({
    codigo: "",
    fecha: 0,
  });

  const [ultimoCodigo, setUltimoCodigo] = useState("");
  const [estado, setEstado] = useState("Listo para conectar");
  const [transmitiendo, setTransmitiendo] = useState(false);
  const [iniciando, setIniciando] = useState(false);

  const parametros = new URLSearchParams(window.location.search);
  const sesionId = parametros.get("camaraCelular");
  const ownerUid = parametros.get("owner");

  function detener() {
    controlesRef.current?.stop();
    controlesRef.current = null;

    canalRef.current = null;

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
    setIniciando(false);
    setEstado("Transmisión detenida");
  }

  useEffect(() => {
    return () => {
      controlesRef.current?.stop();

      streamRef.current
        ?.getTracks()
        .forEach((track) => track.stop());

      conexionRef.current?.close();
    };
  }, []);

  async function iniciar() {
    if (iniciando || transmitiendo) return;

    if (!ownerUid || !sesionId) {
      setEstado("Enlace de conexión inválido.");
      return;
    }

    if (
      !navigator.mediaDevices?.getUserMedia ||
      !window.RTCPeerConnection
    ) {
      setEstado("El navegador no admite la cámara o WebRTC.");
      return;
    }

    setIniciando(true);

    try {
      detener();
      setIniciando(true);
      setEstado("Solicitando cámara trasera...");

      const referencia = doc(
        db,
        "usuarios",
        ownerUid,
        "sesionesCamara",
        sesionId
      );

      const snapshot = await getDoc(referencia);

      if (!snapshot.exists()) {
        throw new Error(
          "La sesión no existe o no tienes permiso."
        );
      }

      const datos = snapshot.data();

      if (
        !datos.oferta ||
        Date.now() > Number(datos.venceEn || 0)
      ) {
        throw new Error("La sesión ha expirado.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const pc = new RTCPeerConnection(SERVIDORES);
      conexionRef.current = pc;

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      pc.ondatachannel = (evento) => {
        if (evento.channel.label === "pos-init-codigos") {
          canalRef.current = evento.channel;
        }
      };

      pc.onconnectionstatechange = () => {
        if (conexionRef.current !== pc) return;

        if (pc.connectionState === "connected") {
          setTransmitiendo(true);
          setEstado("🔴 Transmitiendo a POS Init");
        } else if (
          pc.connectionState === "failed" ||
          pc.connectionState === "disconnected"
        ) {
          setTransmitiendo(false);
          setEstado(
            "Conexión interrumpida. Revisa la computadora."
          );
        }
      };

      await pc.setRemoteDescription(
        new RTCSessionDescription(datos.oferta)
      );

      const respuesta = await pc.createAnswer();
      await pc.setLocalDescription(respuesta);

      await new Promise((resolve) => {
        if (pc.iceGatheringState === "complete") {
          resolve();
          return;
        }

        const timeout = setTimeout(resolve, 8000);

        pc.addEventListener(
          "icegatheringstatechange",
          () => {
            if (pc.iceGatheringState === "complete") {
              clearTimeout(timeout);
              resolve();
            }
          }
        );
      });

      await updateDoc(referencia, {
        respuesta: {
          type: pc.localDescription.type,
          sdp: pc.localDescription.sdp,
        },
        estado: "conectando",
      });

      setEstado("Conectando con la computadora...");

      // Leer directamente desde el celular,
      // sin depender de la imagen comprimida de WebRTC.
      const hints = new Map();

      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.ITF,
      ]);

      hints.set(DecodeHintType.TRY_HARDER, true);

      const lector = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 180,
        delayBetweenScanSuccess: 800,
      });

      const controles = await lector.decodeFromVideoElement(
        videoRef.current,
        (resultado) => {
          if (!resultado || conexionRef.current !== pc) return;

          const codigo = String(resultado.getText() || "")
            .replace(/\s+/g, "")
            .trim();

          if (!codigo) return;

          const ahora = Date.now();

          if (
            ultimoRef.current.codigo === codigo &&
            ahora - ultimoRef.current.fecha < 1800
          ) {
            return;
          }

          if (canalRef.current?.readyState !== "open") {
            return;
          }

          ultimoRef.current = {
            codigo,
            fecha: ahora,
          };

          canalRef.current.send(
            JSON.stringify({
              tipo: "codigo",
              codigo,
            })
          );

          setUltimoCodigo(codigo);

          navigator.vibrate?.(70);
        }
      );

      if (conexionRef.current === pc) {
        controlesRef.current = controles;
      } else {
        controles.stop();
      }
    } catch (error) {
      detener();
      setEstado(`Error: ${error.message}`);
    } finally {
      setIniciando(false);
    }
  }

  const boton = {
    width: "100%",
    padding: 17,
    color: "#fff",
    border: "none",
    borderRadius: 16,
    fontSize: 17,
    fontWeight: 900,
    cursor: "pointer",
  };

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
        fontFamily: "Arial, sans-serif",
        zIndex: 99999,
      }}
    >
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

      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to bottom, #0009, transparent 30%, transparent 70%, #000c)",
          pointerEvents: "none",
        }}
      />

      <header
        style={{
          position: "absolute",
          top: "max(20px, env(safe-area-inset-top))",
          left: 20,
          right: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <strong style={{ fontSize: 22 }}>
            📱 POS Init
          </strong>

          <div style={{ fontSize: 12 }}>
            Escáner inalámbrico
          </div>
        </div>

        <span
          style={{
            padding: "8px 12px",
            borderRadius: 30,
            background: transmitiendo ? "#059669" : "#334155",
          }}
        >
          {transmitiendo ? "● ACTIVA" : "○ SIN CONECTAR"}
        </span>
      </header>

      <div
        style={{
          position: "absolute",
          left: "8%",
          right: "8%",
          top: "50%",
          transform: "translateY(-50%)",
          height: 170,
          border: "2px solid #22d3ee",
          borderRadius: 22,
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
            boxShadow: "0 0 16px #22d3ee",
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          top: "calc(50% + 110px)",
          left: 20,
          right: 20,
          textAlign: "center",
          textShadow: "0 2px 8px #000",
        }}
      >
        Coloca el código de barras dentro del recuadro
      </div>

      <footer
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding:
            "24px 20px max(28px, env(safe-area-inset-bottom))",
          background:
            "linear-gradient(to top, #000e, transparent)",
        }}
      >
        <p
          role="status"
          style={{
            textAlign: "center",
          }}
        >
          {estado}

          {ultimoCodigo
            ? ` · Último código: ${ultimoCodigo}`
            : ""}
        </p>

        {!transmitiendo ? (
          <button
            type="button"
            onClick={iniciar}
            disabled={iniciando}
            style={{
              ...boton,
              background: "#2563eb",
              opacity: iniciando ? 0.6 : 1,
            }}
          >
            {iniciando
              ? "⏳ Conectando..."
              : "📷 Iniciar cámara"}
          </button>
        ) : (
          <button
            type="button"
            onClick={detener}
            style={{
              ...boton,
              background: "#dc2626",
            }}
          >
            ⏹ Detener transmisión
          </button>
        )}
      </footer>
    </main>
  );
}