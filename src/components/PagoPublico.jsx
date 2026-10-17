import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

const moneda = (n) => Number(n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const btn = { width: "100%", border: 0, borderRadius: 14, padding: "15px 16px", fontSize: 15, fontWeight: 750, cursor: "pointer" };
const card = { background: "#f5f8ff", border: "1px solid #e0e9fa", borderRadius: 16, padding: 16 };
const texto = { color: "#64748b", fontSize: 13, lineHeight: 1.6 };

// Stripe Checkout en modo de pruebas. No habilitar para cobros reales.
const API_DEMO = "https://pos-init-pay-api.alexis52gamer.workers.dev";

function urlCheckoutSegura(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "checkout.stripe.com" ? u.href : null;
  } catch { return null; }
}

export default function PagoPublico({ id }) {
  const [pago, setPago] = useState(null);
  const [error, setError] = useState("");
  const [copiado, setCopiado] = useState("");
  const [reportado, setReportado] = useState(false);
  const [metodo, setMetodo] = useState("tarjeta");
  const [stripeOcupado, setStripeOcupado] = useState(false);
  const [stripeMensaje, setStripeMensaje] = useState("");
  const [stripePagado, setStripePagado] = useState(false);

  useEffect(() => {
    setPago(null); setError(""); setReportado(false); setCopiado("");
    setStripeMensaje(""); setStripePagado(false);
    if (!/^[a-zA-Z0-9]{15,35}$/.test(id || "")) {
      setError("Enlace de pago inválido.");
      return;
    }
    return onSnapshot(doc(db, "pagosPosInit", id), (snap) => {
      if (!snap.exists()) { setPago(null); setError("Esta solicitud de pago no existe."); return; }
      setPago(snap.data()); setError("");
    }, () => setError("No fue posible consultar la solicitud. Inténtalo nuevamente."));
  }, [id]);

  const copiar = async (valor, campo) => {
    try {
      await navigator.clipboard.writeText(String(valor));
      setCopiado(campo);
      window.setTimeout(() => setCopiado(""), 2500);
    } catch { setError("No se pudo copiar. Mantén presionado el dato para seleccionarlo."); }
  };

  // Stripe genera la sesión en Cloudflare; el navegador nunca conoce la clave privada.
  const iniciarStripe = async () => {
    if (stripeOcupado || pago?.estado !== "pendiente") return;
    setStripeOcupado(true);
    setStripeMensaje("");
    try {
      const respuesta = await fetch(`${API_DEMO}/api/stripe/create-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pagoId: id }),
      });
      const datos = await respuesta.json();
      const checkoutUrl = urlCheckoutSegura(datos.checkoutUrl);
      if (!respuesta.ok || !datos.ok || !checkoutUrl || datos.entorno !== "test") {
        throw new Error(datos.mensaje || "No fue posible iniciar Stripe Checkout.");
      }
      // Redirigir en la misma pestaña evita bloqueos de ventanas emergentes.
      window.location.assign(checkoutUrl);
    } catch (e) {
      setStripeMensaje(e.message || "No se pudo conectar con Stripe.");
      setStripeOcupado(false);
    }
  };

  // El retorno desde Stripe no es prueba de pago: verificamos con Cloudflare.
  useEffect(() => {
    if (!/^[a-zA-Z0-9]{15,35}$/.test(id || "")) return;
    const sessionId = new URLSearchParams(window.location.search).get("stripe_session_id");
    if (!sessionId) return;
    if (!/^cs_test_[a-zA-Z0-9_]+$/.test(sessionId) || sessionId.length > 255) {
      setStripeMensaje("Identificador de sesión de Stripe inválido.");
      return;
    }
    let cancelado = false;
    const verificar = async () => {
      setStripeOcupado(true);
      setStripeMensaje("Verificando el resultado directamente con Stripe…");
      try {
        const respuesta = await fetch(`${API_DEMO}/api/stripe/verify-checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pagoId: id, sessionId }),
        });
        const datos = await respuesta.json();
        if (!respuesta.ok || !datos.ok) {
          throw new Error(datos.mensaje || "No se pudo verificar el pago.");
        }
        if (cancelado) return;
        if (datos.pagado === true && datos.estado === "paid" && datos.entorno === "test") {
          setStripePagado(true);
          setStripeMensaje("✅ Stripe confirmó el pago de PRUEBA. Aún NO se ha registrado la venta en POS Init ni se ha actualizado el inventario.");
        } else {
          setStripeMensaje("Stripe todavía no confirma el pago. Si acabas de pagar, consulta el estado antes de intentar otra vez.");
        }
      } catch (e) {
        if (!cancelado) setStripeMensaje(e.message || "No se pudo verificar Stripe.");
      } finally {
        if (!cancelado) setStripeOcupado(false);
      }
    };
    verificar();
    return () => { cancelado = true; };
  }, [id]);

  // Descargar ticket como PNG sin abrir la ventana de impresión del celular.
  const descargarTicket = () => {
    if (!pago?.ticket) return;
    const ticket = pago.ticket;
    const productos = Array.isArray(ticket.productos) ? ticket.productos : [];
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ancho = 760;
    const margen = 42;
    const maxTexto = ancho - margen * 2;
    ctx.font = "24px Arial";
    const partir = (texto) => {
      const palabras = String(texto).split(/\s+/);
      const lineas = [];
      let linea = "";
      for (const palabra of palabras) {
        const siguiente = linea ? `${linea} ${palabra}` : palabra;
        if (ctx.measureText(siguiente).width > maxTexto && linea) {
          lineas.push(linea); linea = palabra;
        } else linea = siguiente;
      }
      if (linea) lineas.push(linea);
      return lineas;
    };
    const filas = productos.flatMap(item => [
      ...partir(`${Number(item.cantidad || 0)} x ${item.nombre || "Producto"}`),
      `Subtotal: ${moneda(item.subtotal)}`,
    ]);
    canvas.width = ancho;
    canvas.height = Math.max(460, 325 + filas.length * 36);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#10213c";
    ctx.textAlign = "center";
    ctx.font = "bold 38px Arial";
    ctx.fillText("POS Init", ancho / 2, 65);
    ctx.font = "22px Arial";
    ctx.fillText("Ticket digital", ancho / 2, 105);
    ctx.textAlign = "left";
    ctx.font = "20px Arial";
    ctx.fillText(`Folio: ${String(ticket.folio || "").slice(0, 48)}`, margen, 155);
    ctx.strokeStyle = "#cbd5e1";
    ctx.beginPath(); ctx.moveTo(margen, 180); ctx.lineTo(ancho - margen, 180); ctx.stroke();
    let y = 220;
    ctx.font = "24px Arial";
    for (const fila of filas) { ctx.fillText(fila, margen, y); y += 36; }
    y += 18;
    ctx.beginPath(); ctx.moveTo(margen, y); ctx.lineTo(ancho - margen, y); ctx.stroke();
    y += 48;
    ctx.font = "bold 30px Arial";
    ctx.fillText(`TOTAL: ${moneda(ticket.total)}`, margen, y);
    ctx.font = "21px Arial";
    ctx.fillText(`Método: ${ticket.metodoPago || "Pago confirmado"}`, margen, y + 42);
    const enlace = document.createElement("a");
    enlace.download = `POS-Init-Ticket-${String(ticket.folio || "digital").replace(/[^a-zA-Z0-9_-]/g, "")}.png`;
    enlace.href = canvas.toDataURL("image/png");
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
  };

  const confirmado = pago?.estado === "confirmado" && !!pago.ticket;
  const pendiente = pago?.estado === "pendiente";
  const totalValido = Number.isFinite(Number(pago?.total)) && Number(pago?.total) > 0;
  const tieneSPEI = Boolean(pago?.banco && pago?.titular && pago?.clabe);
  const stripeHabilitado = pendiente && totalValido;

  return (
    <main style={{ minHeight: "100vh", padding: "30px 12px", boxSizing: "border-box", background: "linear-gradient(160deg,#091b3b 0%,#143a75 55%,#e9f1ff 55%)", fontFamily: "system-ui,-apple-system,Segoe UI,sans-serif", color: "#10213c" }}>
      <section style={{ maxWidth: 460, margin: "0 auto", padding: "26px 20px", borderRadius: 24, background: "#fff", boxShadow: "0 22px 55px #03152b40" }}>
        <header style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ display: "inline-grid", placeItems: "center", width: 54, height: 54, borderRadius: 17, background: "#103775", color: "white", fontSize: 27 }}>💳</div>
          <h1 style={{ margin: "12px 0 3px", color: "#102c5c", fontSize: 27 }}>POS Init <span style={{ color: "#2674ed" }}>Pay</span></h1>
          <p style={{ ...texto, margin: 0 }}>Paga de forma fácil y segura</p>
        </header>

        {error && <p role="alert" style={{ background: "#fef2f2", color: "#991b1b", padding: 12, borderRadius: 12 }}>{error}</p>}
        {!pago ? (!error && <p role="status" style={{ textAlign: "center" }}>Consultando solicitud de pago…</p>) : <>
          <div style={{ ...card, textAlign: "center", background: "#eaf2ff" }}>
            <div style={{ ...texto, fontSize: 14 }}>Total a pagar</div>
            <div style={{ fontWeight: 850, fontSize: "clamp(32px,9vw,42px)", color: "#0d326b" }}>{moneda(pago.total)}</div>
            <small style={{ color: "#55739b" }}>Pesos mexicanos · MXN</small>
          </div>

          {confirmado ? <div style={{ marginTop: 18 }}>
            <p role="status" style={{ padding: 14, borderRadius: 12, background: "#dcfce7", color: "#166534", fontWeight: 750 }}>✅ Pago confirmado. ¡Gracias por tu compra!</p>
            <h2 style={{ fontSize: 20 }}>🧾 Tu ticket digital</h2>
            <p style={texto}>Folio: {pago.ticket.folio}</p>
            {(pago.ticket.productos || []).map((item, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: "1px solid #e2e8f0" }}><span>{item.cantidad} × {item.nombre}</span><strong>{moneda(item.subtotal)}</strong></div>)}
            <h3 style={{ textAlign: "right" }}>Total: {moneda(pago.ticket.total)}</h3>
            <p style={texto}>Método: {pago.ticket.metodoPago || pago.metodoPago || "Pago confirmado"}</p>
            <button type="button" onClick={descargarTicket} style={{ ...btn, background: "#102c5c", color: "white" }}>⬇️ Descargar ticket como imagen</button>
          </div> : pendiente ? <div style={{ marginTop: 20 }}>
            <h2 style={{ fontSize: 19, margin: "0 0 12px" }}>Elige cómo quieres pagar</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
              <button type="button" aria-pressed={metodo === "tarjeta"} onClick={() => setMetodo("tarjeta")} style={{ ...btn, background: metodo === "tarjeta" ? "#123d80" : "#eef3fc", color: metodo === "tarjeta" ? "white" : "#18345b" }}>💳 Tarjeta</button>
              <button type="button" aria-pressed={metodo === "banco"} onClick={() => setMetodo("banco")} style={{ ...btn, background: metodo === "banco" ? "#123d80" : "#eef3fc", color: metodo === "banco" ? "white" : "#18345b" }}>🏦 Banco / SPEI</button>
            </div>
            {metodo === "tarjeta" ? <div style={{ ...card, marginTop: 14 }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 17 }}>Paga con tarjeta</h3>
              <p style={{ ...texto, marginTop: 0 }}>Tarjeta de débito o crédito. Las opciones disponibles dependen del proveedor de pagos.</p>
              <div style={{ padding: 12, marginBottom: 12, borderRadius: 10, background: "#eff6ff", border: "1px solid #93c5fd" }}>
                <strong>🧪 Stripe Checkout — SOLO PRUEBAS</strong>
                <p style={{ ...texto, margin: "7px 0" }}>Pago simulado con tarjeta mediante Stripe. No registra ventas ni modifica el inventario. No utilices tarjetas reales.</p>
                <button type="button" onClick={iniciarStripe} disabled={!stripeHabilitado || stripeOcupado || stripePagado} style={{ ...btn, background: stripeHabilitado && !stripePagado ? "#123d80" : "#cbd5e1", color: stripeHabilitado && !stripePagado ? "white" : "#475569", cursor: stripeHabilitado && !stripePagado ? "pointer" : "not-allowed" }}>
                  {stripeOcupado ? "Conectando / verificando…" : stripePagado ? "Prueba verificada ✓" : `💳 Pagar ${moneda(pago.total)} con Stripe (prueba)`}
                </button>
                {stripeMensaje && <p role="status" style={{ ...texto, marginBottom: 0, color: stripePagado ? "#166534" : "#475569" }}>{stripeMensaje}</p>}
              </div>
            </div> : <div style={{ ...card, marginTop: 14 }}>
              <h3 style={{ margin: "0 0 10px", fontSize: 17 }}>🏦 Transferencia SPEI</h3>
              {tieneSPEI ? <>
                <div style={{ fontSize: 14, lineHeight: 2, overflowWrap: "anywhere" }}><div>Banco: <strong>{pago.banco}</strong></div><div>Titular: <strong>{pago.titular}</strong></div><div>CLABE: <strong style={{ userSelect: "all" }}>{pago.clabe}</strong></div></div>
                <button type="button" onClick={() => copiar(pago.clabe, "clabe")} style={{ ...btn, marginTop: 12, background: "#2563eb", color: "white" }}>{copiado === "clabe" ? "✓ CLABE copiada" : "📋 Copiar CLABE"}</button>
                <button type="button" onClick={() => copiar(Number(pago.total).toFixed(2), "importe")} style={{ ...btn, marginTop: 9, background: "#dce9ff", color: "#16458a" }}>{copiado === "importe" ? "✓ Importe copiado" : `Copiar importe: ${moneda(pago.total)}`}</button>
                <p style={texto}>Realiza la transferencia en tu aplicación bancaria y solicita al cajero que verifique el depósito.</p>
                <button type="button" disabled={reportado} onClick={() => setReportado(true)} style={{ ...btn, background: reportado ? "#cbd5e1" : "#102c5c", color: reportado ? "#334155" : "white" }}>{reportado ? "⏳ Esperando verificación" : "✅ Ya hice la transferencia"}</button>
                <p style={{ ...texto, marginBottom: 0 }}>Este aviso solo cambia tu pantalla. No notifica al cajero ni confirma el depósito. El negocio debe verificarlo antes de aprobar el pago.</p>
              </> : <p style={texto}>El negocio todavía no ha configurado sus datos para recibir transferencias.</p>}
            </div>}
          </div> : <p role="status" style={{ marginTop: 18, background: "#fef2f2", color: "#991b1b", padding: 14, borderRadius: 12 }}>Esta solicitud ya no está disponible para pagar. Consulta al cajero.</p>}
        </>}
        <footer style={{ ...texto, textAlign: "center", marginTop: 24 }}>🔒 POS Init Pay · Nunca compartas tu NIP bancario</footer>
      </section>
    </main>
  );
}
