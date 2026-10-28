import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function EscanerProductos({ productos = [], onProducto, onCerrar }) {
  const videoRef = useRef(null);
  const productosRef = useRef(productos);
  const onProductoRef = useRef(onProducto);
  const procesadoRef = useRef(false);
  const [mensaje, setMensaje] = useState("Abriendo cámara...");
  const [codigoManual, setCodigoManual] = useState("");

  productosRef.current = productos;
  onProductoRef.current = onProducto;

  const buscar = (codigo) => {
    if (procesadoRef.current) return;
    const limpio = String(codigo ?? "").trim();
    const producto = productosRef.current.find(
      (p) => String(p.codigoBarras ?? "").trim() === limpio
    );
    if (!producto) {
      setMensaje(`El código ${limpio} no está registrado.`);
      return;
    }
    procesadoRef.current = true;
    onProductoRef.current(producto);
  };
  const buscarRef = useRef(buscar);
  buscarRef.current = buscar;

  useEffect(() => {
    let activo = true;
    let controles = null;
    const lector = new BrowserMultiFormatReader();

    async function iniciar() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("La cámara requiere HTTPS o localhost y permiso del navegador.");
        }
        const camaraPreferida = localStorage.getItem("pos-init-camara-preferida");
        const control = await lector.decodeFromVideoDevice(
          camaraPreferida || undefined,
          videoRef.current,
          (resultado) => {
            if (!activo || !resultado || procesadoRef.current) return;
            setMensaje("");
            buscarRef.current(resultado.getText());
          }
        );
        controles = control;
        if (!activo) control.stop();
        else setMensaje("");
      } catch (err) {
        if (activo) {
          setMensaje(err?.name === "NotAllowedError"
            ? "Permite el acceso a la cámara desde el navegador."
            : `No se pudo iniciar la cámara: ${err?.message || "error desconocido"}`);
        }
      }
    }
    iniciar();
    return () => {
      activo = false;
      controles?.stop();
      const video = videoRef.current;
      video?.srcObject?.getTracks?.().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-label="Escanear código de barras"
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#0b182bef", display: "grid", placeItems: "center", padding: 16 }}>
      <div style={{ background: "#fff", color: "#17243a", borderRadius: 16, padding: 20, width: "min(100%, 480px)", boxShadow: "0 15px 60px #0005" }}>
        <h2 style={{ marginTop: 0 }}>📷 Escanear producto</h2>
        <video ref={videoRef} autoPlay muted playsInline
          style={{ width: "100%", minHeight: 180, background: "#0f172a", borderRadius: 12 }} />
        {mensaje && <p role="status" style={{ color: "#a33", fontSize: 13 }}>{mensaje}</p>}
        <form onSubmit={(e) => { e.preventDefault(); if (codigoManual.trim()) buscar(codigoManual); }}
          style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input aria-label="Código de barras manual" placeholder="Código de barras"
            value={codigoManual} onChange={(e) => setCodigoManual(e.target.value)}
            style={{ flex: 1, minWidth: 0, padding: 10 }} />
          <button type="submit">Buscar</button>
        </form>
        <button type="button" onClick={onCerrar} style={{ marginTop: 14, padding: "10px 16px" }}>
          Cerrar cámara
        </button>
      </div>
    </div>
  );
}
