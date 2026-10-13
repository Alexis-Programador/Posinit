import { useState } from "react";

const PIN_LENGTH = 4;

function validarPinSeguro(valor) {
  if (!/^\d{4}$/.test(valor)) {
    return "El PIN debe tener exactamente 4 números.";
  }

  // Ejemplos rechazados: 1111, 2222, 9999
  if (/^(\d)\1{3}$/.test(valor)) {
    return "No puedes utilizar cuatro números iguales, como 1111.";
  }

  // Ejemplos rechazados: 0123, 1234, 4321, 9876
  let ascendente = true;
  let descendente = true;

  for (let i = 1; i < valor.length; i++) {
    const anterior = Number(valor[i - 1]);
    const actual = Number(valor[i]);

    if (actual !== anterior + 1) {
      ascendente = false;
    }

    if (actual !== anterior - 1) {
      descendente = false;
    }
  }

  if (ascendente || descendente) {
    return "No puedes utilizar números consecutivos, como 1234 o 4321.";
  }

  return "";
}

function LoginPin({
  usuario,
  onRegresar,
  onIngresar,
  primerAcceso = true,
}) {
  const [paso, setPaso] = useState(
    primerAcceso ? "crear" : "ingresar"
  );

  const [pin, setPin] = useState("");
  const [primerPin, setPrimerPin] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const esCreacion = paso === "crear" || paso === "confirmar";

  const cambiarPin = (valor) => {
    const soloNumeros = valor
      .replace(/\D/g, "")
      .slice(0, PIN_LENGTH);

    setPin(soloNumeros);
    setError("");
  };

  const regresar = () => {
    if (cargando) return;

    // Si está confirmando, regresa a crear el PIN.
    if (paso === "confirmar") {
      setPaso("crear");
      setPin("");
      setPrimerPin("");
      setError("");
      return;
    }

    setPin("");
    setPrimerPin("");
    setError("");

    if (typeof onRegresar === "function") {
      onRegresar();
    }
  };

  const continuar = async (e) => {
    e.preventDefault();

    if (cargando) return;

    if (!/^\d{4}$/.test(pin)) {
      setError("El PIN debe tener exactamente 4 números.");
      return;
    }

    // ==========================================
    // CREACIÓN DEL PIN
    // ==========================================
    if (paso === "crear") {
      const problema = validarPinSeguro(pin);

      if (problema) {
        setError(problema);
        return;
      }

      setPrimerPin(pin);
      setPin("");
      setError("");
      setPaso("confirmar");
      return;
    }

    // ==========================================
    // CONFIRMACIÓN DEL PIN
    // ==========================================
    if (paso === "confirmar") {
      if (pin !== primerPin) {
        setError("Los PIN no coinciden. Inténtalo nuevamente.");
        setPin("");
        return;
      }
    }

    // ==========================================
    // ENVIAR PIN A APP.JSX
    // ==========================================
    try {
      setCargando(true);
      setError("");

      if (typeof onIngresar !== "function") {
        throw new Error(
          "No se configuró la función para ingresar a caja."
        );
      }

      const esNuevo = paso === "confirmar";

      const resultado = await onIngresar(pin, esNuevo);

      if (resultado === false) {
        setError(
          "No se pudo ingresar. Verifica tu PIN."
        );
        setPin("");
      }
    } catch (err) {
      console.error("Error al ingresar con PIN:", err);

      setError(
        err?.message ||
          "Ocurrió un error al ingresar. Inténtalo nuevamente."
      );

      setPin("");
    } finally {
      setCargando(false);
    }
  };

  const titulo = () => {
    if (paso === "crear") return "Crea tu PIN";
    if (paso === "confirmar") return "Confirma tu PIN";

    return "Ingresa tu PIN";
  };

  const descripcion = () => {
    if (paso === "crear") {
      return "Es tu primer acceso. Crea un PIN seguro de 4 números.";
    }

    if (paso === "confirmar") {
      return "Escribe nuevamente tu PIN para confirmarlo.";
    }

    return "Escribe tu PIN de acceso para entrar a la caja.";
  };

  const textoBoton = () => {
    if (cargando) return "Verificando...";

    if (paso === "crear") return "Continuar";
    if (paso === "confirmar") return "Crear PIN";

    return "Ingresar a caja";
  };

  return (
    <main className="pagina-pin-seguro">
      <div className="pin-tres-paneles">

        {/* ==========================================
            PANEL IZQUIERDO
            REGLAS DE SEGURIDAD
        ========================================== */}
        <aside className="pin-panel-lateral">

          <div className="pin-panel-icono">
            🛡️
          </div>

          <span className="pin-panel-etiqueta">
            SEGURIDAD DE ACCESO
          </span>

          <h2>
            Protege tu caja
          </h2>

          <p className="pin-panel-descripcion">
            Tu PIN es personal y permite proteger
            el acceso a tu punto de venta.
          </p>

          <div className="pin-info-bloque">
            <div className="pin-info-icono">
              🚫
            </div>

            <div>
              <h3>No repitas números</h3>

              <p>
                No se permiten PIN con los cuatro
                números iguales.
              </p>

              <span className="pin-ejemplo">
                Ejemplos: 0000, 1111, 9999
              </span>
            </div>
          </div>

          <div className="pin-info-bloque">
            <div className="pin-info-icono">
              🔢
            </div>

            <div>
              <h3>Evita números consecutivos</h3>

              <p>
                No puedes crear un PIN formado por
                una secuencia ascendente o descendente.
              </p>

              <span className="pin-ejemplo">
                Ejemplos: 0123, 1234, 4321
              </span>
            </div>
          </div>

          <div className="pin-info-bloque">
            <div className="pin-info-icono">
              🔒
            </div>

            <div>
              <h3>No compartas tu PIN</h3>

              <p>
                Cada usuario debe utilizar
                su propio acceso a caja.
              </p>
            </div>
          </div>

          <div className="pin-panel-pie">
            POS Init · Seguridad
          </div>

        </aside>

        {/* ==========================================
            PANEL CENTRAL
            LOGIN PIN ORIGINAL
        ========================================== */}
        <section className="tarjeta-login pin-panel-central">

          <div className="marca">
            <div className="logo-pos">
              P
            </div>

            <div>
              <h1>POS Init</h1>
              <p>Punto de venta</p>
            </div>
          </div>

          <div className="login-pin">

            <button
              type="button"
              className="boton-regresar"
              onClick={regresar}
              disabled={cargando}
            >
              ← Regresar
            </button>

            <div className="usuario-login">

              <div className="avatar-login">
                {usuario?.nombre
                  ?.charAt(0)
                  ?.toUpperCase() || "U"}
              </div>

              <h2>
                {usuario?.nombre || "Usuario"}
              </h2>

              <p>
                Usuario {usuario?.numeroUsuario || ""}
              </p>

            </div>

            <div className="encabezado-pin">
              <h3>{titulo()}</h3>
              <p>{descripcion()}</p>
            </div>

            <form onSubmit={continuar}>

              <label htmlFor="pin">
                PIN de acceso
              </label>

              <input
                id="pin"
                className="input-pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={PIN_LENGTH}
                placeholder="••••"
                value={pin}
                onChange={(e) =>
                  cambiarPin(e.target.value)
                }
                autoFocus
                autoComplete="off"
                disabled={cargando}
                required
              />

              <div className="contador-pin">
                {pin.length} / {PIN_LENGTH}
              </div>

              {esCreacion && (
                <p className="pin-ayuda">
                  Elige cuatro números diferentes
                  de secuencias fáciles de adivinar.
                </p>
              )}

              {error && (
                <div
                  className="mensaje-error"
                  role="alert"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={
                  pin.length !== PIN_LENGTH ||
                  cargando
                }
              >
                {textoBoton()}
              </button>

            </form>

            <div className="pie-login">
              <span>POS Init</span>
              <span>•</span>
              <span>Acceso a caja</span>
            </div>

          </div>
        </section>

        {/* ==========================================
            PANEL DERECHO
            RENOVACIÓN MENSUAL
        ========================================== */}
        <aside className="pin-panel-lateral">

          <div className="pin-panel-icono">
            📅
          </div>

          <span className="pin-panel-etiqueta">
            PROTECCIÓN DE CUENTA
          </span>

          <h2>
            Renovación de PIN
          </h2>

          <p className="pin-panel-descripcion">
            POS Init contará con una política
            de renovación periódica del PIN.
          </p>

          <div className="pin-info-bloque">
            <div className="pin-info-icono">
              🔄
            </div>

            <div>
              <h3>Cambio cada 30 días</h3>

              <p>
                Al vencer el periodo de seguridad,
                deberás crear un PIN nuevo para
                continuar utilizando la caja.
              </p>
            </div>
          </div>

          <div className="pin-info-bloque">
            <div className="pin-info-icono">
              🚫
            </div>

            <div>
              <h3>No reutilices tu PIN</h3>

              <p>
                No podrás utilizar un PIN que ya
                hayas registrado anteriormente.
              </p>
            </div>
          </div>

          <div className="pin-info-bloque">
            <div className="pin-info-icono">
              📱
            </div>

            <div>
              <h3>¿Olvidaste tu PIN?</h3>

              <p>
                Próximamente podrás restablecerlo
                desde la aplicación móvil POS Init,
                después de verificar tu identidad.
              </p>
            </div>
          </div>

          <div className="pin-panel-pie">
            POS Init · Protección de acceso
          </div>

        </aside>

      </div>
    </main>
  );
}

export default LoginPin;