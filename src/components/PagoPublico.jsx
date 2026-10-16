import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

const moneda = (n) => Number(n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const boton = { width: "100%", padding: "14px 12px", borderRadius: 12, border: 0, fontWeight: 800, fontSize: 15, cursor: "pointer" };

export default function PagoPublico({ id }) {
  const [pago, setPago] = useState(null);
  const [error, setError] = useState("");
  const [reportado, setReportado] = useState(false);
  const [copiado, setCopiado] = useState("");

  useEffect(() => {
    setPago(null);
    setError("");
    setReportado(false);
    if (!/^[a-zA-Z0-9]{15,35}$/.test(id || "")) {
      setError("Enlace inválido.");
      return undefined;
    }
    return onSnapshot(doc(db, "pagosPosInit", id), (snap) => {
      if (!snap.exists()) {
        setPago(null);
        setError("Esta solicitud de pago no existe.");
      } else {
        setPago(snap.data());
        setError("");
      }
    }, (e) => setError("No se pudo consultar el pago: " + e.message));
  }, [id]);

  const copiar = async (texto, etiqueta) => {
    try {
      await navigator.clipboard.writeText(String(texto));
      setCopiado(etiqueta);
      setTimeout(() => setCopiado(""), 2500);
    } catch {
      setError("No se pudo copiar automáticamente. Mantén presionado el dato para copiarlo.");
    }
  };

  const confirmado = pago?.estado === "confirmado" && !!pago.ticket;
  const pendiente = pago?.estado === "pendiente";

  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(160deg,#dbeafe,#eef2ff 45%,#f8fafc)", padding: "24px 12px", fontFamily: "system-ui,sans-serif", color: "#0f172a", boxSizing: "border-box" }}>
      <section style={{ maxWidth: 480, margin: "0 auto", background: "white", borderRadius: 22, padding: "24px 20px", boxShadow: "0 12px 35px #0f172a20" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 36 }}>📱</div>
          <h1 style={{ margin: "4px 0" }}>POS Init Pay</h1>
          <p style={{ color: "#64748b", margin: 0, fontSize: 13 }}>Pago digital seguro · Transferencia SPEI</p>
        </div>
        {error && <p role="alert" style={{ color: "#b91c1c", background: "#fef2f2", padding: 12, borderRadius: 10 }}>{error}</p>}
        {!pago ? (!error && <p style={{ textAlign: "center" }}>Consultando solicitud de pago...</p>) : <>
          <div style={{ background: "#eff6ff", borderRadius: 16, padding: 20, textAlign: "center" }}>
            <div style={{ color: "#475569", fontSize: 14 }}>Total de tu compra</div>
            <div style={{ fontSize: "clamp(32px, 9vw, 44px)", fontWeight: 900, marginTop: 5 }}>{moneda(pago.total)}</div>
          </div>
          {confirmado ? <>
            <p role="status" style={{ background: "#dcfce7", color: "#166534", padding: 14, borderRadius: 12, fontWeight: 800 }}>✅ Pago confirmado. ¡Gracias por tu compra!</p>
            <h2>🧾 Tu ticket digital</h2>
            <p style={{ overflowWrap: "anywhere", fontSize: 13 }}>Folio: {pago.ticket.folio}</p>
            {(pago.ticket.productos || []).map((item, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "10px 0", borderBottom: "1px solid #e2e8f0" }}>
                <span>{item.cantidad} × {item.nombre}</span><strong>{moneda(item.subtotal)}</strong>
              </div>
            ))}
            <h3 style={{ textAlign: "right" }}>Total: {moneda(pago.ticket.total)}</h3>
            <p style={{ fontSize: 13, color: "#475569" }}>Método: Transferencia SPEI</p>
            <button type="button" onClick={() => window.print()} style={{ ...boton, background: "#0f172a", color: "white" }}>🧾 Imprimir / guardar ticket como PDF</button>
          </> : pendiente ? <>
            <p role="status" style={{ background: "#fef9c3", padding: 13, borderRadius: 12, fontWeight: 700 }}>⏳ {reportado ? "Avisaste al cajero. Espera la verificación del depósito." : "Pendiente de transferencia"}</p>
            <h2 style={{ fontSize: 20 }}>🏦 Datos para transferir</h2>
            <div style={{ background: "#f8fafc", padding: 15, borderRadius: 12, lineHeight: 1.9 }}>
              <div>Banco: <strong>{pago.banco}</strong></div>
              <div>Titular: <strong>{pago.titular}</strong></div>
              <div>CLABE: <strong style={{ overflowWrap: "anywhere", userSelect: "all" }}>{pago.clabe}</strong></div>
            </div>
            <button type="button" onClick={() => copiar(pago.clabe, "clabe")} style={{ ...boton, background: "#2563eb", color: "white", marginTop: 12 }}>{copiado === "clabe" ? "✅ CLABE copiada" : "📋 Copiar CLABE"}</button>
            <button type="button" onClick={() => copiar(Number(pago.total).toFixed(2), "importe")} style={{ ...boton, background: "#dbeafe", color: "#1d4ed8", marginTop: 9 }}>{copiado === "importe" ? "✅ Importe copiado" : `💰 Copiar importe: ${moneda(pago.total)}`}</button>
            <p style={{ color: "#334155", lineHeight: 1.5 }}>1. Copia la CLABE y el importe.<br />2. Abre tu aplicación bancaria y realiza la transferencia.<br />3. Regresa aquí y avisa al cajero.</p>
            <button type="button" onClick={() => setReportado(true)} disabled={reportado} style={{ ...boton, background: reportado ? "#cbd5e1" : "#0f172a", color: reportado ? "#334155" : "white" }}>{reportado ? "⏳ Esperando al cajero" : "✅ Ya hice la transferencia"}</button>
            <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>Este botón solo muestra un aviso en tu pantalla: no verifica ni confirma el pago. El negocio debe comprobar el depósito en su banco. El ticket aparecerá automáticamente aquí cuando confirme.</p>
          </> : <p role="status" style={{ background: "#fef2f2", color: "#991b1b", padding: 14, borderRadius: 12 }}>Esta solicitud ya no está disponible para pagar. Consulta al cajero.</p>}
        </>}
      </section>
    </main>
  );
}
