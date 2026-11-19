import { useMemo, useState } from 'react';
import { money, when, registerLoss } from './data';

function time(value) {
  if (typeof value?.toMillis==='function') return value.toMillis();
  if (typeof value?.toDate==='function') return value.toDate().getTime();
  return Number(value||0);
}
function dateKey(ms) {
  return new Date(ms).toLocaleDateString('es-MX',{timeZone:'America/Mexico_City'});
}
const todayKey=()=>dateKey(Date.now());

export function DailySales({sales,cashOuts,cuts,onDetails}) {
  const [tab,setTab]=useState('ventas');
  const today=todayKey();
  const salesToday=sales.filter(x=>dateKey(time(x.fechaHora))===today).sort((a,b)=>time(b.fechaHora)-time(a.fechaHora));
  const withdrawals=cashOuts.filter(x=>dateKey(time(x.fechaHora))===today);
  const cutsToday=cuts.filter(x=>dateKey(time(x.fechaHora))===today);
  const revenue=salesToday.reduce((v,x)=>v+Number(x.total||0),0);
  const cash=salesToday.reduce((v,x)=>v+(String(x.metodoPago).toLowerCase()==='efectivo'?Number(x.total||0):String(x.metodoPago).toLowerCase()==='mixto'?Number(x.efectivoMixto||0):0),0);
  const cashOut=withdrawals.reduce((v,x)=>v+Number(x.monto||0),0);
  return <div className="extended-page">
    <div className="stats-highlights">
      {[['💰','Ventas de hoy',money(revenue)],['🧾','Operaciones',salesToday.length],
      ['💵','Efectivo por ventas',money(cash)],['↗','Retiros',money(cashOut)],
      ['📦','Cortes registrados',cutsToday.length],['📊','Diferencia previa a cortes',money(Math.max(0,cash-cashOut))]].map(([icon,label,value])=>
      <div className="stats-highlight" key={label}><span>{icon} {label}</span><strong>{value}</strong></div>)}
    </div>
    <div className="message info">Cifras del día calendario (zona America/Mexico_City). El efectivo resumido no sustituye el saldo de caja por cajero, que depende del último corte y del turno.</div>
    <section className="panel">
      <div className="panel-header"><div><h2>Movimientos del día</h2><p>Consulta en tiempo real desde Android, iOS y POS Init Web</p></div></div>
      <div className="period-options" style={{marginBottom:16}}>{[['ventas','Ventas'],['retiros','Retiros'],['cortes','Cortes']].map(([id,label])=>
        <button className={'period-chip '+(id===tab?'selected':'')} onClick={()=>setTab(id)} key={id}>{label}</button>)}</div>
      <div className="table-wrap"><table><thead><tr><th>Hora</th><th>Concepto</th><th>Usuario</th><th>Importe</th><th>Detalle</th></tr></thead><tbody>
        {tab==='ventas' && salesToday.map(x=><tr key={x.docId}><td>{when(x.fechaHora)}</td><td>{x.metodoPago||'Venta'}</td><td>{x.nombreUsuario||'—'}</td><td><strong>{money(x.total)}</strong></td><td><button className="btn small outline" onClick={()=>onDetails(x)}>Ver ticket</button></td></tr>)}
        {tab==='retiros' && withdrawals.map(x=><tr key={x.docId}><td>{when(x.fechaHora)}</td><td>Retiro de caja</td><td>{x.nombreUsuario||'—'}</td><td><strong>{money(x.monto)}</strong></td><td>—</td></tr>)}
        {tab==='cortes' && cutsToday.map(x=><tr key={x.docId}><td>{when(x.fechaHora)}</td><td>Corte de caja</td><td>{x.usuarioId||'—'}</td><td>{money(x.totalContado||0)}</td><td>—</td></tr>)}
        {((tab==='ventas'&&!salesToday.length)||(tab==='retiros'&&!withdrawals.length)||(tab==='cortes'&&!cutsToday.length))&&<tr><td colSpan={5} className="empty">Sin movimientos de este tipo hoy.</td></tr>}
      </tbody></table></div>
    </section>
  </div>;
}

export function LossRegister({uid,products,inventory,records,onSaved}) {
  const [selected,setSelected]=useState('');
  const [quantity,setQuantity]=useState('1');
  const [note,setNote]=useState('');
  const [working,setWorking]=useState(false);
  const [error,setError]=useState('');
  const stockMap=useMemo(()=>new Map(inventory.map(x=>[x.docId,x])),[inventory]);
  const product=products.find(x=>x.docId===selected);
  const existing=Number(stockMap.get(selected)?.stockActual||0);
  const n=Number(quantity);
  const total=n*Number(product?.precioVenta||0);
  const submit=async(e)=>{
    e.preventDefault();
    if(!product||!Number.isSafeInteger(n)||n<=0||n>existing){setError('Selecciona producto y unidades válidas que no superen el stock.');return;}
    if(!window.confirm('¿Registrar '+n+' unidades de '+product.nombre+' como robadas? Se descontarán del inventario.'))return;
    setWorking(true);setError('');
    try{
      await registerLoss(uid,product,n,note);
      setQuantity('1');setNote('');setSelected('');onSaved?.('✅ Robo registrado y existencias actualizadas en Firebase.');
    }catch(err){setError(err.message||'No se pudo registrar el robo.');}
    finally{setWorking(false);}
  };
  return <div className="extended-page">
    <section className="panel">
      <div className="panel-header"><div><h2>🛡️ Registrar mercancía robada</h2><p>Descuenta existencias y crea un registro del negocio, compatible con Android.</p></div></div>
      <form className="edit-form" onSubmit={submit}>
        <label className="field"><span>Producto</span><select value={selected} onChange={e=>setSelected(e.target.value)} required>
          <option value="">Seleccionar producto</option>{[...products].sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre))).map(p=><option key={p.docId} value={p.docId}>{p.nombre} · {p.codigoBarras}</option>)}
        </select></label>
        {product&&<p className="message info">Stock disponible: <strong>{existing} unidades</strong>. Valor del retiro: <strong>{money(total)}</strong>.</p>}
        <label className="field"><span>Unidades robadas</span><input required type="number" min="1" step="1" max={existing} value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
        <label className="field"><span>Observaciones (opcional, hasta 500 caracteres)</span><textarea rows="3" maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label>
        {error&&<div className="message error" role="alert">{error}</div>}
        <button type="submit" className="btn primary" disabled={working||!product||existing<1}>{working?'Guardando…':'Revisar y registrar robo'}</button>
      </form>
    </section>
    <section className="panel">
      <div className="panel-header"><div><h2>Historial de robos</h2><p>Movimientos registrados desde todos los dispositivos</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Producto</th><th>Unidades</th><th>Valor</th><th>Stock</th><th>Fecha</th><th>Observación</th></tr></thead>
      <tbody>{[...records].sort((a,b)=>time(b.fechaHora)-time(a.fechaHora)).map(x=><tr key={x.docId}>
        <td><strong>{x.nombre||x.producto||x.productoId}</strong><small>{x.codigo||''}</small></td><td>{x.unidades}</td><td>{money(x.importe)}</td><td>{x.stockAnterior} → {x.stockResultante}</td><td>{when(x.fechaHora)}</td><td>{x.nota||'—'}</td></tr>)}
        {!records.length&&<tr><td colSpan={6} className="empty">No hay registros de robo.</td></tr>}
      </tbody></table></div>
    </section>
  </div>;
}
