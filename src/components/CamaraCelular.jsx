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

const limpiarCodigo = (valor) =>
  String(valor ?? "").replace(/\s+/g, "").trim();

export default function CamaraCelular() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const conexionRef = useRef(null);
  const canalRef = useRef(null);
  const controlesRef = useRef(null);
  const detectorRef = useRef(null);
  const temporizadorRef = useRef(null);

  const ultimoRef = useRef({ codigo: "", fecha: 0 });
  const iniciandoRef = useRef(false);

  const [estado, setEstado] = useState("Listo para conectar");
  const [transmitiendo, setTransmitiendo] = useState(false);
  const [iniciando, setIniciando] = useState(false);
  const [ultimoCodigo, setUltimoCodigo] = useState("");

  const [zoom, setZoom] = useState(1);
  const [zoomMax, setZoomMax] = useState(1);
  const [linterna, setLinterna] = useState(false);
  const [permiteLinterna, setPermiteLinterna] = useState(false);

  const [mostrarManual, setMostrarManual] = useState(false);
  const [codigoManual, setCodigoManual] = useState("");

  const parametros = new URLSearchParams(window.location.search);
  const sesionId = parametros.get("camaraCelular");
  const ownerUid = parametros.get("owner");

  function obtenerPista() {
    return streamRef.current?.getVideoTracks?.()[0] || null;
  }

  function detenerLectura() {
    controlesRef.current?.stop();
    controlesRef.current = null;

    detectorRef.current = null;

    if (temporizadorRef.current) {
      clearTimeout(temporizadorRef.current);
      temporizadorRef.current = null;
    }
  }

  function limpiarConexion() {
    detenerLectura();

    canalRef.current?.close();
    canalRef.current = null;

    conexionRef.current?.close();
    conexionRef.current = null;

    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });

    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  function detener() {
    limpiarConexion();

    setTransmitiendo(false);
    setIniciando(false);
    iniciandoRef.current = false;
    setLinterna(false);
    setZoom(1);
    setEstado("Transmisión detenida");
  }

  useEffect(() => {
    return () => {
      limpiarConexion();
    };
  }, []);

  function enviarCodigo(valor) {
    const codigo = limpiarCodigo(valor);

    if (!codigo) return false;

    const canal = canalRef.current;

    if (!canal || canal.readyState !== "open") {
      setEstado("Primero conecta el celular con POS Init.");
      return false;
    }

    const ahora = Date.now();

    if (
      ultimoRef.current.codigo === codigo &&
      ahora - ultimoRef.current.fecha < 1800
    ) {
      return false;
    }

    try {
      canal.send(
        JSON.stringify({
          tipo: "codigo",
          codigo,
        })
      );

      ultimoRef.current = {
        codigo,
        fecha: ahora,
      };

      setUltimoCodigo(codigo);
      setEstado(`✅ Código enviado: ${codigo}`);

      navigator.vibrate?.(80);

      return true;
    } catch (error) {
      setEstado(`No se pudo enviar: ${error.message}`);
      return false;
    }
  }

  async function cambiarZoom(valor) {
    const pista = obtenerPista();

    if (!pista) return;

    const capacidades = pista.getCapabilities?.();

    if (!capacidades?.zoom) {
      setEstado("Esta cámara no permite zoom desde el navegador.");
      return;
    }

    const minimo = capacidades.zoom.min ?? 1;
    const maximo = capacidades.zoom.max ?? 1;

    const nuevo = Math.max(
      minimo,
      Math.min(maximo, Number(valor))
    );

    try {
      await pista.applyConstraints({
        advanced: [{ zoom: nuevo }],
      });

      setZoom(nuevo);
    } catch (error) {
      setEstado(`No se pudo aplicar zoom: ${error.message}`);
    }
  }

  async function cambiarLinterna() {
    const pista = obtenerPista();

    if (!pista) return;

    const capacidades = pista.getCapabilities?.();

    if (!capacidades?.torch) {
      setEstado("La linterna no está disponible en esta cámara.");
      return;
    }

    try {
      const nuevoEstado = !linterna;

      await pista.applyConstraints({
        advanced: [{ torch: nuevoEstado }],
      });

      setLinterna(nuevoEstado);
    } catch (error) {
      setEstado(`Error de linterna: ${error.message}`);
    }
  }

  async function iniciarLector(video, pc) {
    const formatos = [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.ITF,
    ];

    // Utilizar BarcodeDetector nativo cuando esté disponible.
    if ("BarcodeDetector" in window) {
      try {
        const disponibles =
          await window.BarcodeDetector.getSupportedFormats();

        const formatosNativos = [
          "ean_13",
          "ean_8",
          "upc_a",
          "upc_e",
          "code_128",
          "code_39",
          "itf",
        ].filter((formato) => disponibles.includes(formato));

        if (formatosNativos.length > 0) {
          const detector = new window.BarcodeDetector({
            formats: formatosNativos,
          });

          detectorRef.current = detector;

          async function detectar() {
            if (
              conexionRef.current !== pc ||
              detectorRef.current !== detector
            ) {
              return;
            }

            try {
              if (
                video.readyState >= 2 &&
                video.videoWidth > 0
              ) {
                const resultados = await detector.detect(video);

                if (resultados.length > 0) {
                  enviarCodigo(resultados[0].rawValue);
                }
              }
            } catch {
              // Algunos fotogramas no pueden analizarse.
            }

            if (
              conexionRef.current === pc &&
              detectorRef.current === detector
            ) {
              temporizadorRef.current = setTimeout(
                detectar,
                130
              );
            }
          }

          detectar();
          return;
        }
      } catch {
        // Si falla BarcodeDetector, utilizamos ZXing.
      }
    }

    const hints = new Map();

    hints.set(DecodeHintType.POSSIBLE_FORMATS, formatos);
    hints.set(DecodeHintType.TRY_HARDER, true);

    const lector = new BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: 150,
      delayBetweenScanSuccess: 650,
    });

    const controles = await lector.decodeFromVideoElement(
      video,
      (resultado) => {
        if (
          resultado &&
          conexionRef.current === pc
        ) {
          enviarCodigo(resultado.getText());
        }
      }
    );

    if (conexionRef.current === pc) {
      controlesRef.current = controles;
    } else {
      controles.stop();
    }
  }

  async function iniciar() {
    if (iniciandoRef.current || transmitiendo) return;

    if (!ownerUid || !sesionId) {
      setEstado("El enlace de conexión no es válido.");
      return;
    }

    if (
      !navigator.mediaDevices?.getUserMedia ||
      !window.RTCPeerConnection
    ) {
      setEstado("Este navegador no admite cámara o WebRTC.");
      return;
    }

    iniciandoRef.current = true;
    setIniciando(true);

    try {
      limpiarConexion();

      setEstado("Conectando cámara trasera...");

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
        throw new Error("La sesión expiró. Genera otro QR.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
      });

      streamRef.current = stream;

      const pista = obtenerPista();
      const capacidades = pista?.getCapabilities?.() || {};

      setZoomMax(capacidades.zoom?.max ?? 1);
      setZoom(capacidades.zoom?.min ?? 1);
      setPermiteLinterna(Boolean(capacidades.torch));

      const video = videoRef.current;

      video.srcObject = stream;
      await video.play();

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
          setEstado("🟢 Conectado. Escanea un producto.");
        }

        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "disconnected"
        ) {
          setTransmitiendo(false);
          setEstado("Se perdió la conexión con POS Init.");
        }
      };

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

        const verificar = () => {
          if (pc.iceGatheringState === "complete") {
            clearTimeout(timeout);
            pc.removeEventListener(
              "icegatheringstatechange",
              verificar
            );
            resolver();
          }
        };

        pc.addEventListener(
          "icegatheringstatechange",
          verificar
        );
      });

      await updateDoc(referencia, {
        respuesta: {
          type: pc.localDescription.type,
          sdp: pc.localDescription.sdp,
        },
        estado: "conectando",
      });

      await iniciarLector(video, pc);

      setEstado("Esperando conexión con la computadora...");
    } catch (error) {
      limpiarConexion();
      setEstado(`Error: ${error.message}`);
    } finally {
      iniciandoRef.current = false;
      setIniciando(false);
    }
  }

  function buscarManual(evento) {
    evento.preventDefault();

    const codigo = limpiarCodigo(codigoManual);

    if (!codigo) return;

    if (enviarCodigo(codigo)) {
      setCodigoManual("");
      setMostrarManual(false);
    }
  }

  const boton = {
    minHeight: 56,
    padding: "12px 16px",
    borderRadius: 14,
    border: "1px solid #475569",
    color: "#fff",
    fontSize: 17,
    fontWeight: 800,
    cursor: "pointer",
    background: "#1e293b",
  };

  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        height: "100dvh",
        background: "#020617",
        color: "#fff",
        fontFamily: "Arial, sans-serif",
        overflow: "hidden",
        zIndex: 99999,
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          background: "#000",
        }}
      />

      {/* Encabezado */}
      <header
        style={{
          position: "absolute",
          top: "max(12px, env(safe-area-inset-top))",
          left: 12,
          right: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          padding: 12,
          borderRadius: 16,
          background: "#020617dd",
        }}
      >
        <div>
          <strong style={{ fontSize: 21 }}>
            📱 POS Init
          </strong>
          <div style={{ fontSize: 12 }}>
            Escáner de productos
          </div>
        </div>

        <span
          style={{
            background: transmitiendo ? "#166534" : "#475569",
            padding: "10px 12px",
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          {transmitiendo ? "● CONECTADO" : "○ SIN CONEXIÓN"}
        </span>
      </header>

      {/* Guía de lectura */}
      <div
        style={{
          position: "absolute",
          left: "5%",
          right: "5%",
          top: "42%",
          height: 120,
          transform: "translateY(-50%)",
          border: "3px solid #22d3ee",
          borderRadius: 18,
          boxShadow: "0 0 15px #22d3ee55",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "5%",
            right: "5%",
            height: 2,
            background: "#22d3ee",
          }}
        />
      </div>

      {/* Controles inferiores */}
      <footer
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding:
            "14px 14px max(16px, env(safe-area-inset-bottom))",
          background: "#020617ed",
          borderTop: "1px solid #334155",
          maxHeight: "54dvh",
          overflowY: "auto",
        }}
      >
        <div
          role="status"
          style={{
            fontSize: 13,
            textAlign: "center",
            marginBottom: 12,
            lineHeight: 1.5,
          }}
        >
          {estado}
          {ultimoCodigo && (
            <div>
              Último código: <strong>{ultimoCodigo}</strong>
            </div>
          )}
        </div>

        {/* Zoom */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 8,
            marginBottom: 10,
          }}
        >
          {[1, 2, 3, 4].map((valor) => (
            <button
              key={valor}
              type="button"
              disabled={!transmitiendo || zoomMax < valor}
              onClick={() => cambiarZoom(valor)}
              style={{
                ...boton,
                background:
                  Math.abs(zoom - valor) < 0.1
                    ? "#0369a1"
                    : "#1e293b",
                opacity:
                  !transmitiendo || zoomMax < valor
                    ? 0.45
                    : 1,
              }}
            >
              {valor}×
            </button>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
            marginBottom: 10,
          }}
        >
          <button
            type="button"
            style={boton}
            disabled={!transmitiendo}
            onClick={() => cambiarZoom(zoom - 0.5)}
          >
            ➖ Zoom
          </button>

          <button
            type="button"
            style={boton}
            disabled={!transmitiendo}
            onClick={() => cambiarZoom(zoom + 0.5)}
          >
            ➕ Zoom
          </button>

          <button
            type="button"
            style={{
              ...boton,
              background: linterna ? "#a16207" : "#1e293b",
            }}
            disabled={!transmitiendo || !permiteLinterna}
            onClick={cambiarLinterna}
          >
            💡 Luz
          </button>
        </div>

        <button
          type="button"
          onClick={() => setMostrarManual(!mostrarManual)}
          style={{
            ...boton,
            width: "100%",
            marginBottom: 10,
            background: "#0f766e",
          }}
        >
          🔢 Buscar producto por número
        </button>

        {mostrarManual && (
          <form
            onSubmit={buscarManual}
            style={{
              padding: 12,
              background: "#0f172a",
              borderRadius: 14,
              marginBottom: 10,
            }}
          >
            <input
              type="text"
              inputMode="numeric"
              value={codigoManual}
              onChange={(e) =>
                setCodigoManual(e.target.value)
              }
              placeholder="Ej. 7702111828827"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: 15,
                fontSize: 20,
                borderRadius: 12,
                border: "1px solid #64748b",
                marginBottom: 10,
              }}
            />

            <button
              type="submit"
              style={{
                ...boton,
                width: "100%",
                background: "#2563eb",
              }}
            >
              🔎 Buscar y enviar a POS Init
            </button>
          </form>
        )}

        {!transmitiendo ? (
          <button
            type="button"
            onClick={iniciar}
            disabled={iniciando}
            style={{
              ...boton,
              width: "100%",
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
              width: "100%",
              background: "#b91c1c",
            }}
          >
            ⏹ Desconectar cámara
          </button>
        )}
      </footer>
    </main>
  );
}