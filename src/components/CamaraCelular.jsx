
import { useEffect, useRef, useState } from "react";
import {
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
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

  const [estado, setEstado] = useState("Listo para conectar");
  const [transmitiendo, setTransmitiendo] = useState(false);

  const parametros = new URLSearchParams(
    window.location.search
  );

  const sesionId = parametros.get("camaraCelular");
  const ownerUid = parametros.get("owner");

  function detener() {
    streamRef.current?.getTracks().forEach(
      (track) => track.stop()
    );

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
      streamRef.current?.getTracks().forEach(
        (track) => track.stop()
      );
      conexionRef.current?.close();
    };
  }, []);

  async function iniciar() {
    if (!ownerUid || !sesionId) {
      setEstado("Enlace de conexión inválido.");
      return;
    }

    try {
      setEstado("Solicitando cámara...");

      const referencia = doc(
        db,
        "usuarios",
        ownerUid,
        "sesionesCamara",
        sesionId
      );

      const snapshot = await getDoc(referencia);

      if (!snapshot.exists()) {
        throw new Error("La sesión no existe.");
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
          width: { ideal: 1280 },
          height: { ideal: 720 },
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

      await pc.setRemoteDescription(
        new RTCSessionDescription(datos.oferta)
      );

      const respuesta = await pc.createAnswer();
      await pc.setLocalDescription(respuesta);

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

      await updateDoc(referencia, {
        respuesta: {
          type: pc.localDescription.type,
          sdp: pc.localDescription.sdp,
        },
        estado: "conectando",
      });

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setEstado("🔴 Transmitiendo a POS Init");
        } else if (pc.connectionState === "failed") {
          setEstado("Falló la conexión por internet.");
        }
      };

      setTransmitiendo(true);
      setEstado("Conectando con la computadora...");
    } catch (error) {
      detener();
      setEstado(`Error: ${error.message}`);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#081526",
        color: "#fff",
        padding: 20,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1>📱 POS Init Cámara</h1>

      <p>
        Usa la cámara trasera de tu celular
        como escáner inalámbrico.
      </p>

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          width: "100%",
          maxHeight: 480,
          background: "#000",
          borderRadius: 14,
          objectFit: "cover",
        }}
      />

      <p role="status">{estado}</p>

      {!transmitiendo ? (
        <button type="button" onClick={iniciar}>
          📷 Iniciar transmisión
        </button>
      ) : (
        <button type="button" onClick={detener}>
          ⏹ Detener transmisión
        </button>
      )}
    </div>
  );
}
