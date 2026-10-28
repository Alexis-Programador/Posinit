
import { useEffect, useRef, useState } from "react";

const LIMITE = 3000;

export default function NotificacionRetiro({
  efectivoEnCaja,
  cajaId,
  onAbrirCaja,
}) {
  const [permiso, setPermiso] = useState(
    "Notification" in window
      ? Notification.permission
      : "unsupported"
  );

  const ultimaAlerta = useRef(null);

  const activar = async () => {
    if (!("Notification" in window)) return;

    const resultado = await Notification.requestPermission();
    setPermiso(resultado);
  };

  useEffect(() => {
    const saldo = Number(efectivoEnCaja || 0);
    const clave = `pos-init-alerta-${cajaId}`;

    if (saldo < LIMITE) {
      ultimaAlerta.current = null;
      sessionStorage.removeItem(clave);
      return;
    }

    if (permiso !== "granted") return;
    if (ultimaAlerta.current === clave) return;
    if (sessionStorage.getItem(clave) === "enviada") return;

    try {
      const aviso = new Notification(
        "POS Init · Retiro requerido",
        {
          body:
            `Hay $${saldo.toFixed(2)} MXN en efectivo. ` +
            "Realiza un retiro de caja.",
          tag: clave,
        }
      );

      ultimaAlerta.current = clave;
      sessionStorage.setItem(clave, "enviada");

      aviso.onclick = () => {
        window.focus();
        onAbrirCaja?.();
        aviso.close();
      };
    } catch (err) {
      console.error("No se pudo mostrar la notificación:", err);
    }
  }, [efectivoEnCaja, permiso, cajaId, onAbrirCaja]);

  if (permiso === "granted") return null;

  return (
    <button type="button" onClick={activar}>
      🔔 Activar notificaciones
    </button>
  );
}
