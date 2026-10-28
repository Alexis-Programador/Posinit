
import { useEffect, useState } from "react";

const CLAVE_CAMARA = "pos-init-camara-preferida";

export default function ConfiguracionFuncionesPos({
  tipo,
  onCerrar,
  onActualizarUbicacion,
}) {
  const [camaras, setCamaras] = useState([]);
  const [camara, setCamara] = useState(
    () => localStorage.getItem(CLAVE_CAMARA) || ""
  );
  const [mensaje, setMensaje] = useState("");
  const [permiso, setPermiso] = useState(
    () => "Notification" in window
      ? Notification.permission
      : "unsupported"
  );

  useEffect(() => {
    if (tipo !== "camara") return;

    let cancelado = false;

    async function cargarCamaras() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });

        try {
          const dispositivos =
            await navigator.mediaDevices.enumerateDevices();

          if (cancelado) return;

          const lista = dispositivos.filter(
            (dispositivo) => dispositivo.kind === "videoinput"
          );

          setCamaras(lista);

          const guardada = localStorage.getItem(CLAVE_CAMARA);
          const seleccion = lista.find(
            (dispositivo) => dispositivo.deviceId === guardada
          );

          setCamara(
            seleccion?.deviceId || lista[0]?.deviceId || ""
          );

          if (!lista.length) {
            setMensaje("No se encontraron cámaras.");
          }
        } finally {
          stream.getTracks().forEach((track) => track.stop());
        }
      } catch (error) {
        if (!cancelado) {
          setMensaje(
            `No se pudo acceder a la cámara: ${error.message}`
          );
        }
      }
    }

    cargarCamaras();

    return () => {
      cancelado = true;
    };
  }, [tipo]);

  async function validarNotificaciones() {
    if (!("Notification" in window)) {
      setMensaje("El navegador no admite notificaciones.");
      return;
    }

    try {
      const resultado = await Notification.requestPermission();
      setPermiso(resultado);

      if (resultado === "granted") {
        setMensaje("Notificaciones autorizadas.");
      } else {
        setMensaje("Autoriza las notificaciones en Chrome.");
      }
    } catch (error) {
      setMensaje(error.message);
    }
  }

  function probarNotificaciones() {
    if (Notification.permission !== "granted") {
      setMensaje("Primero debes autorizar las notificaciones.");
      return;
    }

    try {
      const aviso = new Notification(
        "POS Init · Notificaciones activadas",
        {
          body: "La conexión con las notificaciones del sistema funciona.",
          tag: "pos-init-prueba-manual",
        }
      );

      aviso.onclick = () => {
        window.focus();
        aviso.close();
      };

      setMensaje("Prueba enviada al sistema.");
    } catch (error) {
      setMensaje(`No se pudo mostrar el aviso: ${error.message}`);
    }
  }

  function guardarCamara() {
    localStorage.setItem(CLAVE_CAMARA, camara);
    setMensaje("Cámara guardada correctamente.");
  }

  async function validarUbicacion() {
    if (!navigator.geolocation) {
      setMensaje("La geolocalización no está disponible.");
      return;
    }

    setMensaje("Solicitando ubicación...");

    navigator.geolocation.getCurrentPosition(
      async (posicion) => {
        setMensaje("Ubicación autorizada.");

        try {
          await onActualizarUbicacion?.(posicion.coords);
        } catch (error) {
          setMensaje(`Error al actualizar el clima: ${error.message}`);
        }
      },
      (error) => {
        setMensaje(`No se pudo obtener ubicación: ${error.message}`);
      },
      {
        timeout: 12000,
        maximumAge: 300000,
      }
    );
  }

  const titulos = {
    camara: "📷 Configurar cámara",
    notificaciones: "🔔 Notificaciones de Windows",
    ubicacion: "📍 Ubicación y clima",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulos[tipo]}
      style={{
        position: "fixed",
        inset: 0,
        background: "#0b182bd9",
        zIndex: 10020,
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <section
        style={{
          width: "min(440px, 100%)",
          background: "#fff",
          color: "#17243a",
          borderRadius: 16,
          padding: 22,
          boxShadow: "0 20px 60px #0004",
        }}
      >
        <h2>{titulos[tipo]}</h2>

        {tipo === "camara" && (
          <>
            <p>Selecciona la cámara que utilizará POS Init.</p>

            <select
              value={camara}
              onChange={(e) => setCamara(e.target.value)}
              style={{ width: "100%", padding: 12 }}
            >
              <option value="">Seleccionar cámara</option>

              {camaras.map((dispositivo, indice) => (
                <option
                  key={dispositivo.deviceId}
                  value={dispositivo.deviceId}
                >
                  {dispositivo.label || `Cámara ${indice + 1}`}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={!camara}
              onClick={guardarCamara}
              style={{ marginTop: 12, padding: 10 }}
            >
              Guardar cámara
            </button>

            <div
              style={{
                marginTop: 18,
                padding: 12,
                background: "#f1f5f9",
                borderRadius: 10,
                color: "#64748b",
              }}
            >
              📱 Cámara del celular — Próximamente
            </div>
          </>
        )}

        {tipo === "notificaciones" && (
          <>
            <p>
              Estado: <strong>{permiso}</strong>
            </p>

            <button
              type="button"
              onClick={validarNotificaciones}
              style={{ padding: 10, marginRight: 8 }}
            >
              Activar notificaciones
            </button>

            <button
              type="button"
              onClick={probarNotificaciones}
              disabled={permiso !== "granted"}
              style={{ padding: 10 }}
            >
              Enviar prueba
            </button>

            <p style={{ fontSize: 13 }}>
              Las alertas de retiro se enviarán al llegar a
              $3,000 MXN en efectivo.
            </p>
          </>
        )}

        {tipo === "ubicacion" && (
          <>
            <p>
              Comprueba el permiso de ubicación para actualizar
              el clima de la barra superior.
            </p>

            <button
              type="button"
              onClick={validarUbicacion}
              style={{ padding: 10 }}
            >
              📍 Validar ubicación
            </button>
          </>
        )}

        {mensaje && (
          <p role="status" style={{ marginTop: 14, fontSize: 13 }}>
            {mensaje}
          </p>
        )}

        <button
          type="button"
          onClick={onCerrar}
          style={{
            display: "block",
            marginTop: 20,
            padding: "10px 16px",
          }}
        >
          Cerrar
        </button>
      </section>
    </div>
  );
}
