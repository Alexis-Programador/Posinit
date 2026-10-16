import { useEffect, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase/firebaseConfig";

const campo = { width: "100%", padding: 12, border: "1px solid #cbd5e1", borderRadius: 10, boxSizing: "border-box", marginTop: 5 };

/** Configuración de SPEI por propietario. No habilita cargos con tarjeta. */
export default function ConfiguracionPosInitPay({ ownerUid }) {
  const [datos, setDatos] = useState({ banco: "", titular: "", clabe: "" });
  const [estado, setEstado] = useState("Cargando configuración…");
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    let activo = true;
    if (!ownerUid || auth.currentUser?.uid !== ownerUid) { setEstado("Inicia sesión como propietario para configurar los cobros."); return; }
    getDoc(doc(db, "usuarios", ownerUid, "configuracion", "posInitPay"))
      .then(s => { if (activo) { if (s.exists()) setDatos({ banco: s.data().banco || "", titular: s.data().titular || "", clabe: s.data().clabe || "" }); setEstado(""); } })
      .catch(() => { if (activo) setEstado("No fue posible consultar la configuración."); });
    return () => { activo = false; };
  }, [ownerUid]);
  const guardar = async (e) => {
    e.preventDefault();
    if (auth.currentUser?.uid !== ownerUid) { setEstado("Acceso no autorizado."); return; }
    const banco = datos.banco.trim(), titular = datos.titular.trim(), clabe = datos.clabe.trim();
    if (!banco || !titular || !/^\d{18}$/.test(clabe)) { setEstado("Completa banco, titular y CLABE de 18 dígitos."); return; }
    setGuardando(true); setEstado("");
    try {
      await setDoc(doc(db, "usuarios", ownerUid, "configuracion", "posInitPay"), {
        propietarioUid: ownerUid, banco, titular, clabe, actualizadoEn: serverTimestamp(),
      }, { merge: true });
      setEstado("✅ Datos SPEI guardados para este negocio.");
    } catch { setEstado("No se pudo guardar. Comprueba tu sesión y las reglas de Firestore."); }
    finally { setGuardando(false); }
  };
  return <section style={{ maxWidth: 520, margin: "20px auto", padding: 24, borderRadius: 18, background: "white", color: "#102c5c", boxShadow: "0 8px 25px #0001" }}>
    <h2>💳 Configuración · POS Init Pay</h2>
    <p>Configura la cuenta SPEI de este negocio. Cada propietario guarda sus propios datos.</p>
    <form onSubmit={guardar}>
      {[["banco", "Banco"], ["titular", "Titular"], ["clabe", "CLABE (18 dígitos)"]].map(([k, label]) => <label key={k} style={{ display: "block", marginBottom: 14, fontWeight: 600 }}>{label}<input style={campo} value={datos[k]} maxLength={k === "clabe" ? 18 : 120} inputMode={k === "clabe" ? "numeric" : "text"} onChange={e => setDatos(d => ({ ...d, [k]: k === "clabe" ? e.target.value.replace(/\D/g, "") : e.target.value }))} /></label>)}
      <button disabled={guardando || auth.currentUser?.uid !== ownerUid} style={{ width: "100%", padding: 14, border: 0, borderRadius: 12, background: "#103775", color: "white", fontWeight: 700 }}>{guardando ? "Guardando…" : "Guardar configuración SPEI"}</button>
    </form>
    <p role="status">{estado}</p>
    <div style={{ padding: 14, background: "#eff6ff", borderRadius: 12, fontSize: 13 }}><strong>Tarjetas y billeteras digitales:</strong> aún requieren vincular una cuenta verificada con un procesador autorizado. Esta pantalla no habilita cargos reales con tarjeta ni verifica depósitos SPEI.</div>
  </section>;
}
