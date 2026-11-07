import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, reauthenticateWithCredential, EmailAuthProvider, sendEmailVerification } from "firebase/auth";
import { auth } from "../firebase/firebaseConfig";
import { API_PAGOS, ENTORNO_PAGOS } from "./pagosConfig";

export default function StripeConnect() {
  const [user,setUser]=useState(null),[ready,setReady]=useState(false);
  const [email,setEmail]=useState(""),[password,setPassword]=useState("");
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[status,setStatus]=useState(null);
  useEffect(()=>onAuthStateChanged(auth,u=>{setUser(u);setEmail(u?.email||"");setReady(true);setStatus(null);}),[]);
  async function call(route){
    if(!API_PAGOS)throw Error("Falta configurar VITE_POS_PAY_API_URL.");
    const idToken=await auth.currentUser.getIdToken(true);
    const res=await fetch(API_PAGOS+route,{method:"POST",headers:{Authorization:"Bearer "+idToken,"Content-Type":"application/json"},body:"{}"});
    const d=await res.json();if(!res.ok||!d.ok)throw Error(d.mensaje||"No se pudo consultar Stripe.");
    if(d.entorno&&d.entorno!==ENTORNO_PAGOS)throw Error("El entorno de la web y el servidor no coincide.");return d;
  }
  async function run(fn){setBusy(true);setMessage("");try{await fn();}catch(e){setMessage(e.message);}finally{setBusy(false);setPassword("");}}
  const style={padding:14,borderRadius:10,border:"1px solid #cbd5e1",fontSize:16,width:"100%",boxSizing:"border-box"};
  return <main style={{minHeight:"100vh",background:"#f1f5f9",color:"#0f172a",padding:24,boxSizing:"border-box"}}>
    <section style={{maxWidth:520,margin:"36px auto",background:"white",padding:28,borderRadius:24,boxShadow:"0 16px 40px #0f172a12"}}>
      <a href={window.location.pathname}>← Volver a POS Init</a>
      <h1>Cobros con tarjeta</h1><p>Cada negocio recibe sus cobros en su propia cuenta de Stripe.</p>
      <p><strong>{ENTORNO_PAGOS==="live"?"Entorno real configurado":"Modo de pruebas · no cobra dinero real"}</strong></p>
      {!ready?<p>Cargando sesión…</p>:<>
        {user?<p>Dueño: <strong>{user.email}</strong></p>:<p>Inicia sesión con la cuenta del dueño, no con el número del cajero.</p>}
        <form onSubmit={e=>{e.preventDefault();run(async()=>{
          if(!auth.currentUser)await signInWithEmailAndPassword(auth,email.trim(),password);
          else await reauthenticateWithCredential(auth.currentUser,EmailAuthProvider.credential(auth.currentUser.email,password));
          await auth.currentUser.reload();
          if(!auth.currentUser.emailVerified)throw Error("Verifica primero el correo del dueño y vuelve a iniciar sesión.");
          const d=await call('/api/connect/onboarding');
          const u=new URL(d.url);if(u.protocol!=="https:"||!u.hostname.endsWith(".stripe.com"))throw Error("Enlace no válido.");
          window.location.assign(u.href);
        });}} style={{display:"grid",gap:12}}>
          {!user&&<label>Correo del dueño<input required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} style={style}/></label>}
          <label>Confirma tu contraseña<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} style={style}/></label>
          <button disabled={busy} style={{...style,background:"#2563eb",color:"white",cursor:"pointer"}}>{busy?"Procesando…":"Conectar o completar mi cuenta Stripe"}</button>
        </form>
        {user&&<button disabled={busy} style={{...style,marginTop:12}} onClick={()=>run(async()=>{await auth.currentUser.reload();setStatus(await call('/api/connect/status'));})}>Comprobar estado</button>}
        {user&&!user.emailVerified&&<button disabled={busy} style={{...style,marginTop:12}} onClick={()=>run(async()=>{await sendEmailVerification(auth.currentUser);setMessage("Enviamos el enlace de verificación a tu correo.");})}>Enviar verificación del correo</button>}
        {status&&<p role="status">{!status.conectada?"Todavía no has conectado tu cuenta.":status.chargesEnabled&&status.payoutsEnabled?"Stripe permite cobros y depósitos en esta cuenta.":"Completa los datos solicitados por Stripe. Tu cuenta todavía no está lista para cobrar y recibir depósitos."}</p>}
      </>}
      {message&&<p role="alert" style={{color:"#b91c1c"}}>{message}</p>}
      <p style={{fontSize:13,color:"#475569"}}>Stripe te pedirá los datos del negocio y de tu cuenta bancaria. Volver de Stripe no significa que ya esté aprobada: usa «Comprobar estado». Las comisiones de Stripe se aplican a los cobros.</p>
    </section>
  </main>;
}
