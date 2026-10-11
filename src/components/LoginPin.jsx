import { useState } from "react";

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

  const cambiarPin = (valor) => {
    const soloNumeros = valor
      .replace(/\D/g, "")
      .slice(0, 4);

    setPin(soloNumeros);
    setError("");
  };

  const regresar = () => {
    if (cargando) return;

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

    // PRIMER ACCESO: CREAR PIN
    if (paso === "crear") {
      setPrimerPin(pin);
      setPin("");
      setError("");
      setPaso("confirmar");
      return;
    }

    // CONFIRMAR PIN
    if (paso === "confirmar") {
      if (pin !== primerPin) {
        setError("Los PIN no coinciden. Inténtalo nuevamente.");
        setPin("");
        return;
      }
    }

    // ENVIAR PIN A APP.JSX
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
      return "Es tu primer acceso. Crea un PIN de 4 números.";
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
    <div className="login-pin">

      {/* BOTÓN REGRESAR */}
      <button
        type="button"
        className="boton-regresar"
        onClick={regresar}
        disabled={cargando}
      >
        ← Regresar
      </button>

      {/* INFORMACIÓN DEL USUARIO */}
      <div className="usuario-login">
        <div className="avatar-login">
          {usuario?.nombre
            ?.charAt(0)
            ?.toUpperCase() || "U"}
        </div>

        <h2>{usuario?.nombre || "Usuario"}</h2>

        <p>
          Usuario {usuario?.numeroUsuario || ""}
        </p>
      </div>

      {/* ENCABEZADO */}
      <div className="encabezado-pin">
        <h3>{titulo()}</h3>
        <p>{descripcion()}</p>
      </div>

      {/* FORMULARIO */}
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
          maxLength={4}
          placeholder="••••"
          value={pin}
          onChange={(e) => cambiarPin(e.target.value)}
          autoFocus
          autoComplete="off"
          disabled={cargando}
          required
        />

        <div className="contador-pin">
          {pin.length} / 4
        </div>

        {error && (
          <div className="mensaje-error" role="alert">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={pin.length !== 4 || cargando}
        >
          {textoBoton()}
        </button>
      </form>

      {/* INFORMACIÓN */}
      <div className="pie-login">
        <span>POS Init</span>
        <span>•</span>
        <span>Acceso seguro a caja</span>
      </div>

    </div>
  );
}

export default LoginPin;