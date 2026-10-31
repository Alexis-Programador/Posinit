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

    setSesionId("");
    setUrl("");
    setEstado("Desconectado");

    if (referencia) {
      try {
        await deleteDoc(referencia);
      } catch (error) {
        console.warn(
          "No se pudo eliminar la sesión:",
          error
        );
      }
    }
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

    if (!window.RTCPeerConnection) {
      setEstado(
        "Este navegador no admite conexiones WebRTC."
      );
      return;
    }

    await desconectar();

    try {
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

      pc.addTransceiver("video", {
        direction: "recvonly",
      });

      pc.ontrack = (evento) => {
        const stream =
          evento.streams?.[0] ||
          new MediaStream([evento.track]);

        onStreamRef.current?.(stream);

        setEstado("📱 Cámara del celular conectada");
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setEstado("📱 Celular conectado");
        }

        if (
          pc.connectionState === "disconnected" ||
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          onStreamRef.current?.(null);

          setEstado(
            pc.connectionState === "failed"
              ? "Falló la conexión con el celular"
              : "Celular desconectado"
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
                new RTCSessionDescription(
                  datos.respuesta
                )
              );

              setEstado("Conectando video...");
            } catch (error) {
              setEstado(
                `Error WebRTC: ${error.message}`
              );
            }
          }
        },
        (error) => {
          setEstado(
            `Error de sesión: ${error.message}`
          );
        }
      );

      const destino = new URL(window.location.href);

      destino.search = "";
      destino.hash = "";

      destino.searchParams.set(
        "camaraCelular",
        referencia.id
      );

      destino.searchParams.set(
        "owner",
        ownerUid
      );

      setSesionId(referencia.id);
      setUrl(destino.toString());

      setEstado(
        "Conexión preparada. Abre el enlace en POS Init desde el celular."
      );
    } catch (error) {
      console.error(
        "POS Init - Conexión remota:",
        error
      );

      setEstado(
        `Error: ${error.message}`
      );
    }
  }

  async function copiarEnlace() {
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);

      setEstado(
        "Enlace copiado. Ábrelo en el celular."
      );
    } catch {
      setEstado(
        "No se pudo copiar el enlace."
      );
    }
  }

  return (
    <div
      style={{
        padding: 18,
        color: "#eaf4ff",
      }}
    >
      <h2>📱 Conectar cámara del celular</h2>

      <p>
        Utiliza la cámara trasera de tu celular
        para escanear productos directamente
        en POS Init.
      </p>

      <button
        type="button"
        onClick={conectar}
      >
        📱 Generar conexión
      </button>

      {url && (
        <div
          style={{
            marginTop: 18,
          }}
        >
          <p>
            Abre este enlace desde POS Init
            en tu celular:
          </p>

          <input
            readOnly
            value={url}
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 8,
            }}
          />

          <button
            type="button"
            onClick={copiarEnlace}
            style={{
              marginTop: 10,
            }}
          >
            📋 Copiar enlace
          </button>

          <p>
            Sesión: {sesionId}
          </p>
        </div>
      )}

      <p role="status">
        {estado}
      </p>

      <button
        type="button"
        onClick={desconectar}
      >
        ⏹ Desconectar celular
      </button>

      {onCerrar && (
        <button
          type="button"
          onClick={onCerrar}
        >
          Cerrar configuración
        </button>
      )}
    </div>
  );
}