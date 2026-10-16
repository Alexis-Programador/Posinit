import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

export default function PagoPublico({ id }) {
  const [pago, setPago] = useState(null);
  const [error, setError] = useState("");
  const [reportado, setReportado] = useState(false);
  useEffect(() => {
    if (!/^[a-zA-Z0-9]{15,35}$/.test(id)) { setError("Enlace inválido."); return; }
    return onSnapshot(doc(db, "pagosPosInit", id), snap => {
      if (!snap.exists()) setError("Esta solicitud de pago no existe.");
      else { setPago(snap.data()); setError(""); }
    }, e => setError("No se pudo consultar el pago: " + e.message));
  }, [id]);
  const formato = n => Number(n || 0).toLocaleString("es-MX", {style: "currency", currency: "MXN"});
  const copiar = texto => navigator.clipboard?.writeText(texto);
  return <main style={{minHeight: "100vh", background: "#eef2ff", padding: "25px 12px", fontFamily: "system-ui, sans-serif", color: "#0f172a"}}>
    <section style={{maxWidth: 480, margin: "0 auto", background: "white", borderRadius: 20, padding: 24, boxShadow: "0 8px 35px #0f172a20"}}>
      <h1 style={{marginTop: 0}}>📱 POS Init Pay</h1>
      {error ? <p role="alert" style={{color: "#b91c1c"}}>{error}</p> : !pago ? <p>Cargando solicitud de pago...</p> : <>
        <p style={{color: "#64748b"}}>Total de tu compra</p>
        <h2 style={{fontSize: 38, marginTop: 0}}>{formato(pago.total)}</h2>
        {pago.estado === "confirmado" && pago.ticket ? <>
          <div style={{background: "#dcfce7", padding: 14, borderRadius: 10}}>✅ Pago confirmado. ¡Gracias por tu compra!</div>
          <h3>🧾 Tu ticket digital</h3>
          <p>Folio: <span style={{overflowWrap: "anywhere"}}>{pago.ticket.folio}</span></p>
          {(pago.ticket.productos || []).map((item, i) => <div key={i} style={{display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #e2e8f0"}}><span>{item.cantidad} × {item.nombre}</span><strong>{formato(item.subtotal)}</strong></div>)}
          <h3 style={{textAlign: "right"}}>Total: {formato(pago.ticket.total)}</h3>
          <p>Método: Transferencia SPEI</p>
          <button onClick={() => window.print()} style={{padding: 12, width: "100%"}}>🧾 Imprimir / guardar como PDF</button>
        </> : <>
          <div style={{background: "#fef9c3", padding: 12, borderRadius: 10}}>⏳ {reportado ? "Avisaste que transferiste. Espera a que el cajero confirme." : "Pago pendiente"}</div>
          <h3>🏦 Transferencia SPEI</h3>
          <p>Banco: <strong>{pago.banco}</strong></p>
          <p>Titular: <strong>{pago.titular}</strong></p>
          <p>CLABE: <strong style={{overflowWrap: "anywhere"}}>{pago.clabe}</strong></p>
          <button onClick={() => copiar(pago.clabe)} style={{padding: 12, width: "100%"}}>📋 Copiar CLABE</button>
          <p>Importe exacto: <strong>{formato(pago.total)}</strong></p>
          <p>Abre tu aplicación bancaria y realiza la transferencia. Después avisa al cajero.</p>
          <button onClick={() => setReportado(true)} style={{padding: 14, width: "100%", background: "#2563eb", color: "white", border: 0, borderRadius: 10}}>Ya hice la transferencia</button>
          <p style={{fontSize: 12, color: "#64748b"}}>Este botón no verifica el depósito. El ticket aparecerá aquí cuando el negocio confirme el pago.</p>
        </>}
      </>}
    </section>
  </main>;
}
