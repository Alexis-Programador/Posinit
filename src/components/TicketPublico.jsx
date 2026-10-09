import { useEffect, useMemo, useRef } from "react";

function decodificarTicket(token) {
  try {
    const normalizado = token.replace(/-/g, "+").replace(/_/g, "/");
    const relleno = normalizado + "=".repeat((4 - (normalizado.length % 4)) % 4);
    const binario = atob(relleno);
    const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
  } catch (error) {
    console.error("Ticket inválido:", error);
    return null;
  }
}

function TicketPublico({ token }) {
  const ticketRef = useRef(null);
  const ticket = useMemo(() => decodificarTicket(token), [token]);

  const descargarImagen = async () => {
    if (!ticket) return;

    const ancho = 760;
    const margen = 54;
    const altoFila = 70;
    const productos = Array.isArray(ticket.productos) ? ticket.productos : [];
    const esEfectivo = String(ticket.metodoPago ?? "").toLowerCase() === "efectivo";
    const alto = 560 + productos.length * altoFila + (esEfectivo ? 110 : 40);

    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, ancho, alto);
    ctx.fillStyle = "#0f172a";
    ctx.textBaseline = "top";

    ctx.textAlign = "center";
    ctx.font = "700 42px Arial";
    ctx.fillText("POS Init", ancho / 2, 42);
    ctx.font = "24px Arial";
    ctx.fillText(new Date(Number(ticket.fechaHora)).toLocaleString("es-MX"), ancho / 2, 102);
    ctx.font = "22px Arial";
    ctx.fillText(`Cajero: ${ticket.nombreUsuario || "Usuario"} · ${ticket.numeroUsuario || ""}`, ancho / 2, 142);

    let y = 205;
    ctx.strokeStyle = "#94a3b8";
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(margen, y);
    ctx.lineTo(ancho - margen, y);
    ctx.stroke();
    ctx.setLineDash([]);
    y += 34;

    ctx.textAlign = "left";
    productos.forEach((item) => {
      ctx.font = "700 24px Arial";
      ctx.fillStyle = "#0f172a";
      ctx.fillText(String(item.nombre || "Producto"), margen, y);
      ctx.font = "21px Arial";
      ctx.fillText(`${Number(item.cantidad || 0)} × $${Number(item.precio || 0).toFixed(2)}`, margen, y + 32);
      ctx.textAlign = "right";
      ctx.font = "700 24px Arial";
      ctx.fillText(`$${Number(item.subtotal || 0).toFixed(2)}`, ancho - margen, y + 12);
      ctx.textAlign = "left";
      y += altoFila;
    });

    y += 8;
    ctx.strokeStyle = "#94a3b8";
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(margen, y);
    ctx.lineTo(ancho - margen, y);
    ctx.stroke();
    ctx.setLineDash([]);
    y += 34;

    ctx.font = "700 34px Arial";
    ctx.fillText("TOTAL", margen, y);
    ctx.textAlign = "right";
    ctx.fillText(`$${Number(ticket.total || 0).toFixed(2)}`, ancho - margen, y);
    y += 58;

    ctx.font = "22px Arial";
    ctx.textAlign = "left";
    ctx.fillText("Método", margen, y);
    ctx.textAlign = "right";
    ctx.font = "700 22px Arial";
    ctx.fillText(String(ticket.metodoPago || "Sin especificar"), ancho - margen, y);
    y += 42;

    if (esEfectivo) {
      ctx.font = "22px Arial";
      ctx.textAlign = "left";
      ctx.fillText("Efectivo", margen, y);
      ctx.textAlign = "right";
      ctx.font = "700 22px Arial";
      ctx.fillText(`$${Number(ticket.recibido || 0).toFixed(2)}`, ancho - margen, y);
      y += 38;
      ctx.font = "22px Arial";
      ctx.textAlign = "left";
      ctx.fillText("Cambio", margen, y);
      ctx.textAlign = "right";
      ctx.font = "700 22px Arial";
      ctx.fillText(`$${Number(ticket.cambio || 0).toFixed(2)}`, ancho - margen, y);
      y += 52;
    }

    ctx.textAlign = "center";
    ctx.font = "22px Arial";
    ctx.fillText("Gracias por su compra", ancho / 2, y + 16);
    ctx.font = "16px Arial";
    ctx.fillStyle = "#64748b";
    ctx.fillText(`Folio: ${ticket.folio || ""}`, ancho / 2, y + 56);

    const enlace = document.createElement("a");
    enlace.download = `ticket-pos-init-${ticket.folio || Date.now()}.png`;
    enlace.href = canvas.toDataURL("image/png");
    enlace.click();
  };

  useEffect(() => {
    if (!ticket) return undefined;

    const temporizador = window.setTimeout(() => {
      descargarImagen();
    }, 350);

    return () => window.clearTimeout(temporizador);
  }, [ticket]);

  if (!ticket) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f1f5f9", padding: 20 }}>
        <section style={{ background: "#fff", borderRadius: 18, padding: 28, maxWidth: 520, textAlign: "center" }}>
          <h1>POS Init</h1>
          <h2>Ticket no válido</h2>
          <p>El código del ticket está incompleto o no se pudo leer.</p>
        </section>
      </main>
    );
  }

  const esEfectivo = String(ticket.metodoPago ?? "").toLowerCase() === "efectivo";

  return (
    <main style={{ minHeight: "100vh", background: "#f1f5f9", padding: "24px 14px", color: "#0f172a" }}>
      <section ref={ticketRef} style={{ width: "min(560px, 100%)", margin: "0 auto", background: "#fff", borderRadius: 20, padding: 26, boxShadow: "0 18px 55px rgba(15,23,42,.12)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 42 }}>🧾</div>
          <h1 style={{ margin: "8px 0" }}>POS Init</h1>
          <p style={{ margin: 0 }}>{new Date(Number(ticket.fechaHora)).toLocaleString("es-MX")}</p>
          <p>Cajero: {ticket.nombreUsuario || "Usuario"} · {ticket.numeroUsuario || ""}</p>
          <small style={{ wordBreak: "break-all", color: "#64748b" }}>Folio: {ticket.folio}</small>
        </div>

        <div style={{ borderTop: "1px dashed #94a3b8", margin: "18px 0" }} />

        <div style={{ display: "grid", gap: 14 }}>
          {(ticket.productos || []).map((item, index) => (
            <div key={`${item.nombre}-${index}`} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12 }}>
              <div><strong>{item.nombre}</strong><div>{Number(item.cantidad)} × ${Number(item.precio).toFixed(2)}</div></div>
              <strong>${Number(item.subtotal).toFixed(2)}</strong>
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px dashed #94a3b8", margin: "18px 0" }} />

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, fontWeight: 800 }}>
          <span>TOTAL</span><span>${Number(ticket.total).toFixed(2)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
          <span>Método</span><strong>{ticket.metodoPago}</strong>
        </div>
        {esEfectivo && <>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}><span>Efectivo</span><strong>${Number(ticket.recibido).toFixed(2)}</strong></div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}><span>Cambio</span><strong>${Number(ticket.cambio).toFixed(2)}</strong></div>
        </>}

        <p style={{ textAlign: "center", marginTop: 24 }}>Gracias por su compra 🌱</p>

        <button type="button" onClick={descargarImagen} style={{ width: "100%", minHeight: 54, marginTop: 12, border: 0, borderRadius: 12, background: "#0f172a", color: "#fff", fontWeight: 800, fontSize: 16, cursor: "pointer" }}>
          📥 Descargar ticket
        </button>
      </section>
    </main>
  );
}

export default TicketPublico;
