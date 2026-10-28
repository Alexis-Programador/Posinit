import React, { useEffect, useMemo, useRef, useState } from "react";

// POS Init — Vista previa de cobro combinado.
// No procesa tarjetas, no genera cargos y no registra ventas.

const centavos = (valor) =>
  Math.max(0, Math.round((Number(valor) || 0) * 100));

const pesos = (valor) =>
  (valor / 100).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });

const nuevaFila = (tipo = "efectivo") => ({
  id:
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random()}`,
  tipo,
  importe: "",
});

const filaEstilo = {
  display: "flex",
  justifyContent: "space-between",
};

const botonClaro = {
  background: "#eef4fc",
  border: "1px solid #cbd9ed",
  borderRadius: 12,
  padding: "12px 14px",
  cursor: "pointer",
  fontWeight: 650,
};

export default function CobroMixtoDemo({
  total = 600,
  onCerrar = () => {},
}) {
  const [filas, setFilas] = useState([nuevaFila()]);
  const [seleccionada, setSeleccionada] = useState(0);
  const [planBloqueado, setPlanBloqueado] = useState(false);
  const [aviso, setAviso] = useState("");

  const contenedorRef = useRef(null);

  const totalC = centavos(total);

  const abonadoC = useMemo(
    () =>
      filas.reduce(
        (suma, fila) => suma + centavos(fila.importe),
        0
      ),
    [filas]
  );

  const restanteC = Math.max(0, totalC - abonadoC);
  const excesoC = Math.max(0, abonadoC - totalC);

  const tarjetaInvalida = filas.some(
    (fila) =>
      fila.tipo === "tarjeta" &&
      centavos(fila.importe) > 0 &&
      centavos(fila.importe) < 1000
  );

  const valido =
    totalC > 0 &&
    restanteC === 0 &&
    !tarjetaInvalida &&
    filas.every((fila) => centavos(fila.importe) > 0) &&
    !(
      excesoC > 0 &&
      filas.some((fila) => fila.tipo === "tarjeta")
    );

  const actualizar = (id, cambios) => {
    if (planBloqueado) return;

    setFilas((anteriores) =>
      anteriores.map((fila) =>
        fila.id === id ? { ...fila, ...cambios } : fila
      )
    );

    setAviso("");
  };

  const agregar = (tipo) => {
    if (planBloqueado) return;

    setFilas((anteriores) => [
      ...anteriores,
      nuevaFila(tipo),
    ]);

    setSeleccionada(filas.length);
    setAviso("");
  };

  const quitar = (id) => {
    if (planBloqueado) return;

    setFilas((anteriores) =>
      anteriores.length > 1
        ? anteriores.filter((fila) => fila.id !== id)
        : anteriores
    );

    setSeleccionada(0);
    setAviso("");
  };

  const cambiarTipo = (id, tipo) => {
    actualizar(id, { tipo });
  };

  const bloquearDistribucion = () => {
    if (!valido || planBloqueado) return;

    setPlanBloqueado(true);

    setAviso(
      "Distribución bloqueada para revisión. " +
        "No se ha cobrado ninguna tarjeta."
    );
  };

  const editarDistribucion = () => {
    setPlanBloqueado(false);
    setAviso("Puedes editar la distribución.");
  };

  const manejarTeclas = (evento) => {
    const elemento = evento.target;

    const escribiendo =
      elemento instanceof HTMLElement &&
      ["INPUT", "SELECT", "TEXTAREA"].includes(
        elemento.tagName
      );

    if (escribiendo) return;

    if (evento.key === "+") {
      evento.preventDefault();
      agregar("efectivo");
      return;
    }

    if (evento.key === "-") {
      evento.preventDefault();
      agregar("tarjeta");
      return;
    }

    if (
      evento.key === "ArrowDown" ||
      evento.key === "ArrowUp"
    ) {
      evento.preventDefault();

      const movimiento =
        evento.key === "ArrowDown" ? 1 : -1;

      setSeleccionada((actual) =>
        Math.max(
          0,
          Math.min(filas.length - 1, actual + movimiento)
        )
      );

      return;
    }

    if (evento.key === "Escape") {
      evento.preventDefault();
      onCerrar();
      return;
    }

    if (evento.key === "Enter") {
      evento.preventDefault();
      bloquearDistribucion();
    }
  };

  useEffect(() => {
    contenedorRef.current?.focus();
  }, []);

  return (
    <div
      ref={contenedorRef}
      onKeyDown={manejarTeclas}
      tabIndex={0}
      style={{
        minHeight: "100vh",
        background: "#dfe9f6",
        display: "grid",
        placeItems: "center",
        padding: 16,
        fontFamily: "system-ui, sans-serif",
        color: "#12203c",
      }}
    >
      <section
        style={{
          width: "min(760px, 100%)",
          maxHeight: "94vh",
          overflow: "auto",
          background: "#fff",
          borderRadius: 22,
          boxShadow: "0 20px 65px #20334b44",
          padding: 24,
          boxSizing: "border-box",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "start",
            gap: 12,
          }}
        >
          <div>
            <h2 style={{ margin: "0 0 5px" }}>
              🛒 Cobrar venta
            </h2>

            <span style={{ color: "#63748f" }}>
              Divide el pago entre efectivo y tantas
              tarjetas como necesites.
            </span>
          </div>

          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </header>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            margin: "18px 0",
            padding: "16px 18px",
            background: "#eaf3ff",
            borderRadius: 14,
          }}
        >
          <b>Total a pagar</b>

          <strong
            style={{
              fontSize: 27,
              color: "#075cdd",
            }}
          >
            {pesos(totalC)}
          </strong>
        </div>

        <h3 style={{ margin: "12px 0" }}>
          Métodos de pago
        </h3>

        {filas.map((fila, indice) => {
          const numeroTarjeta = filas
            .slice(0, indice + 1)
            .filter(
              (elemento) => elemento.tipo === "tarjeta"
            ).length;

          const importeC = centavos(fila.importe);

          return (
            <div
              key={fila.id}
              onClick={() => setSeleccionada(indice)}
              style={{
                border:
                  seleccionada === indice
                    ? "2px solid #1672f5"
                    : "1px solid #d9e3ef",
                background:
                  fila.tipo === "efectivo"
                    ? "#effcf5"
                    : "#eef5ff",
                borderRadius: 14,
                padding: 13,
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <b style={{ minWidth: 90 }}>
                  {fila.tipo === "efectivo"
                    ? "💵 Efectivo"
                    : `💳 Tarjeta ${numeroTarjeta}`}
                </b>

                <select
                  disabled={planBloqueado}
                  aria-label={`Método ${indice + 1}`}
                  value={fila.tipo}
                  onChange={(evento) =>
                    cambiarTipo(
                      fila.id,
                      evento.target.value
                    )
                  }
                  style={{
                    padding: 9,
                    borderRadius: 9,
                    border: "1px solid #cbd7e6",
                  }}
                >
                  <option value="efectivo">
                    Efectivo
                  </option>

                  <option value="tarjeta">
                    Tarjeta (Stripe)
                  </option>
                </select>

                <input
                  disabled={planBloqueado}
                  aria-label={`Importe ${indice + 1}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="Importe $"
                  value={fila.importe}
                  onChange={(evento) =>
                    actualizar(fila.id, {
                      importe: evento.target.value,
                    })
                  }
                  style={{
                    flex: "1 1 140px",
                    minWidth: 110,
                    padding: 10,
                    borderRadius: 9,
                    border: "1px solid #cbd7e6",
                    fontSize: 17,
                  }}
                />

                <button
                  type="button"
                  onClick={() => quitar(fila.id)}
                  disabled={
                    planBloqueado || filas.length === 1
                  }
                  title="Quitar método"
                >
                  ✕
                </button>
              </div>

              {fila.tipo === "tarjeta" && (
                <small
                  style={{
                    display: "block",
                    marginTop: 8,
                    color:
                      importeC > 0 && importeC < 1000
                        ? "#b45309"
                        : "#526684",
                  }}
                >
                  {importeC > 0 && importeC < 1000
                    ? "⚠️ Stripe requiere al menos $10.00 MXN por tarjeta."
                    : "🔒 El QR individual se habilitará al integrar el Worker y la verificación de Stripe."}
                </small>
              )}
            </div>
          );
        })}

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            margin: "14px 0",
          }}
        >
          <button
            type="button"
            disabled={planBloqueado}
            onClick={() => agregar("efectivo")}
            style={botonClaro}
          >
            ＋ Agregar efectivo
          </button>

          <button
            type="button"
            disabled={planBloqueado}
            onClick={() => agregar("tarjeta")}
            style={botonClaro}
          >
            ＋ Agregar tarjeta
          </button>
        </div>

        <div
          style={{
            background: "#f2f6fc",
            borderRadius: 14,
            padding: 16,
            display: "grid",
            gap: 9,
          }}
        >
          <div style={filaEstilo}>
            <span>Distribuido</span>
            <b>{pesos(abonadoC)}</b>
          </div>

          <div style={filaEstilo}>
            <span>Restante</span>

            <b
              style={{
                color: restanteC
                  ? "#b45309"
                  : "#059669",
              }}
            >
              {pesos(restanteC)}
            </b>
          </div>

          {excesoC > 0 && (
            <div style={filaEstilo}>
              <span>
                Excedente{" "}
                {filas.every(
                  (fila) => fila.tipo === "efectivo"
                )
                  ? "(posible cambio)"
                  : "(no permitido en tarjeta)"}
              </span>

              <b>{pesos(excesoC)}</b>
            </div>
          )}
        </div>

        <p
          style={{
            color: "#95501b",
            background: "#fff2df",
            borderRadius: 12,
            padding: 12,
            fontSize: 13,
          }}
        >
          🧾 Los pagos combinados no deben imprimir
          automáticamente. Esta pantalla es una{" "}
          <b>demostración</b>: todavía no genera QR,
          no procesa cargos y no registra ventas.
        </p>

        {aviso && (
          <p
            role="status"
            style={{ color: "#1255a3" }}
          >
            {aviso}
          </p>
        )}

        <footer
          style={{
            display: "flex",
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={onCerrar}
            style={{
              ...botonClaro,
              flex: 1,
            }}
          >
            Cancelar
          </button>

          <button
            type="button"
            disabled={!valido || planBloqueado}
            onClick={bloquearDistribucion}
            style={{
              flex: 2,
              background: valido
                ? "#075ff0"
                : "#9daec7",
              color: "#fff",
              border: 0,
              padding: 14,
              borderRadius: 12,
              fontWeight: 700,
              cursor: valido
                ? "pointer"
                : "not-allowed",
            }}
          >
            ✓ Bloquear distribución (demo)
          </button>
        </footer>

        {planBloqueado && (
          <button
            type="button"
            onClick={editarDistribucion}
            style={{
              ...botonClaro,
              marginTop: 10,
            }}
          >
            Editar distribución
          </button>
        )}

        <small
          style={{
            display: "block",
            marginTop: 12,
            color: "#68788c",
          }}
        >
          Atajos fuera de los campos: + efectivo ·
          - tarjeta · ↑/↓ seleccionar · Enter validar ·
          Esc cerrar
        </small>
      </section>
    </div>
  );
}