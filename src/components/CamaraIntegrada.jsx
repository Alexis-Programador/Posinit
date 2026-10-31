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

  const datosRef = useRef({
    productos,
    onProducto,
  });

  const ultimoRef = useRef({
    codigo: "",
    tiempo: 0,
  });

  const [estado, setEstado] = useState("Preparando cámara...");
  const [fuente, setFuente] = useState("conectando");

  useEffect(() => {
    datosRef.current = {
      productos,
      onProducto,
    };
  }, [productos, onProducto]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) return;

    let cancelado = false;
    let controles = null;
    let verificador = null;

    const lector = new BrowserMultiFormatReader();

    const pistaRemota = streamRemoto
      ?.getVideoTracks?.()
      .find((track) => track.readyState === "live");

    const remoto = Boolean(pistaRemota);

    const detectar = (resultado) => {
      if (!resultado || cancelado) return;

      const codigo = String(resultado.getText() || "")
        .replace(/\s+/g, "")
        .trim();

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
        const codigos = [
          p.codigoBarras,
          p.codigo,
          p.barcode,
          p.ean,
          ...(Array.isArray(p.codigosBarras)
            ? p.codigosBarras
            : []),
        ];

        return codigos.some(
          (valor) =>
            String(valor ?? "")
              .replace(/\s+/g, "") === codigo
        );
      });

      if (producto) {
        agregar?.(producto);
        setEstado(`✓ ${producto.nombre || codigo}`);
      } else {
        setEstado(`Código no encontrado: ${codigo}`);
      }
    };

    async function iniciar() {
      if (!activa) {
        setFuente("pausada");
        setEstado("Cámara pausada");
        return;
      }

      setFuente("conectando");

      setEstado(
        remoto
          ? "Recibiendo cámara del celular..."
          : "Iniciando cámara USB..."
      );

      try {
        if (remoto) {
          video.srcObject = streamRemoto;

          await video.play();

          if (cancelado) return;

          // El celular ya decodifica los códigos.
          // Aquí únicamente mostramos su video.
        } else {
          controles = await lector.decodeFromVideoDevice(
            camaraId || undefined,
            video,
            detectar
          );
        }

        if (cancelado) {
          controles?.stop();
          return;
        }

        const pista = video.srcObject
          ?.getVideoTracks?.()[0];

        let sinImagen = 0;

        verificador = window.setInterval(() => {
          if (cancelado) return;

          const imagen =
            video.videoWidth > 0 &&
            video.videoHeight > 0 &&
            video.readyState >= 2;

          if (
            !pista ||
            pista.readyState !== "live" ||
            !imagen
          ) {
            sinImagen += 1;

            if (sinImagen >= 5) {
              setFuente("error");

              setEstado(
                remoto
                  ? "Celular conectado sin imagen; revisa la transmisión."
                  : "Cámara USB sin imagen."
              );
            }
          } else {
            sinImagen = 0;

            setFuente(remoto ? "celular" : "usb");

            setEstado((anterior) => {
              if (
                anterior.startsWith("✓") ||
                anterior.startsWith("Código no encontrado")
              ) {
                return anterior;
              }

              return remoto
                ? "📱 Cámara del celular conectada"
                : "📷 Cámara USB conectada";
            });
          }
        }, 1000);
      } catch (error) {
        if (cancelado) return;

        console.error("POS Init - cámara:", error);

        setFuente("error");

        setEstado(
          remoto
            ? `Error de cámara del celular: ${error.message}`
            : esperandoCelular
            ? "Esperando celular; no hay cámara USB disponible."
            : `Error de cámara USB: ${error.message}`
        );
      }
    }

    iniciar();

    return () => {
      cancelado = true;

      if (verificador) {
        clearInterval(verificador);
      }

      controles?.stop();

      video.pause();
      video.srcObject = null;
    };
  }, [activa, camaraId, streamRemoto, esperandoCelular]);

  const etiqueta = !activa
    ? "⏸ PAUSADA"
    : fuente === "celular"
    ? "📱 CELULAR"
    : fuente === "usb"
    ? "● USB EN VIVO"
    : fuente === "error"
    ? "⚠ SIN IMAGEN"
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