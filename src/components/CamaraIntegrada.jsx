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
  const [fuente, setFuente] = useState("conectando");

  useEffect(() => {
    datosRef.current = { productos, onProducto };
  }, [productos, onProducto]);

  useEffect(() => {
    let cancelado = false;
    let controles = null;

    const video = videoRef.current;

    controlesRef.current?.stop();
    controlesRef.current = null;

    if (video) {
      video.pause();
      video.srcObject = null;
    }

    if (!activa) {
      setEstado("Cámara pausada");
      setFuente("pausada");
      return;
    }

    if (!video) return;

    const lector = new BrowserMultiFormatReader();

    const alDetectar = (resultado) => {
      if (!resultado || cancelado) return;

      const codigo = String(resultado.getText() || "").trim();

      if (!codigo) return;

      const ahora = Date.now();

      if (
        ultimoRef.current.codigo === codigo &&
        ahora - ultimoRef.current.tiempo < 1800
      ) {
        return;
      }

      ultimoRef.current = {
        codigo,
        tiempo: ahora,
      };

      const {
        productos: lista,
        onProducto: agregar,
      } = datosRef.current;

      const producto = lista.find((p) => {
        const codigoProducto = String(
          p.codigoBarras ?? p.codigo ?? ""
        ).trim();

        return codigoProducto === codigo;
      });

      if (producto) {
        agregar?.(producto);
        setEstado(`✓ ${producto.nombre || codigo}`);
      } else {
        setEstado(`Código no encontrado: ${codigo}`);
      }
    };

    async function iniciarCamara() {
      try {
        setFuente("conectando");

        if (streamRemoto?.getVideoTracks().some((t) => t.readyState === "live")) {
          setEstado("Conectando cámara del celular...");

          video.srcObject = streamRemoto;

          await video.play();

          if (cancelado) return;

          controles = await lector.decodeFromVideoElement(
            video,
            alDetectar
          );

          if (cancelado) {
            controles?.stop();
            return;
          }

          controlesRef.current = controles;

          setFuente("celular");
          setEstado("📱 Cámara del celular conectada");

          return;
        }

        setEstado(
          esperandoCelular
            ? "Buscando cámara USB mientras se conecta el celular..."
            : "Iniciando cámara USB..."
        );

        controles = await lector.decodeFromVideoDevice(
          camaraId || undefined,
          video,
          alDetectar
        );

        if (cancelado) {
          controles?.stop();
          return;
        }

        controlesRef.current = controles;

        setFuente("usb");
        setEstado("📷 Cámara USB conectada");
      } catch (error) {
        if (cancelado) return;

        console.error("POS Init - Error de cámara:", error);

        setFuente("error");

        setEstado(
          esperandoCelular
            ? "Esperando celular. No se encontró cámara USB disponible."
            : `No se pudo iniciar la cámara: ${
                error.message || "Revisa los permisos"
              }`
        );
      }
    }

    iniciarCamara();

    return () => {
      cancelado = true;

      controles?.stop();

      if (controlesRef.current === controles) {
        controlesRef.current = null;
      }

      if (video) {
        video.pause();
        video.srcObject = null;
      }
    };
  }, [activa, camaraId, streamRemoto, esperandoCelular]);

  const etiqueta =
    !activa
      ? "⏸ PAUSADA"
      : fuente === "celular"
      ? "📱 CONECTADA"
      : fuente === "usb"
      ? "● EN VIVO"
      : fuente === "error"
      ? "⚠ SIN CÁMARA"
      : "◌ CONECTANDO";

  return (
    <section
      className="pos-camara-integrada"
      aria-label="Cámara de productos"
    >
      <div className="pos-camara-encabezado">
        <strong>📷 Cámara</strong>
        <span>{etiqueta}</span>
      </div>

      <div className="pos-camara-visor">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
        />

        <div
          className="pos-camara-guia"
          aria-hidden="true"
        />
      </div>

      <small
        className="pos-camara-mensaje"
        title={estado}
      >
        {estado}
      </small>
    </section>
  );
}