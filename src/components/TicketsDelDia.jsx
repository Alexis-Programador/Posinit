import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

const moneda = (valor) => Number(valor || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const escapar = (valor) => String(valor ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fechaLocal = (valor) => new Date(valor).toLocaleDateString("en-CA");
const fechaVenta = (venta) => {
  const valor = venta.fechaHora;
  if (typeof valor === "number") return valor;
  if (valor?.toMillis) return valor.toMillis();
  if (valor?.seconds) return valor.seconds * 1000;
  if (typeof valor === "string") return new Date(valor).getTime();
  return NaN;
};

function htmlTicket(venta, negocio, usuario) {
  const fecha = fechaVenta(venta);
  const items = Array.isArray(venta.productos) ? venta.productos : [];
  const filas = items.map((p) => {
    const cantidad = Number(p.cantidad || 0);
    const subtotal = Number(p.subtotal ?? (cantidad * Number(p.precio || 0)));
    return `<tr><td>${escapar(p.nombre || "Producto")}</td><td class="c">${cantidad}</td><td class="r">${moneda(subtotal)}</td></tr>`;
  }).join("");
  const pago = escapar(venta.metodoPago || "No especificado");
  const recibido = venta.recibido == null ? "" : `<p>Recibido: ${moneda(venta.recibido)}</p>`;
  const cambio = venta.cambio == null ? "" : `<p>Cambio: ${moneda(venta.cambio)}</p>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ticket ${escapar(venta.folio || venta.documentoId || "")}</title><style>
    body{font-family:ui-monospace,Consolas,monospace;max-width:350px;margin:22px auto;padding:12px;color:#111}h2,p{text-align:center;margin:7px 0}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{border-bottom:1px dashed #aaa;padding:7px 2px;font-size:12px}.r{text-align:right}.c{text-align:center}.total{text-align:right;font-size:21px;font-weight:800;border-top:2px dashed #333;padding-top:12px}.acciones{display:flex;gap:8px;margin-top:25px}.acciones button{flex:1;padding:12px;border:1px solid #aaa;border-radius:8px;background:#f4f6fa;cursor:pointer}@media print{.acciones{display:none}body{margin:0 auto}}</style></head><body>
    <h2>${escapar(negocio || "Negocio")}</h2><p>Ticket de venta</p><p>${Number.isFinite(fecha) ? escapar(new Date(fecha).toLocaleString("es-MX")) : ""}</p>
    <p>Folio: ${escapar(venta.folio || venta.documentoId || "Sin folio")}</p><p>Cajero: ${escapar(venta.nombreUsuario || usuario?.nombre || "")}</p>
    <table><thead><tr><th>Producto</th><th>Cant.</th><th>Importe</th></tr></thead><tbody>${filas}</tbody></table>
    <div class="total">Total: ${moneda(venta.total)}</div><p>Método: ${pago}</p>${recibido}${cambio}
    <p class="marca-pos">Punto de venta gestionado con <strong>POS Init</strong></p>
    <div class="acciones"><button onclick="window.print()">Imprimir / guardar PDF</button><button onclick="window.close()">Cerrar</button></div>
    <script>window.addEventListener("keydown", function(event) { if (event.key === "Escape") { event.preventDefault(); window.close(); } });<\/script>
    </body></html>`;
}

export default function TicketsDelDia({ ownerUid, usuario, nombreEmpresa, onCerrar }) {
  const [ventas, setVentas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [fechaHoy] = useState(() => fechaLocal(Date.now()));

  useEffect(() => {
    if (!ownerUid) { setError("No se encontró el negocio."); setCargando(false); return; }
    return onSnapshot(collection(db, "usuarios", ownerUid, "ventas"), (snap) => {
      setVentas(snap.docs.map(d => ({ documentoId: d.id, ...d.data() })));
      setCargando(false); setError("");
    }, (err) => { setError(err?.message || "No se pudieron consultar las ventas."); setCargando(false); });
  }, [ownerUid]);

  useEffect(() => {
    const tecla = (e) => { if (e.key === "Escape" || e.key === "F1") { e.preventDefault(); e.stopImmediatePropagation?.(); onCerrar?.(); } };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [onCerrar]);

  const delDia = useMemo(() => ventas.filter(v => {
    const fecha = fechaVenta(v);
    return Number.isFinite(fecha) && fechaLocal(fecha) === fechaHoy;
  }).sort((a,b) => fechaVenta(b)-fechaVenta(a)), [ventas,fechaHoy]);
  const filtradas = useMemo(() => delDia.filter(v => {
    const texto = busqueda.trim().toLocaleLowerCase("es-MX");
    return !texto || [v.folio, v.documentoId, v.nombreUsuario, v.metodoPago, v.total,
      ...(Array.isArray(v.productos) ? v.productos.map(p => p.nombre) : [])].some(x => String(x ?? "").toLocaleLowerCase("es-MX").includes(texto));
  }), [delDia,busqueda]);

  const abrir = (venta) => {
    const ventana = window.open("", "_blank", "width=460,height=760");
    if (!ventana) { setError("Permite las ventanas emergentes para imprimir el ticket."); return; }
    ventana.document.open(); ventana.document.write(htmlTicket(venta, nombreEmpresa, usuario)); ventana.document.close(); ventana.focus();
  };
  const descargar = (venta) => {
    const archivo = new Blob([htmlTicket(venta, nombreEmpresa, usuario)], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(archivo);
    const a = document.createElement("a"); a.href = url;
    a.download = `Ticket_POS_Init_${String(venta.folio || venta.documentoId || "venta").replace(/[^\w-]/g,"_")}.html`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const boton = { border:"1px solid #cbd5e1", background:"white", borderRadius:9, padding:"9px 12px", cursor:"pointer", fontWeight:700 };
  return <div role="dialog" aria-modal="true" aria-label="Tickets de hoy" style={{position:"fixed",inset:0,zIndex:12000,background:"#0b1728ad",display:"grid",placeItems:"center",padding:12}} onMouseDown={e=>{if(e.target===e.currentTarget)onCerrar?.();}}>
    <section style={{background:"#fff",color:"#14253b",borderRadius:18,width:"min(740px,100%)",maxHeight:"92dvh",display:"flex",flexDirection:"column",boxShadow:"0 24px 90px #0005",overflow:"hidden"}}>
      <header style={{padding:"20px 22px 12px",display:"flex",justifyContent:"space-between",alignItems:"start",gap:12}}>
        <div><h2 style={{margin:0,fontSize:24}}>🧾 Tickets de hoy</h2><p style={{margin:"6px 0",color:"#64748b"}}>{new Date().toLocaleDateString("es-MX",{day:"numeric",month:"long",year:"numeric"})} · {delDia.length} ventas · {moneda(delDia.reduce((s,v)=>s+Number(v.total||0),0))}</p></div>
        <button onClick={onCerrar} style={{...boton,background:"#f1f5f9"}} aria-label="Cerrar">✕</button>
      </header>
      <div style={{padding:"0 22px 14px"}}><input aria-label="Buscar venta de hoy" value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar por folio, producto, cajero o importe..." style={{width:"100%",boxSizing:"border-box",padding:"13px 14px",border:"1px solid #cbd5e1",borderRadius:10,fontSize:15}} /></div>
      <div style={{overflowY:"auto",padding:"0 22px 22px",flex:1}}>
        {cargando && <p>Consultando ventas...</p>}{error && <p style={{color:"#b91c1c"}}>{error}</p>}
        {!cargando && !error && !filtradas.length && <p style={{textAlign:"center",padding:35,color:"#64748b"}}>{delDia.length ? "No hay coincidencias." : "Todavía no hay ventas registradas hoy."}</p>}
        {filtradas.map(v=><article key={v.documentoId} style={{display:"flex",gap:14,justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",border:"1px solid #e2e8f0",borderRadius:12,padding:14,marginBottom:10}}>
          <div style={{minWidth:190,flex:1}}><strong>{moneda(v.total)}</strong><div style={{fontSize:13,color:"#64748b",marginTop:4}}>{new Date(fechaVenta(v)).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"})} · {v.metodoPago || "Venta"}</div><div style={{fontSize:12,color:"#64748b",overflowWrap:"anywhere"}}>Folio: {v.folio || v.documentoId}</div><div style={{fontSize:12,marginTop:5}}>{(v.productos||[]).map(p=>`${p.nombre} ×${p.cantidad}`).join(", ")}</div></div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button style={boton} onClick={()=>abrir(v)}>🖨 Ver / imprimir</button><button style={{...boton,color:"#fff",background:"#165bd6",borderColor:"#165bd6"}} onClick={()=>descargar(v)}>⬇ Descargar</button></div>
        </article>)}
      </div><footer style={{padding:"12px 22px",borderTop:"1px solid #e2e8f0",fontSize:12,color:"#64748b"}}>Solo se muestran ventas de la fecha actual. Los tickets anteriores siguen guardados en el historial de ventas (F5). Para PDF: Ver / imprimir → Guardar como PDF.</footer>
    </section>
  </div>;
}
