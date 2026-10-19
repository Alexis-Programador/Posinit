import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  crearPlanMixto,
  recuperarPlanMixto,
  prepararTarjetaMixta,
  observarTarjetaMixta,
  resumenMixto,
} from "./cobroMixtoService";

const dinero = (c) => (c / 100).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const centavos = (n) => Math.round(Number(n) * 100);
const nuevaFila = (tipo) => ({ id: crypto.randomUUID(), tipo, importe: "" });
const btn = { padding: "11px 14px", borderRadius: 10, border: "1px solid #b6c8df", cursor: "pointer", fontWeight: 700 };

export default function CobroMixtoEnProceso({ total, productos, ownerUid, banco, titular, clabe, procesando, onCerrar, onConfirmar }) {
  const [plan, setPlan] = useState(() => recuperarPlanMixto(ownerUid));
  const [filas, setFilas] = useState(() => [nuevaFila("efectivo"), nuevaFila("tarjeta")]);
  const [estados, setEstados] = useState({});
  const [preparando, setPreparando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const totalC = centavos(total);
  const distribuidoC = filas.reduce((s, f) => s + (Number.isFinite(Number(f.importe)) ? centavos(f.importe) : 0), 0);
  const resumen = useMemo(() => plan ? resumenMixto(plan, estados) : null, [plan, estados]);
  const tarjetas = plan?.pagos.map((p, indice) => ({ ...p, indice })).filter((p) => p.tipo === "tarjeta") || [];
  const siguiente = tarjetas.find((p) => !estados[p.id]?.verificado);

  useEffect(() => {
    if (!plan) return;
    const suscripciones = [];
    for (let i = 0; i < plan.pagos.length; i++) {
      const pago = plan.pagos[i];
      if (pago.tipo !== "tarjeta" || !pago.pagoId) continue;
      try {
        suscripciones.push(observarTarjetaMixta(plan, i, (estado) => {
          setEstados((prev) => ({ ...prev, [pago.id]: estado }));
        }, (e) => setError(`No se pudo verificar la tarjeta ${i + 1}: ${e.message}`)));
      } catch (e) { setError(e.message); }
    }
    return () => suscripciones.forEach((cancelar) => cancelar());
  }, [plan]);

  const editar = (id, cambios) => setFilas((prev) => prev.map((f) => f.id === id ? { ...f, ...cambios } : f));
  const iniciar = () => {
    try {
      if (plan) return;
      if (filas.some((f) => !Number.isFinite(Number(f.importe)) || centavos(f.importe) <= 0)) {
        throw new Error("Cada importe debe ser mayor que cero.");
      }
      const creado = crearPlanMixto({ ownerUid, total, productos, filas });
      setPlan(creado);
      setError("");
      setAviso("Distribución guardada en este navegador. No cambies el carrito mientras el cobro esté pendiente.");
    } catch (e) { setError(e.message); }
  };

  const prepararSiguiente = async () => {
    if (!plan || !siguiente || preparando) return;
    setPreparando(true); setError("");
    try {
      await prepararTarjetaMixta(plan, siguiente.indice, { banco, titular, clabe });
      const recuperado = recuperarPlanMixto(ownerUid);
      if (!recuperado || recuperado.id !== plan.id) throw new Error("No se pudo recuperar el plan guardado.");
      setPlan({ ...recuperado });
      setAviso("QR listo. Espera la confirmación de Stripe antes de continuar con otra tarjeta.");
    } catch (e) { setError(e.message); }
    finally { setPreparando(false); }
  };

  const pagoActivo = siguiente?.pagoId ? siguiente : null;
  const urlPago = pagoActivo ? `${window.location.origin}${window.location.pathname}?pago=${encodeURIComponent(pagoActivo.pagoId)}` : "";
  const totalCoincide = plan && plan.totalCentavos === totalC;
  const productosCoinciden = plan && JSON.stringify(plan.productos) === JSON.stringify(productos.map((p) => ({
    id: String(p.id ?? ""), nombre: String(p.nombre || "Producto").slice(0, 120), cantidad: Number(p.cantidad), precio: Number(p.precio),
  })));
  const listo = Boolean(resumen?.listoParaFinalizar && totalCoincide && productosCoinciden);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "#0f172acc", display: "grid", placeItems: "center", padding: 14 }}>
      <section role="dialog" aria-modal="true" aria-label="Cobro combinado" style={{ width: "min(680px,100%)", maxHeight: "94vh", overflowY: "auto", boxSizing: "border-box", background: "white", borderRadius: 18, padding: 22, color: "#10213d", fontFamily: "system-ui" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>💵 + 💳 Cobro combinado</h2>
          <button type="button" style={btn} onClick={onCerrar} disabled={procesando}>Cerrar</button>
        </header>
        <p><b>Total de venta: {dinero(totalC)}</b></p>
        {!plan ? (
          <>
            <p>Distribuye el total entre efectivo y tarjetas. Cada tarjeta debe ser de al menos $10 MXN.</p>
            {filas.map((f, i) => (
              <div key={f.id} style={{ display: "flex", gap: 8, marginBottom: 9 }}>
                <select aria-label={`Método ${i + 1}`} value={f.tipo} onChange={(e) => editar(f.id, { tipo: e.target.value })} style={{ ...btn, flex: 1 }}>
                  <option value="efectivo">💵 Efectivo</option><option value="tarjeta">💳 Tarjeta</option>
                </select>
                <input aria-label={`Importe ${i + 1}`} type="number" min="0" step="0.01" value={f.importe} onChange={(e) => editar(f.id, { importe: e.target.value })} placeholder="Importe" style={{ ...btn, width: 135 }} />
                <button type="button" style={btn} disabled={filas.length <= 2} onClick={() => setFilas((prev) => prev.filter((x) => x.id !== f.id))}>✕</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" style={btn} onClick={() => setFilas((prev) => [...prev, nuevaFila("efectivo")])}>＋ Efectivo</button>
              <button type="button" style={btn} onClick={() => setFilas((prev) => [...prev, nuevaFila("tarjeta")])}>＋ Tarjeta</button>
            </div>
            <p>Distribuido: <b>{dinero(distribuidoC)}</b> · Diferencia: <b>{dinero(totalC - distribuidoC)}</b></p>
            <button type="button" style={{ ...btn, background: "#1d4ed8", color: "white" }} onClick={iniciar} disabled={distribuidoC !== totalC}>Guardar distribución y comenzar</button>
          </>
        ) : (
          <>
            <p style={{ background: "#eff6ff", padding: 12, borderRadius: 10 }}>Cobro pendiente: <code>{plan.id}</code>. El plan se recupera en este navegador al reabrir el modal.</p>
            {plan.pagos.map((p, i) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #e2e8f0", gap: 12 }}>
                <span>{p.tipo === "efectivo" ? "💵 Efectivo" : `💳 Tarjeta ${i + 1}`} — {dinero(p.importeCentavos)}</span>
                <strong>{p.tipo === "efectivo" ? "Declarado" : estados[p.id]?.verificado ? "✅ Stripe verificado" : p.pagoId ? "⏳ Pendiente" : "Sin QR"}</strong>
              </div>
            ))}
            {siguiente && !siguiente.pagoId && <button type="button" style={{ ...btn, marginTop: 16, background: "#1d4ed8", color: "white" }} disabled={preparando} onClick={prepararSiguiente}>{preparando ? "Preparando..." : "Generar QR de la siguiente tarjeta"}</button>}
            {pagoActivo && (
              <div style={{ textAlign: "center", marginTop: 18 }}>
                <QRCodeSVG value={urlPago} size={180} />
                <p>Escanea para pagar <b>{dinero(pagoActivo.importeCentavos)}</b></p>
                <a href={urlPago} target="_blank" rel="noreferrer">Abrir página de pago</a>
                <p>⏳ El QR no significa que la tarjeta haya pagado. Espera la confirmación del webhook de Stripe.</p>
              </div>
            )}
            <p>Tarjetas verificadas: <b>{resumen.tarjetasConfirmadas} de {resumen.tarjetasTotales}</b></p>
            {!totalCoincide || !productosCoinciden ? <p style={{ color: "#b91c1c" }}>El carrito cambió respecto al cobro pendiente. Recupera el carrito original antes de continuar.</p> : null}
            <button type="button" style={{ ...btn, background: listo ? "#047857" : "#94a3b8", color: "white", width: "100%" }} disabled={!listo || procesando} onClick={() => onConfirmar?.({ metodoPago: "mixto", cobroMixtoId: plan.id, pagos: plan.pagos, total: plan.totalCentavos / 100 })}>
              {procesando ? "Procesando..." : "Confirmar venta con todos los pagos verificados"}
            </button>
            <p style={{ fontSize: 12, color: "#92400e" }}>⚠️ La venta solo puede confirmarse cuando Ventas.jsx implemente la transacción mixta. Este botón no debe sustituir esa validación.</p>
          </>
        )}
        {aviso && <p role="status" style={{ color: "#1d4ed8" }}>{aviso}</p>}
        {error && <p role="alert" style={{ color: "#b91c1c", fontWeight: 700 }}>{error}</p>}
      </section>
    </div>
  );
}