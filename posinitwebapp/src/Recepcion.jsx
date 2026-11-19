import { useState } from 'react';
import { receiveMerchandiseBatch, money, when } from './data';

function Field({label,children}) { return <label className="field"><span>{label}</span>{children}</label>; }
function SearchProduct({products,query,onSelect}) {
  const matches=products.filter(p=>(p.nombre||'').toLowerCase().includes(query.toLowerCase())||String(p.codigoBarras||'').includes(query)).slice(0,7);
  return <div className="receipt-results">{matches.map(p=>
    <button type="button" className="receipt-result" key={p.docId} onClick={()=>onSelect(p)}>
      {typeof p.imagenUri === 'string' && p.imagenUri.startsWith('https://') ? <img src={p.imagenUri} alt="" loading="lazy" /> : <span>📦</span>}
      <span><strong>{p.nombre}</strong><small>{p.codigoBarras} · {money(p.precioVenta)}</small></span>
      <strong>＋</strong>
    </button>)}
    {query&&!matches.length&&<p className="muted">No se encontraron productos con esa búsqueda.</p>}
  </div>;
}
export default function MerchandiseReceipt({uid,products,inventory,providers,records,onSaved}) {
  const [query,setQuery]=useState('');
  const [selected,setSelected]=useState(null);
  const [qty,setQty]=useState('1');
  const [provider,setProvider]=useState('');
  const [cart,setCart]=useState([]);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState('');
  const stock=new Map(inventory.map(x=>[x.docId,x]));
  const cartCount=cart.reduce((v,x)=>v+x.cantidad,0);
  const ordered=[...records].sort((a,b)=>Number(b.fechaHora||0)-Number(a.fechaHora||0));
  const selectedStock=selected ? stock.get(selected.docId)?.stockActual ?? 0 : 0;
  const add=()=>{
    setError('');
    if(!selected||!Number.isSafeInteger(Number(qty))||Number(qty)<1){setError('Selecciona un producto y escribe unidades válidas.');return;}
    const count=Number(qty),found=cart.find(x=>x.docId===selected.docId);
    if((found?.cantidad||0)+count>2147483647||cart.length>=60&&!found){setError('Se excedió la cantidad permitida por recepción.');return;}
    setCart(all=>all.some(x=>x.docId===selected.docId)?all.map(x=>x.docId===selected.docId?{...x,cantidad:x.cantidad+count}:x):[...all,{...selected,cantidad:count}]);
    setSelected(null);setQty('1');setQuery('');
  };
  const save=async()=>{
    if(working||!cart.length)return;
    setWorking(true);setError('');
    try{
      await receiveMerchandiseBatch(uid,cart,provider);
      setCart([]);setProvider('');
      onSaved?.('✅ Mercancía registrada correctamente. Inventario e historial sincronizados.');
    }catch(e){setError(e.message||'No fue posible registrar la recepción.');}
    finally{setWorking(false);}
  };
  return <div className="extended-page">
    <section className="panel">
      <div className="panel-header"><div><h2>📥 Nueva recepción de mercancía</h2><p>Registra entradas en la misma base de datos de Android e iOS.</p></div><span className="chip neutral">Stock sincronizado</span></div>
      <div className="receipt-layout">
        <div className="receipt-form">
          <Field label="Buscar producto por nombre o código de barras">
            <input value={query} placeholder="Escribe para buscar..." onChange={e=>{setQuery(e.target.value);setSelected(null);}} />
          </Field>
          {query&&<SearchProduct products={products} query={query} onSelect={p=>{setSelected(p);setQuery(p.nombre);}}/>}
          {selected&&<div className="selected-product"><strong>✓ {selected.nombre}</strong><span>Stock actual: {selectedStock} uds.</span></div>}
          <div className="receipt-row">
            <Field label="Unidades a recibir"><input type="number" min="1" max="2147483647" step="1" value={qty} onChange={e=>setQty(e.target.value)}/></Field>
            <button className="btn primary" type="button" onClick={add} disabled={!selected}>＋ Agregar</button>
          </div>
          <Field label="Proveedor de la recepción (opcional)">
            <select value={provider} onChange={e=>setProvider(e.target.value)}>
              <option value="">Sin proveedor</option>
              {providers.filter(p=>!p.protegido).map(p=><option key={p.docId} value={p.nombre}>{p.nombre}</option>)}
            </select>
          </Field>
          <p className="muted">Se guardarán los mismos campos que utiliza Android: cantidad, stock anterior, stock resultante, proveedor y fecha.</p>
        </div>
        <div className="receipt-cart">
          <div className="receipt-cart-top"><strong>Resumen de recepción</strong><span>{cart.length} artículos · {cartCount} uds.</span></div>
          {cart.map(p=><div key={p.docId} className="receipt-cart-item"><span><strong>{p.nombre}</strong><small>{p.cantidad} unidades · stock actual {stock.get(p.docId)?.stockActual??0}</small></span><button className="btn small outline" onClick={()=>setCart(xs=>xs.filter(x=>x.docId!==p.docId))} disabled={working}>Quitar</button></div>)}
          {!cart.length&&<p className="muted">Selecciona productos para crear una recepción.</p>}
          {error&&<div className="message error" role="alert">{error}</div>}
          <button type="button" className="btn primary wide" disabled={working||!cart.length} onClick={save}>{working?'Guardando con seguridad…':'✅ Confirmar recepción'}</button>
          <p className="muted">La operación utiliza una transacción de Firestore. Evita volver a enviarla si tienes una conexión intermitente sin comprobar antes el historial.</p>
        </div>
      </div>
    </section>
    <section className="panel">
      <div className="panel-header"><div><h2>📚 Historial de mercancía</h2><p>Últimas entradas registradas en todos los dispositivos</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Producto</th><th>Cantidad</th><th>Existencias</th><th>Proveedor</th><th>Fecha</th></tr></thead>
        <tbody>{ordered.slice(0,100).map(x=><tr key={x.docId}><td><strong>{x.producto||x.productoId}</strong><small>{x.codigo||''}</small></td><td>{x.cantidadRecibida} uds.</td><td>{x.stockAnterior} → {x.stockResultante}</td><td>{x.proveedor||'—'}</td><td>{when(x.fechaHora)}</td></tr>)}
          {!ordered.length&&<tr><td colSpan={5} className="empty">Aún no hay recepciones registradas.</td></tr>}
        </tbody>
      </table></div>
    </section>
  </div>;
}
