import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function CamaraIntegrada({
  productos = [],
  onProducto,
  streamRemoto = null,
  camaraId = "",
  activa = true,
  esperandoCelular = false,
}) {
  const videoRef = useRef(null);
  const controlesRef = useRef(null);
  const datosRef = useRef({ productos, onProducto });
  const ultimoRef = useRef({ codigo: "", tiempo: 0 });
  const [estado, setEstado] = useState("Preparando cámara...");

  useEffect(() => {
    datosRef.current = { productos, onProducto };
  }, [productos, onProducto]);

  useEffect(() => {
    let cancelado = false;
    let controles = null;
    const video = videoRef.current;

    controlesRef.current?.stop();
    controlesRef.current = null;
    if (video) video.srcObject = null;

    if (esperandoCelular) {
      setEstado("Esperando conexión del celular (F6)...");
      return;
    }
    if (!activa) {
      setEstado("Cámara pausada");
      return;
    }
    if (!video) return;

    const lector = new BrowserMultiFormatReader();
    const alDetectar = (resultado) => {
      if (!resultado || cancelado) return;
      const codigo = String(resultado.getText() || "").trim();
      if (!codigo) return;
      const ahora = Date.now();
      if (ultimoRef.current.codigo === codigo && ahora - ultimoRef.current.tiempo < 1800) return;
      ultimoRef.current = { codigo, tiempo: ahora };
      const { productos: lista, onProducto: agregar } = datosRef.current;
      const producto = lista.find((p) =>
        String(p.codigoBarras ?? p.codigo ?? "").trim() === codigo
      );
      if (producto) {
        agregar?.(producto);
        setEstado(`✓ ${producto.nombre || codigo}`);
      } else {
        setEstado(`Código no encontrado: ${codigo}`);
      }
    };

    (async () => {
      try {
        setEstado("Conectando cámara...");
        if (streamRemoto) {
          video.srcObject = streamRemoto;
          await video.play();
          controles = await lector.decodeFromVideoElement(video, alDetectar);
        } else {
          controles = await lector.decodeFromVideoDevice(
            camaraId || undefined,
            video,
            alDetectar
          );
        }
        if (cancelado) controles?.stop();
        else {
          controlesRef.current = controles;
          setEstado("Escáner activo");
        }
      } catch (error) {
        if (!cancelado) {
          console.error("POS Init - cámara:", error);
          setEstado(`No se pudo iniciar: ${error.message || "revisa permisos"}`);
        }
      }
    })();

    return () => {
      cancelado = true;
      controles?.stop();
      if (controlesRef.current === controles) controlesRef.current = null;
      if (video) video.srcObject = null;
    };
  }, [activa, camaraId, streamRemoto, esperandoCelular]);

  return (
    <section className="pos-camara-integrada" aria-label="Cámara de productos">
      <div className="pos-camara-encabezado">
        <strong>📷 Cámara</strong>
        <span>{esperandoCelular ? "📱 ESPERANDO" : activa ? "● EN VIVO" : "⏸ PAUSADA"}</span>
      </div>
      <div className="pos-camara-visor">
        <video ref={videoRef} autoPlay playsInline muted />
        <div className="pos-camara-guia" aria-hidden="true" />
      </div>
      <small className="pos-camara-mensaje" title={estado}>{estado}</small>
    </section>
  );
}
