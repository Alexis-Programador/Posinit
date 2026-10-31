import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import {
  BarcodeFormat,
  DecodeHintType,
} from "@zxing/library";

const limpiarCodigo = (valor) =>
  String(valor ?? "")
    .replace(/\s+/g, "")
    .trim();

function obtenerCodigos(producto) {
  const codigos = [
    producto.codigoBarras,
    producto.codigo,
    producto.barcode,
    producto.ean,
    producto.upc,
  ];

  if (Array.isArray(producto.codigosBarras)) {
    codigos.push(...producto.codigosBarras);
  }

  if (Array.isArray(producto.codigosAlternativos)) {
    codigos.push(...producto.codigosAlternativos);
  }

  return codigos
    .filter((codigo) => codigo != null)
    .map(limpiarCodigo)
    .filter(Boolean);
}

export default function EscanerProductos({
  productos = [],
  onProducto,
  onCerrar,
  streamRemoto = null,
  integrado = false,
  activo = true,
  camaraId = "",
}) {
  const videoRef = useRef(null);
  const productosRef = useRef(productos);
  const onProductoRef = useRef(onProducto);

  const ultimoCodigoRef = useRef({
    codigo: "",
    fecha: 0,
  });

  const buscarRef = useRef(null);

  const [mensaje, setMensaje] = useState(
    "Preparando cámara..."
  );

  const [codigoManual, setCodigoManual] = useState("");
  const [ultimoLeido, setUltimoLeido] = useState("");
  const [camaraLista, setCamaraLista] = useState(false);

  productosRef.current = productos;
  onProductoRef.current = onProducto;

  buscarRef.current = (codigo) => {
    const limpio = limpiarCodigo(codigo);

    if (!limpio) return;

    setUltimoLeido(limpio);

    const ahora = Date.now();
    const ultimo = ultimoCodigoRef.current;

    if (
      ultimo.codigo === limpio &&
      ahora - ultimo.fecha < 1800
    ) {
      return;
    }

    const producto = productosRef.current.find((p) =>
      obtenerCodigos(p).includes(limpio)
    );

    if (!producto) {
      setMensaje(
        `⚠️ Código ${limpio} no encontrado en los productos cargados.`
      );
      return;
    }

    ultimoCodigoRef.current = {
      codigo: limpio,
      fecha: ahora,
    };

    setMensaje(
      `✓ ${producto.nombre || "Producto"} agregado`
    );

    onProductoRef.current?.(producto);
  };

  useEffect(() => {
    if (!activo) {
      setCamaraLista(false);
      setMensaje("Cámara pausada");
      return;
    }

    let cancelado = false;
    let controles = null;
    let streamLocal = null;

    const hints = new Map();

    hints.set(DecodeHintType.TRY_HARDER, true);

    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.ITF,
      BarcodeFormat.QR_CODE,
    ]);

    const lector = new BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: 250,
      delayBetweenScanSuccess: 1000,
    });

    const procesarResultado = (resultado, error) => {
      if (cancelado) return;

      if (resultado) {
        buscarRef.current?.(resultado.getText());
      }

      // ZXing puede fallar al decodificar fotogramas
      // desenfocados o incompletos. No son errores
      // de Firebase ni deben detener la cámara.
      //
      // Evitamos mostrar esos errores repetitivos
      // en la interfaz.
      void error;
    };

    async function iniciar() {
      try {
        setMensaje("Iniciando cámara...");
        setCamaraLista(false);

        const video = videoRef.current;

        if (!video) return;

        if (streamRemoto) {
          video.srcObject = streamRemoto;

          await video.play();

          if (cancelado) return;

          controles =
            await lector.decodeFromVideoElement(
              video,
              procesarResultado
            );
        } else {
          if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error(
              "La cámara requiere HTTPS o localhost."
            );
          }

          const preferida =
            camaraId ||
            localStorage.getItem(
              "pos-init-camara-preferida"
            ) ||
            undefined;

          controles =
            await lector.decodeFromVideoDevice(
              preferida,
              video,
              procesarResultado
            );

          streamLocal = video.srcObject;
        }

        if (cancelado) {
          controles?.stop();
          return;
        }

        setCamaraLista(true);
        setMensaje("📷 Escáner activo. Enfoca el código.");
      } catch (error) {
        if (cancelado) return;

        console.error(
          "POS Init - Error al iniciar cámara:",
          error
        );

        setCamaraLista(false);

        setMensaje(
          error?.name === "NotAllowedError"
            ? "Autoriza el acceso a la cámara."
            : `Error: ${error.message}`
        );
      }
    }

    iniciar();

    return () => {
      cancelado = true;

      controles?.stop();

      if (!streamRemoto) {
        streamLocal
          ?.getTracks?.()
          .forEach((track) => track.stop());
      }

      const video = videoRef.current;

      if (video) {
        video.pause();
        video.srcObject = null;
      }
    };
  }, [activo, streamRemoto, camaraId]);

  const contenido = (
    <div
      style={{
        background: "#10243a",
        color: "#fff",
        borderRadius: 14,
        padding: 12,
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
          gap: 8,
        }}
      >
        <strong>📷 Cámara de productos</strong>

        <span
          style={{
            color: camaraLista
              ? "#86efac"
              : "#fbbf24",
            fontSize: 12,
          }}
        >
          {streamRemoto
            ? "📱 Celular"
            : "📷 Cámara local"}
        </span>
      </div>

      <div style={{ position: "relative" }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{
            width: "100%",
            height: 240,
            objectFit: "cover",
            background: "#020617",
            borderRadius: 10,
          }}
        />

        <div
          style={{
            position: "absolute",
            left: "8%",
            top: "32%",
            width: "84%",
            height: "36%",
            border: "2px solid #38bdf8",
            borderRadius: 12,
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            right: 12,
            textAlign: "center",
            fontSize: 12,
            color: "#fff",
            textShadow: "0 1px 5px #000",
            pointerEvents: "none",
          }}
        >
          Centra el código y mantén la cámara estable
        </div>
      </div>

      <p
        role="status"
        style={{
          fontSize: 13,
          lineHeight: 1.5,
          minHeight: 20,
        }}
      >
        {mensaje}
      </p>

      {ultimoLeido && (
        <div
          style={{
            background: "#1e3a5f",
            borderRadius: 8,
            padding: 10,
            marginBottom: 10,
            fontSize: 12,
            overflowWrap: "anywhere",
          }}
        >
          <strong>Último código detectado:</strong>
          <div style={{ marginTop: 4 }}>
            {ultimoLeido}
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          buscarRef.current?.(codigoManual);
          setCodigoManual("");
        }}
        style={{
          display: "flex",
          gap: 8,
        }}
      >
        <input
          aria-label="Código de barras"
          placeholder="Código de barras manual"
          value={codigoManual}
          onChange={(e) =>
            setCodigoManual(e.target.value)
          }
          autoComplete="off"
          style={{
            flex: 1,
            minWidth: 0,
            padding: 10,
            borderRadius: 8,
            border: "1px solid #94a3b8",
            fontSize: 14,
          }}
        />

        <button
          type="submit"
          style={{
            border: "none",
            borderRadius: 8,
            padding: "10px 14px",
            background: "#38bdf8",
            color: "#082f49",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Buscar
        </button>
      </form>

      {onCerrar && (
        <button
          type="button"
          onClick={onCerrar}
          style={{
            marginTop: 12,
            padding: "10px 14px",
            border: "none",
            borderRadius: 8,
            background: "#334155",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Cerrar cámara
        </button>
      )}
    </div>
  );

  if (integrado) return contenido;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Escanear productos"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#000a",
        display: "grid",
        placeItems: "center",
        padding: 16,
        overflowY: "auto",
      }}
    >
      <div
        style={{
          width: "min(100%, 480px)",
        }}
      >
        {contenido}
      </div>
    </div>
  );
}