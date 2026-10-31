
import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

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
  const ultimoCodigoRef = useRef({ codigo: "", fecha: 0 });
  const [mensaje, setMensaje] = useState("Preparando cámara...");
  const [codigoManual, setCodigoManual] = useState("");

  productosRef.current = productos;
  onProductoRef.current = onProducto;

  const buscarRef = useRef(null);

  buscarRef.current = (codigo) => {
    const limpio = String(codigo ?? "").trim();
    if (!limpio) return;

    const ahora = Date.now();
    const ultimo = ultimoCodigoRef.current;

    if (
      ultimo.codigo === limpio &&
      ahora - ultimo.fecha < 1800
    ) {
      return;
    }

    const producto = productosRef.current.find(
      (p) => String(p.codigoBarras ?? "").trim() === limpio
    );

    if (!producto) {
      setMensaje(`Código ${limpio} no registrado.`);
      return;
    }

    ultimoCodigoRef.current = {
      codigo: limpio,
      fecha: ahora,
    };

    setMensaje(`✓ ${producto.nombre || "Producto"} agregado`);
    onProductoRef.current?.(producto);
  };

  useEffect(() => {
    if (!activo) return;

    let cancelado = false;
    let controles = null;
    let streamLocal = null;
    const lector = new BrowserMultiFormatReader();

    async function iniciar() {
      try {
        setMensaje("Iniciando cámara...");

        if (!videoRef.current) return;

        if (streamRemoto) {
          videoRef.current.srcObject = streamRemoto;

          await videoRef.current.play();

          if (cancelado) return;

          controles = await lector.decodeFromVideoElement(
            videoRef.current,
            (resultado) => {
              if (resultado && !cancelado) {
                buscarRef.current?.(resultado.getText());
              }
            }
          );
        } else {
          if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error(
              "La cámara requiere HTTPS o localhost."
            );
          }

          const preferida =
            camaraId ||
            localStorage.getItem("pos-init-camara-preferida") ||
            undefined;

          controles = await lector.decodeFromVideoDevice(
            preferida,
            videoRef.current,
            (resultado) => {
              if (resultado && !cancelado) {
                buscarRef.current?.(resultado.getText());
              }
            }
          );

          streamLocal = videoRef.current?.srcObject;
        }

        if (cancelado) {
          controles?.stop();
          return;
        }

        setMensaje("Escáner activo");
      } catch (error) {
        if (!cancelado) {
          setMensaje(
            error?.name === "NotAllowedError"
              ? "Autoriza la cámara en Chrome."
              : `Error: ${error.message}`
          );
        }
      }
    }

    iniciar();

    return () => {
      cancelado = true;
      controles?.stop();

      if (!streamRemoto) {
        streamLocal?.getTracks?.().forEach(
          (track) => track.stop()
        );
      }

      if (videoRef.current) {
        videoRef.current.srcObject = null;
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
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <strong>📷 Cámara de productos</strong>
        <span style={{ color: "#86efac", fontSize: 12 }}>
          {streamRemoto ? "📱 Celular" : "USB / PC"}
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
            height: 220,
            objectFit: "cover",
            background: "#020617",
            borderRadius: 10,
          }}
        />

        <div
          style={{
            position: "absolute",
            left: "15%",
            top: "28%",
            width: "70%",
            height: "44%",
            border: "2px solid #38bdf8",
            borderRadius: 12,
            pointerEvents: "none",
          }}
        />
      </div>

      <p role="status" style={{ fontSize: 12 }}>
        {mensaje}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          buscarRef.current?.(codigoManual);
          setCodigoManual("");
        }}
        style={{ display: "flex", gap: 8 }}
      >
        <input
          aria-label="Código de barras"
          placeholder="Código de barras manual"
          value={codigoManual}
          onChange={(e) => setCodigoManual(e.target.value)}
          style={{
            flex: 1,
            minWidth: 0,
            padding: 9,
            borderRadius: 8,
          }}
        />
        <button type="submit">Buscar</button>
      </form>

      {onCerrar && (
        <button
          type="button"
          onClick={onCerrar}
          style={{ marginTop: 10 }}
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
      }}
    >
      <div style={{ width: "min(100%, 480px)" }}>
        {contenido}
      </div>
    </div>
  );
}
