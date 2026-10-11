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

import { onAuthStateChanged, signOut } from "firebase/auth";

import Ventas from "./components/Ventas";
import ActivarCaja from "./components/ActivarCaja";
import LoginPin from "./components/LoginPin";
import TicketPublico from "./components/TicketPublico";

function AppPrivada() {

  // ============================================================
  // ESTADOS GENERALES
  // ============================================================

  const [cargandoInicial, setCargandoInicial] =
    useState(true);

  const [cajaActivada, setCajaActivada] =
    useState(false);

  const [ownerUid, setOwnerUid] =
    useState("");

  const [businessIdCaja, setBusinessIdCaja] =
    useState("");

  const [businessId, setBusinessId] =
    useState("");

  const [numeroUsuario, setNumeroUsuario] =
    useState("");

  const [mensaje, setMensaje] =
    useState("");

  const [buscandoUsuario, setBuscandoUsuario] =
    useState(false);

  const [pantalla, setPantalla] =
    useState("login");

  const [
    usuarioSeleccionado,
    setUsuarioSeleccionado,
  ] = useState(null);

  const [sesionCaja, setSesionCaja] =
    useState(false);

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
            setCargandoInicial(false);
            return;
          }

          const referenciaUsuario = doc(
            db,
            "usuarios",
            usuario.uid
          );

          const resultadoUsuario =
            await getDoc(referenciaUsuario);

          if (!resultadoUsuario.exists()) {
            setCajaActivada(false);
            setCargandoInicial(false);
            return;
          }

          const datos =
            resultadoUsuario.data();

          const codigoNegocio =
            datos.businessId?.trim();

          if (!codigoNegocio) {
            setCajaActivada(false);
            setCargandoInicial(false);
            return;
          }

          const codigo =
            codigoNegocio.toUpperCase();

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
  // CAJA ACTIVADA
  // ============================================================

  const alActivarCaja = (datos) => {
    const codigo =
      datos.businessId.toUpperCase();

    setOwnerUid(datos.uid);

    setBusinessIdCaja(codigo);

    setBusinessId(codigo);

    setCajaActivada(true);

    setPantalla("login");

    setMensaje("");
  };

  // ============================================================
  // BUSCAR CAJERO EN FIREBASE
  // ============================================================

  const continuar = async (e) => {
    e.preventDefault();

    const negocio =
      businessId
        .trim()
        .toUpperCase();

    const numero =
      numeroUsuario.trim();

    if (!negocio) {
      setMensaje(
        "Escribe el código del negocio."
      );

      return;
    }

    if (!numero) {
      setMensaje(
        "Escribe tu número de usuario."
      );

      return;
    }

    if (
      negocio !==
      businessIdCaja.toUpperCase()
    ) {
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

      const referenciaUsuarios =
        collection(
          db,
          "usuarios",
          ownerUid,
          "usuariosSistema"
        );

      const consulta =
        query(
          referenciaUsuarios,
          where(
            "numeroUsuario",
            "==",
            numero
          ),
          limit(1)
        );

      const resultado =
        await getDocs(consulta);

      if (resultado.empty) {
        setMensaje(
          "No existe un usuario con ese número."
        );

        return;
      }

      const documento =
        resultado.docs[0];

      const datosUsuario =
        documento.data();

      if (
        datosUsuario.activo === false
      ) {
        setMensaje(
          "Este usuario está desactivado."
        );

        return;
      }

      setUsuarioSeleccionado({
        id:
          datosUsuario.id ??
          documento.id,

        nombre:
          datosUsuario.nombre ||
          "Usuario",

        numeroUsuario:
          datosUsuario.numeroUsuario,

        activo:
          datosUsuario.activo !== false,

        businessId:
          negocio,
      });

      setPantalla("pin");
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
  // REGRESAR DESDE PIN
  // ============================================================

  const regresarLogin = () => {
    setPantalla("login");

    setUsuarioSeleccionado(null);

    setSesionCaja(false);

    setMensaje("");
  };

  // ============================================================
  // REGRESAR A ACTIVAR CAJA (CIERRA SESIÓN ADMINISTRADOR)
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
      setPantalla("login");
    } catch (error) {
      console.error("Error al regresar a activación:", error);
      setMensaje("No se pudo cerrar la sesión. Inténtalo de nuevo.");
    }
  };

  // ============================================================
  // PIN
  // ============================================================

  const ingresarConPin = (
    pin,
    esNuevoPin
  ) => {
    /*
      Por ahora el PIN solamente controla
      el flujo visual.

      Todavía NO se guarda el PIN en Firestore.

      La validación segura se conectará
      posteriormente mediante backend.
    */

    console.log(
      "Acceso a caja:",
      {
        businessId:
          usuarioSeleccionado?.businessId,

        usuarioId:
          usuarioSeleccionado?.id,

        numeroUsuario:
          usuarioSeleccionado?.numeroUsuario,

        esNuevoPin,

        longitudPin:
          pin.length,
      }
    );

    setSesionCaja(true);
  };

  // ============================================================
  // CERRAR SESIÓN DEL CAJERO
  // ============================================================

  const cerrarCaja = () => {
    setSesionCaja(false);

    setPantalla("login");

    setUsuarioSeleccionado(null);

    setNumeroUsuario("");

    setMensaje("");
  };

  // ============================================================
  // CARGANDO
  // ============================================================

  if (cargandoInicial) {
    return (
      <main className="pagina-login">

        <section className="tarjeta-login">

          <div className="marca">

            <div className="logo-pos">
              P
            </div>

            <div>
              <h1>POS Init</h1>

              <p>
                Punto de venta
              </p>
            </div>

          </div>

          <div className="encabezado">

            <h2>
              Cargando...
            </h2>

            <p>
              Comprobando esta caja.
            </p>

          </div>

        </section>

      </main>
    );
  }

  // ============================================================
  // ACTIVAR CAJA
  // ============================================================

  if (!cajaActivada) {
    return (
      <ActivarCaja
        onActivada={
          alActivarCaja
        }
      />
    );
  }

  // ============================================================
  // VENTAS
  // ============================================================

  if (
    sesionCaja &&
    usuarioSeleccionado
  ) {
    return (
      <Ventas
        ownerUid={
          ownerUid
        }
        usuario={
          usuarioSeleccionado
        }
        onCerrarCaja={
          cerrarCaja
        }
      />
    );
  }

  // ============================================================
  // PIN
  // ============================================================

  if (
    pantalla === "pin" &&
    usuarioSeleccionado
  ) {
    return (
      <main className="pagina-login">

        <section className="tarjeta-login">

          <div className="marca">

            <div className="logo-pos">
              P
            </div>

            <div>
              <h1>
                POS Init
              </h1>

              <p>
                Punto de venta
              </p>
            </div>

          </div>

          <LoginPin
            usuario={
              usuarioSeleccionado
            }
            primerAcceso={
              true
            }
            onRegresar={
              regresarLogin
            }
            onIngresar={
              ingresarConPin
            }
          />

        </section>

      </main>
    );
  }

  // ============================================================
  // LOGIN DEL CAJERO
  // ============================================================

  return (
    <main className="pagina-login pagina-acceso-caja">
      <div className="acceso-tres-paneles">
        <aside className="acceso-panel-info" aria-label="Información del código de negocio">
          <div className="acceso-info-icono">🏪</div>
          <span className="acceso-info-etiqueta">CÓDIGO DE NEGOCIO</span>
          <h2>¿Qué es el código de negocio?</h2>
          <p>Es el código que identifica a tu negocio en POS Init y permite conectar esta caja con él.</p>
          <div className="acceso-info-pasos">
            <h3>📍 ¿Dónde se consigue?</h3>
            <ol>
              <li>Abre la aplicación móvil <strong>POS Init</strong>.</li>
              <li>Entra a <strong>Ajustes ⚙️</strong>.</li>
              <li>Busca <strong>Código de negocio</strong>.</li>
              <li>Copia el código y escríbelo en el formulario.</li>
            </ol>
          </div>
          <p className="acceso-info-nota">El código debe pertenecer al negocio con el que se activó esta caja.</p>
        </aside>

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

            <h1>
              POS Init
            </h1>

            <p>
              Punto de venta
            </p>

          </div>

        </div>

        <div className="encabezado">

          <h2>
            Acceso a caja
          </h2>

          <p>
            Ingresa tu código del negocio
            y número de usuario.
          </p>

        </div>

        <form
          onSubmit={
            continuar
          }
        >

          <label
            htmlFor="businessId"
          >
            Código del negocio
          </label>

          <input
            id="businessId"
            type="text"
            placeholder="BIZ-XXXXXXXXXXXX"
            value={
              businessId
            }
            onChange={(e) => {
              setBusinessId(
                e.target.value
                  .toUpperCase()
              );

              setMensaje("");
            }}
            autoComplete="off"
          />

          <label
            htmlFor="numeroUsuario"
          >
            Número de usuario
          </label>

          <input
            id="numeroUsuario"
            type="text"
            inputMode="numeric"
            placeholder="Ej. 001"
            value={
              numeroUsuario
            }
            onChange={(e) => {
              setNumeroUsuario(
                e.target.value.replace(
                  /\D/g,
                  ""
                )
              );

              setMensaje("");
            }}
            autoComplete="off"
          />

          {mensaje && (
            <div
              className="mensaje-error"
            >
              {mensaje}
            </div>
          )}

          <button
            type="submit"
            disabled={
              buscandoUsuario
            }
          >
            {buscandoUsuario
              ? "Buscando usuario..."
              : "Continuar"}
          </button>

        </form>

        <div className="pie-login">

          <span>
            POS Init
          </span>

          <span>
            •
          </span>

          <span>
            Acceso para personal autorizado
          </span>

        </div>

      </section>

        <aside className="acceso-panel-info" aria-label="Información del número de usuario">
          <div className="acceso-info-icono">👤</div>
          <span className="acceso-info-etiqueta">NÚMERO DE USUARIO</span>
          <h2>¿Qué es el número de usuario?</h2>
          <p>Es el número que identifica a cada empleado o cajero autorizado para entrar al punto de venta.</p>
          <div className="acceso-info-pasos">
            <h3>➕ ¿Cómo se consigue o crea?</h3>
            <ol>
              <li>Abre la aplicación móvil <strong>POS Init</strong>.</li>
              <li>Entra a <strong>Usuarios 👥</strong>.</li>
              <li>Pulsa el botón <strong>+</strong> para agregar un usuario.</li>
              <li>Registra al empleado y consulta su <strong>número de usuario</strong>.</li>
              <li>Escribe ese número en el formulario.</li>
            </ol>
          </div>
          <p className="acceso-info-nota">Si ya estás registrado, solicita tu número al administrador.</p>
        </aside>
      </div>

    </main>
  );
}

function App() {
  const ticketPublico =
    new URLSearchParams(window.location.search).get("ticket");

  if (ticketPublico) {
    return <TicketPublico token={ticketPublico} />;
  }

  return <AppPrivada />;
}


export default App;

