import { useEffect, useMemo, useState } from "react";

function ModalCobro({ total = 0, procesando = false, onCerrar, onConfirmar }) {
  const [metodoPago, setMetodoPago] = useState("efectivo");
  const [recibidoTexto, setRecibidoTexto] = useState("");
  const [error, setError] = useState("");

  const totalNumero = Number(total || 0);
  const recibido = Number(recibidoTexto || 0);
  const cambio = useMemo(
    () => Math.max(0, recibido - totalNumero),
    [recibido, totalNumero]
  );

  const confirmar = () => {
    if (procesando) return;

    if (metodoPago === "efectivo" && recibido < totalNumero) {
      setError("El dinero recibido no alcanza para cubrir la venta.");
      return;
    }

    setError("");
    onConfirmar?.({
      metodoPago,
      recibido: metodoPago === "efectivo" ? recibido : totalNumero,
      cambio: metodoPago === "efectivo" ? cambio : 0,
    });
  };

  useEffect(() => {
    const manejarTecla = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        confirmar();
        return;
      }

      if (event.key === "Backspace" || event.key === "Escape") {
        event.preventDefault();
        if (!procesando) onCerrar?.();
      }
    };

    window.addEventListener("keydown", manejarTecla);
    return () => window.removeEventListener("keydown", manejarTecla);
  });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,.55)", display: "grid", placeItems: "center", padding: 18 }}>
      <section style={{ width: "min(530px,100%)", background: "#fff", borderRadius: 20, padding: 26, boxShadow: "0 24px 70px rgba(0,0,0,.3)", color: "#0f172a" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <div><h2 style={{ margin: 0, fontSize: 26 }}>Cobrar venta</h2><p style={{ margin: "5px 0 0", color: "#64748b" }}>Selecciona el método de pago.</p></div>
          <button type="button" onClick={onCerrar} disabled={procesando} style={{ width: 38, height: 38, border: 0, borderRadius: 10, fontWeight: 900, fontSize: 18 }}>×</button>
        </div>

        <div style={{ marginTop: 22, padding: 18, borderRadius: 14, background: "#f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong>Total</strong><strong style={{ fontSize: 30 }}>${totalNumero.toFixed(2)}</strong>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 24 }}>
          <button type="button" onClick={() => { setMetodoPago("efectivo"); setError(""); }} style={{ minHeight: 88, border: metodoPago === "efectivo" ? "2px solid #2563eb" : "2px solid #cbd5e1", borderRadius: 12, background: "#f8fafc", fontWeight: 800, fontSize: 15 }}>💵<br/>Efectivo</button>
          <button type="button" onClick={() => { setMetodoPago("tarjeta"); setError(""); }} style={{ minHeight: 88, border: metodoPago === "tarjeta" ? "2px solid #2563eb" : "2px solid #cbd5e1", borderRadius: 12, background: "#f8fafc", fontWeight: 800, fontSize: 15 }}>💳<br/>Tarjeta</button>
        </div>

        {metodoPago === "efectivo" && <>
          <label htmlFor="dineroRecibido" style={{ display: "block", marginTop: 22, marginBottom: 8, fontWeight: 800 }}>Dinero recibido</label>
          <input id="dineroRecibido" type="number" min="0" step="0.01" value={recibidoTexto} onChange={(e) => { setRecibidoTexto(e.target.value); setError(""); }} autoFocus style={{ width: "100%", boxSizing: "border-box", padding: "14px", border: "2px solid #2563eb", borderRadius: 11, fontSize: 20 }} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22, paddingBottom: 14, borderBottom: "1px solid #cbd5e1", fontSize: 18 }}><strong>Cambio</strong><strong style={{ color: "#15803d", fontSize: 22 }}>${cambio.toFixed(2)}</strong></div>
        </>}

        {error && <div style={{ marginTop: 14, padding: 11, borderRadius: 9, background: "#fef2f2", color: "#b91c1c", fontWeight: 700 }}>{error}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.25fr", gap: 12, marginTop: 20 }}>
          <button type="button" onClick={onCerrar} disabled={procesando} style={{ minHeight: 52, border: 0, borderRadius: 11, fontWeight: 800 }}>Backspace · Cancelar</button>
          <button type="button" onClick={confirmar} disabled={procesando} style={{ minHeight: 52, border: 0, borderRadius: 11, background: "#0f172a", color: "#fff", fontWeight: 800 }}>{procesando ? "Procesando..." : "Enter · Confirmar venta"}</button>
        </div>
      </section>
    </div>
  );
}

export default ModalCobro;
