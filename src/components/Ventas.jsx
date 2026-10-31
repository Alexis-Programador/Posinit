
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import {
  db,
} from "../firebase/firebaseConfig";

import ModalCobro from "./ModalCobro";
import { recuperarPlanMixto, limpiarPlanMixto } from "./cobroMixtoService";
import ConfiguracionPosInitPay from "./ConfiguracionPosInitPay";
import { getAuth } from "firebase/auth";
import CorteCaja from "./CorteCaja";
import HistorialVentas from "./HistorialVentas";
import { QRCodeSVG } from "qrcode.react";
import { verificarPinCajero } from "../firebase/posPinBasico";
import CamaraRemota from "./CamaraRemota";
import CamaraIntegrada from "./CamaraIntegrada";


// FUNCIONES NATIVAS: clima, reloj y cámara. Sin dependencias adicionales.
function ClimaHoraPos({ actualizarToken = 0, cancelarToken = 0 }) {
  const solicitudRef = useRef(0);
  useEffect(() => { solicitudRef.current += 1; setEstado(""); }, [cancelarToken]);
  const [clima, setClima] = useState(null);
  const [hora, setHora] = useState("");
  const [estado, setEstado] = useState("");
  const zona = clima?.zona;

  useEffect(() => {
    const actualizar = () => {
      try {
        setHora(new Intl.DateTimeFormat("es-MX", {
          hour: "2-digit", minute: "2-digit", hour12: true,
          ...(zona ? { timeZone: zona } : {}),
        }).format(new Date()));
      } catch {
        setHora(new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }));
      }
    };
    actualizar();
    const id = setInterval(actualizar, 30000);
    return () => clearInterval(id);
  }, [zona]);

  const activarUbicacion = () => {
    if (!navigator.geolocation) { setEstado("Ubicación no disponible"); return; }
    setEstado("Consultando clima...");
    const solicitud = ++solicitudRef.current;
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      if (solicitud !== solicitudRef.current) return;
      try {
        const params = new URLSearchParams({
          latitude: String(coords.latitude), longitude: String(coords.longitude),
          current: "temperature_2m,weather_code", timezone: "auto",
        });
        const respuesta = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
        if (!respuesta.ok) throw new Error("No se pudo consultar el clima");
        const datos = await respuesta.json();
        const codigo = Number(datos.current?.weather_code ?? -1);
        const icono = codigo <= 1 && codigo >= 0 ? "☀️" : codigo <= 3 ? "🌤️" : codigo <= 48 ? "🌫️" : codigo <= 67 ? "🌧️" : codigo <= 77 ? "❄️" : "⛈️";
        if (solicitud !== solicitudRef.current) return;
        setClima({
          temperatura: Math.round(Number(datos.current.temperature_2m)),
          zona: datos.timezone,
          // Zona horaria como aproximación de ciudad, no geocodificación exacta.
          ciudad: String(datos.timezone || "Ubicación actual").split("/").pop().replaceAll("_", " "),
          icono,
        });
        setEstado("");
      } catch (err) { if (solicitud === solicitudRef.current) setEstado(err.message || "Error de clima"); }
    }, () => { if (solicitud === solicitudRef.current) setEstado("Ubicación no autorizada"); }, {
      enableHighAccuracy: false, timeout: 12000, maximumAge: 300000,
    });
  };

  useEffect(() => {
    if (actualizarToken > 0) activarUbicacion();
    // El token cambia únicamente al solicitar F8.
  }, [actualizarToken]);

  return (
    <div className="pos-clima-hora" style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", border: "1px solid #55708a", borderRadius: 10, color: "#fff", fontSize: 13, flexWrap: "wrap" }}>
      {clima ? <><strong>{clima.icono} {clima.temperatura} °C</strong><span>📍 {clima.ciudad}</span></> : (
        <button type="button" onClick={activarUbicacion} style={{ background: "transparent", color: "#fff", border: "1px solid #7c9ab3", borderRadius: 7, padding: "4px 7px", cursor: "pointer" }}>📍 Activar clima</button>
      )}
      <strong>🕒 {hora}</strong>
      {estado && <small title={estado} style={{ color: "#ffdc9d" }}>{estado}</small>}
    </div>
  );
}

const estiloOpcionMenu = {
  width: "100%",
  padding: "14px 16px",
  border: "1px solid #d1d5db",
  borderRadius: "10px",
  background: "#fff",
  color: "#111827",
  cursor: "pointer",
  textAlign: "left",
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  fontSize: "15px",
};

// =========================================================
// EFECTIVO REAL DE VENTAS NORMALES Y COMBINADAS
// =========================================================
function obtenerEfectivoDeVenta(venta) {
  if (!venta) return 0;
  if (venta.metodoPago === "mixto" && Array.isArray(venta.pagos)) {
    const suma = venta.pagos
      .filter(p => p.tipo === "efectivo")
      .reduce((acc, p) => acc + Number(p.importe || 0), 0);
    return Math.round(suma * 100) / 100;
  }
  return String(venta.metodoPago || "").toLowerCase() === "efectivo"
    ? Number(venta.total || 0)
    : 0;
}

function Ventas({
  ownerUid,
  usuario,
  onCerrarCaja,
}) {
  const [cajaEnEspera, setCajaEnEspera] = useState(false);
  const [pinDesbloqueo, setPinDesbloqueo] = useState("");
  const [errorDesbloqueo, setErrorDesbloqueo] = useState("");
  const [validandoDesbloqueo, setValidandoDesbloqueo] = useState(false);

  const ponerCajaEnEspera = () => {
    setMostrarMenu(false);
    setPinDesbloqueo("");
    setErrorDesbloqueo("");
    setCajaEnEspera(true);
  };

  const desbloquearCaja = async (evento) => {
    evento.preventDefault();
    if (validandoDesbloqueo) return;
    setValidandoDesbloqueo(true);
    setErrorDesbloqueo("");
    try {
      if (!ownerUid || !usuario?.id) throw new Error("No se identificó al cajero.");
      const resultado = await verificarPinCajero({ ownerUid, usuarioId: usuario.id, pin: pinDesbloqueo });
      if (!resultado.autorizado) throw new Error(resultado.mensaje || "PIN incorrecto.");
      setCajaEnEspera(false);
      setPinDesbloqueo("");
    } catch (err) {
      setErrorDesbloqueo(err.message || "No se pudo verificar el PIN.");
      setPinDesbloqueo("");
    } finally {
      setValidandoDesbloqueo(false);
    }
  };
  // =========================================================
  // ESTADOS
  // =========================================================

  const [
    productos,
    setProductos,
  ] = useState([]);

  const [
    inventario,
    setInventario,
  ] = useState({});

  const [
    carrito,
    setCarrito,
  ] = useState([]);

  const [
    busqueda,
    setBusqueda,
  ] = useState("");

  const buscadorRef =
    useRef(null);

  const [
    productoSeleccionado,
    setProductoSeleccionado,
  ] = useState(0);

  const [
    cargando,
    setCargando,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    mostrarCobro,
    setMostrarCobro,
  ] = useState(false);

  const [
    procesandoVenta,
    setProcesandoVenta,
  ] = useState(false);

  const [
    mensajeVenta,
    setMensajeVenta,
  ] = useState("");

  const [
    mostrarCorte,
    setMostrarCorte,
  ] = useState(false);

  const [
    mostrarHistorial,
    setMostrarHistorial,
  ] = useState(false);

  const [
    mostrarMenu,
    setMostrarMenu,
  ] = useState(false);

  const [mostrarConfigPay, setMostrarConfigPay] = useState(false);
  const esPropietario = Boolean(ownerUid && getAuth().currentUser?.uid === ownerUid);

  const [
    mostrarCerrarSesionCorte,
    setMostrarCerrarSesionCorte,
  ] = useState(false);

  const [
    ultimoCorteRealizado,
    setUltimoCorteRealizado,
  ] = useState(null);

  const [
    cierreSesionHabilitado,
    setCierreSesionHabilitado,
  ] = useState(false);

  const [
    ticketVentaActual,
    setTicketVentaActual,
  ] = useState(null);

  const [
    efectivoEnCaja,
    setEfectivoEnCaja,
  ] = useState(0);

  const [
    procesandoRetiro,
    setProcesandoRetiro,
  ] = useState(false);

  const [
    mostrarConfirmarRetiro,
    setMostrarConfirmarRetiro,
  ] = useState(false);

  const [
    montoRetiro,
    setMontoRetiro,
  ] = useState("");

  const montoRetiroInputRef = useRef(null);
  const LIMITE_RETIRO = 3000;

  const [camaraActiva, setCamaraActiva] = useState(true);
  const [modoCamara, setModoCamara] = useState("usb");
  const [streamRemoto, setStreamRemoto] = useState(null);
  const [vinculandoCelular, setVinculandoCelular] = useState(false);
  const [mostrarPanelConexion, setMostrarPanelConexion] = useState(false);
  const [posicionConfig, setPosicionConfig] = useState({ x: 0, y: 0 });
  const arrastreConfigRef = useRef(null);
  const iniciarArrastreConfig = (e) => {
    if (e.button !== 0 || e.target.closest("button, input, select")) return;
    arrastreConfigRef.current = { x: e.clientX, y: e.clientY, ...posicionConfig };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moverConfig = (e) => {
    const inicio = arrastreConfigRef.current;
    if (!inicio) return;
    setPosicionConfig({
      x: Math.max(-window.innerWidth / 3, Math.min(window.innerWidth / 3, inicio.x + e.clientX - inicio.x)),
      y: Math.max(-window.innerHeight / 3, Math.min(window.innerHeight / 3, inicio.y + e.clientY - inicio.y)),
    });
  };
  const [configuracionFunciones, setConfiguracionFunciones] = useState(null);
  const [actualizacionClima, setActualizacionClima] = useState(0);
  const [cancelacionClima, setCancelacionClima] = useState(0);
  const [avisosHabilitados, setAvisosHabilitados] = useState(() => localStorage.getItem("pos-init-avisos-habilitados") !== "false");
  const cerrarAvisoEnCincoSegundos = (aviso) => window.setTimeout(() => aviso.close(), 5000);
  const [camarasConfiguracion, setCamarasConfiguracion] = useState([]);
  const [camaraElegida, setCamaraElegida] = useState(() => localStorage.getItem("pos-init-camara-preferida") || "");
  const [mensajeConfiguracion, setMensajeConfiguracion] = useState("");
  const abrirConfiguracion = (tipo) => {
    setMostrarMenu(false);
    setMensajeConfiguracion("");
    setPosicionConfig({ x: 0, y: 0 });
    setConfiguracionFunciones(tipo);
  };
  useEffect(() => {
    if (configuracionFunciones !== "camara") return;
    let cancelado = false;
    (async () => {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        const dispositivos = await navigator.mediaDevices.enumerateDevices();
        const lista = dispositivos.filter((d) => d.kind === "videoinput");
        if (!cancelado) {
          setCamarasConfiguracion(lista);
          setCamaraElegida((anterior) => lista.some((d) => d.deviceId === anterior) ? anterior : (lista[0]?.deviceId || ""));
          if (!lista.length) setMensajeConfiguracion("No se encontraron cámaras.");
        }
      } catch (err) {
        if (!cancelado) setMensajeConfiguracion(`No se pudo acceder a la cámara: ${err.message}`);
      } finally {
        stream?.getTracks().forEach((track) => track.stop());
      }
    })();
    return () => { cancelado = true; };
  }, [configuracionFunciones]);
  const probarNotificacion = () => {
    if (!avisosHabilitados) { setMensajeConfiguracion("Activa los avisos de POS Init primero."); return; }
    if (!("Notification" in window) || Notification.permission !== "granted") {
      setMensajeConfiguracion("Primero autoriza las notificaciones desde Chrome.");
      return;
    }
    try {
      const aviso = new Notification("POS Init · Prueba de notificaciones", {
        body: "Las notificaciones del sistema están funcionando. Se cerrará en 5 segundos.",
        tag: "pos-init-prueba",
      });
      cerrarAvisoEnCincoSegundos(aviso);
      aviso.onclick = () => { window.focus(); aviso.close(); };
      setMensajeConfiguracion("Notificación enviada a Windows. Comprueba el centro de notificaciones.");
    } catch (err) { setMensajeConfiguracion(`No se pudo mostrar la notificación: ${err.message}`); }
  };
  const [permisoNotificacion, setPermisoNotificacion] = useState(() =>
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
  );
  const [cajaListaParaAlertar, setCajaListaParaAlertar] = useState(false);
  // Último saldo de efectivo que generó una notificación.
  // Se compara en centavos para evitar diferencias de punto flotante.
  const ultimoSaldoNotificadoRef = useRef(null);
  const cajaClave = `${ownerUid}-${usuario?.id ?? usuario?.numeroUsuario ?? "caja"}`;

  useEffect(() => {
    // Reiniciar el control al cambiar de cajero o negocio.
    ultimoSaldoNotificadoRef.current = null;
  }, [cajaClave]);

  useEffect(() => {
    // Esperar a que Firestore entregue ventas, retiros y cortes.
    if (!cajaListaParaAlertar) return;

    const saldo = Number(efectivoEnCaja);
    if (!Number.isFinite(saldo)) return;
    const saldoCentavos = Math.round(saldo * 100);
    const limiteCentavos = Math.round(LIMITE_RETIRO * 100);

    if (saldoCentavos < limiteCentavos) {
      // Después de un retiro, una nueva llegada al límite avisará otra vez.
      ultimoSaldoNotificadoRef.current = null;
      return;
    }

    // Notificar cada aumento real por encima del límite, no cada render.
    if (ultimoSaldoNotificadoRef.current !== null &&
        saldoCentavos <= ultimoSaldoNotificadoRef.current) return;

    if (!avisosHabilitados || permisoNotificacion !== "granted" ||
        typeof Notification === "undefined" ||
        Notification.permission !== "granted") return;

    try {
      const aviso = new Notification("POS Init · Retiro de caja", {
        body: `Efectivo en caja: $${saldo.toLocaleString("es-MX", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} MXN. Realiza un retiro. Se cerrará en 5 segundos.`,
        // Sin tag: Chrome no reemplaza el aviso anterior por el nuevo.
        requireInteraction: false,
      });
      cerrarAvisoEnCincoSegundos(aviso);
      ultimoSaldoNotificadoRef.current = saldoCentavos;
      aviso.onclick = () => {
        window.focus();
        setMontoRetiro("");
        setMostrarMenu(false);
        setMostrarConfirmarRetiro(true);
        aviso.close();
      };
    } catch (err) {
      console.warn("No se pudo mostrar la notificación de retiro:", err);
    }
  }, [efectivoEnCaja, permisoNotificacion, cajaListaParaAlertar, cajaClave, avisosHabilitados]);

  const activarNotificaciones = async () => {
    if (!("Notification" in window)) { setError("Este navegador no admite notificaciones del sistema."); return; }
    try {
      const resultado = await Notification.requestPermission();
      setPermisoNotificacion(resultado);
      if (resultado !== "granted") setError("Autoriza las notificaciones desde la configuración del navegador.");
    } catch { setError("No se pudo solicitar permiso para notificaciones."); }
  };


  // =========================================================
  // CARGAR PRODUCTOS + INVENTARIO
  // =========================================================

  useEffect(() => {
    if (!ownerUid) {
      setError("No se encontró el negocio.");
      setCargando(false);
      return undefined;
    }

    setCargando(true);
    setError("");
    let productosListos = false;
    let inventarioListo = false;
    const terminarCarga = () => {
      if (productosListos && inventarioListo) setCargando(false);
    };

    const cancelarProductos = onSnapshot(
      collection(db, "usuarios", ownerUid, "productos"),
      (snapshot) => {
        setProductos(snapshot.docs.map((d) => ({ documentoId: d.id, ...d.data() })));
        productosListos = true;
        terminarCarga();
      },
      (err) => {
        console.error("Error escuchando productos:", err);
        setError("No se pudieron actualizar los productos.");
        productosListos = true;
        terminarCarga();
      }
    );

    const cancelarInventario = onSnapshot(
      collection(db, "usuarios", ownerUid, "inventario"),
      (snapshot) => {
        const mapa = {};
        snapshot.docs.forEach((d) => {
          const datos = d.data();
          mapa[String(datos.productoId ?? d.id)] = { ...datos };
        });
        setInventario(mapa);
        inventarioListo = true;
        terminarCarga();
      },
      (err) => {
        console.error("Error escuchando inventario:", err);
        setError("No se pudo actualizar el inventario.");
        inventarioListo = true;
        terminarCarga();
      }
    );

    return () => {
      cancelarProductos();
      cancelarInventario();
    };
  }, [ownerUid]);

  // =========================================================
  // EFECTIVO EN CAJA
  // =========================================================

  useEffect(() => {
    setCajaListaParaAlertar(false);
    if (!ownerUid || !usuario) {
      setEfectivoEnCaja(0);
      return undefined;
    }

    let ventasCaja = [];
    let retirosCaja = [];
    let cortesCaja = [];
    let ventasRecibidas = false, retirosRecibidos = false, cortesRecibidos = false;

    const esDelCajero = (
      movimiento
    ) => {
      if (
        movimiento?.usuarioId != null &&
        usuario?.id != null
      ) {
        return (
          String(
            movimiento.usuarioId
          ) ===
          String(
            usuario.id
          )
        );
      }

      return (
        String(
          movimiento?.numeroUsuario ??
            ""
        ) ===
        String(
          usuario?.numeroUsuario ??
            ""
        )
      );
    };

    const recalcular = () => {
      if (!(ventasRecibidas && retirosRecibidos && cortesRecibidos)) return;
      const ultimoCorte =
        cortesCaja
          .filter(
            esDelCajero
          )
          .reduce(
            (
              mayor,
              corte
            ) =>
              Math.max(
                mayor,
                Number(
                  corte.fechaHora ??
                    0
                )
              ),
            0
          );

      const ventasEfectivo = ventasCaja
        .filter(venta => esDelCajero(venta) && Number(venta.fechaHora ?? 0) > ultimoCorte)
        .reduce((total, venta) => total + obtenerEfectivoDeVenta(venta), 0);

      const retiros =
        retirosCaja
          .filter(
            (retiro) =>
              esDelCajero(
                retiro
              ) &&
              Number(
                retiro.fechaHora ??
                  0
              ) >
                ultimoCorte
          )
          .reduce(
            (
              total,
              retiro
            ) =>
              total +
              Number(
                retiro.monto ??
                  0
              ),
            0
          );

      setEfectivoEnCaja(
        Math.max(
          0,
          Number(
            (
              ventasEfectivo -
              retiros
            ).toFixed(2)
          )
        )
      );
      setCajaListaParaAlertar(true);
    };

    const cancelarVentas =
      onSnapshot(
        collection(
          db,
          "usuarios",
          ownerUid,
          "ventas"
        ),

        (snapshot) => {
          ventasCaja =
            snapshot.docs.map(
              (d) => ({
                documentoId:
                  d.id,

                ...d.data(),
              })
            );

          ventasRecibidas = true;
          recalcular();
        },

        (err) =>
          console.error(
            "Error escuchando ventas para caja:",
            err
          )
      );

    const cancelarRetiros =
      onSnapshot(
        collection(
          db,
          "usuarios",
          ownerUid,
          "retirosCaja"
        ),

        (snapshot) => {
          retirosRecibidos = true;
          retirosCaja =
            snapshot.docs.map(
              (d) => ({
                documentoId:
                  d.id,

                ...d.data(),
              })
            );

          recalcular();
        },

        (err) => {
          console.error(
            "Error escuchando retiros:",
            err
          );

          setError(
            err?.message ||
              "No se pudieron cargar los retiros de caja."
          );
        }
      );

    const cancelarCortes =
      onSnapshot(
        collection(
          db,
          "usuarios",
          ownerUid,
          "cortesCaja"
        ),

        (snapshot) => {
          cortesRecibidos = true;
          cortesCaja =
            snapshot.docs.map(
              (d) => ({
                documentoId:
                  d.id,

                ...d.data(),
              })
            );

          recalcular();
        },

        (err) => {
          console.error(
            "Error escuchando cortes:",
            err
          );

          setError(
            err?.message ||
              "No se pudieron cargar los cortes de caja."
          );
        }
      );

    return () => {
      cancelarVentas();
      cancelarRetiros();
      cancelarCortes();
    };
  }, [
    ownerUid,
    usuario?.id,
    usuario?.numeroUsuario,
  ]);

  // =========================================================
  // RETIRO DE $3,000
  // =========================================================

  const realizarRetiro =
    async () => {
      if (procesandoRetiro) return;

      const textoMonto = String(montoRetiroInputRef.current?.value ?? montoRetiro).trim();
      const monto = textoMonto === "" ? NaN : Number(textoMonto.replace(",", "."));

      if (!Number.isFinite(monto) || monto <= 0 || Math.abs(Math.round(monto * 100) - monto * 100) > 0.000001) {
        setError("Escribe una cantidad válida para retirar.");
        return;
      }

      if (monto > efectivoEnCaja) {
        setError(
          `No puedes retirar $${monto.toFixed(2)} porque solamente hay $${efectivoEnCaja.toFixed(2)} en caja.`
        );
        return;
      }

      try {
        setProcesandoRetiro(true);
        setError("");
        setMensajeVenta("");

        const [ventasSnap, retirosSnap, cortesSnap] = await Promise.all([
          getDocs(collection(db, "usuarios", ownerUid, "ventas")),
          getDocs(collection(db, "usuarios", ownerUid, "retirosCaja")),
          getDocs(collection(db, "usuarios", ownerUid, "cortesCaja")),
        ]);

        const esDelCajero = (movimiento) => {
          if (movimiento?.usuarioId != null && usuario?.id != null) {
            return String(movimiento.usuarioId) === String(usuario.id);
          }
          return String(movimiento?.numeroUsuario ?? "") ===
            String(usuario?.numeroUsuario ?? "");
        };

        const ultimoCorte = cortesSnap.docs
          .map((d) => d.data())
          .filter(esDelCajero)
          .reduce(
            (mayor, corte) => Math.max(mayor, Number(corte.fechaHora ?? 0)),
            0
          );

        const totalVentasEfectivo = ventasSnap.docs
          .map(d => d.data())
          .filter(venta => esDelCajero(venta) && Number(venta.fechaHora ?? 0) > ultimoCorte)
          .reduce((total, venta) => total + obtenerEfectivoDeVenta(venta), 0);

        const totalRetiros = retirosSnap.docs
          .map((d) => d.data())
          .filter(
            (retiro) =>
              esDelCajero(retiro) &&
              Number(retiro.fechaHora ?? 0) > ultimoCorte
          )
          .reduce((total, retiro) => total + Number(retiro.monto ?? 0), 0);

        const saldoAntes = Number(
          (totalVentasEfectivo - totalRetiros).toFixed(2)
        );

        if (monto > saldoAntes) {
          throw new Error(
            `No puedes retirar $${monto.toFixed(2)}. El efectivo real disponible es $${saldoAntes.toFixed(2)}.`
          );
        }

        const saldoDespues = Number((saldoAntes - monto).toFixed(2));
        const retiroRef = doc(
          collection(db, "usuarios", ownerUid, "retirosCaja")
        );

        await setDoc(retiroRef, {
          id: retiroRef.id,
          propietarioUid: ownerUid,
          usuarioId: usuario?.id ?? null,
          numeroUsuario: usuario?.numeroUsuario ?? "",
          nombreUsuario: usuario?.nombre ?? "Usuario",
          monto,
          saldoAntes,
          saldoDespues,
          fechaHora: Date.now(),
          fechaServidor: serverTimestamp(),
          origen: "web",
        });

        setEfectivoEnCaja(saldoDespues);
        setMostrarConfirmarRetiro(false);
        setMostrarMenu(false);
        setMontoRetiro("");
        setMensajeVenta(
          `Retiro de $${monto.toFixed(2)} registrado correctamente.`
        );
      } catch (err) {
        console.error("Error realizando retiro:", err);
        setError(err?.message || "No se pudo registrar el retiro de caja.");
      } finally {
        setProcesandoRetiro(false);
      }
    };

  // =========================================================
  // F3 - TICKET ANTERIOR
  // =========================================================

  const imprimirTicketAnterior =
    async () => {
      setError("");
      setMensajeVenta("");

      const ventana =
        window.open(
          "",
          "_blank",
          "width=430,height=720"
        );

      try {
        const snapshot =
          await getDocs(
            collection(
              db,
              "usuarios",
              ownerUid,
              "ventas"
            )
          );

        const esDelCajero = (
          venta
        ) => {
          if (
            venta?.usuarioId !=
              null &&
            usuario?.id != null
          ) {
            return (
              String(
                venta.usuarioId
              ) ===
              String(
                usuario.id
              )
            );
          }

          return (
            String(
              venta?.numeroUsuario ??
                ""
            ) ===
            String(
              usuario?.numeroUsuario ??
                ""
            )
          );
        };

        const ventasCajero =
          snapshot.docs
            .map(
              (d) => ({
                documentoId:
                  d.id,

                ...d.data(),
              })
            )
            .filter(
              esDelCajero
            )
            .sort(
              (a, b) =>
                Number(
                  b.fechaHora ??
                    0
                ) -
                Number(
                  a.fechaHora ??
                    0
                )
            );

        const venta =
          ventasCajero[0];

        if (!venta) {
          ventana?.close();

          setError(
            "Todavía no existe una venta anterior para imprimir."
          );

          return;
        }

        if (!ventana) {
          setError(
            "El navegador bloqueó la ventana de impresión."
          );

          return;
        }

        const productosVenta =
          Array.isArray(
            venta.productos
          )
            ? venta.productos
            : [];

        const filas =
          productosVenta
            .map(
              (item) => `
                <tr>
                  <td>${String(
                    item.nombre ??
                      "Producto"
                  )}</td>

                  <td style="text-align:center">
                    ${Number(
                      item.cantidad ??
                        0
                    )}
                  </td>

                  <td style="text-align:right">
                    $${Number(
                      item.subtotal ??
                        0
                    ).toFixed(2)}
                  </td>
                </tr>
              `
            )
            .join("");

        const metodo =
          String(
            venta.metodoPago ??
              ""
          );

        const esEfectivo =
          metodo.toLowerCase() ===
          "efectivo";

        const recibido =
          Number(
            venta.recibido ??
              0
          );

        const cambio =
          Number(
            venta.cambio ??
              0
          );

        const fechaVenta =
          new Date(
            Number(
              venta.fechaHora ??
                Date.now()
            )
          ).toLocaleString(
            "es-MX"
          );

        ventana.document.write(`
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Ticket POS Init</title>

<style>
body {
  font-family: monospace;
  max-width: 360px;
  margin: 20px auto;
  color: #000;
  padding: 0 12px;
}

h2,
p {
  text-align: center;
}

table {
  width: 100%;
  border-collapse: collapse;
}

td {
  padding: 5px 0;
  vertical-align: top;
}

.linea {
  border-top: 1px dashed #000;
  margin: 10px 0;
}

.derecha {
  text-align: right;
}

.total {
  font-size: 19px;
  font-weight: bold;
}

button {
  width: 100%;
  padding: 10px;
  margin-top: 18px;
}

@media print {
  button {
    display: none;
  }

  body {
    margin: 0 auto;
  }
}
</style>
</head>

<body>

<h2>POS Init</h2>

<p>
${fechaVenta}
</p>

<p>
Cajero:
${String(
  venta.nombreUsuario ??
    usuario?.nombre ??
    ""
)}
·
${String(
  venta.numeroUsuario ??
    usuario?.numeroUsuario ??
    ""
)}
</p>

<div class="linea"></div>

<table>
<tbody>
${filas}
</tbody>
</table>

<div class="linea"></div>

<div class="derecha total">
Total:
$${Number(
  venta.total ??
    0
).toFixed(2)}
</div>

<p>
Método:
${metodo || "Sin especificar"}
</p>

${
  esEfectivo
    ? `
<div class="derecha">
Recibido:
$${recibido.toFixed(2)}
</div>

<div class="derecha">
Cambio:
$${cambio.toFixed(2)}
</div>
`
    : ""
}

<button onclick="window.print()">
Imprimir ticket
</button>

</body>
</html>
        `);

        ventana.document.close();
        ventana.addEventListener("keydown", (e) => { if (e.key === "Escape") ventana.close(); });

        setMostrarMenu(
          false
        );
      } catch (err) {
        ventana?.close();

        console.error(
          "Error imprimiendo ticket anterior:",
          err
        );

        setError(
          err?.message ||
            "No se pudo cargar el ticket anterior."
        );
      }
    };

  // =========================================================
  // MENÚ F1-F6
  // =========================================================

  const [mostrarConfirmacionSalida, setMostrarConfirmacionSalida] = useState(false);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);

  const solicitarCerrarSesion = () => {
    setMostrarMenu(false);
    setMostrarConfirmacionSalida(true);
  };

  const confirmarCerrarSesion = async () => {
    if (cerrandoSesion) return;
    setCerrandoSesion(true);
    try {
      // Guardar aviso auditable sin modificar ni liquidar el saldo de caja.
      const registroRef = doc(collection(db, "usuarios", ownerUid, "cierresSesionCaja"));
      await setDoc(registroRef, {
        id: registroRef.id,
        propietarioUid: ownerUid,
        usuarioId: usuario?.id ?? null,
        numeroUsuario: usuario?.numeroUsuario ?? "",
        nombreUsuario: usuario?.nombre ?? "Usuario",
        efectivoRegistrado: Number(efectivoEnCaja.toFixed(2)),
        pendienteCorte: efectivoEnCaja > 0,
        fechaHora: Date.now(),
        fechaServidor: serverTimestamp(),
        origen: "web",
        estado: efectivoEnCaja > 0 ? "pendiente_revision" : "sin_efectivo_registrado",
      });
      setMostrarConfirmacionSalida(false);
      onCerrarCaja?.(ultimoCorteRealizado);
    } catch (err) {
      console.error("No se pudo registrar el cierre de sesión:", err);
      setError("No se pudo registrar el cierre. Comprueba permisos de Firestore.");
    } finally {
      setCerrandoSesion(false);
    }
  };

  useEffect(() => {
    const manejarTecla = (event) => {
      if (cajaEnEspera) return;
      if (!["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "Escape"].includes(event.key)) return;
      if (event.key === "Escape" && !configuracionFunciones && !mostrarMenu) return;
      event.preventDefault(); // F1 no debe abrir la ayuda del navegador.
      if (configuracionFunciones) {
        if (event.key === "Escape" || event.key === "F1") setConfiguracionFunciones(null);
        return;
      }
      if (mostrarConfirmacionSalida || ticketVentaActual || mostrarConfirmarRetiro ||
          mostrarCerrarSesionCorte || mostrarCobro || mostrarConfigPay) return;
      if (mostrarHistorial || mostrarCorte) {
        if (event.key === "F1") {
          event.preventDefault();
          setMostrarHistorial(false);
          setMostrarCorte(false);
        }
        return;
      }
      if (event.key === "F10") {
        solicitarCerrarSesion();
        return;
      }
      if (event.key === "F9") {
        ponerCajaEnEspera();
        return;
      }
      if (event.key === "F1") {
        event.preventDefault();
        setMostrarMenu((abierto) => !abierto);
        return;
      }
      if (mostrarMenu && ["F6", "F7", "F8"].includes(event.key)) {
        abrirConfiguracion({ F6: "camara", F7: "notificaciones", F8: "ubicacion" }[event.key]);
        return;
      }
      if (event.key === "Escape" && mostrarMenu) { setMostrarMenu(false); return; }
      if (!mostrarMenu) return;
      if (event.key === "F2") {
        if (efectivoEnCaja <= 0) {
          setError("No hay efectivo disponible para realizar un retiro.");
          return;
        }
        setMostrarMenu(false);
        setMontoRetiro("");
        setMostrarConfirmarRetiro(true);
      } else if (event.key === "F3") {
        setMostrarMenu(false);
        setMostrarCorte(true);
      } else if (event.key === "F4") {
        imprimirTicketAnterior();
      } else if (event.key === "F5") {
        setMostrarMenu(false);
        setMostrarHistorial(true);
      }
    };
    window.addEventListener("keydown", manejarTecla);
    return () => window.removeEventListener("keydown", manejarTecla);
  }, [mostrarMenu, mostrarHistorial, mostrarCorte, mostrarCobro,
      mostrarCerrarSesionCorte, mostrarConfirmarRetiro, mostrarConfirmacionSalida, mostrarConfigPay,
      ticketVentaActual, efectivoEnCaja, ultimoCorteRealizado, onCerrarCaja, cajaEnEspera, configuracionFunciones]);

  // =========================================================
  // CONFIRMACIÓN CIERRE DESPUÉS DEL CORTE
  // =========================================================

  useEffect(() => {
    if (
      !mostrarCerrarSesionCorte
    ) {
      return undefined;
    }

    const manejarConfirmacionCierre =
      (event) => {
        if (
          event.key ===
          "Enter"
        ) {
          event.preventDefault();

          const corte =
            ultimoCorteRealizado;

          setMostrarCerrarSesionCorte(
            false
          );

          setUltimoCorteRealizado(
            null
          );

          onCerrarCaja?.(
            corte
          );

          return;
        }

        if (
          event.key ===
            "Backspace" ||
          event.key ===
            "Escape"
        ) {
          event.preventDefault();

          setMostrarCerrarSesionCorte(
            false
          );

          setCierreSesionHabilitado(
            true
          );
        }
      };

    window.addEventListener(
      "keydown",
      manejarConfirmacionCierre
    );

    return () => {
      window.removeEventListener(
        "keydown",
        manejarConfirmacionCierre
      );
    };
  }, [
    mostrarCerrarSesionCorte,
    ultimoCorteRealizado,
    onCerrarCaja,
  ]);

  // =========================================================
  // PRODUCTOS FILTRADOS
  // =========================================================

  // Orden alfabético estable, incluyendo nombres con acentos.
  const productosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase("es-MX");
    return productos
      .filter((producto) => {
        if (!texto) return true;
        return [producto.nombre, producto.codigoBarras, producto.categoria]
          .some((valor) => String(valor ?? "").toLocaleLowerCase("es-MX").includes(texto));
      })
      .sort((a, b) =>
        String(a.nombre ?? "").localeCompare(String(b.nombre ?? ""), "es-MX", {
          sensitivity: "base",
          numeric: true,
        })
      );
  }, [productos, busqueda]);

  // =========================================================
  // STOCK
  // =========================================================

  const obtenerStock = (
    producto
  ) => {
    const productoId =
      producto.id ??
      producto.documentoId;

    const datos =
      inventario[
        String(
          productoId
        )
      ];

    return Number(
      datos?.stockActual ??
        0
    );
  };

  // =========================================================
  // ATAJOS DEL CATÁLOGO
  // =========================================================

  useEffect(() => {
    setProductoSeleccionado(
      0
    );
  }, [
    busqueda,
    productos.length,
  ]);

  useEffect(() => {
    const manejarCatalogo = (
      event
    ) => {
      if (
        mostrarMenu ||
        mostrarConfigPay ||
        mostrarCobro ||
        mostrarCorte ||
        mostrarHistorial ||
        mostrarCerrarSesionCorte ||
        mostrarConfirmarRetiro ||
        ticketVentaActual
      ) {
        return;
      }

      const elemento =
        document.activeElement;

      const esBuscador =
        elemento === buscadorRef.current;

      const escribiendoEnOtroCampo =
        !esBuscador &&
        (elemento?.tagName === "INPUT" ||
          elemento?.tagName === "TEXTAREA" ||
          elemento?.tagName === "SELECT" ||
          elemento?.isContentEditable);

      // Alt + letra: saltar al primer producto de esa inicial.
      // Solo funciona si el navegador entrega el atajo a la página.
      if (event.altKey && !event.ctrlKey && !event.metaKey &&
          /^[a-z]$/i.test(event.key) && !escribiendoEnOtroCampo) {
        event.preventDefault();
        const letra = event.key.toLocaleLowerCase("es-MX");
        const normalizar = (valor) => String(valor ?? "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLocaleLowerCase("es-MX");
        const indice = productosFiltrados.findIndex((producto) =>
          normalizar(producto.nombre).startsWith(letra)
        );
        if (indice >= 0) {
          setProductoSeleccionado(indice);
          requestAnimationFrame(() => {
            document.querySelector(`[data-producto-indice="${indice}"]`)
              ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          });
        }
        return;
      }

      // + = abrir buscador
      if (
        event.key === "+"
      ) {
        event.preventDefault();

        buscadorRef.current
          ?.focus();

        buscadorRef.current
          ?.select();

        return;
      }

      // . = limpiar buscador
      if (
        event.key === "."
      ) {
        event.preventDefault();

        setBusqueda("");

        setProductoSeleccionado(
          0
        );

        buscadorRef.current
          ?.focus();

        return;
      }

      if (escribiendoEnOtroCampo) {
        return;
      }

      if (
        esBuscador &&
        event.key === "Escape"
      ) {
        event.preventDefault();
        elemento?.blur?.();
        return;
      }

      if (
        productosFiltrados.length ===
        0
      ) {
        return;
      }

      let nuevoIndice =
        productoSeleccionado;

      const rejilla = document.querySelector(".productos-grid");
      const columnasAproximadas = rejilla
        ? getComputedStyle(rejilla).gridTemplateColumns.split(" ").filter(Boolean).length
        : 5;

      if (
        event.key ===
        "ArrowRight"
      ) {
        nuevoIndice =
          Math.min(
            productosFiltrados.length -
              1,

            productoSeleccionado +
              1
          );
      } else if (
        event.key ===
        "ArrowLeft"
      ) {
        nuevoIndice =
          Math.max(
            0,
            productoSeleccionado -
              1
          );
      } else if (
        event.key ===
        "ArrowDown"
      ) {
        nuevoIndice =
          Math.min(
            productosFiltrados.length -
              1,

            productoSeleccionado +
              columnasAproximadas
          );
      } else if (
        event.key ===
        "ArrowUp"
      ) {
        nuevoIndice =
          Math.max(
            0,
            productoSeleccionado -
              columnasAproximadas
          );
      } else if (
        event.key ===
        "Enter"
      ) {
        event.preventDefault();

        const producto =
          productosFiltrados[
            productoSeleccionado
          ];

        if (
          producto &&
          obtenerStock(
            producto
          ) > 0
        ) {
          agregarProducto(
            producto
          );
        }

        return;
      } else {
        return;
      }

      event.preventDefault();

      setProductoSeleccionado(
        nuevoIndice
      );

      requestAnimationFrame(
        () => {
          document
            .querySelector(
              `[data-producto-indice="${nuevoIndice}"]`
            )
            ?.scrollIntoView(
              {
                behavior:
                  "smooth",

                block:
                  "nearest",

                inline:
                  "nearest",
              }
            );
        }
      );
    };

    window.addEventListener(
      "keydown",
      manejarCatalogo
    );

    return () =>
      window.removeEventListener(
        "keydown",
        manejarCatalogo
      );
  }, [
    productosFiltrados,
    productoSeleccionado,
    mostrarMenu,
    mostrarConfigPay,
    mostrarCobro,
    mostrarCorte,
    mostrarHistorial,
    mostrarCerrarSesionCorte,
    mostrarConfirmarRetiro,
    ticketVentaActual,
    inventario,
    carrito,
  ]);

  // =========================================================
  // CANTIDAD EN CARRITO
  // =========================================================

  const cantidadEnCarrito = (
    productoId
  ) => {
    const item =
      carrito.find(
        (producto) =>
          String(
            producto.id
          ) ===
          String(
            productoId
          )
      );

    return (
      item?.cantidad ??
      0
    );
  };

  // =========================================================
  // AGREGAR PRODUCTO
  // =========================================================

  const agregarProducto = (
    producto
  ) => {
    setMensajeVenta("");
    setError("");

    const productoId =
      producto.id ??
      producto.documentoId;

    const stock =
      obtenerStock(
        producto
      );

    if (
      stock <= 0
    ) {
      setError(
        `${
          producto.nombre ||
          "El producto"
        } no tiene existencias.`
      );

      return;
    }

    const cantidadActual =
      cantidadEnCarrito(
        productoId
      );

    if (
      cantidadActual >=
      stock
    ) {
      setError(
        `No hay más unidades disponibles de ${
          producto.nombre ||
          "este producto"
        }.`
      );

      return;
    }

    setCarrito(
      (actual) => {
        const existe =
          actual.find(
            (item) =>
              String(
                item.id
              ) ===
              String(
                productoId
              )
          );

        if (existe) {
          return actual.map(
            (item) =>
              String(
                item.id
              ) ===
              String(
                productoId
              )
                ? {
                    ...item,

                    cantidad:
                      item.cantidad +
                      1,
                  }
                : item
          );
        }

        return [
          ...actual,

          {
            id:
              productoId,

            nombre:
              producto.nombre ||
              "Producto",

            precio:
              Number(
                producto.precioVenta ??
                  0
              ),

            imagenUri:
              producto.imagenUri ||
              null,

            cantidad:
              1,
          },
        ];
      }
    );
  };

  // =========================================================
  // QUITAR PRODUCTO
  // =========================================================

  const quitarProducto = (
    productoId
  ) => {
    setError("");

    setCarrito(
      (actual) =>
        actual
          .map(
            (item) =>
              String(
                item.id
              ) ===
              String(
                productoId
              )
                ? {
                    ...item,

                    cantidad:
                      item.cantidad -
                      1,
                  }
                : item
          )
          .filter(
            (item) =>
              item.cantidad >
              0
          )
    );
  };

  // =========================================================
  // ELIMINAR PRODUCTO
  // =========================================================

  const eliminarProducto = (
    productoId
  ) => {
    setError("");

    setCarrito(
      (actual) =>
        actual.filter(
          (item) =>
            String(
              item.id
            ) !==
            String(
              productoId
            )
        )
    );
  };

  // =========================================================
  // VACIAR
  // =========================================================

  const vaciarCarrito =
    () => {
      setCarrito([]);

      setCierreSesionHabilitado(
        false
      );

      setError("");
      setMensajeVenta("");
    };

  // =========================================================
  // TOTALES
  // =========================================================

  const totalProductos =
    carrito.reduce(
      (
        total,
        producto
      ) =>
        total +
        producto.cantidad,
      0
    );

  const totalVenta =
    carrito.reduce(
      (
        total,
        producto
      ) =>
        total +
        producto.precio *
          producto.cantidad,
      0
    );

  // =========================================================
  // COBRAR
  // =========================================================

  const cobrar = () => {
    if (
      carrito.length ===
      0
    ) {
      return;
    }

    setError("");
    setMensajeVenta("");

    setMostrarCobro(
      true
    );
  };

  // Shift sola abre cobro; no interfiere con escritura de texto.
  useEffect(() => {
    const manejarShift = (event) => {
      if (event.key !== "Shift" || event.repeat || carrito.length === 0 ||
          mostrarCobro || mostrarMenu || mostrarConfigPay || mostrarCorte || mostrarHistorial || ticketVentaActual) return;
      const el = document.activeElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(el?.tagName) || el?.isContentEditable) return;
      event.preventDefault();
      cobrar();
    };
    window.addEventListener("keyup", manejarShift);
    return () => window.removeEventListener("keyup", manejarShift);
  }, [carrito, mostrarCobro, mostrarMenu, mostrarConfigPay, mostrarCorte, mostrarHistorial, ticketVentaActual]);

  // =========================================================
  // CONFIRMAR VENTA
  // =========================================================

  const confirmarVenta =
    async ({
      metodoPago,
      recibido,
      cambio,
      pagoDigitalId,
      cobroMixtoId,
      pagos: pagosMixtos,
    }) => {
      if (
        procesandoVenta ||
        carrito.length ===
          0
      ) {
        return;
      }

      if (!["efectivo", "tarjeta", "transferencia", "mixto"].includes(metodoPago)) {
        setError("Método de pago no permitido.");
        return;
      }
      // El efectivo de un cobro mixto se valida contra el plan persistido.
      if (metodoPago === "mixto" && (!cobroMixtoId || !Array.isArray(pagosMixtos))) {
        setError("Falta el plan de cobro combinado.");
        return;
      }
      if (metodoPago !== "mixto" && (!Number.isFinite(Number(recibido)) || !Number.isFinite(Number(cambio)))) {
        setError("Los importes del cobro no son válidos.");
        return;
      }

      try {
        setProcesandoVenta(
          true
        );

        setError("");
        setMensajeVenta("");

        if (metodoPago === "mixto") { recibido = Number(totalVenta.toFixed(2)); cambio = 0; }

        const carritoVenta =
          carrito.map(
            (item) => ({
              ...item,
            })
          );

        const totalFinal =
          Number(
            totalVenta.toFixed(
              2
            )
          );

        let planMixto = null;
        let desgloseMixto = null;
        if (metodoPago === "mixto") {
          planMixto = recuperarPlanMixto(ownerUid);
          if (!planMixto || planMixto.id !== cobroMixtoId) {
            throw new Error("No se encontró el cobro combinado pendiente. No se realizará otra venta.");
          }
          const cent = n => Math.round(Number(n) * 100);
          if (planMixto.totalCentavos !== cent(totalFinal) ||
              !Array.isArray(planMixto.pagos) || planMixto.pagos.length < 2 ||
              !planMixto.pagos.some(p => p.tipo === "tarjeta") ||
              planMixto.pagos.reduce((n,p) => n + p.importeCentavos, 0) !== planMixto.totalCentavos ||
              planMixto.pagos.some(p => !Number.isSafeInteger(p.importeCentavos) || p.importeCentavos <= 0 ||
                (p.tipo === "tarjeta" && (p.importeCentavos < 1000 || !p.pagoId)))) {
            throw new Error("La distribución de pagos no es válida.");
          }
          const normalizar = items => items.map(i =>
            `${String(i.id ?? i.productoId)}:${Number(i.cantidad)}:${cent(i.precio)}`).sort();
          if (JSON.stringify(normalizar(planMixto.productos)) !== JSON.stringify(normalizar(carritoVenta))) {
            throw new Error("El carrito cambió desde que se prepararon los pagos. Conserva el cobro pendiente para revisión.");
          }
          // La UI no decide qué pagos fueron verificados: se leen nuevamente dentro de la transacción.
          desgloseMixto = planMixto.pagos.map(p => ({
            tipo: p.tipo, importe: p.importeCentavos / 100,
            ...(p.tipo === "tarjeta" ? { pagoId: p.pagoId } : {}),
          }));
        }

        // Identificador estable: reintentos no crean otra venta del mismo cobro.
        const ventaRef = metodoPago === "mixto"
          ? doc(db, "usuarios", ownerUid, "ventas", `mixto_${cobroMixtoId}`)
          : doc(collection(db, "usuarios", ownerUid, "ventas"));

        await runTransaction(
          db,

          async (
            transaction
          ) => {
            if (metodoPago === "mixto") {
              const anterior = await transaction.get(ventaRef);
              if (anterior.exists()) {
                throw new Error("Este cobro combinado ya tiene una venta registrada. No se duplicó la venta.");
              }
            }
            const inventarios =
              [];

            for (
              const item of
              carritoVenta
            ) {
              const inventarioRef =
                doc(
                  db,
                  "usuarios",
                  ownerUid,
                  "inventario",
                  String(
                    item.id
                  )
                );

              const snapshot =
                await transaction.get(
                  inventarioRef
                );

              if (
                !snapshot.exists()
              ) {
                throw new Error(
                  `No existe inventario para ${item.nombre}.`
                );
              }

              const datos =
                snapshot.data();

              const stockActual =
                Number(
                  datos.stockActual ??
                    0
                );

              if (
                stockActual <
                item.cantidad
              ) {
                throw new Error(
                  `Stock insuficiente para ${item.nombre}. Disponible: ${stockActual}.`
                );
              }

              inventarios.push(
                {
                  referencia:
                    inventarioRef,

                  nuevoStock:
                    stockActual -
                    item.cantidad,
                }
              );
            }

            if (metodoPago === "mixto") {
              // Firestore exige todas las lecturas antes de cualquier escritura.
              const comprobantes = [];
              const tarjetas = planMixto.pagos.filter(p => p.tipo === "tarjeta");
              const ids = tarjetas.map(p => p.pagoId);
              if (new Set(ids).size !== ids.length) {
                throw new Error("Hay tarjetas con el mismo identificador de pago.");
              }
              for (const parte of tarjetas) {
                const ref = doc(db, "pagosPosInit", parte.pagoId);
                const snap = await transaction.get(ref);
                if (!snap.exists()) throw new Error("Falta un pago de Stripe.");
                const pago = snap.data();
                const stripe = pago.stripeConfirmacion || {};
                const cent = n => Math.round(Number(n) * 100);
                const normalizar = items => (items || []).map(i =>
                  `${String(i.id ?? i.productoId)}:${Number(i.cantidad)}:${cent(i.precio)}`).sort();
                if (pago.ownerUid !== ownerUid || pago.cobroMixtoId !== cobroMixtoId ||
                    cent(pago.totalVenta) !== cent(totalFinal) ||
                    cent(pago.total) !== parte.importeCentavos || pago.estado !== "pendiente" ||
                    stripe.proveedor !== "stripe" || stripe.entorno !== "test" ||
                    stripe.estado !== "paid" || stripe.moneda !== "mxn" ||
                    Number(stripe.importeCentavos) !== parte.importeCentavos ||
                    !stripe.sessionId || !stripe.eventId ||
                    JSON.stringify(normalizar(pago.productos)) !== JSON.stringify(normalizar(carritoVenta))) {
                  throw new Error("Una tarjeta todavía no está confirmada por Stripe o no corresponde a esta venta.");
                }
                comprobantes.push({ ref, parte });
              }
              for (const { ref, parte } of comprobantes) {
                transaction.update(ref, {
                  estado: "confirmado", ventaId: ventaRef.id,
                  fechaConfirmacion: serverTimestamp(),
                  ticket: {
                    folio: ventaRef.id, total: totalFinal, metodoPago: "mixto",
                    cobroMixtoId,
                    productos: carritoVenta.map(item => ({
                      nombre: item.nombre, cantidad: item.cantidad,
                      precio: item.precio,
                      subtotal: Number((item.precio * item.cantidad).toFixed(2)),
                    })),
                  },
                });
              }
            }

            if (metodoPago === "tarjeta") {
              if (!pagoDigitalId) throw new Error("Falta el identificador del pago Stripe.");
              const pagoRef = doc(db, "pagosPosInit", pagoDigitalId);
              const pagoSnap = await transaction.get(pagoRef);
              if (!pagoSnap.exists()) throw new Error("No existe el pago de Stripe.");
              const pago = pagoSnap.data();
              // Un pago parcial jamás debe consumirse como pago total normal.
              if (pago.cobroMixtoId || pago.totalVenta || pago.tipoCobro === "mixto") {
                throw new Error("Este pago pertenece a un cobro combinado y no puede usarse como pago único.");
              }
              const stripe = pago.stripeConfirmacion || {};
              if (pago.ownerUid !== ownerUid || pago.estado !== "pendiente" ||
                  Math.round(Number(pago.total) * 100) !== Math.round(totalFinal * 100) ||
                  stripe.proveedor !== "stripe" || stripe.entorno !== "test" ||
                  stripe.estado !== "paid" || stripe.moneda !== "mxn" ||
                  Number(stripe.importeCentavos) !== Math.round(totalFinal * 100) ||
                  !stripe.sessionId || !stripe.eventId) {
                throw new Error("Stripe no confirmó este pago o sus datos no coinciden.");
              }
              const itemsPago = Array.isArray(pago.productos) ? pago.productos : [];
              const normalizar = items => items.map(i => `${String(i.id ?? i.productoId)}:${Number(i.cantidad)}:${Math.round(Number(i.precio)*100)}`).sort();
              if (JSON.stringify(normalizar(itemsPago)) !== JSON.stringify(normalizar(carritoVenta))) {
                throw new Error("El carrito no coincide con el pago confirmado.");
              }
              transaction.update(pagoRef, {
                estado: "confirmado", ventaId: ventaRef.id,
                fechaConfirmacion: serverTimestamp(),
                ticket: {
                  folio: ventaRef.id, total: totalFinal, metodoPago: "tarjeta",
                  productos: carritoVenta.map(item => ({ nombre: item.nombre,
                    cantidad: item.cantidad, precio: item.precio,
                    subtotal: Number((item.precio * item.cantidad).toFixed(2)) })),
                },
              });
            }

            if (metodoPago === "transferencia") {
              if (!pagoDigitalId) throw new Error("Falta el identificador del pago digital.");
              const pagoRef = doc(db, "pagosPosInit", pagoDigitalId);
              const pagoSnap = await transaction.get(pagoRef);
              if (!pagoSnap.exists() || pagoSnap.data().ownerUid !== ownerUid ||
                  pagoSnap.data().estado !== "pendiente" ||
                  Math.abs(Number(pagoSnap.data().total) - totalFinal) > 0.001) {
                throw new Error("La solicitud de pago ya no es válida.");
              }
              // Este estado solo se escribe después de verificar el depósito manualmente.
              transaction.update(pagoRef, {
                estado: "confirmado", ventaId: ventaRef.id,
                fechaConfirmacion: serverTimestamp(),
                ticket: {
                  folio: ventaRef.id, total: totalFinal, metodoPago: "transferencia",
                  productos: carritoVenta.map(item => ({ nombre: item.nombre,
                    cantidad: item.cantidad, precio: item.precio,
                    subtotal: Number((item.precio * item.cantidad).toFixed(2)) })),
                },
              });
            }

            inventarios.forEach(
              ({
                referencia,
                nuevoStock,
              }) => {
                transaction.update(
                  referencia,

                  {
                    stockActual:
                      nuevoStock,

                    fechaActualizacion:
                      Date.now(),
                  }
                );
              }
            );

            transaction.set(
              ventaRef,

              {
                id:
                  ventaRef.id,

                propietarioUid:
                  ownerUid,

                usuarioId:
                  usuario?.id ??
                  null,

                numeroUsuario:
                  usuario
                    ?.numeroUsuario ??
                  "",

                nombreUsuario:
                  usuario?.nombre ??
                  "Usuario",

                productos:
                  carritoVenta.map(
                    (item) => ({
                      productoId:
                        item.id,

                      nombre:
                        item.nombre,

                      precio:
                        Number(
                          item.precio
                        ),

                      cantidad:
                        item.cantidad,

                      subtotal:
                        Number(
                          (
                            item.precio *
                            item.cantidad
                          ).toFixed(
                            2
                          )
                        ),
                    })
                  ),

                cantidadProductos:
                  carritoVenta.reduce(
                    (
                      total,
                      item
                    ) =>
                      total +
                      item.cantidad,

                    0
                  ),

                total:
                  totalFinal,

                metodoPago,
                ...(metodoPago === "mixto" ? { pagos: desgloseMixto, cobroMixtoId } : {}),

                recibido:
                  Number(
                    recibido.toFixed(
                      2
                    )
                  ),

                cambio:
                  Number(
                    cambio.toFixed(
                      2
                    )
                  ),

                fechaHora:
                  Date.now(),

                fechaServidor:
                  serverTimestamp(),
              }
            );
          }
        );

        // onSnapshot actualiza el stock tras confirmar la transacción.

        const fechaVentaFinal =
          Date.now();

        setTicketVentaActual(
          {
            id:
              ventaRef.id,

            folio:
              ventaRef.id,

            fechaHora:
              fechaVentaFinal,

            nombreUsuario:
              usuario?.nombre ??
              "Usuario",

            numeroUsuario:
              usuario?.numeroUsuario ??
              "",

            productos:
              carritoVenta.map(
                (item) => ({
                  productoId:
                    item.id,

                  nombre:
                    item.nombre,

                  precio:
                    Number(
                      item.precio
                    ),

                  cantidad:
                    item.cantidad,

                  subtotal:
                    Number(
                      (
                        item.precio *
                        item.cantidad
                      ).toFixed(
                        2
                      )
                    ),
                })
              ),

            cantidadProductos:
              carritoVenta.reduce(
                (
                  total,
                  item
                ) =>
                  total +
                  item.cantidad,

                0
              ),

            total:
              totalFinal,

            metodoPago,
            ...(metodoPago === "mixto" ? { pagos: desgloseMixto, cobroMixtoId } : {}),

            recibido:
              Number(
                recibido.toFixed(
                  2
                )
              ),

            cambio:
              Number(
                cambio.toFixed(
                  2
                )
              ),
          }
        );

        if (metodoPago === "mixto") {
          try { limpiarPlanMixto(ownerUid, cobroMixtoId); }
          catch (e) { console.warn("Venta confirmada; no se pudo limpiar el plan local:", e); }
        }
        setCarrito([]);

        // Una venta nueva significa que el corte anterior
        // ya no permite cerrar la sesión.
        setCierreSesionHabilitado(
          false
        );

        setMostrarCobro(
          false
        );

        setMensajeVenta("");
      } catch (err) {
        console.error(
          "Error realizando venta:",
          err
        );

        setError(
          err?.message ||
            "No se pudo realizar la venta."
        );

        setMostrarCobro(
          false
        );
      } finally {
        setProcesandoVenta(
          false
        );
      }
    };

  // =========================================================
  // QR DEL TICKET DIGITAL
  // =========================================================

  const urlQrTicket =
    useMemo(() => {
      if (!ticketVentaActual) {
        return "";
      }

      try {
        const datosPublicos = {
          v: 1,
          folio:
            ticketVentaActual.folio ??
            ticketVentaActual.id ??
            "",
          fechaHora:
            Number(ticketVentaActual.fechaHora ?? Date.now()),
          nombreUsuario:
            ticketVentaActual.nombreUsuario ?? "",
          numeroUsuario:
            ticketVentaActual.numeroUsuario ?? "",
          productos:
            (ticketVentaActual.productos || []).slice(-10).map((item) => ({
              nombre: String(item.nombre ?? "Producto"),
              precio: Number(item.precio ?? 0),
              cantidad: Number(item.cantidad ?? 0),
              subtotal: Number(item.subtotal ?? 0),
            })),
          total: Number(ticketVentaActual.total ?? 0),
          metodoPago: String(
            ticketVentaActual.metodoPago ?? "Sin especificar"
          ),
          recibido: Number(ticketVentaActual.recibido ?? 0),
          cambio: Number(ticketVentaActual.cambio ?? 0),
        };

        const json = JSON.stringify(datosPublicos);
        const bytes = new TextEncoder().encode(json);
        let binario = "";

        bytes.forEach((byte) => {
          binario += String.fromCharCode(byte);
        });

        const token = btoa(binario)
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/g, "");

        return `${window.location.origin}${window.location.pathname}?ticket=${token}`;
      } catch (err) {
        console.error("Error creando QR del ticket:", err);
        return "";
      }
    }, [ticketVentaActual]);

  // =========================================================
  // CERRAR TICKET
  // =========================================================

  const borrarTicketYSalir =
    () => {
      setTicketVentaActual(
        null
      );

      setError("");
      setMensajeVenta("");
      setBusqueda("");
    };

  // =========================================================
  // IMPRIMIR TICKET ACTUAL
  // =========================================================

  const imprimirTicketVentaActual =
    () => {
      if (
        !ticketVentaActual
      ) {
        return;
      }

      const venta =
        ticketVentaActual;

      const ventana =
        window.open(
          "",
          "_blank",
          "width=430,height=720"
        );

      if (!ventana) {
        setError(
          "El navegador bloqueó la ventana de impresión."
        );

        return;
      }

      const productosVenta =
        Array.isArray(
          venta.productos
        )
          ? venta.productos
          : [];

      const filas =
        productosVenta
          .map(
            (item) => `
              <tr>
                <td>
                  ${String(
                    item.nombre ??
                      "Producto"
                  )}
                </td>

                <td style="text-align:center">
                  ${Number(
                    item.cantidad ??
                      0
                  )}
                </td>

                <td style="text-align:right">
                  $${Number(
                    item.subtotal ??
                      0
                  ).toFixed(2)}
                </td>
              </tr>
            `
          )
          .join("");

      const metodo =
        String(
          venta.metodoPago ??
            ""
        );

      const esEfectivo =
        metodo.toLowerCase() ===
        "efectivo";

      const fechaVenta =
        new Date(
          Number(
            venta.fechaHora ??
              Date.now()
          )
        ).toLocaleString(
          "es-MX"
        );

      ventana.document.write(`
<!doctype html>

<html>

<head>

<meta charset="utf-8">

<title>
Ticket POS Init
</title>

<style>

body {
  font-family: monospace;
  max-width: 360px;
  margin: 20px auto;
  color: #000;
  padding: 0 12px;
}

h2,
p {
  text-align: center;
}

table {
  width: 100%;
  border-collapse: collapse;
}

td {
  padding: 5px 0;
  vertical-align: top;
}

.linea {
  border-top: 1px dashed #000;
  margin: 10px 0;
}

.derecha {
  text-align: right;
}

.total {
  font-size: 19px;
  font-weight: bold;
}

.folio {
  font-size: 11px;
  word-break: break-all;
}

@media print {
  body {
    margin: 0 auto;
  }
}

</style>

</head>

<body>

<h2>
POS Init
</h2>

<p>
${fechaVenta}
</p>

<p>
Cajero:
${String(
  venta.nombreUsuario ??
    ""
)}
·
${String(
  venta.numeroUsuario ??
    ""
)}
</p>

<p class="folio">
Folio:
${String(
  venta.folio ??
    venta.id ??
    ""
)}
</p>

<div class="linea"></div>

<table>
<tbody>
${filas}
</tbody>
</table>

<div class="linea"></div>

<div class="derecha total">
TOTAL:
$${Number(
  venta.total ??
    0
).toFixed(2)}
</div>

<p>
Método:
${metodo || "Sin especificar"}
</p>

${
  esEfectivo
    ? `
<div class="derecha">
Efectivo:
$${Number(
  venta.recibido ??
    0
).toFixed(2)}
</div>

<div class="derecha">
Cambio:
$${Number(
  venta.cambio ??
    0
).toFixed(2)}
</div>
`
    : ""
}

<p>
Gracias por su compra
</p>

<script>

window.onload = function () {
  window.print();

  setTimeout(
    function () {
      window.close();
    },
    400
  );
};

<\/script>

</body>

</html>
      `);

      ventana.document.close();
      ventana.addEventListener("keydown", (e) => { if (e.key === "Escape") ventana.close(); });

      borrarTicketYSalir();
    };

  // =========================================================
  // TECLAS TICKET
  // =========================================================

  useEffect(() => {
    if (
      !ticketVentaActual
    ) {
      return undefined;
    }

    const manejarTicket = (
      event
    ) => {
      if (
        event.key ===
        "Enter"
      ) {
        event.preventDefault();
        // Los tickets mixtos requieren impresión manual explícita.
        if (ticketVentaActual?.metodoPago === "mixto") return;

        imprimirTicketVentaActual();

        return;
      }

      if (
        event.key ===
          "Backspace" ||
        event.key ===
          "Escape" ||
        [
          "F1",
          "F2",
          "F3",
          "F4",
          "F5",
          "F6",
        ].includes(
          event.key
        )
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener(
      "keydown",
      manejarTicket
    );

    return () =>
      window.removeEventListener(
        "keydown",
        manejarTicket
      );
  }, [
    ticketVentaActual,
  ]);

  // =========================================================
  // TECLAS MODAL DE RETIRO
  // =========================================================

  useEffect(() => {
    if (!mostrarConfirmarRetiro) {
      return undefined;
    }

    const manejarRetiro = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();

        if (!procesandoRetiro) {
          setMostrarConfirmarRetiro(false);
        }
      }
    };

    window.addEventListener("keydown", manejarRetiro);

    return () =>
      window.removeEventListener("keydown", manejarRetiro);
  }, [
    mostrarConfirmarRetiro,
    procesandoRetiro,
    efectivoEnCaja,
  ]);

  // =========================================================
  // CARGANDO
  // =========================================================

  if (cargando) {
    return (
      <main className="ventas-cargando">

        <h2>
          POS Init
        </h2>

        <p>
          Cargando productos...
        </p>

      </main>
    );
  }

  // =========================================================
  // PANTALLA
  // =========================================================

  return (
    <main className="ventas-pagina">

      <style>{`
        /* Catálogo adaptable: cinco columnas cuando hay espacio */
        .ventas-pagina .catalogo {
          min-width: 0;
          container-type: inline-size;
        }
        .ventas-pagina .productos-grid {
          display: grid !important;
          grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
          grid-auto-rows: 205px !important;
          gap: 12px !important;
          padding: 8px 12px 20px !important;
          overflow-y: auto !important;
          align-content: start !important;
          box-sizing: border-box !important;
        }
        .ventas-pagina .producto-card {
          display: flex !important;
          flex-direction: column !important;
          width: 100% !important;
          height: 205px !important;
          min-width: 0 !important;
          min-height: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          border-radius: 14px !important;
          box-sizing: border-box !important;
          text-align: left !important;
        }
        .ventas-pagina .producto-imagen {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          flex: 1 1 auto !important;
          width: 100% !important;
          min-height: 0 !important;
          padding: 8px !important;
          overflow: hidden !important;
          box-sizing: border-box !important;
        }
        .ventas-pagina .producto-imagen img {
          display: block !important;
          width: 100% !important;
          height: 100% !important;
          max-width: 100% !important;
          max-height: 100% !important;
          object-fit: contain !important;
          object-position: center !important;
        }
        .ventas-pagina .producto-sin-imagen {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 100% !important;
          height: 100% !important;
          font-size: 34px !important;
        }
        .ventas-pagina .producto-info {
          display: flex !important;
          flex-direction: column !important;
          flex: 0 0 auto !important;
          gap: 3px !important;
          width: 100% !important;
          min-width: 0 !important;
          padding: 9px !important;
          box-sizing: border-box !important;
        }
        .ventas-pagina .producto-info strong,
        .ventas-pagina .producto-codigo {
          display: block !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
        }
        .ventas-pagina .producto-info strong { font-size: 13px !important; }
        .ventas-pagina .producto-codigo { font-size: 10px !important; }
        .ventas-pagina .producto-precio-stock {
          display: flex !important;
          justify-content: space-between !important;
          align-items: flex-end !important;
          gap: 4px !important;
          width: 100% !important;
          min-width: 0 !important;
        }
        .ventas-pagina .producto-precio {
          font-size: 14px !important;
          font-weight: 800 !important;
          white-space: nowrap !important;
        }
        .ventas-pagina .stock {
          max-width: 50% !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          font-size: 10px !important;
          white-space: nowrap !important;
        }
        @container (max-width: 650px) {
          .productos-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
        }
        @container (max-width: 420px) {
          .productos-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
      `}</style>


      {/* ENCABEZADO */}

      <header
        className="ventas-header"
        style={{
          position:
            "sticky",

          top:
            0,

          zIndex:
            100,
        }}
      >

        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <div>
          <h1>
            POS Init
          </h1>

          <p>
            Caja ·{" "}
            {usuario?.nombre ||
              "Usuario"}{" "}
            ·{" "}
            {usuario
              ?.numeroUsuario ||
              ""}
          </p>

          {false && efectivoEnCaja >= LIMITE_RETIRO && (
            <div
              style={{
                marginTop: "6px",
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                padding: "5px 10px",
                borderRadius: "8px",
                background: "#fff7ed",
                border: "1px solid #fdba74",
                color: "#9a3412",
                fontSize: "13px",
                fontWeight: 800,
              }}
            >
              ⚠ Retiro requerido · ${efectivoEnCaja.toFixed(2)} en caja
            </div>
          )}
          </div>

        </div>

        <div className="pos-ventas-herramientas">
          <div className="pos-ventas-buscador">
            <input
              ref={
                buscadorRef
              }
              className="buscar-producto"
              type="search"
              placeholder="Buscar producto o código..."
              value={
                busqueda
              }
              onChange={(e) =>
                setBusqueda(
                  e.target.value
                )
              }
              autoFocus
            />
          </div>
          <div className="pos-ventas-camara">
            <div className="pos-camara-cabecera">
              <CamaraIntegrada
                productos={productos}
                onProducto={agregarProducto}
                streamRemoto={streamRemoto}
                camaraId={camaraElegida}
                activa={camaraActiva && !cajaEnEspera}
                esperandoCelular={false}
              />
              <button
                type="button"
                className="pos-camara-boton"
                onClick={() => setCamaraActiva((actual) => !actual)}
              >
                {camaraActiva ? "⏸ Pausar cámara" : "▶ Activar cámara"}
              </button>
            </div>
          </div>
        </div>
        <div className="ventas-header-acciones" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" className="ventas-cerrar" onClick={async () => { try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch (err) { setError("Pantalla completa requiere autorización del navegador."); } }} title="Pantalla completa (equivalente a F11)">⛶ Pantalla completa</button>
          {permisoNotificacion !== "granted" && avisosHabilitados && (
            <button type="button" className="ventas-cerrar" onClick={activarNotificaciones} title="Activar notificaciones del sistema">🔔 Activar avisos</button>
          )}

          <button
            type="button"
            className="ventas-cerrar"
            onClick={() => {
              setMostrarMenu(
                true
              );

              setError("");
              setMensajeVenta("");
            }}
          >
            ☰ Menú · F1
          </button>

        </div>

      </header>

      {/* CONTENIDO */}

      <div
        className="ventas-contenido"
        style={{
          height: "auto",
          flex: "1 1 auto",
          minHeight: 0,

          overflow:
            "hidden",

          alignItems:
            "stretch",
        }}
      >

        {/* CATÁLOGO */}

        <section
          className="catalogo"
          style={{
            height:
              "100%",

            overflow:
              "hidden",

            minHeight:
              0,

            display:
              "flex",

            flexDirection:
              "column",
          }}
        >

          <div
            className="catalogo-superior"
            style={{
              position:
                "relative",

              zIndex:
                20,

              background:
                "#f4f7fa",

              paddingBottom:
                "12px",
            }}
          >

            {/* Buscador y cámara trasladados al encabezado principal. */}
          </div>

          {mensajeVenta && (
            <div className="venta-exitosa">
              ✅ {mensajeVenta}
            </div>
          )}

          {error && (
            <div className="ventas-error">
              {error}
            </div>
          )}

          {!error &&
            productosFiltrados
              .length ===
              0 && (
              <div className="sin-productos">
                No se encontraron productos.
              </div>
            )}

          {/* PRODUCTOS */}

          <div
            className="productos-grid"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              alignContent: "start",
              paddingBottom: "18px",
            }}
          >

            {productosFiltrados.map(
              (
                producto,
                index
              ) => {
                const productoId =
                  producto.id ??
                  producto.documentoId;

                const stock =
                  obtenerStock(
                    producto
                  );

                const sinStock =
                  stock <= 0;

                return (
                  <button
                    type="button"
                    data-producto-indice={
                      index
                    }
                    key={
                      producto.documentoId
                    }
                    style={
                      index ===
                      productoSeleccionado
                        ? {
                            outline:
                              "4px solid #2563eb",

                            outlineOffset:
                              "2px",

                            transform:
                              "translateY(-1px)",
                          }
                        : undefined
                    }
                    className={
                      sinStock
                        ? "producto-card producto-sin-stock"
                        : "producto-card"
                    }
                    disabled={
                      sinStock
                    }
                    onClick={() =>
                      agregarProducto(
                        producto
                      )
                    }
                  >

                    <div className="producto-imagen">

                      {producto.imagenUri ? (
                        <img
                          src={
                            producto.imagenUri
                          }
                          alt={
                            producto.nombre ||
                            "Producto"
                          }
                        />
                      ) : (
                        <div className="producto-sin-imagen">
                          📦
                        </div>
                      )}

                    </div>

                    <div className="producto-info">

                      <strong>
                        {producto.nombre ||
                          "Producto"}
                      </strong>

                      <span className="producto-codigo">

                        {producto.codigoBarras ||
                          "Sin código"}

                      </span>

                      <div className="producto-precio-stock">

                        <span className="producto-precio">

                          $
                          {Number(
                            producto.precioVenta ??
                              0
                          ).toFixed(
                            2
                          )}

                        </span>

                        <span
                          className={
                            sinStock
                              ? "stock agotado"
                              : "stock"
                          }
                        >

                          {sinStock
                            ? "Agotado"
                            : `Stock: ${stock > 99 ? "99+" : stock}`}

                        </span>

                      </div>

                    </div>

                  </button>
                );
              }
            )}

          </div>

        </section>

        {/* VENTA ACTUAL */}

        <aside
          className="carrito"
          style={{
            position:
              "sticky",

            top:
              0,

            height:
              "100%",

            maxHeight:
              "100%",

            overflow:
              "hidden",

            alignSelf:
              "stretch",
          }}
        >

          <div className="carrito-encabezado">

            <div>

              <h2>
                Venta actual
              </h2>

              <p>
                {totalProductos}{" "}
                {totalProductos ===
                1
                  ? "artículo"
                  : "artículos"}
              </p>

            </div>

            {carrito.length >
              0 && (
              <button
                type="button"
                className="vaciar-carrito"
                onClick={
                  vaciarCarrito
                }
              >
                Vaciar
              </button>
            )}

          </div>

          {carrito.length ===
          0 ? (
            <div className="carrito-vacio">

              <div>
                🛒
              </div>

              <strong>
                Venta vacía
              </strong>

              <p>
                Agrega productos para
                comenzar.
              </p>

            </div>
          ) : (
            <div className="carrito-productos">

              {carrito.map(
                (item) => (
                  <div
                    className="carrito-item"
                    key={
                      item.id
                    }
                  >

                    <div className="carrito-item-info">

                      <strong>
                        {item.nombre}
                      </strong>

                      <span>
                        $
                        {Number(
                          item.precio
                        ).toFixed(
                          2
                        )}{" "}
                        c/u
                      </span>

                    </div>

                    <div className="carrito-controles">

                      <button
                        type="button"
                        onClick={() =>
                          quitarProducto(
                            item.id
                          )
                        }
                      >
                        −
                      </button>

                      <strong>
                        {item.cantidad}
                      </strong>

                      <button
                        type="button"
                        onClick={() => {
                          const producto =
                            productos.find(
                              (p) =>
                                String(
                                  p.id ??
                                    p.documentoId
                                ) ===
                                String(
                                  item.id
                                )
                            );

                          if (
                            producto
                          ) {
                            agregarProducto(
                              producto
                            );
                          }
                        }}
                      >
                        +
                      </button>

                      <button
                        type="button"
                        className="eliminar-item"
                        onClick={() =>
                          eliminarProducto(
                            item.id
                          )
                        }
                      >
                        ×
                      </button>

                    </div>

                    <strong className="carrito-subtotal">

                      $
                      {(
                        item.precio *
                        item.cantidad
                      ).toFixed(
                        2
                      )}

                    </strong>

                  </div>
                )
              )}

            </div>
          )}

          <div className="carrito-resumen">

            <div>

              <span>
                Artículos
              </span>

              <strong>
                {totalProductos}
              </strong>

            </div>

            <div className="carrito-total">

              <span>
                Total
              </span>

              <strong>
                $
                {totalVenta.toFixed(
                  2
                )}
              </strong>

            </div>

          </div>

          <button
            type="button"
            className="boton-cobrar"
            disabled={
              carrito.length ===
                0 ||
              procesandoVenta
            }
            onClick={
              cobrar
            }
          >
            💵 Cobrar
          </button>

        </aside>

      </div>

      <footer className="pos-ventas-barra-inferior" aria-label="Estado de caja">
        <div className="pos-ventas-identidad">
          <span className="pos-ventas-avatar">{String(usuario?.nombre || "U").slice(0, 1).toUpperCase()}</span>
          <span><strong>{usuario?.nombre || "Usuario"}</strong><small>Usuario {usuario?.numeroUsuario || "—"}</small></span>
        </div>
        {efectivoEnCaja >= LIMITE_RETIRO && (
          <div className="pos-ventas-retiro" role="status">⚠️ <span><strong>Retiro requerido</strong><small>${efectivoEnCaja.toFixed(2)} en caja</small></span></div>
        )}
        <div className="pos-ventas-tiempo"><ClimaHoraPos actualizarToken={actualizacionClima} cancelarToken={cancelacionClima} /></div>
      </footer>

      {cajaEnEspera && (
        <div role="dialog" aria-modal="true" aria-label="Caja en espera"
          onKeyDown={(e) => e.stopPropagation()}
          style={{position:"fixed",inset:0,zIndex:99999,background:"#0f172a",color:"#fff",display:"grid",placeItems:"center",padding:20}}>
          <form onSubmit={desbloquearCaja} style={{width:"min(420px,100%)",background:"#1e293b",padding:30,borderRadius:18,display:"grid",gap:16}}>
            <h2 style={{margin:0}}>🔒 Caja en espera</h2>
            <p style={{margin:0}}>Cajero: {usuario?.nombre || "Usuario"}. Introduce tu PIN de 4 dígitos para continuar.</p>
            <input autoFocus type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4}
              autoComplete="off" aria-label="PIN del cajero" value={pinDesbloqueo}
              onChange={(e)=>setPinDesbloqueo(e.target.value.replace(/\D/g,"").slice(0,4))}
              style={{fontSize:24,padding:12,borderRadius:8,textAlign:"center"}} />
            {errorDesbloqueo && <p role="alert" style={{color:"#fca5a5",margin:0}}>{errorDesbloqueo}</p>}
            <button type="submit" disabled={validandoDesbloqueo || pinDesbloqueo.length!==4}
              style={{padding:14,borderRadius:8,fontWeight:700,cursor:"pointer"}}>
              {validandoDesbloqueo ? "Verificando…" : "Desbloquear caja"}
            </button>
          </form>
        </div>
      )}

      {/* MENÚ */}

      {mostrarMenu && (
        <div
          style={{
            position:
              "fixed",

            inset:
              0,

            background:
              "rgba(15,23,42,.45)",

            display:
              "grid",

            placeItems:
              "center",

            zIndex:
              500,
          }}
        >

          <section
            style={{
              width:
                "min(440px, calc(100vw - 32px))",

              background:
                "#fff",

              borderRadius:
                "18px",

              padding:
                "22px",

              boxShadow:
                "0 24px 60px rgba(0,0,0,.22)",
            }}
          >

            <h2
              style={{
                marginTop:
                  0,
              }}
            >
              Menú de caja
            </h2>

            <div
              style={{
                display:
                  "grid",

                gap:
                  "10px",
              }}
            >


              <button
                type="button"
                style={
                  estiloOpcionMenu
                }
                onClick={() =>
                  setMostrarMenu(
                    false
                  )
                }
              >
                <strong>
                  F1 · ✕ Salir
                </strong>

                <span>
                  Cerrar este menú.
                </span>
              </button>

              <button
                type="button"
                style={
                  estiloOpcionMenu
                }
                onClick={() => {
                  if (efectivoEnCaja <= 0) {
                    setError(
                      "No hay efectivo disponible para realizar un retiro."
                    );
                    return;
                  }

                  setMostrarMenu(false);
                  setMontoRetiro("");
                  setMostrarConfirmarRetiro(true);
                  setError("");
                  setMensajeVenta("");
                }}
              >
                <strong>
                  F2 · 💵 Retiro de dinero
                </strong>

                <span>
                  Efectivo actual:
                  {" "}
                  $
                  {efectivoEnCaja.toFixed(
                    2
                  )}
                </span>
              </button>

              <button
                type="button"
                style={
                  estiloOpcionMenu
                }
                onClick={() => {
                  setMostrarMenu(
                    false
                  );

                  setMostrarCorte(
                    true
                  );

                  setError("");
                  setMensajeVenta("");
                }}
              >
                <strong>
                  F3 · 💰 Corte de caja
                </strong>

                <span>
                  Finalizar el turno actual.
                </span>
              </button>

              <button
                type="button"
                style={
                  estiloOpcionMenu
                }
                onClick={
                  imprimirTicketAnterior
                }
              >
                <strong>
                  F4 · 🖨 Imprimir ticket anterior
                </strong>
              </button>

              <button
                type="button"
                style={
                  estiloOpcionMenu
                }
                onClick={() => {
                  setMostrarMenu(
                    false
                  );

                  setMostrarHistorial(
                    true
                  );

                  setError("");
                  setMensajeVenta("");
                }}
              >
                <strong>
                  F5 · 🧾 Historial de ventas
                </strong>
              </button>

              <button type="button" style={estiloOpcionMenu} onClick={() => abrirConfiguracion("camara")}>
                <strong>F6 · 📷 Configurar cámara</strong>
                <span>Seleccionar webcam para escanear productos.</span>
              </button>
              <button type="button" style={estiloOpcionMenu} onClick={() => abrirConfiguracion("notificaciones")}>
                <strong>F7 · 🔔 Notificaciones del sistema</strong>
                <span>Activar permisos y probar avisos de Windows.</span>
              </button>
              <button type="button" style={estiloOpcionMenu} onClick={() => abrirConfiguracion("ubicacion")}>
                <strong>F8 · 📍 Ubicación y clima</strong>
                <span>Validar ubicación y actualizar el clima.</span>
              </button>
              <button type="button" style={estiloOpcionMenu} onClick={()=>abrirConfiguracion("camara")}><strong>📱 Conectar celular por internet</strong><span>Abre F6 y genera un QR para transmitir video.</span></button>

              <button type="button" style={estiloOpcionMenu}
                onClick={() => {
                  ponerCajaEnEspera();
                }}>
                <strong>F9 · 🔒 Poner caja en espera</strong>
                <span>Bloquear la caja y desbloquear con el PIN del cajero.</span>
              </button>

              <button type="button" style={estiloOpcionMenu}
                onClick={solicitarCerrarSesion}>
                <strong>F10 · 🚪 Cerrar sesión</strong>
                <span>Siempre disponible. Registra el efectivo pendiente.</span>
              </button>

            </div>

          </section>

        </div>
      )}

      {mostrarConfirmacionSalida && (
        <div style={{ position: "fixed", inset: 0, zIndex: 950,
          background: "rgba(15,23,42,.7)", display: "grid", placeItems: "center", padding: 16 }}>
          <section style={{ background: "white", padding: 26, borderRadius: 16,
            width: "min(460px, 100%)", boxShadow: "0 20px 60px #0005" }}>
            <h2>🚪 Confirmar cierre de sesión</h2>
            {efectivoEnCaja > 0 ? (
              <p>⚠️ Hay <strong>${efectivoEnCaja.toFixed(2)}</strong> de efectivo registrado
                pendiente de corte. ¿Cerrar sesión de todos modos?</p>
            ) : (
              <p>¿Deseas cerrar la sesión de {usuario?.nombre || "este cajero"}?</p>
            )}
            <p style={{ fontSize: 13 }}>El cierre quedará registrado y no borrará el saldo.</p>
            {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button type="button" disabled={cerrandoSesion}
                onClick={() => { setMostrarConfirmacionSalida(false); setError(""); }}>
                Cancelar
              </button>
              <button type="button" disabled={cerrandoSesion}
                onClick={confirmarCerrarSesion}>
                {cerrandoSesion ? "Registrando..." : "Cerrar sesión"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* RETIRO DE EFECTIVO */}

      {mostrarConfirmarRetiro && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 900,
            background: "rgba(15,23,42,.62)",
            display: "grid",
            placeItems: "center",
            padding: "20px",
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!procesandoRetiro) realizarRetiro();
            }}
            onKeyDownCapture={(e) => {
              if (e.key === "Enter" && !e.repeat) {
                e.preventDefault();
                e.stopPropagation();
                if (!procesandoRetiro) realizarRetiro();
              }
            }}
            style={{
              width: "min(520px, 100%)",
              background: "#fff",
              borderRadius: "20px",
              padding: "28px",
              boxShadow: "0 28px 80px rgba(0,0,0,.30)",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "48px" }}>💵</div>
              <h2 style={{ margin: "8px 0" }}>RETIRO REQUERIDO</h2>
              <p style={{ margin: 0 }}>
                Retiro de seguridad de efectivo
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gap: "12px",
                margin: "24px 0",
                padding: "18px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "14px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Cajero</span>
                <strong>{usuario?.nombre || "Usuario"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Efectivo actual</span>
                <strong>${efectivoEnCaja.toFixed(2)}</strong>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: "12px", alignItems: "center" }}>
                <span>Retiro</span>
                <input
                  ref={montoRetiroInputRef}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={montoRetiro}
                  onChange={(e) => {
                    setMontoRetiro(e.target.value);
                    setError("");
                  }}
                  onFocus={(e) => e.target.select()}
                  onWheel={(e) => e.currentTarget.blur()}
                  autoFocus
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 12px",
                    border: "2px solid #2563eb",
                    borderRadius: "10px",
                    fontSize: "18px",
                    fontWeight: 800,
                    textAlign: "right",
                  }}
                />
              </div>
              <div
                style={{
                  borderTop: "1px solid #cbd5e1",
                  paddingTop: "12px",
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "20px",
                }}
              >
                <span>Quedará en caja</span>
                <strong>
                  ${Math.max(0, efectivoEnCaja - Number(montoRetiro || 0)).toFixed(2)}
                </strong>
              </div>
            </div>

            {error && (
              <div className="ventas-error" style={{ marginBottom: "14px" }}>
                {error}
              </div>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
              }}
            >
              <button
                type="button"
                disabled={procesandoRetiro}
                onClick={() => setMostrarConfirmarRetiro(false)}
                style={{ minHeight: "52px", fontWeight: 700 }}
              >
                Esc · Cancelar
              </button>

              <button
                type="submit"
                disabled={procesandoRetiro}
                style={{
                  minHeight: "52px",
                  border: "none",
                  borderRadius: "10px",
                  background: "#0f172a",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: procesandoRetiro ? "wait" : "pointer",
                }}
              >
                {procesandoRetiro
                  ? "Registrando..."
                  : "Enter · Confirmar retiro"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CONFIGURACIÓN DE PAGOS: SOLO PROPIETARIO AUTENTICADO */}
      {mostrarConfigPay && esPropietario && (
        <div role="dialog" aria-modal="true" aria-label="Configuración POS Init Pay"
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#07172cbb",
            display: "grid", placeItems: "center", padding: 14, overflowY: "auto" }}>
          <section style={{ width: "min(540px, 100%)", maxHeight: "calc(100vh - 28px)",
            overflowY: "auto", background: "white", borderRadius: 18, padding: 20,
            boxSizing: "border-box" }}>
            <button type="button" onClick={() => setMostrarConfigPay(false)}
              style={{ float: "right", padding: "8px 12px", cursor: "pointer",
                border: 0, borderRadius: 8, background: "#e8eef7" }}>
              ✕ Cerrar
            </button>
            <h2 style={{ marginTop: 5 }}>⚙️ POS Init Pay</h2>
            <ConfiguracionPosInitPay ownerUid={ownerUid} />
          </section>
        </div>
      )}

      {/* COBRO */}

      {mostrarCobro && (
        <ModalCobro
          total={
            totalVenta
          }
          procesando={
            procesandoVenta
          }
          onCerrar={() =>
            setMostrarCobro(
              false
            )
          }
          onConfirmar={confirmarVenta}
          ownerUid={ownerUid}
          productos={carrito.map(item => ({id: String(item.id), nombre: item.nombre, cantidad: item.cantidad, precio: item.precio}))}
        />
      )}

      {/* HISTORIAL */}

      {mostrarHistorial && (
        <HistorialVentas
          ownerUid={
            ownerUid
          }
          usuario={
            usuario
          }
          onCerrar={() =>
            setMostrarHistorial(
              false
            )
          }
        />
      )}

      {/* CORTE */}

      {mostrarCorte && (
        <CorteCaja
          ownerUid={
            ownerUid
          }
          usuario={
            usuario
          }
          efectivoEnCaja={
            efectivoEnCaja
          }
          onCerrar={() =>
            setMostrarCorte(
              false
            )
          }
          onCorteRealizado={(
            corte
          ) => {
            setMostrarCorte(
              false
            );

            setUltimoCorteRealizado(
              corte
            );

            setCierreSesionHabilitado(
              true
            );

            setMostrarCerrarSesionCorte(
              true
            );

            setEfectivoEnCaja(
              0
            );

            setMensajeVenta("");
            setError("");
          }}
        />
      )}

      {/* CONFIRMACIÓN DESPUÉS DEL CORTE */}

      {mostrarCerrarSesionCorte && (
        <div
          style={{
            position:
              "fixed",

            inset:
              0,

            zIndex:
              800,

            background:
              "rgba(15,23,42,.55)",

            display:
              "grid",

            placeItems:
              "center",
          }}
        >

          <section
            style={{
              width:
                "min(470px, calc(100vw - 32px))",

              background:
                "#fff",

              borderRadius:
                "18px",

              padding:
                "26px",

              textAlign:
                "center",

              boxShadow:
                "0 24px 70px rgba(0,0,0,.25)",
            }}
          >

            <div
              style={{
                fontSize:
                  "46px",
              }}
            >
              ✅
            </div>

            <h2>
              CORTE REALIZADO
            </h2>

            <p>
              ¿Cerrar sesión del cajero?
            </p>

            <div
              style={{
                display:
                  "grid",

                gridTemplateColumns:
                  "1fr 1fr",

                gap:
                  "12px",

                marginTop:
                  "20px",
              }}
            >

              <button
                type="button"
                onClick={() => {
                  setMostrarCerrarSesionCorte(
                    false
                  );

                  setCierreSesionHabilitado(
                    true
                  );
                }}
              >
                Back · No
              </button>

              <button
                type="button"
                onClick={() => {
                  const corte =
                    ultimoCorteRealizado;

                  setMostrarCerrarSesionCorte(
                    false
                  );

                  setUltimoCorteRealizado(
                    null
                  );

                  onCerrarCaja?.(
                    corte
                  );
                }}
              >
                Enter · Sí
              </button>

            </div>

          </section>

        </div>
      )}

      {/* TICKET POST-VENTA: compacto, centrado y sin desplazar la página */}
      <style>{`
        .pos-ticket-overlay { box-sizing: border-box; overflow: hidden !important; }
        .pos-ticket-modal { box-sizing: border-box; display: flex; flex-direction: column;
          width: min(1010px, 100%) !important; max-height: calc(100dvh - 16px);
          min-height: 0; overflow: hidden; padding: 12px !important; }
        .pos-ticket-heading { flex: 0 0 auto; margin-bottom: 8px !important; }
        .pos-ticket-heading > div { font-size: 30px !important; }
        .pos-ticket-heading h2 { font-size: 21px; margin: 3px 0 !important; }
        .pos-ticket-heading p { font-size: 13px; }
        .pos-ticket-body { flex: 1 1 auto; min-height: 0; overflow-y: auto;
          overscroll-behavior: contain; gap: 12px !important;
          grid-template-columns: minmax(0, 1fr) minmax(270px, 345px) !important; }
        .pos-ticket-body > div { min-width: 0; padding: 12px !important; }
        .pos-ticket-body > div:nth-child(2) { padding: 8px !important; }
        .pos-ticket-body > div:nth-child(2) h2 { font-size: 19px; margin: 3px 0 !important; }
        .pos-ticket-body > div:nth-child(2) p { font-size: 13px !important; margin: 4px 0 8px !important; }
        .pos-ticket-qr { padding: 8px !important; }
        .pos-ticket-qr svg { display: block; width: min(100%, 225px) !important; height: auto !important; }
        .pos-ticket-actions { flex: 0 0 auto; gap: 10px !important; margin-top: 8px !important; }
        .pos-ticket-actions button { min-height: 42px !important; font-size: 14px !important; }
        @media (max-width: 650px) {
          .pos-ticket-overlay { padding: 5px !important; }
          .pos-ticket-modal { max-height: calc(100dvh - 10px); padding: 9px !important; }
          .pos-ticket-body { grid-template-columns: minmax(0, 1fr) !important; }
          .pos-ticket-body > div { padding: 9px !important; }
          .pos-ticket-qr svg { width: min(100%, 175px) !important; }
          .pos-ticket-actions button { font-size: 12px !important; }
        }
        @media (max-height: 540px) and (min-width: 651px) {
          .pos-ticket-heading p { display: none; }
          .pos-ticket-qr svg { width: min(100%, 145px) !important; }
        }
      `}</style>

      {ticketVentaActual && (
        <div
          className="pos-ticket-overlay"
          style={{
            position:
              "fixed",

            inset:
              0,

            zIndex:
              1000,

            background:
              "rgba(15,23,42,.68)",

            overflowY:
              "hidden",

            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding:
              "12px",
          }}
        >

          <section
            className="pos-ticket-modal"
            style={{
              width:
                "min(980px, 100%)",

              margin:
                "0 auto",

              background:
                "#fff",

              borderRadius:
                "20px",

              boxShadow:
                "0 28px 80px rgba(0,0,0,.28)",

              padding:
                "18px",
            }}
          >

            <div
              className="pos-ticket-heading"
              style={{
                textAlign:
                  "center",

                marginBottom:
                  "12px",
              }}
            >

              <div
                style={{
                  fontSize:
                    "44px",
                }}
              >
                ✅
              </div>

              <h2
                style={{
                  margin:
                    "8px 0",
                }}
              >
                Compra realizada
              </h2>

              <p
                style={{
                  margin:
                    0,
                }}
              >
                Elige imprimir el ticket o
                permite que el cliente lo
                escanee.
              </p>

            </div>

            <div
              className="pos-ticket-body"
              style={{
                display:
                  "grid",

                gridTemplateColumns:
                  "minmax(0, 1fr) minmax(300px, 390px)",

                gap:
                  "16px",

                alignItems:
                  "start",
              }}
            >

              {/* TICKET IZQUIERDO */}

              <div
                style={{
                  border:
                    "1px solid #dbe3ec",

                  borderRadius:
                    "16px",

                  padding:
                    "22px",
                }}
              >

                <div
                  style={{
                    textAlign:
                      "center",
                  }}
                >

                  <h2>
                    POS Init
                  </h2>

                  <p>
                    {new Date(
                      ticketVentaActual.fechaHora
                    ).toLocaleString(
                      "es-MX"
                    )}
                  </p>

                  <p>
                    Cajero:{" "}
                    {
                      ticketVentaActual.nombreUsuario
                    }{" "}
                    ·{" "}
                    {
                      ticketVentaActual.numeroUsuario
                    }
                  </p>

                </div>

                <div
                  style={{
                    borderTop:
                      "1px dashed #94a3b8",

                    margin:
                      "16px 0",
                  }}
                />

                <div
                  style={{
                    display:
                      "grid",

                    gap:
                      "12px",
                  }}
                >

                  {ticketVentaActual.productos.length > 10 && (
                    <div style={{ color: "#64748b", fontSize: "13px", fontWeight: 700 }}>
                      Mostrando los últimos 10 artículos de {ticketVentaActual.productos.length}.
                    </div>
                  )}

                  {ticketVentaActual.productos
                    .slice(-10)
                    .map(
                    (
                      item,
                      index
                    ) => (
                      <div
                        key={`${item.productoId}-${index}`}
                        style={{
                          display:
                            "grid",

                          gridTemplateColumns:
                            "1fr auto",

                          gap:
                            "12px",

                          alignItems:
                            "start",
                        }}
                      >

                        <div>

                          <strong>
                            {item.nombre}
                          </strong>

                          <div>
                            {item.cantidad}{" "}
                            ×{" "}
                            $
                            {Number(
                              item.precio
                            ).toFixed(
                              2
                            )}
                          </div>

                        </div>

                        <strong>
                          $
                          {Number(
                            item.subtotal
                          ).toFixed(
                            2
                          )}
                        </strong>

                      </div>
                    )
                  )}

                </div>

                <div
                  style={{
                    borderTop:
                      "1px dashed #94a3b8",

                    margin:
                      "16px 0",
                  }}
                />

                <div
                  style={{
                    display:
                      "grid",

                    gap:
                      "8px",
                  }}
                >

                  <div
                    style={{
                      display:
                        "flex",

                      justifyContent:
                        "space-between",

                      fontSize:
                        "21px",

                      fontWeight:
                        800,
                    }}
                  >

                    <span>
                      TOTAL
                    </span>

                    <span>
                      $
                      {Number(
                        ticketVentaActual.total
                      ).toFixed(
                        2
                      )}
                    </span>

                  </div>

                  <div
                    style={{
                      display:
                        "flex",

                      justifyContent:
                        "space-between",
                    }}
                  >

                    <span>
                      Método
                    </span>

                    <strong>
                      {
                        ticketVentaActual.metodoPago
                      }
                    </strong>

                  </div>

                  {String(
                    ticketVentaActual.metodoPago ??
                      ""
                  ).toLowerCase() ===
                    "efectivo" && (
                    <>

                      <div
                        style={{
                          display:
                            "flex",

                          justifyContent:
                            "space-between",
                        }}
                      >

                        <span>
                          Efectivo
                        </span>

                        <strong>
                          $
                          {Number(
                            ticketVentaActual.recibido
                          ).toFixed(
                            2
                          )}
                        </strong>

                      </div>

                      <div
                        style={{
                          display:
                            "flex",

                          justifyContent:
                            "space-between",
                        }}
                      >

                        <span>
                          Cambio
                        </span>

                        <strong>
                          $
                          {Number(
                            ticketVentaActual.cambio
                          ).toFixed(
                            2
                          )}
                        </strong>

                      </div>

                    </>
                  )}

                </div>

              </div>

              {/* QR DERECHO */}

              <div
                style={{
                  display:
                    "grid",

                  justifyItems:
                    "center",

                  textAlign:
                    "center",

                  padding:
                    "18px",
                }}
              >

                <h2
                  style={{
                    marginBottom:
                      "6px",
                  }}
                >
                  🌱 Ayudemos al planeta
                </h2>

                <p
                  style={{
                    marginTop:
                      0,

                    marginBottom:
                      "20px",

                    fontSize:
                      "18px",

                    fontWeight:
                      700,
                  }}
                >
                  Mejor escanea tu ticket
                </p>

                <div
                  className="pos-ticket-qr"
                  style={{
                    background:
                      "#fff",

                    padding:
                      "12px",

                    borderRadius:
                      "18px",

                    border:
                      "1px solid #dbe3ec",

                    boxShadow:
                      "0 10px 30px rgba(15,23,42,.10)",
                  }}
                >

                  <QRCodeSVG
                    value={
                      urlQrTicket
                    }
                    size={
                      240
                    }
                    level="L"
                    includeMargin
                  />

                </div>

                <p
                  style={{
                    marginTop:
                      "18px",

                    maxWidth:
                      "330px",
                  }}
                >
                  Escanea el código para abrir
                  tu ticket digital y descargarlo
                  como imagen.
                </p>

              </div>

            </div>

            <div
              className="pos-ticket-actions"
              style={{
                display:
                  "grid",

                gridTemplateColumns:
                  "1fr 1fr",

                gap:
                  "14px",

                marginTop:
                  "12px",
              }}
            >

              <button
                type="button"
                onClick={
                  borrarTicketYSalir
                }
                style={{
                  minHeight:
                    "52px",

                  border:
                    "1px solid #cbd5e1",

                  borderRadius:
                    "12px",

                  background:
                    "#fff",

                  fontSize:
                    "16px",

                  fontWeight:
                    700,

                  cursor:
                    "pointer",
                }}
              >
                🗑 Borrar / salir
              </button>

              <button
                type="button"
                onClick={
                  imprimirTicketVentaActual
                }
                style={{
                  minHeight:
                    "52px",

                  border:
                    "none",

                  borderRadius:
                    "12px",

                  background:
                    "#0f172a",

                  color:
                    "#fff",

                  fontSize:
                    "16px",

                  fontWeight:
                    800,

                  cursor:
                    "pointer",
                }}
              >
                Enter · 🖨 Imprimir y salir
              </button>

            </div>

          </section>

        </div>
      )}

              {(vinculandoCelular || mostrarPanelConexion) && (
          <div style={configuracionFunciones === "camara" && mostrarPanelConexion ? {position:"fixed",zIndex:10030,top:"max(12px, 5vh)",left:"50%",transform:"translateX(-50%)",width:"min(520px,94vw)",maxHeight:"90dvh",overflowY:"auto",background:"#fff",color:"#14243a",border:"1px solid #cbd5e1",borderRadius:16,boxShadow:"0 15px 50px #0008"} : {display:"none"}}>
            <CamaraRemota ownerUid={ownerUid} usuarioId={usuario?.id} onCodigo={(codigo) => {
              const limpio = String(codigo ?? "").replace(/\s+/g, "").trim();
              const encontrado = productos.find((p) =>
                [p.codigoBarras, p.codigo, p.barcode, p.ean,
                 ...(Array.isArray(p.codigosBarras) ? p.codigosBarras : [])]
                  .some((v) => String(v ?? "").replace(/\s+/g, "") === limpio)
              );
              if (encontrado) agregarProducto(encontrado);
              else setError(`Código ${limpio} no encontrado en inventario.`);
            }} onStream={(stream)=>{setStreamRemoto(stream);if(stream){setModoCamara("celular");setCamaraActiva(true);}else{setModoCamara("usb");}}} onCerrar={()=>setMostrarPanelConexion(false)} />
          </div>
        )}
{configuracionFunciones && (
        <div role="dialog" aria-modal="true" aria-label="Configuración de funciones" style={{ position: "fixed", inset: 0, zIndex: 10020, background: "#0b182bd9", display: "grid", placeItems: "center", padding: 16 }}>
          <section style={{ width: "min(440px, 100%)", maxHeight: "90dvh", overflowY: "auto", background: "white", color: "#17243a", borderRadius: 16, padding: 22, boxShadow: "0 20px 60px #0004", transform: `translate(${posicionConfig.x}px, ${posicionConfig.y}px)` }}>
            <h2 onPointerDown={iniciarArrastreConfig} onPointerMove={moverConfig} onPointerUp={() => { arrastreConfigRef.current = null; }} onPointerCancel={() => { arrastreConfigRef.current = null; }} style={{ marginTop: 0, cursor: "move", touchAction: "none", userSelect: "none" }}>{configuracionFunciones === "camara" ? "📷 Configurar cámara" : configuracionFunciones === "notificaciones" ? "🔔 Notificaciones de Windows" : "📍 Ubicación y clima"}</h2>
            {configuracionFunciones === "camara" && (
              <>
                <p>Selecciona la cámara que usará el lector de códigos de barras.</p>
                <select aria-label="Seleccionar cámara" value={camaraElegida} onChange={(e) => setCamaraElegida(e.target.value)} style={{ width: "100%", padding: 12 }}>
                  <option value="">Seleccionar cámara</option>
                  {camarasConfiguracion.map((camara, i) => <option key={camara.deviceId} value={camara.deviceId}>{camara.label || `Cámara ${i + 1}`}</option>)}
                </select>
                <button type="button" disabled={!camaraElegida} onClick={() => { localStorage.setItem("pos-init-camara-preferida", camaraElegida); setMensajeConfiguracion("Cámara guardada. El escáner la utilizará al abrirse."); }} style={{ marginTop: 12, padding: 10 }}>Guardar cámara</button>
                <p><button type="button" onClick={()=>{localStorage.setItem("pos-init-camara-preferida",camaraElegida);setModoCamara("usb");setMostrarPanelConexion(false);setCamaraActiva(true);setConfiguracionFunciones(null);}}>Usar cámara USB</button></p>
                <button type="button" onClick={()=>{setVinculandoCelular(true);setMostrarPanelConexion(true);setCamaraActiva(true);}}>📱 Conectar celular por internet</button>
                <p style={{fontSize:12,background:"#eff6ff",padding:10,borderRadius:8}}>🔗 Vincular app POS Init: próximamente. La conexión actual funciona por enlace o QR.</p>
                <p style={{fontSize:12}}>La vinculación continúa aunque cierres F6. El celular debe tener iniciada la sesión del mismo negocio.</p>
              </>
            )}
            {configuracionFunciones === "notificaciones" && (
              <>
                <p>Permiso de Chrome: <strong>{permisoNotificacion}</strong></p>
                <button type="button" onClick={async () => { if (avisosHabilitados) { setAvisosHabilitados(false); localStorage.setItem("pos-init-avisos-habilitados", "false"); setMensajeConfiguracion("Avisos de POS Init desactivados."); } else { setAvisosHabilitados(true); localStorage.setItem("pos-init-avisos-habilitados", "true"); if (Notification.permission !== "granted") await activarNotificaciones(); setMensajeConfiguracion("Avisos de POS Init activados."); } }} style={{ padding: 10, marginRight: 8 }}>{avisosHabilitados ? "🔕 Desactivar notificaciones" : "🔔 Activar notificaciones"}</button>
                <button type="button" onClick={probarNotificacion} disabled={permisoNotificacion !== "granted" || !avisosHabilitados} style={{ padding: 10 }}>Enviar prueba</button>
                <p style={{ fontSize: 13 }}>El aviso automático de retiro utiliza el efectivo real de caja a partir de $3,000 MXN. Se solicita su cierre después de 5 segundos.</p>
              </>
            )}
            {configuracionFunciones === "ubicacion" && (
              <>
                <p>Actualiza el clima y la hora de la barra superior. Chrome puede solicitar permiso de ubicación.</p>
                <button type="button" onClick={() => { setActualizacionClima((n) => n + 1); setMensajeConfiguracion("Actualizando ubicación y clima en la barra superior..."); }} style={{ padding: 10 }}>📍 Validar y actualizar ubicación</button>
                <button type="button" onClick={() => { setCancelacionClima(n => n + 1); setMensajeConfiguracion("Solicitud cancelada; se ignorará su resultado si llega después."); }} style={{ padding: 10, marginLeft: 8 }}>Cancelar ubicación</button>
              </>
            )}
            {mensajeConfiguracion && <p role="status" style={{ fontSize: 13 }}>{mensajeConfiguracion}</p>}
            <button type="button" onClick={() => setConfiguracionFunciones(null)} style={{ display: "block", marginTop: 20, padding: "10px 16px" }}>Cerrar</button>
          </section>
        </div>
      )}

    </main>
  );
}

export default Ventas;
