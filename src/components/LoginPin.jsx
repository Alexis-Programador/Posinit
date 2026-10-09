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

  const limpiarError = () => {
    setError("");
  };

  const cambiarPin = (valor) => {
    const soloNumeros = valor
      .replace(/\D/g, "")
      .slice(0, 4);

    setPin(soloNumeros);
    limpiarError();
  };

  const continuar = (e) => {
    e.preventDefault();

    if (!/^\d{4}$/.test(pin)) {
      setError("El PIN debe tener exactamente 4 números.");
      return;
    }

    // ==========================================
    // PRIMER ACCESO: CREAR PIN
    // ==========================================

    if (paso === "crear") {
      setPrimerPin(pin);
      setPin("");
      setError("");
      setPaso("confirmar");
      return;
    }

    // ==========================================
    // CONFIRMAR PIN
    // ==========================================

    if (paso === "confirmar") {
      if (pin !== primerPin) {
        setError("Los PIN no coinciden.");
        setPin("");
        return;
      }

      onIngresar(pin, true);
      return;
    }

    // ==========================================
    // USUARIO QUE YA TIENE PIN
    // ==========================================

    onIngresar(pin, false);
  };

  const titulo = () => {
    if (paso === "crear") {
      return "Crea tu PIN";
    }

    if (paso === "confirmar") {
      return "Confirma tu PIN";
    }

    return "Ingresa tu PIN";
  };

  const descripcion = () => {
    if (paso === "crear") {
      return "Es tu primer acceso. Crea un PIN de 4 números.";
    }

    if (paso === "confirmar") {
      return "Escribe nuevamente el PIN para confirmarlo.";
    }

    return "Escribe tu PIN de acceso para entrar a la caja.";
  };

  const textoBoton = () => {
    if (paso === "crear") {
      return "Continuar";
    }

    if (paso === "confirmar") {
      return "Crear PIN";
    }

    return "Ingresar a caja";
  };

  return (
    <div className="login-pin">
      <button
        type="button"
        className="boton-regresar"
        onClick={onRegresar}
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
          maxLength={4}
          placeholder="••••"
          value={pin}
          onChange={(e) =>
            cambiarPin(e.target.value)
          }
          autoFocus
          autoComplete="off"
        />

        <div className="contador-pin">
          {pin.length} / 4
        </div>

        {error && (
          <div className="mensaje-error">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={pin.length !== 4}
        >
          {textoBoton()}
        </button>
      </form>
    </div>
  );
}

export default LoginPin;