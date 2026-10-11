import { useState } from "react";
import {
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase/firebaseConfig";

function ActivarCaja({ onActivada }) {
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(false);

  const activar = async (e) => {
    e.preventDefault();

    if (!correo.trim() || !password) {
      setMensaje("Escribe el correo y la contraseña.");
      return;
    }

    try {
      setCargando(true);
      setMensaje("");

      const credencial = await signInWithEmailAndPassword(
        auth,
        correo.trim(),
        password
      );

      const uid = credencial.user.uid;

      const referencia = doc(db, "usuarios", uid);
      const resultado = await getDoc(referencia);

      if (!resultado.exists()) {
        await signOut(auth);
        setMensaje("No se encontró el perfil del negocio.");
        return;
      }

      const datos = resultado.data();

      if (!datos.businessId) {
        await signOut(auth);
        setMensaje(
          "Esta cuenta todavía no tiene un negocio vinculado."
        );
        return;
      }

      const codigoNegocio = datos.businessId
        .trim()
        .toUpperCase();

      localStorage.setItem(
        "posInitCajaActivada",
        "true"
      );

      localStorage.setItem(
        "posInitOwnerUid",
        uid
      );

      localStorage.setItem(
        "posInitBusinessId",
        codigoNegocio
      );

      onActivada({
        uid,
        businessId: codigoNegocio,
        nombreEmpresa: datos.nombreEmpresa || "Negocio",
      });
    } catch (error) {
      console.error("Error al activar caja:", error);

      setMensaje(
        "No se pudo activar la caja. Verifica tus datos o intenta nuevamente."
      );
    } finally {
      setCargando(false);
    }
  };

  return (
    <main className="pagina-login pagina-activar-caja">
      <div className="login-contenedor">

        {/* PANEL IZQUIERDO */}
        <aside className="login-panel-bienvenida">
          <div className="bienvenida-contenido">
            <div className="bienvenida-icono">
              🔐
            </div>

            <span className="bienvenida-etiqueta">
              BIENVENIDO A POS INIT
            </span>

            <h2>
              Accede a tu
              <br />
              negocio
            </h2>

            <p className="bienvenida-descripcion">
              Utiliza la misma cuenta que registraste
              en la aplicación móvil POS Init para
              activar tu punto de venta en esta computadora.
            </p>

            <div className="bienvenida-destacado">
              <span className="bienvenida-destacado-icono">
                🔄
              </span>

              <div>
                <strong>
                  Tu negocio conectado
                </strong>

                <p>
                  Al activar esta caja, se vinculará
                  con el negocio asociado a tu cuenta.
                </p>
              </div>
            </div>
          </div>

          <div className="bienvenida-pie">
            POS Init · Punto de venta
          </div>
        </aside>

        {/* PANEL CENTRAL */}
        <section className="tarjeta-login">
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
            <h2>Activar esta caja</h2>

            <p>
              Inicia sesión con tu cuenta de
              administrador para vincular esta
              computadora con tu negocio.
            </p>
          </div>

          <form onSubmit={activar}>
            <label htmlFor="correo">
              Correo del administrador
            </label>

            <input
              id="correo"
              type="email"
              placeholder="correo@ejemplo.com"
              value={correo}
              onChange={(e) => {
                setCorreo(e.target.value);
                setMensaje("");
              }}
              autoComplete="email"
              required
              disabled={cargando}
            />

            <label htmlFor="password">
              Contraseña
            </label>

            <input
              id="password"
              type="password"
              placeholder="Ingresa tu contraseña"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setMensaje("");
              }}
              autoComplete="current-password"
              required
              disabled={cargando}
            />

            {mensaje && (
              <div
                className="mensaje-error"
                role="alert"
              >
                {mensaje}
              </div>
            )}

            <button
              type="submit"
              disabled={cargando}
            >
              {cargando
                ? "Activando caja..."
                : "Activar caja"}
            </button>
          </form>

          <div className="pie-login">
            <span>POS Init</span>
            <span>•</span>
            <span>Configuración inicial</span>
          </div>
        </section>

        {/* PANEL DERECHO */}
        <aside className="login-panel-informacion">
          <div className="login-info-encabezado">
            <div className="login-info-icono">
              📱
            </div>

            <span className="login-info-etiqueta">
              INFORMACIÓN DE ACCESO
            </span>

            <h2>
              ¿Necesitas ayuda?
            </h2>

            <p>
              Tu cuenta de POS Init se administra
              desde la aplicación móvil.
            </p>
          </div>

          <div className="login-info-bloques">

            {/* CREAR CUENTA */}
            <div className="login-info-bloque">
              <div className="login-info-bloque-icono">
                📱
              </div>

              <div>
                <h3>
                  ¿Todavía no tienes cuenta?
                </h3>

                <p>
                  Primero debes crear una cuenta
                  desde la aplicación móvil POS Init.
                </p>

                <p>
                  Una vez registrado tu negocio,
                  podrás utilizar tu correo y
                  contraseña para activar esta caja.
                </p>
              </div>
            </div>

            {/* RECUPERAR CUENTA */}
            <div className="login-info-bloque">
              <div className="login-info-bloque-icono">
                🔑
              </div>

              <div>
                <h3>
                  ¿Olvidaste tu correo o contraseña?
                </h3>

                <p>
                  Abre la aplicación móvil POS Init
                  y utiliza las opciones disponibles
                  para recuperar el acceso o actualizar
                  los datos de tu cuenta.
                </p>
              </div>
            </div>

          </div>

          <div className="login-info-pie">
            <span className="login-info-indicador" />

            <span>
              POS Init · Aplicación móvil y web
            </span>
          </div>
        </aside>

      </div>
    </main>
  );
}

export default ActivarCaja;