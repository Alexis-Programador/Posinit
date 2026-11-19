import { useState } from 'react';
import { saveCategory, deleteCategory, normalizeCatalogValue, money, disableOffer } from './data';

export function CategoriesScreen({ uid, categories, products, loading, error }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const save = async e => {
    e.preventDefault();
    if (busy) return;
    setBusy('saving'); setNotice('');
    try { await saveCategory(uid, name); setName(''); setNotice('✅ Categoría guardada y disponible en tus dispositivos.'); }
    catch(err) { setNotice('❌ '+(err.message||'No se pudo guardar.')); }
    finally { setBusy(''); }
  };
  const remove = async row => {
    const count = products.filter(p=>normalizeCatalogValue(p.categoria)===normalizeCatalogValue(row.nombre)).length;
    if(count) { setNotice('❌ Esta categoría tiene '+count+' productos. Cámbialos antes de eliminarla.'); return; }
    if(!window.confirm('¿Eliminar la categoría "'+row.nombre+'"?')) return;
    setBusy(row.docId);setNotice('');
    try {await deleteCategory(uid,row);setNotice('✅ Categoría eliminada.');}
    catch(err){setNotice('❌ '+(err.message||'No se pudo eliminar.'));}
    finally{setBusy('');}
  };
  const sorted=[...categories].sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es'));
  return <section className="panel">
    <div className="panel-header"><div><h2>🏷️ Categorías de productos</h2><p>Categorías guardadas en tu cuenta y compartidas con Android e iOS.</p></div><span className="chip neutral">{sorted.length} categorías</span></div>
    <form className="category-create" onSubmit={save}>
      <label className="field"><span>Nombre de la nueva categoría</span><input value={name} onChange={e=>setName(e.target.value)} maxLength={80} placeholder="Ej. Abarrotes" required /></label>
      <button className="btn primary" disabled={!name.trim()||!!busy} type="submit">{busy==='saving'?'Guardando…':'+ Agregar categoría'}</button>
    </form>
    {error&&<div className="message error" role="alert">No se pudieron consultar las categorías: {error}</div>}
    {loading&&<p className="muted">Cargando categorías guardadas…</p>}
    {notice&&<div className={'message '+(notice.startsWith('❌')?'error':'info')} role="status">{notice}</div>}
    <div className="category-grid">
      {sorted.map(row=>{
        const count=products.filter(p=>normalizeCatalogValue(p.categoria)===normalizeCatalogValue(row.nombre)).length;
        return <article key={row.docId} className="category-item category-live">
          <span>🏷️</span><strong>{row.nombre}</strong><small>{count} {count===1?'producto':'productos'}</small>
          <button type="button" className="btn small outline" disabled={!!busy||count>0} onClick={()=>remove(row)}>{busy===row.docId?'Eliminando…':'Eliminar'}</button>
        </article>;
      })}
      {!loading&&!sorted.length&&!error&&<p className="muted">Aún no has registrado categorías en tu negocio.</p>}
    </div>
    <p className="muted">Para eliminar una categoría, primero cambia de categoría sus productos.</p>
  </section>;
}

const discountOf = (base, offer) => {
  const price = Number(offer?.precioOferta);
  return offer?.activa === true && price > 0 && price < Number(base) ? price : null;
};

export function OffersScreen({ products, offers, onEdit, uid, search='' }) {
  const [working,setWorking]=useState('');
  const [error,setError]=useState('');
  const offerMap=new Map(offers.map(x=>[x.docId,x]));
  const filtered=products.filter(p=>String(p.nombre||'').toLocaleLowerCase('es-MX').includes(search.toLocaleLowerCase('es-MX')) ||
    String(p.codigoBarras||'').toLowerCase().includes(search.toLowerCase()));
  const remove=async product=>{
    if(!window.confirm('¿Eliminar la oferta de "'+product.nombre+'"? El precio normal no cambiará.'))return;
    setWorking(product.docId);setError('');
    try{await disableOffer(uid,product);}
    catch(e){setError(e.message||'No se pudo eliminar la oferta.');}
    finally{setWorking('');}
  };
  return <section className="panel">
    <div className="panel-header"><div><h2>🏷️ Ofertas y promociones</h2><p>El precio normal se conserva. La rebaja aparece en el catálogo y en las etiquetas.</p></div><span className="chip neutral">{offers.filter(o=>o.activa).length} activas</span></div>
    {error&&<div className="message error" role="alert">{error}</div>}
    <div className="offer-grid">{filtered.map(product=>{
      const base=Number(product.precioVenta||0),offer=offerMap.get(product.docId),price=discountOf(base,offer);
      const savings=price===null?0:base-price;
      const percent=base>0?Math.floor(savings/base*100):0;
      return <article className={'offer-card '+(price!==null?'has-offer':'')} key={product.docId}>
        <div className="offer-head">
          {product.imagenUri?.startsWith('https://')?<img src={product.imagenUri} alt={product.nombre} loading="lazy"/>:<span className="offer-placeholder">🏷️</span>}
          <div><strong>{product.nombre}</strong><small>{product.codigoBarras}</small></div>
          {price!==null&&<span className="offer-badge">OFERTA {percent}%</span>}
        </div>
        <p className="offer-base-label">{price===null?'Precio normal':'Antes'}</p>
        <p className={price===null?'offer-normal':'offer-strike'}>{money(base)}</p>
        {price!==null&&<><p className="offer-new-price">{money(price)}</p><p className="offer-savings">Ahorras {money(savings)} por producto</p></>}
        <div className="offer-actions"><button type="button" className="btn primary" disabled={!!working||base<=0} onClick={()=>onEdit(product,offer)}>{price===null?'＋ Crear oferta':'✏️ Editar oferta'}</button>
        {offer&&<button type="button" className="btn outline danger-button" disabled={!!working} onClick={()=>remove(product)}>{working===product.docId?'Eliminando…':'🗑️ Eliminar oferta'}</button>}</div>
      </article>;
    })}
    {!filtered.length&&<p className="muted">No hay productos que coincidan con la búsqueda.</p>}</div>
  </section>;
}
