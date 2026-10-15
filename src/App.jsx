import { useEffect, useState } from "react";
import "./App.css";

import { auth, db } from "./firebase/firebaseConfig";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";

import {
  onAuthStateChanged,
  signOut,
} from "firebase/auth";

import {
  consultarEstadoPin,
  crearPinCajero,
  verificarPinCajero,
} from "./firebase/posPinBasico";

import Ventas from "./components/Ventas";
import ActivarCaja from "./components/ActivarCaja";
import LoginPin from "./components/LoginPin";
import TicketPublico from "./components/TicketPublico";

// ============================================================
// POS INIT - APLICACIÓN PRINCIPAL
// Firebase Spark + Firestore
// ============================================================

function AppPrivada() {
  const [cargandoInicial, setCargandoInicial] = useState(true);

  const [cajaActivada, setCajaActivada] = useState(false);

  const [ownerUid, setOwnerUid] = useState("");

  const [businessIdCaja, setBusinessIdCaja] = useState("");

  const [businessId, setBusinessId] = useState("");

  const [numeroUsuario, setNumeroUsuario] = useState("");

  const [mensaje, setMensaje] = useState("");

  const [buscandoUsuario, setBuscandoUsuario] = useState(false);

  const [pantalla, setPantalla] = useState("login");

  const [usuarioSeleccionado, setUsuarioSeleccionado] =
    useState(null);

  const [sesionCaja, setSesionCaja] = useState(false);

  const [estadoPin, setEstadoPin] = useState(null);

  const [cargandoPin, setCargandoPin] = useState(false);

  const [errorPin, setErrorPin] = useState("");

  // ============================================================
  // COMPROBAR SESIÓN DEL ADMINISTRADOR
  // ============================================================

  useEffect(() => {
    const cancelar = onAuthStateChanged(
      auth,
      async (usuario) => {
        try {
          if (!usuario) {
            setCajaActivada(false);
            setOwnerUid("");
            setBusinessIdCaja("");
            setSesionCaja(false);
            setUsuarioSeleccionado(null);
            setPantalla("login");
            return;
          }

          const referenciaUsuario = doc(
            db,
            "usuarios",
            usuario.uid
          );

          const resultadoUsuario = await getDoc(
            referenciaUsuario
          );

          if (!resultadoUsuario.exists()) {
            setCajaActivada(false);
            return;
          }

          const datos = resultadoUsuario.data();

          const codigoNegocio =
            datos.businessId?.trim();

          if (!codigoNegocio) {
            setCajaActivada(false);
            return;
          }

          const codigo = codigoNegocio.toUpperCase();

          setOwnerUid(usuario.uid);
          setBusinessIdCaja(codigo);
          setBusinessId(codigo);
          setCajaActivada(true);
        } catch (error) {
          console.error(
            "Error comprobando la caja:",
            error
          );

          setCajaActivada(false);
        } finally {
          setCargandoInicial(false);
        }
      }
    );

    return () => cancelar();
  }, []);

  // ============================================================
  // ACTIVAR CAJA
  // ============================================================

  const alActivarCaja = (datos) => {
    const codigo = datos.businessId.toUpperCase();

    setOwnerUid(datos.uid);
    setBusinessIdCaja(codigo);
    setBusinessId(codigo);

    setCajaActivada(true);
    setPantalla("login");
    setMensaje("");
  };

  // ============================================================
  // BUSCAR CAJERO EN FIRESTORE
  // ============================================================

  const continuar = async (e) => {
    e.preventDefault();

    const negocio = businessId.trim().toUpperCase();
    const numero = numeroUsuario.trim();

    if (!negocio) {
      setMensaje("Escribe el código del negocio.");
      return;
    }

    if (!numero) {
      setMensaje("Escribe tu número de usuario.");
      return;
    }

    if (negocio !== businessIdCaja.toUpperCase()) {
      setMensaje(
        "El código del negocio no corresponde a esta caja."
      );
      return;
    }

    if (!ownerUid) {
      setMensaje(
        "Esta caja no está correctamente activada."
      );
      return;
    }

    try {
      setBuscandoUsuario(true);
      setMensaje("");

      const referenciaUsuarios = collection(
        db,
        "usuarios",
        ownerUid,
        "usuariosSistema"
      );

      const consulta = query(
        referenciaUsuarios,
        where("numeroUsuario", "==", numero),
        limit(1)
      );

      const resultado = await getDocs(consulta);

      if (resultado.empty) {
        setMensaje(
          "No existe un usuario con ese número."
        );
        return;
      }

      const documento = resultado.docs[0];
      const datosUsuario = documento.data();

      if (datosUsuario.activo === false) {
        setMensaje("Este usuario está desactivado.");
        return;
      }

      // Utilizamos el ID real del documento de Firestore.
      const usuarioId = documento.id;

      setEstadoPin(null);
      setErrorPin("");

      setUsuarioSeleccionado({
        id: usuarioId,
        nombre: datosUsuario.nombre || "Usuario",
        numeroUsuario: datosUsuario.numeroUsuario,
        activo: datosUsuario.activo !== false,
        businessId: negocio,
      });

      setPantalla("pin");
      setCargandoPin(true);

      try {
        const estado = await consultarEstadoPin(
          ownerUid,
          usuarioId
        );

        if (
          !estado ||
          typeof estado.tienePin !== "boolean"
        ) {
          throw new Error(
            "Firestore no devolvió un estado de PIN válido."
          );
        }

        setEstadoPin(estado);
      } catch (error) {
        console.error(
          "Error consultando el PIN:",
          error
        );

        setErrorPin(
          error?.code === "permission-denied"
            ? "Firestore no permite consultar el PIN. Debemos actualizar las reglas."
            : "No se pudo consultar el PIN en Firestore. Revisa la conexión y los permisos."
        );
      } finally {
        setCargandoPin(false);
      }
    } catch (error) {
      console.error(
        "Error buscando usuario:",
        error
      );

      setMensaje(
        "No se pudo consultar el usuario. Revisa la conexión e inténtalo nuevamente."
      );
    } finally {
      setBuscandoUsuario(false);
    }
  };

  // ============================================================
  // REGRESAR AL LOGIN DEL CAJERO
  // ============================================================

  const regresarLogin = () => {
    setPantalla("login");
    setUsuarioSeleccionado(null);
    setEstadoPin(null);
    setErrorPin("");
    setSesionCaja(false);
    setMensaje("");
  };

  // ============================================================
  // REGRESAR A ACTIVACIÓN DE CAJA
  // ============================================================

  const regresarActivacion = async () => {
    if (buscandoUsuario) return;

    try {
      setMensaje("");

      await signOut(auth);

      localStorage.removeItem("posInitCajaActivada");
      localStorage.removeItem("posInitOwnerUid");
      localStorage.removeItem("posInitBusinessId");

      setCajaActivada(false);
      setOwnerUid("");
      setBusinessIdCaja("");
      setBusinessId("");
      setNumeroUsuario("");
      setUsuarioSeleccionado(null);
      setSesionCaja(false);
      setEstadoPin(null);
      setPantalla("login");
    } catch (error) {
      console.error(
        "Error al regresar a activación:",
        error
      );

      setMensaje(
        "No se pudo cerrar la sesión. Inténtalo de nuevo."
      );
    }
  };

  // ============================================================
  // CREAR O VERIFICAR PIN
  // ============================================================
  //
  // IMPORTANTE:
  // Esta verificación ocurre en el navegador.
  // Es un control básico de acceso, no autenticación
  // resistente a manipulaciones externas.
  //
  // ============================================================

  const ingresarConPin = async (pin, esNuevoPin) => {
    if (
      !usuarioSeleccionado ||
      !ownerUid ||
      !estadoPin
    ) {
      throw new Error(
        "No se pudo verificar el estado del PIN."
      );
    }

    if (!/^\d{4}$/.test(pin)) {
      throw new Error(
        "El PIN debe tener exactamente cuatro números."
      );
    }

    if (estadoPin.bloqueado) {
      throw new Error(
        "Este PIN está bloqueado."
      );
    }

    if (estadoPin.vencido) {
      throw new Error(
        "Este PIN venció. Debes renovarlo antes de entrar."
      );
    }

    const datos = {
      ownerUid,
      usuarioId: String(usuarioSeleccionado.id),
      pin,
    };

    try {
      let resultado;

      if (esNuevoPin) {
        if (estadoPin.tienePin) {
          throw new Error(
            "Este cajero ya tiene un PIN registrado."
          );
        }

        resultado = await crearPinCajero(datos);
      } else {
        if (!estadoPin.tienePin) {
          throw new Error(
            "Primero debes crear tu PIN."
          );
        }

        resultado = await verificarPinCajero(datos);
      }

      if (resultado.autorizado !== true) {
        throw new Error(
          resultado.mensaje || "PIN no autorizado."
        );
      }

      setSesionCaja(true);

      return true;
    } catch (error) {
      console.error(
        "Error al comprobar el PIN:",
        error
      );

      throw new Error(
        error?.message ||
          "No se pudo comprobar el PIN."
      );
    }
  };

  // ============================================================
  // CERRAR SESIÓN DEL CAJERO
  // ============================================================

  const cerrarCaja = () => {
    setSesionCaja(false);
    setPantalla("login");
    setUsuarioSeleccionado(null);
    setNumeroUsuario("");
    setEstadoPin(null);
    setErrorPin("");
    setMensaje("");
  };

  // ============================================================
  // PANTALLA DE CARGA
  // ============================================================

  if (cargandoInicial) {
    return (
      <main className="pagina-login">
        <section className="tarjeta-login">
          <div className="marca">
            <div className="logo-pos">P</div>

            <div>
              <h1>POS Init</h1>
              <p>Punto de venta</p>
            </div>
          </div>

          <div className="encabezado">
            <h2>Cargando...</h2>
            <p>Comprobando esta caja.</p>
          </div>
        </section>
      </main>
    );
  }

  // ============================================================
  // ACTIVACIÓN DE CAJA
  // ============================================================

  if (!cajaActivada) {
    return (
      <ActivarCaja onActivada={alActivarCaja} />
    );
  }

  // ============================================================
  // VENTAS
  // ============================================================

  if (sesionCaja && usuarioSeleccionado) {
    return (
      <Ventas
        ownerUid={ownerUid}
        usuario={usuarioSeleccionado}
        onCerrarCaja={cerrarCaja}
      />
    );
  }

  // ============================================================
  // PANTALLA DEL PIN
  // ============================================================

  if (pantalla === "pin" && usuarioSeleccionado) {
    if (cargandoPin || errorPin || !estadoPin) {
      return (
        <main className="pagina-login">
          <section className="tarjeta-login">
            <h2>
              {cargandoPin
                ? "Consultando PIN..."
                : "No se pudo abrir la caja"}
            </h2>

            {errorPin && (
              <p role="alert">{errorPin}</p>
            )}

            <button
              type="button"
              onClick={regresarLogin}
            >
              ← Regresar
            </button>
          </section>
        </main>
      );
    }

    if (estadoPin.bloqueado || estadoPin.vencido) {
      return (
        <main className="pagina-login">
          <section className="tarjeta-login">
            <h2>
              {estadoPin.bloqueado
                ? "PIN bloqueado"
                : "PIN vencido"}
            </h2>

            <p>
              {estadoPin.bloqueado
                ? "Se agotaron los cuatro intentos. Este acceso necesita restauración."
                : "Han pasado 30 días. Debes renovar tu PIN antes de entrar. La renovación todavía está pendiente."}
            </p>

            <button
              type="button"
              onClick={regresarLogin}
            >
              ← Regresar
            </button>
          </section>
        </main>
      );
    }

    return (
      <LoginPin
        key={`${usuarioSeleccionado.id}-${estadoPin.tienePin}`}
        usuario={usuarioSeleccionado}
        primerAcceso={!estadoPin.tienePin}
        onRegresar={regresarLogin}
        onIngresar={ingresarConPin}
      />
    );
  }

  // ============================================================
  // LOGIN DEL CAJERO
  // DISEÑO ORIGINAL DE TRES COLUMNAS
  // ============================================================

  return (
    <>
      <style>{`
        @media (min-width: 901px) {
          html:has(.pagina-acceso-caja),
          body:has(.pagina-acceso-caja),
          #root:has(.pagina-acceso-caja) {
            height: 100% !important;
            overflow: hidden !important;
          }

          main.pagina-login.pagina-acceso-caja {
            display: flex !important;
            justify-content: center !important;
            align-items: stretch !important;
            width: 100% !important;
            max-width: none !important;
            height: 100dvh !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 12px !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
          }

          main.pagina-acceso-caja > .acceso-tres-paneles {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            grid-template-rows: minmax(0, 1fr) !important;
            width: 100% !important;
            max-width: 1440px !important;
            height: 100% !important;
            min-height: 0 !important;
            gap: 12px !important;
            margin: 0 auto !important;
            padding: 0 !important;
            align-items: stretch !important;
            box-sizing: border-box !important;
          }

          main.pagina-acceso-caja > .acceso-tres-paneles > .acceso-panel-info,
          main.pagina-acceso-caja > .acceso-tres-paneles > .tarjeta-login {
            grid-row: 1 !important;
            position: static !important;
            display: flex !important;
            flex-direction: column !important;
            width: 100% !important;
            max-width: none !important;
            min-width: 0 !important;
            height: 100% !important;
            min-height: 0 !important;
            max-height: none !important;
            margin: 0 !important;
            overflow-x: hidden !important;
            overflow-y: auto !important;
            box-sizing: border-box !important;
            scrollbar-width: none;
          }

          main.pagina-acceso-caja > .acceso-tres-paneles > :nth-child(1) {
            grid-column: 1 !important;
          }

          main.pagina-acceso-caja > .acceso-tres-paneles > :nth-child(2) {
            grid-column: 2 !important;
          }

          main.pagina-acceso-caja > .acceso-tres-paneles > :nth-child(3) {
            grid-column: 3 !important;
          }

          main.pagina-acceso-caja > .acceso-tres-paneles > *::-webkit-scrollbar {
            display: none;
          }

          main.pagina-acceso-caja .acceso-panel-info {
            padding: 22px !important;
            overflow-wrap: break-word;
          }

          main.pagina-acceso-caja .tarjeta-login {
            padding: 28px !important;
          }

          main.pagina-acceso-caja .tarjeta-login form,
          main.pagina-acceso-caja .tarjeta-login input {
            min-width: 0 !important;
          }
        }

        @media (max-width: 900px) {
          html:has(.pagina-acceso-caja),
          body:has(.pagina-acceso-caja),
          #root:has(.pagina-acceso-caja) {
            height: auto !important;
            overflow-y: auto !important;
          }

          main.pagina-login.pagina-acceso-caja {
            display: block !important;
            height: auto !important;
            min-height: 100dvh !important;
            padding: 12px !important;
            overflow: visible !important;
          }

          main.pagina-acceso-caja > .acceso-tres-paneles {
            display: flex !important;
            flex-direction: column !important;
            width: 100% !important;
            max-width: 600px !important;
            height: auto !important;
            margin: 0 auto !important;
            gap: 12px !important;
          }

          main.pagina-acceso-caja > .acceso-tres-paneles > * {
            width: 100% !important;
            max-width: none !important;
            height: auto !important;
            min-width: 0 !important;
          }

          main.pagina-acceso-caja > .acceso-tres-paneles > .tarjeta-login {
            order: 0 !important;
          }

          main.pagina-acceso-caja > .acceso-tres-paneles > .acceso-panel-info:first-child {
            order: 1 !important;
          }

          main.pagina-acceso-caja > .acceso-tres-paneles > .acceso-panel-info:last-child {
            order: 2 !important;
          }
        }
      `}</style>

      <main className="pagina-login pagina-acceso-caja">
        <div className="acceso-tres-paneles">

          {/* ============================================= */}
          {/* PANEL IZQUIERDO: CÓDIGO DE NEGOCIO            */}
          {/* ============================================= */}

          <aside
            className="acceso-panel-info"
            aria-label="Información del código de negocio"
          >
            <div className="acceso-info-icono">
              🏪
            </div>

            <span className="acceso-info-etiqueta">
              CÓDIGO DE NEGOCIO
            </span>

            <h2>
              ¿Qué es el código de negocio?
            </h2>

            <p>
              Es el código que identifica a tu negocio
              en POS Init y permite conectar esta caja
              con él.
            </p>

            <div className="acceso-info-pasos">
              <h3>
                📍 ¿Dónde se consigue?
              </h3>

              <ol>
                <li>
                  Abre la aplicación móvil{" "}
                  <strong>POS Init</strong>.
                </li>

                <li>
                  Entra a <strong>Ajustes ⚙️</strong>.
                </li>

                <li>
                  Busca <strong>Código de negocio</strong>.
                </li>

                <li>
                  Copia el código y escríbelo
                  en el formulario.
                </li>
              </ol>
            </div>

            <p className="acceso-info-nota">
              El código debe pertenecer al negocio
              con el que se activó esta caja.
            </p>
          </aside>

          {/* ============================================= */}
          {/* PANEL CENTRAL: ACCESO A CAJA                  */}
          {/* ============================================= */}

          <section className="tarjeta-login">
            <button
              type="button"
              className="boton-regresar"
              onClick={regresarActivacion}
              disabled={buscandoUsuario}
              style={{
                width: "auto",
                display: "inline-flex",
                alignItems: "center",
                padding: "10px 16px",
                marginBottom: "18px",
                background: "#edf4fa",
                color: "#123450",
                border: "1px solid #d4e1ed",
                borderRadius: "10px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ← Regresar
            </button>

            <div className="marca">
              <div className="logo-pos">
                P
              </div>

              <div>
                <h1>POS Init</h1>
                <p>Punto de venta</p>
              </div>
            </div>

            <div className="encabezado">
              <h2>Acceso a caja</h2>

              <p>
                Ingresa tu código del negocio
                y número de usuario.
              </p>
            </div>

            <form onSubmit={continuar}>
              <label htmlFor="businessId">
                Código del negocio
              </label>

              <input
                id="businessId"
                type="text"
                placeholder="BIZ-XXXXXXXXXXXX"
                value={businessId}
                onChange={(e) => {
                  setBusinessId(
                    e.target.value.toUpperCase()
                  );

                  setMensaje("");
                }}
                autoComplete="off"
              />

              <label htmlFor="numeroUsuario">
                Número de usuario
              </label>

              <input
                id="numeroUsuario"
                type="text"
                inputMode="numeric"
                placeholder="Ej. 001"
                value={numeroUsuario}
                onChange={(e) => {
                  setNumeroUsuario(
                    e.target.value.replace(/\D/g, "")
                  );

                  setMensaje("");
                }}
                autoComplete="off"
              />

              {mensaje && (
                <div className="mensaje-error">
                  {mensaje}
                </div>
              )}

              <button
                type="submit"
                disabled={buscandoUsuario}
              >
                {buscandoUsuario
                  ? "Buscando usuario..."
                  : "Continuar"}
              </button>
            </form>

            <div className="pie-login">
              <span>POS Init</span>
              <span>•</span>
              <span>Acceso para personal autorizado</span>
            </div>
          </section>

          {/* ============================================= */}
          {/* PANEL DERECHO: NÚMERO DE USUARIO              */}
          {/* ============================================= */}

          <aside
            className="acceso-panel-info"
            aria-label="Información del número de usuario"
          >
            <div className="acceso-info-icono">
              👤
            </div>

            <span className="acceso-info-etiqueta">
              NÚMERO DE USUARIO
            </span>

            <h2>
              ¿Qué es el número de usuario?
            </h2>

            <p>
              Es el número que identifica a cada
              empleado o cajero autorizado para
              entrar al punto de venta.
            </p>

            <div className="acceso-info-pasos">
              <h3>
                ➕ ¿Cómo se consigue o crea?
              </h3>

              <ol>
                <li>
                  Abre la aplicación móvil{" "}
                  <strong>POS Init</strong>.
                </li>

                <li>
                  Entra a <strong>Usuarios 👥</strong>.
                </li>

                <li>
                  Pulsa el botón <strong>+</strong>{" "}
                  para agregar un usuario.
                </li>

                <li>
                  Registra al empleado y consulta
                  su <strong>número de usuario</strong>.
                </li>

                <li>
                  Escribe ese número en el formulario.
                </li>
              </ol>
            </div>

            <p className="acceso-info-nota">
              Si ya estás registrado, solicita tu
              número al administrador.
            </p>
          </aside>

        </div>
      </main>
    </>
  );
}

// ============================================================
// APLICACIÓN PRINCIPAL
// ============================================================

function App() {
  const ticketPublico = new URLSearchParams(
    window.location.search
  ).get("ticket");

  if (ticketPublico) {
    return (
      <TicketPublico token={ticketPublico} />
    );
  }

  return <AppPrivada />;
}

export default App;