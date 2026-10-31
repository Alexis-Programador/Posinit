
import { useEffect, useRef, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
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
  onCerrar,
}) {
  const conexionRef = useRef(null);
  const cancelarRef = useRef(null);
  const sesionRef = useRef(null);
  const onStreamRef = useRef(onStream);

  const [url, setUrl] = useState("");
  const [estado, setEstado] = useState("Sin conectar");
  const [sesionId, setSesionId] = useState("");

  onStreamRef.current = onStream;

  async function desconectar() {
    cancelarRef.current?.();
    cancelarRef.current = null;

    conexionRef.current?.close();
    conexionRef.current = null;

    onStreamRef.current?.(null);

    const referencia = sesionRef.current;
    sesionRef.current = null;

    if (referencia) {
      try {
        await deleteDoc(referencia);
      } catch (error) {
        console.warn("No se pudo eliminar la sesión:", error);
      }
    }

    setSesionId("");
    setUrl("");
    setEstado("Desconectado");
  }

  useEffect(() => {
    return () => {
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

    await desconectar();

    try {
      setEstado("Creando conexión...");

      const referencia = doc(
        collection(db, "usuarios", ownerUid, "sesionesCamara")
      );

      sesionRef.current = referencia;

      const pc = new RTCPeerConnection(SERVIDORES);
      conexionRef.current = pc;

      pc.addTransceiver("video", {
        direction: "recvonly",
      });

      pc.ontrack = (evento) => {
        const stream =
          evento.streams?.[0] ||
          new MediaStream([evento.track]);

        onStreamRef.current?.(stream);
        setEstado("📱 Cámara conectada");
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          setEstado("No se pudo establecer la conexión.");
        } else if (pc.connectionState === "disconnected") {
          setEstado("Celular desconectado");
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

      cancelarRef.current = onSnapshot(
        referencia,
        async (snapshot) => {
          if (!snapshot.exists()) return;

          const datos = snapshot.data();

          if (
            datos.respuesta &&
            !pc.currentRemoteDescription
          ) {
            try {
              await pc.setRemoteDescription(
                new RTCSessionDescription(datos.respuesta)
              );
              setEstado("Conectando video...");
            } catch (error) {
              setEstado(`Error WebRTC: ${error.message}`);
            }
          }
        }
      );

      const destino = new URL(window.location.href);
      destino.search = "";
      destino.hash = "";
      destino.searchParams.set("camaraCelular", referencia.id);
      destino.searchParams.set("owner", ownerUid);

      setSesionId(referencia.id);
      setUrl(destino.toString());
      setEstado("Escanea el QR con el celular");
    } catch (error) {
      setEstado(`Error: ${error.message}`);
    }
  }

  return (
    <div style={{ padding: 18 }}>
      <h2>📱 Conectar celular por internet</h2>

      <p>
        El celular transmitirá video a POS Init
        para escanear códigos desde la computadora.
      </p>

      <button type="button" onClick={conectar}>
        Generar conexión
      </button>

      {url && (
        <div style={{ marginTop: 18 }}>
          <QRCodeSVG value={url} size={190} />

          <p>
            Abre este código QR con el celular.
          </p>

          <input
            readOnly
            value={url}
            style={{ width: "100%", padding: 8 }}
          />

          <p>Sesión: {sesionId}</p>
        </div>
      )}

      <p role="status">{estado}</p>

      <button type="button" onClick={desconectar}>
        Desconectar
      </button>

      {onCerrar && (
        <button type="button" onClick={onCerrar}>
          Cerrar
        </button>
      )}
    </div>
  );
}
