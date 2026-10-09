import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
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

      const referencia = doc(
        db,
        "usuarios",
        uid
      );

      const resultado = await getDoc(referencia);

      if (!resultado.exists()) {
        setMensaje(
          "No se encontró el perfil del negocio."
        );
        return;
      }

      const datos = resultado.data();

      if (!datos.businessId) {
        setMensaje(
          "Esta cuenta todavía no tiene código de negocio."
        );
        return;
      }

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
        datos.businessId
      );

      onActivada({
        uid,
        businessId: datos.businessId,
        nombreEmpresa:
          datos.nombreEmpresa || "Negocio",
      });

    } catch (error) {
      console.error(error);

      setMensaje(
        "No se pudo activar la caja. Revisa el correo y la contraseña."
      );
    } finally {
      setCargando(false);
    }
  };

  return (
    <main className="pagina-login">
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
            El administrador debe iniciar sesión
            para vincular esta computadora con
            su negocio.
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
          />

          <label htmlFor="password">
            Contraseña
          </label>

          <input
            id="password"
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setMensaje("");
            }}
            autoComplete="current-password"
          />

          {mensaje && (
            <div className="mensaje-error">
              {mensaje}
            </div>
          )}

          <button
            type="submit"
            disabled={cargando}
          >
            {cargando
              ? "Activando..."
              : "Activar caja"}
          </button>

        </form>

        <div className="pie-login">
          <span>POS Init</span>
          <span>•</span>
          <span>Configuración inicial</span>
        </div>

      </section>
    </main>
  );
}

export default ActivarCaja;