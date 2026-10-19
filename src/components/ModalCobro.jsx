import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { QRCodeSVG } from "qrcode.react";
import CobroMixtoEnProceso from "./CobroMixtoEnProceso";

// POS Init: efectivo funcional; pagos digitales requieren verificación externa.
function ModalCobro({ total = 0, procesando = false, onCerrar, onConfirmar, ownerUid, productos = [] }) {
  const [metodoPago, setMetodoPago] = useState("efectivo");
  const [mostrarDemoMixto, setMostrarDemoMixto] = useState(false);
  const [advertenciaMixto, setAdvertenciaMixto] = useState("");
  const [recibidoTexto, setRecibidoTexto] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const [banco, setBanco] = useState("");
  const [titular, setTitular] = useState("");
  const [clabe, setClabe] = useState("");
  useEffect(() => {
    let activo = true;
    if (!ownerUid) return undefined;
    getDoc(doc(db, "usuarios", ownerUid, "configuracion", "posInitPay"))
      .then(snap => {
        if (!activo || !snap.exists()) return;
        const d = snap.data();
        setBanco(d.banco || ""); setTitular(d.titular || ""); setClabe(d.clabe || "");
      })
      .catch(() => { if (activo) setError("No se pudo cargar la configuración bancaria del negocio."); });
    return () => { activo = false; };
  }, [ownerUid]);
  const [pagoId, setPagoId] = useState("");
  const [estadoPago, setEstadoPago] = useState("");
  const [stripePagado, setStripePagado] = useState(false);
  const confirmadoAutomaticoRef = useRef("");
  const [creandoPago, setCreandoPago] = useState(false);
  const [depositoVerificado, setDepositoVerificado] = useState(false);
  const urlPago = pagoId ? `${window.location.origin}${window.location.pathname}?pago=${encodeURIComponent(pagoId)}` : "";
  useEffect(() => {
    if (!pagoId) return undefined;
    return onSnapshot(doc(db, "pagosPosInit", pagoId), snap => {
      const datos = snap.exists() ? snap.data() : null;
      setEstadoPago(datos?.estado || "no_disponible");
      setStripePagado(Boolean(datos?.stripeConfirmacion?.estado === "paid" && datos?.stripeConfirmacion?.proveedor === "stripe" && datos?.stripeConfirmacion?.entorno === "test" && datos?.stripeConfirmacion?.moneda === "mxn" && Number(datos?.stripeConfirmacion?.importeCentavos) === Math.round(Number(total) * 100)));
    }, err => setError("No se pudo consultar el pago: " + err.message));
  }, [pagoId]);
  useEffect(() => {
    if (!pagoId || !stripePagado || procesando || confirmadoAutomaticoRef.current === pagoId) return;
    confirmadoAutomaticoRef.current = pagoId;
    onConfirmar?.({ metodoPago: "tarjeta", recibido: Number(total), cambio: 0, pagoDigitalId: pagoId });
  }, [pagoId, stripePagado, procesando, total, onConfirmar]);

  const generarPago = async () => {
    if (creandoPago || pagoId) return;
    if (!ownerUid || !titular.trim() || !banco.trim() || !/^\d{18}$/.test(clabe.trim())) {
      setError("El propietario debe configurar una cuenta SPEI válida en POS Init Pay."); return;
    }
    setCreandoPago(true); setError("");
    try {
      // Spark: el importe proviene del carrito local. Esto NO es verificación bancaria.
      if (!Number.isFinite(totalNumero) || totalNumero <= 0 || !Array.isArray(productos) || !productos.length) {
        throw new Error("No hay productos válidos para generar el cobro.");
      }
      const detalle = productos.map((item) => ({
        id: String(item.id),
        cantidad: Number(item.cantidad),
        nombre: String(item.nombre || "Producto").slice(0, 120),
        precio: Number(item.precio),
      }));
      if (detalle.some((item) => !item.id || !Number.isInteger(item.cantidad) || item.cantidad <= 0 ||
        !Number.isFinite(item.precio) || item.precio < 0)) {
        throw new Error("El carrito contiene productos inválidos.");
      }
      const totalCalculado = Math.round(detalle.reduce((suma, item) =>
        suma + item.precio * item.cantidad, 0) * 100) / 100;
      if (Math.abs(totalCalculado - totalNumero) > 0.001) {
        throw new Error("El total del carrito no coincide. Actualiza los productos.");
      }
      const pagoRef = doc(collection(db, "pagosPosInit"));
      await setDoc(pagoRef, {
        ownerUid,
        total: totalCalculado,
        estado: "pendiente",
        banco: banco.trim(),
        titular: titular.trim(),
        clabe: clabe.trim(),
        productos: detalle,
        creadoEn: serverTimestamp(),
      });
      setPagoId(pagoRef.id); setEstadoPago("pendiente");
    } catch (e) { setError("No se pudo generar el QR. Revisa tu conexión, las reglas de Firestore y la configuración SPEI: " + e.message); }
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
    minHeight: 58, border: seleccionado ? "2px solid #2563eb" : "2px solid #cbd5e1",
    borderRadius: 12, background: seleccionado ? "#eff6ff" : "#f8fafc",
    fontWeight: 800, fontSize: 15, cursor: "pointer", color: "#0f172a",
  });

  if (mostrarDemoMixto) {
    return (
      <CobroMixtoEnProceso
        total={totalNumero}
        productos={productos}
        ownerUid={ownerUid}
        banco={banco}
        titular={titular}
        clabe={clabe}
        procesando={procesando}
        onConfirmar={onConfirmar}
        onCerrar={() => setMostrarDemoMixto(false)}
      />
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,.55)", display: "grid", placeItems: "center", padding: 18 }}>
      <section role="dialog" aria-modal="true" aria-label="Cobrar venta" style={{ width: "min(600px,100%)", maxHeight: "min(94dvh, 760px)", overflowY: "auto", background: "#fff", borderRadius: 20, padding: 16, boxShadow: "0 24px 70px rgba(0,0,0,.3)", color: "#0f172a", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <div><h2 style={{ margin: 0, fontSize: 22 }}>Cobrar venta</h2><p style={{ margin: "5px 0 0", color: "#64748b" }}>Selecciona el método de pago.</p></div>
          <button type="button" onClick={onCerrar} disabled={procesando || stripePagado} aria-label="Cerrar" style={{ width: 38, height: 38, border: 0, borderRadius: 10, fontWeight: 900, fontSize: 18, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ marginTop: 12, padding: 12, borderRadius: 14, background: "#f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong>Total</strong><strong style={{ fontSize: 26 }}>${totalNumero.toFixed(2)}</strong>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
          <button type="button" onClick={() => { setMetodoPago("efectivo"); setError(""); }} style={estiloBoton(metodoPago === "efectivo")}>💵<br />Efectivo</button>
          <button type="button" onClick={() => { setMetodoPago("digital"); setError(""); }} style={estiloBoton(metodoPago === "digital")}>📱<br />POS Init Pay</button>
        </div>
        <button type="button" onClick={() => { setMostrarDemoMixto(true); setAdvertenciaMixto(""); setError(""); }}
          disabled={procesando || stripePagado || Boolean(pagoId)}
          style={{ marginTop: 10, width: "100%", padding: 12, borderRadius: 12, border: "1px solid #93c5fd", background: "#eff6ff", color: "#1d4ed8", fontWeight: 800, cursor: "pointer" }}>
          💵 + 💳 Cobro combinado (integración en pruebas)
        </button>
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b" }}>
          Prepara pagos individuales y observa Stripe. El registro final requiere actualizar Ventas.jsx.
        </p>
        {metodoPago === "efectivo" ? <>
          <label htmlFor="dineroRecibido" style={{ display: "block", marginTop: 22, marginBottom: 8, fontWeight: 800 }}>Dinero recibido</label>
          <input ref={inputRef} id="dineroRecibido" type="number" min="0" step="1" value={recibidoTexto} onChange={(e) => { setRecibidoTexto(e.target.value); setError(""); }} autoFocus style={{ width: "100%", boxSizing: "border-box", padding: 14, border: "2px solid #2563eb", borderRadius: 11, fontSize: 20 }} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22, paddingBottom: 14, borderBottom: "1px solid #cbd5e1", fontSize: 18 }}><strong>Cambio</strong><strong style={{ color: "#15803d", fontSize: 22 }}>${cambio.toFixed(2)}</strong></div>
          <p style={{ color: "#64748b", fontSize: 13 }}>↑ y ↓ aumentan o disminuyen $1. Backspace borra; Escape cancela.</p>
        </> : <div style={{ marginTop: 12, padding: 12, background: "#eff6ff", borderRadius: 12, lineHeight: 1.5 }}>
          <strong>📱 POS Init Pay — Transferencia SPEI</strong>
          {!pagoId ? <>
            <p style={{ fontSize: 12, margin: "7px 0" }}>
              {banco && titular && /^\d{18}$/.test(clabe) ?
                `Cuenta SPEI configurada: ${banco} · ${titular}` :
                "La cuenta SPEI aún no está configurada. El propietario debe configurarla desde POS Init Pay."}
            </p>
            <button type="button" onClick={generarPago} disabled={creandoPago || !banco || !titular || !/^\d{18}$/.test(clabe)}
              style={{ padding: 10, width: "100%", background: "#2563eb", color: "white", border: 0, borderRadius: 9, fontWeight: 800, cursor: "pointer" }}>
              {creandoPago ? "Generando..." : "Generar QR de pago"}
            </button>          </> : <div style={{ textAlign: "center", paddingTop: 6 }}>
            <QRCodeSVG value={urlPago} size={142} level="M" />
            <p style={{ margin: "6px 0", fontSize: 13 }}><strong>Escanea para pagar ${totalNumero.toFixed(2)}</strong></p>
            <a href={urlPago} target="_blank" rel="noreferrer" style={{ display: "block", fontSize: 12, margin: "5px 0" }}>Abrir enlace de pago</a>
            <p style={{ margin: "5px 0", fontSize: 13 }}>Estado: <strong>{stripePagado ? "✅ Tarjeta verificada por Stripe; registrando venta..." : estadoPago === "pendiente" ? "⏳ Esperando verificación" : estadoPago}</strong></p>
            <label style={{ display: "block", textAlign: "left", background: "white", padding: 12, borderRadius: 8 }}>
              <input type="checkbox" checked={depositoVerificado} onChange={e => setDepositoVerificado(e.target.checked)} /> He comprobado en mi banca que el dinero llegó a la cuenta y coincide el importe.
            </label>
            <p style={{ fontSize: 12 }}>No confirmes solo por una captura de pantalla del cliente.</p>
          </div>}
        </div>}
        {advertenciaMixto && <div role="status" style={{ marginTop: 12, padding: 10, borderRadius: 9, background: "#fffbeb", color: "#92400e" }}>{advertenciaMixto}</div>}
        {error && <div role="alert" style={{ marginTop: 14, padding: 11, borderRadius: 9, background: "#fef2f2", color: "#b91c1c", fontWeight: 700 }}>{error}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.25fr", gap: 12, marginTop: 12 }}>
          <button type="button" onClick={onCerrar} disabled={procesando || stripePagado} style={{ minHeight: 44, border: 0, borderRadius: 11, fontWeight: 800, cursor: "pointer" }}>Escape · Cancelar</button>
          <button type="button" onClick={confirmar} disabled={procesando || creandoPago || stripePagado || (metodoPago === "digital" && (!pagoId || !depositoVerificado || estadoPago !== "pendiente"))} style={{ minHeight: 44, border: 0, borderRadius: 11, background: "#0f172a", color: "#fff", fontWeight: 800, cursor: "pointer" }}>{procesando ? "Procesando..." : metodoPago === "efectivo" ? "Enter · Confirmar venta" : "Confirmar depósito verificado"}</button>
        </div>
      </section>
    </div>
  );
}

export default ModalCobro;