import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { QRCodeSVG } from "qrcode.react";

// POS Init: efectivo funcional; pagos digitales requieren verificación externa.
function ModalCobro({ total = 0, procesando = false, onCerrar, onConfirmar, ownerUid, productos = [] }) {
  const [metodoPago, setMetodoPago] = useState("efectivo");
  const [recibidoTexto, setRecibidoTexto] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const [banco, setBanco] = useState(() => localStorage.getItem("pospay_banco") || "Nu México");
  const [titular, setTitular] = useState(() => localStorage.getItem("pospay_titular") || "");
  const [clabe, setClabe] = useState(() => localStorage.getItem("pospay_clabe") || "");
  const [pagoId, setPagoId] = useState("");
  const [estadoPago, setEstadoPago] = useState("");
  const [creandoPago, setCreandoPago] = useState(false);
  const [depositoVerificado, setDepositoVerificado] = useState(false);
  const urlPago = pagoId ? `${window.location.origin}${window.location.pathname}?pago=${encodeURIComponent(pagoId)}` : "";
  useEffect(() => {
    if (!pagoId) return undefined;
    return onSnapshot(doc(db, "pagosPosInit", pagoId), snap => {
      setEstadoPago(snap.exists() ? snap.data().estado : "no_disponible");
    }, err => setError("No se pudo consultar el pago: " + err.message));
  }, [pagoId]);
  const generarPago = async () => {
    if (creandoPago || pagoId) return;
    if (!ownerUid || !titular.trim() || !banco.trim() || !/^\d{18}$/.test(clabe.trim())) {
      setError("Escribe banco, titular y una CLABE de 18 dígitos."); return;
    }
    setCreandoPago(true); setError("");
    try {
      const ref = doc(collection(db, "pagosPosInit"));
      await setDoc(ref, {
        ownerUid, total: Number(totalNumero.toFixed(2)), estado: "pendiente",
        banco: banco.trim(), titular: titular.trim(), clabe: clabe.trim(),
        productos: productos.map(x => ({ nombre: String(x.nombre || "Producto"),
          cantidad: Number(x.cantidad || 0), precio: Number(x.precio || 0) })),
        creadoEn: serverTimestamp(),
      });
      localStorage.setItem("pospay_banco", banco.trim());
      localStorage.setItem("pospay_titular", titular.trim());
      localStorage.setItem("pospay_clabe", clabe.trim());
      setPagoId(ref.id); setEstadoPago("pendiente");
    } catch (e) { setError("No se pudo generar el QR. Revisa las reglas de Firestore: " + e.message); }
    finally { setCreandoPago(false); }
  };
  const totalNumero = Number(total || 0);
  const recibido = Number(recibidoTexto || 0);
  const cambio = useMemo(() => Math.max(0, recibido - totalNumero), [recibido, totalNumero]);

  const confirmar = () => {
    if (procesando) return;
    if (metodoPago === "digital") {
      if (!pagoId || estadoPago !== "pendiente" || !depositoVerificado) {
        setError("Verifica el ingreso real en tu banco y marca la casilla antes de confirmar."); return;
      }
      setError("");
      onConfirmar?.({ metodoPago: "transferencia", recibido: totalNumero, cambio: 0, pagoDigitalId: pagoId });
      return;
    }
    if (!recibidoTexto || !Number.isFinite(recibido) || recibido < totalNumero) {
      setError("El dinero recibido no alcanza para cubrir la venta.");
      return;
    }
    setError("");
    onConfirmar?.({ metodoPago: "efectivo", recibido, cambio });
  };

  useEffect(() => {
    const manejarTecla = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!procesando) onCerrar?.();
        return;
      }
      if (event.key === "Backspace") {
        // El navegador borra normalmente dentro del campo; nunca cierra el modal.
        if (document.activeElement !== inputRef.current) {
          event.preventDefault();
          if (metodoPago === "efectivo") setRecibidoTexto((anterior) => anterior.slice(0, -1));
        }
        return;
      }
      if (event.key === "Enter" && metodoPago === "efectivo") {
        event.preventDefault();
        confirmar();
      }
    };
    window.addEventListener("keydown", manejarTecla);
    return () => window.removeEventListener("keydown", manejarTecla);
  });

  const estiloBoton = (seleccionado) => ({
    minHeight: 88, border: seleccionado ? "2px solid #2563eb" : "2px solid #cbd5e1",
    borderRadius: 12, background: seleccionado ? "#eff6ff" : "#f8fafc",
    fontWeight: 800, fontSize: 15, cursor: "pointer", color: "#0f172a",
  });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,.55)", display: "grid", placeItems: "center", padding: 18 }}>
      <section role="dialog" aria-modal="true" aria-label="Cobrar venta" style={{ width: "min(600px,100%)", maxHeight: "95vh", overflowY: "auto", background: "#fff", borderRadius: 20, padding: 26, boxShadow: "0 24px 70px rgba(0,0,0,.3)", color: "#0f172a", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <div><h2 style={{ margin: 0, fontSize: 26 }}>Cobrar venta</h2><p style={{ margin: "5px 0 0", color: "#64748b" }}>Selecciona el método de pago.</p></div>
          <button type="button" onClick={onCerrar} disabled={procesando} aria-label="Cerrar" style={{ width: 38, height: 38, border: 0, borderRadius: 10, fontWeight: 900, fontSize: 18, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ marginTop: 22, padding: 18, borderRadius: 14, background: "#f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong>Total</strong><strong style={{ fontSize: 30 }}>${totalNumero.toFixed(2)}</strong>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 24 }}>
          <button type="button" onClick={() => { setMetodoPago("efectivo"); setError(""); }} style={estiloBoton(metodoPago === "efectivo")}>💵<br />Efectivo</button>
          <button type="button" onClick={() => { setMetodoPago("digital"); setError(""); }} style={estiloBoton(metodoPago === "digital")}>📱<br />QR / Transferencia</button>
        </div>
        {metodoPago === "efectivo" ? <>
          <label htmlFor="dineroRecibido" style={{ display: "block", marginTop: 22, marginBottom: 8, fontWeight: 800 }}>Dinero recibido</label>
          <input ref={inputRef} id="dineroRecibido" type="number" min="0" step="1" value={recibidoTexto} onChange={(e) => { setRecibidoTexto(e.target.value); setError(""); }} autoFocus style={{ width: "100%", boxSizing: "border-box", padding: 14, border: "2px solid #2563eb", borderRadius: 11, fontSize: 20 }} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22, paddingBottom: 14, borderBottom: "1px solid #cbd5e1", fontSize: 18 }}><strong>Cambio</strong><strong style={{ color: "#15803d", fontSize: 22 }}>${cambio.toFixed(2)}</strong></div>
          <p style={{ color: "#64748b", fontSize: 13 }}>↑ y ↓ aumentan o disminuyen $1. Backspace borra; Escape cancela.</p>
        </> : <div style={{ marginTop: 18, padding: 16, background: "#eff6ff", borderRadius: 12, lineHeight: 1.5 }}>
          <strong>📱 POS Init Pay — Transferencia SPEI</strong>
          {!pagoId ? <>
            <p style={{ fontSize: 13 }}>Configura la cuenta receptora del negocio. Estos datos aparecerán al cliente.</p>
            <label style={{ display: "block", marginBottom: 8 }}>Banco<input value={banco} onChange={e => setBanco(e.target.value)} style={{ width: "100%", padding: 10, boxSizing: "border-box" }} /></label>
            <label style={{ display: "block", marginBottom: 8 }}>Titular<input value={titular} onChange={e => setTitular(e.target.value)} style={{ width: "100%", padding: 10, boxSizing: "border-box" }} /></label>
            <label style={{ display: "block", marginBottom: 8 }}>CLABE (18 dígitos)<input value={clabe} onChange={e => setClabe(e.target.value.replace(/\D/g, "").slice(0, 18))} inputMode="numeric" style={{ width: "100%", padding: 10, boxSizing: "border-box" }} /></label>
            <button type="button" onClick={generarPago} disabled={creandoPago} style={{ padding: 14, width: "100%", background: "#2563eb", color: "white", border: 0, borderRadius: 9, fontWeight: 800 }}>{creandoPago ? "Generando..." : "Generar QR de pago"}</button>
          </> : <div style={{ textAlign: "center", paddingTop: 12 }}>
            <QRCodeSVG value={urlPago} size={196} level="M" />
            <p><strong>Escanea para pagar ${totalNumero.toFixed(2)}</strong></p>
            <p style={{ fontSize: 12, overflowWrap: "anywhere" }}>{urlPago}</p>
            <p>Estado: <strong>{estadoPago === "pendiente" ? "⏳ Esperando verificación" : estadoPago}</strong></p>
            <label style={{ display: "block", textAlign: "left", background: "white", padding: 12, borderRadius: 8 }}>
              <input type="checkbox" checked={depositoVerificado} onChange={e => setDepositoVerificado(e.target.checked)} /> He comprobado en mi banca que el dinero llegó a la cuenta y coincide el importe.
            </label>
            <p style={{ fontSize: 12 }}>No confirmes solo por una captura de pantalla del cliente.</p>
          </div>}
        </div>}
        {error && <div role="alert" style={{ marginTop: 14, padding: 11, borderRadius: 9, background: "#fef2f2", color: "#b91c1c", fontWeight: 700 }}>{error}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.25fr", gap: 12, marginTop: 20 }}>
          <button type="button" onClick={onCerrar} disabled={procesando} style={{ minHeight: 52, border: 0, borderRadius: 11, fontWeight: 800, cursor: "pointer" }}>Escape · Cancelar</button>
          <button type="button" onClick={confirmar} disabled={procesando || creandoPago || (metodoPago === "digital" && (!pagoId || !depositoVerificado || estadoPago !== "pendiente"))} style={{ minHeight: 52, border: 0, borderRadius: 11, background: "#0f172a", color: "#fff", fontWeight: 800, cursor: "pointer" }}>{procesando ? "Procesando..." : metodoPago === "efectivo" ? "Enter · Confirmar venta" : "Confirmar depósito verificado"}</button>
        </div>
      </section>
    </div>
  );
}

export default ModalCobro;
