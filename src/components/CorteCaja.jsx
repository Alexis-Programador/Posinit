import { useEffect, useMemo, useState } from "react";

import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

import { db } from "../firebase/firebaseConfig";

// Distribuye ventas mixtas por método sin contar el total dos veces.
// Solo deben existir ventas mixtas después de confirmar todos sus pagos.
function importesPorMetodo(venta) {
  const totalCentavos = Math.round(Number(venta?.total || 0) * 100);
  const metodo = String(venta?.metodoPago || "").toLowerCase();

  if (metodo === "mixto") {
    if (!Array.isArray(venta.pagos) || venta.pagos.length === 0) {
      return { efectivo: 0, tarjeta: 0, otros: totalCentavos / 100 };
    }
    let efectivo = 0;
    let tarjeta = 0;
    let otros = 0;
    for (const pago of venta.pagos) {
      const importe = Number(pago?.importe);
      if (!Number.isFinite(importe) || importe < 0) {
        return { efectivo: 0, tarjeta: 0, otros: totalCentavos / 100 };
      }
      const centavos = Math.round(importe * 100);
      const tipo = String(pago?.tipo || "").toLowerCase();
      if (tipo === "efectivo") efectivo += centavos;
      else if (tipo === "tarjeta") tarjeta += centavos;
      else otros += centavos;
    }
    if (efectivo + tarjeta + otros !== totalCentavos) {
      return { efectivo: 0, tarjeta: 0, otros: totalCentavos / 100 };
    }
    return {
      efectivo: efectivo / 100,
      tarjeta: tarjeta / 100,
      otros: otros / 100,
    };
  }
  if (metodo === "efectivo") return { efectivo: totalCentavos / 100, tarjeta: 0, otros: 0 };
  if (metodo === "tarjeta") return { efectivo: 0, tarjeta: totalCentavos / 100, otros: 0 };
  return { efectivo: 0, tarjeta: 0, otros: totalCentavos / 100 };
}

function CorteCaja({
  ownerUid,
  usuario,
  efectivoEnCaja = 0,
  onCerrar,
  onCorteRealizado,
}) {
  const [ventas, setVentas] = useState([]);
  const [ultimoCorte, setUltimoCorte] = useState(null);
  const [efectivoContado, setEfectivoContado] = useState("");
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");

  // El corte NO modifica el efectivo en caja.
  // Solo compara el efectivo que el sistema espera contra lo contado físicamente.
  const efectivoEsperado = Number(efectivoEnCaja || 0);

  useEffect(() => {
    const cargarInformacion = async () => {
      if (!ownerUid || !usuario?.numeroUsuario) {
        setError("No se encontró la información del cajero.");
        setCargando(false);
        return;
      }

      try {
        setCargando(true);
        setError("");

        const cortesRef = collection(
          db,
          "usuarios",
          ownerUid,
          "cortesCaja"
        );

        const consultaCortes = query(
          cortesRef,
          where("numeroUsuario", "==", usuario.numeroUsuario)
        );

        const cortesSnapshot = await getDocs(consultaCortes);

        const cortes = cortesSnapshot.docs
          .map((documento) => ({
            documentoId: documento.id,
            ...documento.data(),
          }))
          .sort(
            (a, b) =>
              Number(b.fechaHora ?? 0) -
              Number(a.fechaHora ?? 0)
          );

        const corteAnterior =
          cortes.length > 0 ? cortes[0] : null;

        setUltimoCorte(corteAnterior);

        const fechaUltimoCorte =
          Number(corteAnterior?.fechaHora ?? 0);

        const ventasRef = collection(
          db,
          "usuarios",
          ownerUid,
          "ventas"
        );

        const consultaVentas = query(
          ventasRef,
          where("numeroUsuario", "==", usuario.numeroUsuario)
        );

        const ventasSnapshot = await getDocs(consultaVentas);

        const ventasPendientes = ventasSnapshot.docs
          .map((documento) => ({
            documentoId: documento.id,
            ...documento.data(),
          }))
          .filter(
            (venta) =>
              Number(venta.fechaHora ?? 0) >
              fechaUltimoCorte
          )
          .sort(
            (a, b) =>
              Number(a.fechaHora ?? 0) -
              Number(b.fechaHora ?? 0)
          );

        setVentas(ventasPendientes);
      } catch (err) {
        console.error("Error cargando corte:", err);
        setError(
          err?.message ||
            "No se pudo cargar la información del corte."
        );
      } finally {
        setCargando(false);
      }
    };

    cargarInformacion();
  }, [ownerUid, usuario?.numeroUsuario]);

  const resumen = useMemo(() => {
    let efectivo = 0;
    let tarjeta = 0;
    let otros = 0;

    ventas.forEach((venta) => {
      const importes = importesPorMetodo(venta);
      efectivo += importes.efectivo;
      tarjeta += importes.tarjeta;
      otros += importes.otros;
    });

    return {
      efectivo,
      tarjeta,
      otros,
      total: efectivo + tarjeta + otros,
      numeroVentas: ventas.length,
    };
  }, [ventas]);

  const contado =
    efectivoContado.trim() === ""
      ? null
      : Number(efectivoContado);

  const diferencia =
    contado == null || !Number.isFinite(contado)
      ? 0
      : Number((contado - efectivoEsperado).toFixed(2));

  const dinero = (cantidad) =>
    Number(cantidad || 0).toLocaleString("es-MX", {
      style: "currency",
      currency: "MXN",
    });

  const textoResultado = () => {
    if (contado == null || !Number.isFinite(contado)) {
      return "Escribe el efectivo físico para calcular.";
    }

    if (diferencia < 0) {
      return `Faltante: ${dinero(Math.abs(diferencia))}`;
    }

    if (diferencia > 0) {
      return `Sobrante: ${dinero(diferencia)}`;
    }

    return "Caja exacta";
  };

  const realizarCorte = async () => {
    if (procesando) return;

    if (efectivoContado.trim() === "") {
      setError(
        "Escribe cuánto efectivo tiene físicamente el cajero."
      );
      return;
    }

    if (
      contado == null ||
      !Number.isFinite(contado) ||
      contado < 0
    ) {
      setError("La cantidad de efectivo contado no es válida.");
      return;
    }

    try {
      setProcesando(true);
      setError("");

      const fechaCorte = Date.now();

      const corteRef = doc(
        collection(
          db,
          "usuarios",
          ownerUid,
          "cortesCaja"
        )
      );

      const totalEsperado = Number(
        efectivoEsperado.toFixed(2)
      );

      const totalContado = Number(
        contado.toFixed(2)
      );

      const diferenciaFinal = Number(
        (totalContado - totalEsperado).toFixed(2)
      );

      const totalVentas = Number(
        resumen.total.toFixed(2)
      );

      await setDoc(corteRef, {
        id: corteRef.id,
        propietarioUid: ownerUid,

        usuarioId: usuario?.id ?? null,
        numeroUsuario: usuario?.numeroUsuario ?? "",
        nombreUsuario: usuario?.nombre ?? "Usuario",

        fechaHora: fechaCorte,
        fechaServidor: serverTimestamp(),

        desdeFecha: Number(
          ultimoCorte?.fechaHora ?? 0
        ),
        hastaFecha: fechaCorte,

        // Lo que realmente debería existir AHORA en la caja:
        // ventas en efectivo - retiros de $3,000.
        totalEsperado,
        totalContado,
        diferencia: diferenciaFinal,

        // Información adicional del periodo para historial/auditoría.
        cantidadVentas: resumen.numeroVentas,
        totalVentas,
        totalEfectivo: Number(
          resumen.efectivo.toFixed(2)
        ),
        totalTarjeta: Number(
          resumen.tarjeta.toFixed(2)
        ),
        totalOtros: Number(
          resumen.otros.toFixed(2)
        ),

        ventasIds: ventas.map(
          (venta) => venta.documentoId
        ),

        origen: "web",
      });

      onCorteRealizado?.({
        id: corteRef.id,
        totalVentas,
        totalEsperado,
        totalContado,
        diferencia: diferenciaFinal,
      });
    } catch (err) {
      console.error("Error realizando corte:", err);
      setError(
        err?.message ||
          "No se pudo realizar el corte de caja."
      );
    } finally {
      setProcesando(false);
    }
  };

  useEffect(() => {
    const manejarTecla = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (!procesando && efectivoContado.trim() !== "") {
          realizarCorte();
        }
        return;
      }

      if (
        event.key === "F1" ||
        event.key === "Escape" ||
        event.key === "Backspace"
      ) {
        event.preventDefault();

        if (!procesando) {
          onCerrar?.();
        }
      }
    };

    window.addEventListener("keydown", manejarTecla);

    return () => {
      window.removeEventListener("keydown", manejarTecla);
    };
  }, [onCerrar, procesando, efectivoContado, efectivoEsperado]);

  if (cargando) {
    return (
      <div
        className="corte-fondo"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
        }}
      >
        <section className="corte-modal">
          <h2>Corte de caja</h2>
          <p>Preparando corte...</p>
        </section>
      </div>
    );
  }

  return (
    <div
      className="corte-fondo"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
      }}
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget &&
          !procesando
        ) {
          onCerrar?.();
        }
      }}
    >
      <section
        className="corte-modal"
        onMouseDown={(event) =>
          event.stopPropagation()
        }
      >
        <div className="corte-encabezado">
          <div>
            <h2>Corte de caja</h2>
            <p>
              {usuario?.nombre || "Usuario"} · Usuario{" "}
              {usuario?.numeroUsuario || ""}
            </p>
          </div>

          <button
            type="button"
            className="corte-cerrar"
            onClick={onCerrar}
            disabled={procesando}
            aria-label="Cerrar corte"
          >
            ×
          </button>
        </div>

        <div className="corte-total-caja">
          <span>Total actual en caja</span>
          <strong>{dinero(efectivoEsperado)}</strong>
        </div>

        <div className="corte-conteo">
          <label htmlFor="efectivoContado">
            ¿Cuánto dinero tiene físicamente el cajero?
          </label>

          <input
            id="efectivoContado"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={efectivoContado}
            onChange={(event) => {
              setEfectivoContado(event.target.value);
              setError("");
            }}
            autoFocus
          />
        </div>

        <div
          className={
            diferencia < 0
              ? "corte-resultado corte-resultado-faltante"
              : diferencia > 0
                ? "corte-resultado corte-resultado-sobrante"
                : "corte-resultado corte-resultado-exacto"
          }
        >
          <span>Resultado</span>
          <strong>{textoResultado()}</strong>
        </div>

        {error && (
          <div className="mensaje-error">
            {error}
          </div>
        )}

        <div className="corte-acciones">
          <button
            type="button"
            className="corte-cancelar"
            onClick={onCerrar}
            disabled={procesando}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="corte-confirmar"
            onClick={realizarCorte}
            disabled={
              procesando ||
              efectivoContado.trim() === ""
            }
          >
            {procesando
              ? "Realizando corte..."
              : "Realizar corte"}
          </button>
        </div>

        <div className="corte-ayuda-tecla">
          Backspace · Cancelar  |  Enter · Realizar corte
        </div>
      </section>
    </div>
  );
}

export default CorteCaja;