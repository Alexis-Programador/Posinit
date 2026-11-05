import { useEffect, useRef, useState } from "react";

import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "../firebase/firebaseConfig";
import { QRCodeSVG } from "qrcode.react";

const SERVIDORES = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export default function CamaraRemota({
  ownerUid,
  onStream,
  onCodigo,
  onCerrar,
}) {
  const conexionRef = useRef(null);
  const cancelarRef = useRef(null);
  const sesionRef = useRef(null);
  const onStreamRef = useRef(onStream);
  const onCodigoRef = useRef(onCodigo);
  const operacionRef = useRef(0);
  const streamPendienteRef = useRef(null);

  const [url, setUrl] = useState("");
  const [estado, setEstado] = useState("Sin conectar");
  const [sesionId, setSesionId] = useState("");
  const [conectado, setConectado] = useState(false);
  const [generando, setGenerando] = useState(false);

  onStreamRef.current = onStream;
  onCodigoRef.current = onCodigo;

  async function desconectar() {
    operacionRef.current += 1;

    cancelarRef.current?.();
    cancelarRef.current = null;

    conexionRef.current?.close();
    conexionRef.current = null;

    streamPendienteRef.current = null;
    onStreamRef.current?.(null);

    const referencia = sesionRef.current;
    sesionRef.current = null;

    setSesionId("");
    setUrl("");
    setConectado(false);
    setGenerando(false);
    setEstado("Desconectado");

    if (referencia) {
      try {
        await deleteDoc(referencia);
      } catch (error) {
        console.warn(
          "POS Init - No se pudo eliminar la sesión:",
          error
        );
      }
    }
  }

  useEffect(() => {
    return () => {
      operacionRef.current += 1;

      cancelarRef.current?.();
      conexionRef.current?.close();

      onStreamRef.current?.(null);
    };
  }, []);

  async function conectar() {
    if (!ownerUid) {
      setEstado("No se identificó el negocio.");
      return;
    }

    if (!window.RTCPeerConnection) {
      setEstado(
        "Este navegador no admite conexiones WebRTC."
      );
      return;
    }

    if (generando) return;

    setGenerando(true);

    await desconectar();

    const operacion = ++operacionRef.current;

    try {
      setGenerando(true);
      setEstado("Creando conexión...");

      const referencia = doc(
        collection(
          db,
          "usuarios",
          ownerUid,
          "sesionesCamara"
        )
      );

      sesionRef.current = referencia;

      const pc = new RTCPeerConnection(SERVIDORES);
      conexionRef.current = pc;

      const canalCodigos = pc.createDataChannel("pos-init-codigos", { ordered: true });
      canalCodigos.onmessage = (evento) => {
        if (operacion !== operacionRef.current) return;
        try {
          const mensaje = JSON.parse(evento.data);
          if (mensaje?.tipo !== "codigo") return;
          const codigo = String(mensaje.codigo ?? "").trim();
          if (codigo && codigo.length <= 128) onCodigoRef.current?.(codigo);
        } catch (error) {
          console.warn("POS Init - Mensaje de escáner inválido:", error);
        }
      };

      pc.addTransceiver("video", {
        direction: "recvonly",
      });

      pc.ontrack = (evento) => {
        if (operacion !== operacionRef.current) return;

        const stream =
          evento.streams?.[0] ||
          new MediaStream([evento.track]);

        streamPendienteRef.current = stream;

        if (pc.connectionState === "connected") {
          onStreamRef.current?.(stream);
        }
      };

      pc.onconnectionstatechange = () => {
        if (operacion !== operacionRef.current) return;

        if (pc.connectionState === "connected") {
          setConectado(true);

          if (streamPendienteRef.current) {
            onStreamRef.current?.(
              streamPendienteRef.current
            );
          }

          setEstado("📱 Celular conectado");
        }

        if (
          pc.connectionState === "disconnected" ||
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          setConectado(false);
          streamPendienteRef.current = null;
          onStreamRef.current?.(null);

          setEstado(
            pc.connectionState === "failed"
              ? "Falló la conexión con el celular."
              : "Celular desconectado."
          );
        }
      };

      const oferta = await pc.createOffer();
      await pc.setLocalDescription(oferta);

      await new Promise((resolver) => {
        if (pc.iceGatheringState === "complete") {
          resolver();
          return;
        }

        const timeout = setTimeout(resolver, 8000);

        pc.addEventListener(
          "icegatheringstatechange",
          () => {
            if (pc.iceGatheringState === "complete") {
              clearTimeout(timeout);
              resolver();
            }
          }
        );
      });

      if (operacion !== operacionRef.current) return;

      await setDoc(referencia, {
        ownerUid,
        estado: "esperando",
        oferta: {
          type: pc.localDescription.type,
          sdp: pc.localDescription.sdp,
        },
        respuesta: null,
        creadoEn: serverTimestamp(),
        venceEn: Date.now() + 5 * 60 * 1000,
      });

      if (operacion !== operacionRef.current) return;

      cancelarRef.current = onSnapshot(
        referencia,
        async (snapshot) => {
          if (
            operacion !== operacionRef.current ||
            !snapshot.exists()
          ) {
            return;
          }

          const datos = snapshot.data();

          if (
            datos.respuesta &&
            !pc.currentRemoteDescription
          ) {
            try {
              await pc.setRemoteDescription(
                new RTCSessionDescription(
                  datos.respuesta
                )
              );

              if (operacion === operacionRef.current) {
                setEstado("Conectando video...");
              }
            } catch (error) {
              if (operacion === operacionRef.current) {
                setEstado(
                  `Error WebRTC: ${error.message}`
                );
              }
            }
          }
        },
        (error) => {
          if (operacion === operacionRef.current) {
            setEstado(
              `Error de sesión: ${error.message}`
            );
          }
        }
      );

      const destino = new URL(window.location.href);

      destino.search = "";
      destino.hash = "";

      destino.searchParams.set(
        "camaraCelular",
        referencia.id
      );

      destino.searchParams.set("owner", ownerUid);

      setSesionId(referencia.id);
      setUrl(destino.toString());
      setEstado("Escanea el QR para conectar el celular.");
    } catch (error) {
      if (operacion === operacionRef.current) {
        console.error(
          "POS Init - Conexión remota:",
          error
        );

        setEstado(`Error: ${error.message}`);
      }
    } finally {
      if (operacion === operacionRef.current) {
        setGenerando(false);
      }
    }
  }

  async function copiarEnlace() {
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      setEstado("Enlace copiado correctamente.");
    } catch {
      setEstado(
        "No se pudo copiar el enlace. Selecciónalo manualmente."
      );
    }
  }

  const boton = {
    padding: "12px 16px",
    borderRadius: 12,
    border: "none",
    fontWeight: 800,
    cursor: "pointer",
    fontSize: 14,
  };

  return (
    <section
      style={{
        width: "100%",
        boxSizing: "border-box",
        color: "#172033",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          padding: 20,
          borderRadius: 18,
          background: "#ffffff",
          border: "1px solid #dce5ef",
        }}
      >
        <h2
          style={{
            margin: "0 0 10px",
            color: "#10243b",
            fontSize: 22,
          }}
        >
          📱 Conectar cámara del celular
        </h2>

        <p
          style={{
            color: "#475569",
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          Utiliza la cámara trasera de tu celular
          para escanear productos directamente en POS Init.
        </p>

        <button
          type="button"
          onClick={conectar}
          disabled={generando}
          style={{
            ...boton,
            width: "100%",
            color: "#ffffff",
            background: "#2563eb",
            opacity: generando ? 0.6 : 1,
          }}
        >
          {generando
            ? "⏳ Generando conexión..."
            : "📷 Generar conexión"}
        </button>

        {url && (
          <div
            style={{
              marginTop: 18,
              padding: 16,
              borderRadius: 16,
              background: "#f1f5f9",
              border: "1px solid #cbd5e1",
              textAlign: "center",
            }}
          >
            <h3
              style={{
                margin: "0 0 12px",
                color: "#0f172a",
                fontSize: 16,
              }}
            >
              📲 Escanear código QR
            </h3>

            <div
              style={{
                display: "inline-flex",
                padding: 14,
                background: "#ffffff",
                borderRadius: 14,
              }}
            >
              <QRCodeSVG
                value={url}
                size={190}
                level="M"
                includeMargin
              />
            </div>

            <p
              style={{
                color: "#475569",
                fontSize: 13,
              }}
            >
              Escanea el QR con tu celular
              para abrir la cámara de POS Init.
            </p>


          </div>
        )}

        <div
          style={{
            marginTop: 18,
            padding: 14,
            borderRadius: 12,
            background: conectado
              ? "#dcfce7"
              : "#eff6ff",
            border: conectado
              ? "1px solid #86efac"
              : "1px solid #bfdbfe",
            color: conectado
              ? "#166534"
              : "#1e40af",
            fontWeight: 700,
            fontSize: 13,
          }}
          role="status"
        >
          {conectado ? "🟢 " : "🔵 "}
          {estado}
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 16,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={desconectar}
            style={{
              ...boton,
              flex: 1,
              background: "#fee2e2",
              color: "#991b1b",
            }}
          >
            ⏹ Desconectar
          </button>

        </div>
      </div>

    </section>
  );
}
