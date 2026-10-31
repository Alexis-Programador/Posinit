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
  const datosRef = useRef({ productos, onProducto });
  const ultimoRef = useRef({ codigo: "", tiempo: 0 });

  const [estado, setEstado] = useState("Preparando cámara...");
  const [fuente, setFuente] = useState("conectando");

  useEffect(() => {
    datosRef.current = { productos, onProducto };
  }, [productos, onProducto]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelado = false;
    let controles = null;
    let verificador = null;
    let pista = null;

    const lector = new BrowserMultiFormatReader();

    const remoto =
      streamRemoto?.getVideoTracks().some(
        (t) => t.readyState === "live"
      ) || false;

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

      ultimoRef.current = { codigo, tiempo: ahora };

      const {
        productos: lista,
        onProducto: agregar,
      } = datosRef.current;

      const producto = lista.find(
        (p) =>
          String(p.codigoBarras ?? p.codigo ?? "").trim() === codigo
      );

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
          ? "Recibiendo video del celular..."
          : "Iniciando cámara USB..."
      );

      try {
        if (remoto) {
          video.srcObject = streamRemoto;
          video.muted = true;

          await video.play();

          if (cancelado) return;

          controles = await lector.decodeFromVideoElement(
            video,
            alDetectar
          );
        } else {
          controles = await lector.decodeFromVideoDevice(
            camaraId || undefined,
            video,
            alDetectar
          );
        }

        if (cancelado) {
          controles?.stop();
          return;
        }

        pista = video.srcObject?.getVideoTracks?.()[0];

        if (!pista || pista.readyState !== "live") {
          throw new Error("No hay video activo");
        }

        // Verificar que realmente existan imágenes.
        let intentosSinImagen = 0;

        verificador = window.setInterval(() => {
          if (cancelado) return;

          if (pista.readyState !== "live") {
            setFuente("error");
            setEstado(
              "La cámara dejó de transmitir. Reconecta el celular."
            );
            return;
          }

          if (
            video.videoWidth > 0 &&
            video.videoHeight > 0 &&
            video.readyState >= 2
          ) {
            intentosSinImagen = 0;
            setFuente(remoto ? "celular" : "usb");
          } else {
            intentosSinImagen += 1;

            if (intentosSinImagen >= 5) {
              setFuente("error");

              setEstado(
                remoto
                  ? "Celular enlazado, pero no llegan imágenes. Reconecta."
                  : "Cámara USB sin imagen. Revisa el dispositivo."
              );
            }
          }
        }, 1000);

        if (video.videoWidth && video.videoHeight) {
          setFuente(remoto ? "celular" : "usb");

          setEstado(
            remoto
              ? "📱 Cámara del celular conectada"
              : "📷 Cámara USB conectada"
          );
        } else {
          setEstado("Esperando primeros fotogramas...");
        }
      } catch (error) {
        if (cancelado) return;

        console.error("POS Init - cámara:", error);
        setFuente("error");

        setEstado(
          remoto
            ? `Error en video del celular: ${error.message}`
            : esperandoCelular
            ? "Esperando celular; no hay cámara USB disponible."
            : `Error en cámara USB: ${error.message}`
        );
      }
    }

    iniciar();

    return () => {
      cancelado = true;

      if (verificador) {
        window.clearInterval(verificador);
      }

      controles?.stop();
      video.pause();

      // No detener las pistas del celular: pertenecen a WebRTC.
      if (video.srcObject === streamRemoto || !remoto) {
        video.srcObject = null;
      }
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
        <video ref={videoRef} autoPlay playsInline muted />

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