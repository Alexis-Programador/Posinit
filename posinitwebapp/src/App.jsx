import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import {
  useLive, money, when, csvDownload, saveProduct, saveStock,
  saveProvider, saveOffer, disableOffer, saveSettings, saveSpei, saveWebTheme,
} from './data';
import MerchandiseReceipt from './Recepcion';
import { DailySales, LossRegister } from './ExtraScreens';
import { AdvancedStats, AppearancePanel, themeById } from './MobileFeatures';
import ProductEditor from './ProductEditor';
import { CategoriesScreen, OffersScreen } from './CategoriesOffers';

const NAV = [
  { title: 'Panel principal', children: [['inicio', '🏠', 'Resumen en vivo']] },
  { title: 'Operación diaria', children: [
    ['productos', '📦', 'Productos'], ['categorias', '🏷️', 'Categorías'], ['inventario', '🧮', 'Inventario'], ['existencias', '📊', 'Estado de existencias'], ['ofertas', '🏷️', 'Ofertas'],
    ['proveedores', '🚚', 'Proveedores'], ['mercancia', '📥', 'Mercancía'], ['robos', '🛡️', 'Registros de robo'],
    ['etiquetas', '🏷️', 'Etiquetas PDF'],
  ] },
  { title: 'Caja y control', children: [
    ['ventas', '🧾', 'Todas las ventas'], ['ventasHoy', '📆', 'Ventas de hoy'], ['cajaDia', '💵', 'Caja del día'], ['retiros', '💸', 'Retiros'], ['cortes', '💰', 'Cortes de caja'],
    ['cierres', '🔒', 'Cierres de sesión'],
  ] },
  { title: 'Reportes', children: [['reportes', '📊', 'Reportes y estadísticas']] },
  { title: 'Personal', children: [
    ['cajeros', '👤', 'Usuarios / cajeros'], ['trabajadores', '👥', 'Trabajadores'], ['roles', '🔐', 'Roles y permisos'],
  ] },
  { title: 'Administración', children: [
    ['configuracion', '⚙️', 'Configuración'], ['colores', '🎨', 'Colores de la web'], ['spei', '🏦', 'POS Init Pay / SPEI'],
    ['cuenta', '🏢', 'Mi negocio'], ['clientes', '📇', 'Clientes'],
  ] },
];
const SECTION_NAME = Object.fromEntries(NAV.flatMap(group => group.children.map(([key, , name]) => [key, name])));
function stockStatusLabel(quantity, minimum) {
  if (quantity === 0) return 'Agotado';
  return quantity <= minimum ? 'Stock bajo' : 'Disponible';
}
const DATE_COLUMNS = ['fechaHora', 'fechaActualizacion', 'creadoEn', 'fecha', 'actualizadoEn'];
const EMPTY = { rows: [], loading: false, error: '', fromCache: false };
const whole = v => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);

function IconStat({ icon, title, value, sub, action }) {
  return <button type="button" onClick={action} className="stat-card" disabled={!action}>
    <span className="stat-icon">{icon}</span>
    <span className="stat-title">{title}</span>
    <strong>{value}</strong>
    <small>{sub}</small>
  </button>;
}
function Panel({ title, subtitle, action, children }) {
  return <section className="panel">
    <div className="panel-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>
    {children}
  </section>;
}
function Status({ feed }) {
  if (feed.loading) return <div className="status-line">Cargando información…</div>;
  if (feed.error) return <div className="message error">No se pudo sincronizar: {feed.error}.</div>;
  if (feed.fromCache) return <div className="message warn">Se muestran datos almacenados en este dispositivo. Esperando sincronización con tu negocio.</div>;
  return null;
}
function Modal({ title, onClose, children }) {
  return <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label={title} className="modal">
      <div className="panel-header"><h2>{title}</h2><button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar">✕</button></div>
      {children}
    </section>
  </div>;
}
function Field({ name, label, value, onChange, type = 'text', min, max, required = false }) {
  return <label className="field"><span>{label}</span><input name={name} value={value ?? ''} onChange={e => onChange(name, e.target.value)} type={type} min={min} max={max} required={required} /></label>;
}
function EditForm({ title, defaults, fields, onSave, onClose }) {
  const [values, setValues] = useState(defaults);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const change = (key, value) => setValues(v => ({ ...v, [key]: value }));
  const submit = async e => {
    e.preventDefault(); setBusy(true); setError('');
    try { await onSave(values); onClose(); } catch (err) { setError(err.message || 'No se pudo guardar.'); }
    finally { setBusy(false); }
  };
  return <Modal title={title} onClose={onClose}>
    <form onSubmit={submit} className="edit-form">
      {fields.map(f => <Field key={f.name} {...f} value={values[f.name]} onChange={change} />)}
      {error && <div className="message error">{error}</div>}
      <div className="form-actions"><button type="button" onClick={onClose} className="btn ghost">Cancelar</button><button disabled={busy} type="submit" className="btn primary">{busy ? 'Guardando…' : 'Guardar cambios'}</button></div>
    </form>
  </Modal>;
}
function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const login = async e => {
    e.preventDefault(); setLoading(true); setMessage('');
    try { await signInWithEmailAndPassword(auth, email.trim(), password); }
    catch (err) { setMessage('No se pudo iniciar sesión. Verifica tu correo, contraseña y conexión. ' + (err.code || '')); }
    finally { setLoading(false); }
  };
  const reset = async () => {
    if (!email.trim()) return setMessage('Escribe tu correo antes de recuperar la contraseña.');
    try { await sendPasswordResetEmail(auth, email.trim()); setMessage('Si el correo pertenece a una cuenta, recibirás instrucciones de recuperación.'); }
    catch { setMessage('No fue posible solicitar la recuperación. Revisa el correo.'); }
  };
  return <div className="auth-layout">
    <div className="auth-brand"><div className="brand-symbol">P</div><span className="tagline">POS INIT · ADMINISTRACIÓN</span><h1>Tu negocio,<br />en todas partes.</h1><p>Administra la misma información que utilizas en Android y iOS, directamente desde la web.</p><div className="auth-pills">🔄 Datos en vivo <span>•</span> 🔐 Solo propietario <span>•</span> ☁️ Firebase</div></div>
    <div className="auth-card"><div className="auth-card-icon">🔐</div><h2>Entrar a POSInitWebApp</h2><p>Usa el mismo correo y contraseña del propietario registrados en la aplicación móvil POS Init.</p>
      <form onSubmit={login} className="edit-form"><label className="field"><span>Correo electrónico</span><input autoComplete="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@negocio.com" /></label>
        <label className="field"><span>Contraseña</span><input type="password" autoComplete="current-password" minLength={6} required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" /></label>
        {message && <div className="message info" role="status">{message}</div>}
        <button disabled={loading} type="submit" className="btn primary wide">{loading ? 'Verificando cuenta…' : 'Iniciar sesión →'}</button>
      </form><button type="button" onClick={reset} className="text-button">¿Olvidaste tu contraseña?</button><p className="auth-footnote">Los empleados y cajeros siguen usando el acceso autorizado de POS Init Web, no este panel.</p>
    </div>
  </div>;
}

export default function App() {
  const [owner, setOwner] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState('');
  const [screen, setScreen] = useState('inicio');
  const [navOpen, setNavOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState(null);
  const [notice, setNotice] = useState('');
  const [detail, setDetail] = useState(null);
  const [imageFit, setImageFit] = useState(() => {
    try { return localStorage.getItem('posinit-web-image-fit') === 'contain' ? 'contain' : 'cover'; }
    catch { return 'cover'; }
  });
  const [themeBusy, setThemeBusy] = useState(false);
  const [premiumEnabled, setPremiumEnabled] = useState(false);
  const [benefitError, setBenefitError] = useState('');
  const changeFit = () => setImageFit(old => {
    const next=old==='cover'?'contain':'cover';
    try {localStorage.setItem('posinit-web-image-fit',next);} catch {}
    return next;
  });

  useEffect(() => {
    // No ocultar indefinidamente el acceso si Firebase Auth no responde.
    const authTimeout = setTimeout(() => {
      setAuthReady(true);
      setAuthError('El servidor está tardando en responder. Revisa tu conexión o vuelve a iniciar sesión.');
    }, 12000);
    let unsubscribeProfile = () => {};
    const unsubscribeAuth = onAuthStateChanged(auth, current => {
      clearTimeout(authTimeout);
      unsubscribeProfile(); unsubscribeProfile = () => {};
      setAuthReady(true); setAuthError(''); setProfile(null);
      if (!current || current.isAnonymous) { setOwner(null); return; }
      setOwner(current);
      unsubscribeProfile = onSnapshot(doc(db, 'usuarios', current.uid), snapshot => {
        if (!snapshot.exists()) { setProfile(null); setAuthError('La cuenta no tiene un negocio registrado en POS Init.'); return; }
        const data = snapshot.data();
        if (!data.businessId) { setProfile(null); setAuthError('Esta cuenta no tiene un businessId. Debes activar tu negocio desde Android o iOS.'); return; }
        setProfile({ ...data, uid: current.uid }); setAuthError('');
      }, error => { setProfile(null); setAuthError('No se pudo verificar el negocio: ' + error.message); });
    });
    return () => { clearTimeout(authTimeout); unsubscribeAuth(); unsubscribeProfile(); };
  }, []);

  const uid = profile?.uid || '';
  useEffect(() => {
    if (!uid) { setPremiumEnabled(false); setBenefitError(''); return; }
    return onSnapshot(doc(db, 'usuarios', uid, 'beneficios', 'premium'),
      snapshot => { setPremiumEnabled(snapshot.exists() && snapshot.data()?.colores === true); setBenefitError(''); },
      error => { setPremiumEnabled(false); setBenefitError(error.message); });
  }, [uid]);
  const products = useLive(uid, 'productos');
  const categories = useLive(uid, 'categorias');
  const inventory = useLive(uid, 'inventario');
  const sales = useLive(uid, 'ventas', ['inicio','ventas','ventasHoy','cajaDia','reportes','cuenta'].includes(screen));
  const providers = useLive(uid, 'proveedores', ['proveedores','mercancia'].includes(screen));
  const offers = useLive(uid, 'ofertas', screen === 'ofertas' || screen === 'inicio');
  const received = useLive(uid, 'registrosMercancia', ['mercancia','reportes'].includes(screen));
  const robberies = useLive(uid, 'robos', ['robos','reportes'].includes(screen));
  const cashOuts = useLive(uid, 'retirosCaja', ['retiros','reportes','ventasHoy','cajaDia'].includes(screen));
  const cuts = useLive(uid, 'cortesCaja', ['cortes','cajaDia','ventasHoy'].includes(screen));
  const closings = useLive(uid, 'cierresSesionCaja', screen === 'cierres');
  const cashiers = useLive(uid, 'usuariosSistema', screen === 'cajeros');
  const workers = useLive(uid, 'trabajadores', screen === 'trabajadores');
  const roles = useLive(uid, 'roles', screen === 'roles');
  const settings = useLive(uid, 'configuracion');
  const generalConfig = settings.rows.find(x=>x.docId==='general')||{};
  const webConfig = settings.rows.find(x=>x.docId==='webApp')||{};
  const configuredTheme = themeById(webConfig.temaWeb);
  const selectedTheme = configuredTheme.premium && !premiumEnabled
    ? themeById('azul') : configuredTheme;

  const stock = useMemo(() => new Map(inventory.rows.map(r => [r.docId, r])), [inventory.rows]);
  const low = useMemo(() => products.rows.filter(p => {
    const inv = stock.get(p.docId); return inv && Number(inv.stockActual || 0) <= Number(inv.stockMinimo || 0);
  }), [products.rows, stock]);
  const today = new Date().toLocaleDateString('es-MX');
  const todaySales = sales.rows.filter(r => new Date(Number(r.fechaHora || 0)).toLocaleDateString('es-MX') === today);
  const todayRevenue = todaySales.reduce((a, v) => a + Number(v.total || 0), 0);
  const activeFeed = {
    inicio: sales, productos: products, inventario: inventory, ofertas: offers, proveedores: providers, mercancia: received, robos: robberies,
    ventas: sales, ventasHoy: sales, cajaDia: sales, retiros: cashOuts, cortes: cuts, cierres: closings,
    cajeros: cashiers, trabajadores: workers, roles, configuracion: settings, spei: settings,
  }[screen] || EMPTY;
  const navigate = name => { setScreen(name); setNavOpen(false); setSearch(''); setEdit(null); setNotice(''); setDetail(null); };
  const notify = async job => { setNotice(''); try { await job(); setNotice('✅ Cambios guardados. Los dispositivos recibirán el cambio al sincronizarse.'); setEdit(null); } catch (e) { setNotice('❌ ' + (e.message || 'No se pudo guardar.')); } };
  const filtered = rows => rows.filter(v => Object.values(v).some(x => typeof x === 'string' && x.toLowerCase().includes(search.toLowerCase())));

  if (!authReady) return <div className="splash">🔵 Conectando POS Init…</div>;
  if (!owner) return <Login />;
  if (!profile) return <div className="splash"><div className="restricted"><h2>🔐 Verificación del propietario</h2><p>{authError || 'Buscando tu negocio…'}</p><button className="btn primary" onClick={() => signOut(auth)}>Salir</button></div></div>;

  const rowTable = (data, columns, sortKey = 'fechaHora') => {
    const rows = filtered(data.rows).sort((a,b) => Number(b[sortKey] || 0)-Number(a[sortKey] || 0));
    return <><Status feed={data} /><div className="table-wrap"><table><thead><tr>{columns.map(([name]) => <th key={name}>{name}</th>)}</tr></thead><tbody>
      {rows.length ? rows.map((item, i) => <tr key={item.docId || i} onClick={() => { setDetail(item); }} className="clickable">
        {columns.map(([name, func]) => <td key={name}>{func(item)}</td>)}
      </tr>) : <tr><td colSpan={columns.length} className="empty">{data.loading ? 'Cargando…' : 'No hay registros en esta colección.'}</td></tr>}
    </tbody></table></div><div className="table-footer">{rows.length} registros visibles · Actualización en tiempo real</div></>;
  };

  const content = () => {
    switch (screen) {
      case 'inicio': return <>
        <div className="hello"><div><span className="overline">MI NEGOCIO · EN TIEMPO REAL</span><h1>Bienvenido a {profile.nombreEmpresa || profile.nombreNegocio || 'POS Init'}</h1><p>Todo lo que aparece aquí proviene de la misma cuenta que utilizas en Android e iOS.</p></div><span className="live-dot">● CONECTADO</span></div>
        <div className="stat-grid">
          <IconStat icon="💳" title="Ventas de hoy" value={money(todayRevenue)} sub={`${todaySales.length} operaciones registradas`} action={() => navigate('ventas')} />
          <IconStat icon="📦" title="Productos" value={products.loading ? '…' : products.rows.length} sub="Catálogo sincronizado" action={() => navigate('productos')} />
          <IconStat icon="📉" title="Stock bajo" value={inventory.loading ? '…' : low.length} sub="Productos por revisar" action={() => navigate('inventario')} />
          <IconStat icon="🏷️" title="Promociones" value={offers.loading ? '…' : offers.rows.filter(x => x.activa).length} sub="Ofertas activas" action={() => navigate('ofertas')} />
        </div>
        <div className="two-col">
          <Panel title="Últimas ventas" subtitle="Entradas registradas desde POS Init" action={<button className="link-button" onClick={() => navigate('ventas')}>Ver todas →</button>}>
            <Status feed={sales}/>{[...sales.rows].sort((a,b) => numDate(b)-numDate(a)).slice(0,6).map(v => <div className="list-line" key={v.docId}><span><strong>Venta #{String(v.id || v.docId).slice(0,9)}</strong><small>{v.nombreUsuario || 'POS Init'} · {when(v.fechaHora)}</small></span><strong>{money(v.total)}</strong></div>)}
            {!sales.rows.length && <p className="muted">Sin ventas registradas.</p>}
          </Panel>
          <Panel title="Inventario por atender" subtitle="Stock actual igual o menor al mínimo" action={<button className="link-button" onClick={() => navigate('inventario')}>Abrir inventario →</button>}>
            <Status feed={inventory}/>{low.slice(0,6).map(v => <div className="list-line" key={v.docId}><span><strong>{v.nombre}</strong><small>{v.categoria}</small></span><span className="chip danger">{stock.get(v.docId)?.stockActual ?? 0} uds.</span></div>)}
            {!low.length && <p className="muted">No hay alertas de stock en los registros consultados.</p>}
          </Panel>
        </div>
      </>;
      case 'productos': return <Panel title="Catálogo de productos" subtitle="Imágenes grandes y fichas adaptadas al tamaño de tu pantalla" action={<div className="catalog-actions"><button className="btn outline" type="button" onClick={changeFit}>{imageFit==='cover'?'▣ Ajustar imagen':'▧ Llenar tarjeta'}</button><button className="btn primary" onClick={() => setEdit({ type: 'product', row: null })}>+ Agregar producto</button></div>}>
        <Status feed={products}/><div className="product-grid">{filtered(products.rows).sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre))).map(p => <article key={p.docId} className="product-card">
          <div className="product-image">{typeof p.imagenUri === 'string' && p.imagenUri.startsWith('https://') ? <img src={p.imagenUri} alt={p.nombre} loading="lazy" style={{objectFit:imageFit}}/> : '📦'}</div>
          <div><strong>{p.nombre}</strong><small>{p.codigoBarras} · {p.categoria}</small><b>{money(p.precioVenta)}</b><span className="mini-muted">Stock: {stock.get(p.docId)?.stockActual ?? '—'}</span></div>
          <button className="btn small outline" onClick={() => setEdit({ type:'product', row:p })}>Editar</button>
        </article>)}{!products.rows.length && <p className="muted">Sin productos registrados.</p>}</div>
      </Panel>;
      case 'inventario': return <Panel title="Inventario en vivo" subtitle="Cambios de existencias con actualización inmediata">
        <Status feed={inventory}/><div className="table-wrap"><table><thead><tr><th>Producto</th><th>Stock actual</th><th>Mínimo</th><th>Estado</th><th>Acción</th></tr></thead><tbody>
          {filtered(products.rows).map(p => { const st=stock.get(p.docId);const lowFlag=st && Number(st.stockActual || 0)<=Number(st.stockMinimo||0);return <tr key={p.docId}><td><strong>{p.nombre}</strong><small>{p.codigoBarras}</small></td><td>{st?.stockActual ?? 0}</td><td>{st?.stockMinimo ?? 0}</td><td><span className={'chip '+(lowFlag?'danger':'success')}>{lowFlag?'Stock bajo':'Disponible'}</span></td><td><button className="btn small outline" onClick={()=>setEdit({type:'stock',row:p,stock:st})}>Ajustar</button></td></tr> })}
        </tbody></table></div>
      </Panel>;
      case 'ofertas': return <><Status feed={products}/><Status feed={offers}/><OffersScreen uid={uid} products={products.rows} offers={offers.rows} search={search} onEdit={(row,offer)=>setEdit({type:'offer',row,offer})}/></>;
      case 'proveedores': return <Panel title="Proveedores" subtitle="Directorio compartido con la aplicación móvil" action={<button className="btn primary" onClick={()=>setEdit({type:'provider',row:null})}>+ Nuevo proveedor</button>}>
        {rowTable(providers,[['Nombre',x=>x.nombre],['Empresa',x=>x.empresa||'—'],['Teléfono',x=>[x.codigoPais,x.telefono].filter(Boolean).join(' ')||'—'],['',x=><button className="btn small outline" onClick={e=>{e.stopPropagation();setEdit({type:'provider',row:x});}}>Editar</button>]],'fechaActualizacion')}
      </Panel>;
      case 'mercancia': return <><Status feed={products}/><Status feed={inventory}/><Status feed={providers}/><Status feed={received}/><MerchandiseReceipt uid={uid} products={products.rows} inventory={inventory.rows} providers={providers.rows} records={received.rows} onSaved={setNotice}/></>;
      case 'robos': return <><Status feed={products}/><Status feed={inventory}/><Status feed={robberies}/><LossRegister uid={uid} products={products.rows} inventory={inventory.rows} records={robberies.rows} onSaved={setNotice}/></>;
      case 'etiquetas': return <Panel title="Etiquetas de productos" subtitle="Imprime las etiquetas y usa «Guardar como PDF» desde el navegador">
        <p className="muted">Esta versión incluye nombre, código y precio. El diseño avanzado de etiquetas de Android sigue siendo específico de la aplicación móvil.</p>
        <button className="btn primary" onClick={()=>window.print()}>🖨️ Imprimir / Guardar PDF</button>
        <div className="labels-print">{products.rows.map(p => <div className="label-print" key={p.docId}><strong>{p.nombre}</strong><span>{p.codigoBarras}</span><b>{money(p.precioVenta)}</b></div>)}</div>
      </Panel>;
      case 'ventasHoy':
      case 'cajaDia': return <><Status feed={sales}/><Status feed={cashOuts}/><Status feed={cuts}/><DailySales sales={sales.rows} cashOuts={cashOuts.rows} cuts={cuts.rows} onDetails={setDetail}/></>;
      case 'ventas': return <Panel title="Ventas del negocio" subtitle="Solo lectura: se registran y validan desde el flujo de caja autorizado" action={<button className="btn outline" onClick={()=>csvDownload('pos-init-ventas.csv',['Folio','Fecha','Importe','Método','Cajero'],sales.rows.map(v=>[v.id||v.docId,when(v.fechaHora),v.total,v.metodoPago,v.nombreUsuario]))}>↓ Exportar CSV</button>}>
        {rowTable(sales,[['Folio',x=><strong>#{String(x.id||x.docId).slice(0,10)}</strong>],['Fecha',x=>when(x.fechaHora)],['Cajero',x=>x.nombreUsuario||'—'],['Método',x=><span className="chip neutral">{x.metodoPago||'—'}</span>],['Productos',x=>x.cantidadProductos||x.productos?.length||0],['Total',x=><strong>{money(x.total)}</strong>]])}
      </Panel>;
      case 'retiros': return <Panel title="Retiros de caja" subtitle="Movimientos de efectivo registrados por el sistema">
        {rowTable(cashOuts,[['Fecha',x=>when(x.fechaHora)],['Cajero',x=>x.nombreUsuario||'—'],['Retiro',x=>money(x.monto)],['Saldo antes',x=>money(x.saldoAntes)],['Saldo después',x=>money(x.saldoDespues)]])}
      </Panel>;
      case 'cortes': return <Panel title="Cortes de caja" subtitle="Historial de cierres de efectivo por usuario">
        {rowTable(cuts,[['Fecha',x=>when(x.fechaHora)],['Usuario',x=>x.usuarioId||'—'],['Esperado',x=>money(x.totalEsperado)],['Contado',x=>money(x.totalContado)],['Diferencia',x=>money(x.diferencia)]])}
      </Panel>;
      case 'cierres': return <Panel title="Cierres de sesión" subtitle="Solicitudes y cierres registrados en POS Init Web">
        {rowTable(closings,[['Fecha',x=>when(x.fechaHora||x.fechaActualizacion)],['Cajero',x=>x.nombreUsuario||'—'],['Efectivo',x=>money(x.efectivoRegistrado)],['Estado',x=>x.estado||'—']])}
      </Panel>;
      case 'cajeros': return <Panel title="Usuarios y cajeros" subtitle="Consulta de personal de caja; los PIN se administran desde el flujo seguro de POS Init">
        {rowTable(cashiers,[['Nombre',x=>x.nombre],['Número',x=>x.numeroUsuario],['Activo',x=><span className={'chip '+(x.activo!==false?'success':'danger')}>{x.activo!==false?'Sí':'No'}</span>],['Creado',x=>when(x.fechaCreacion)]],'fechaCreacion')}
      </Panel>;
      case 'trabajadores': return <Panel title="Mis trabajadores" subtitle="Miembros de empresa registrados en la app móvil">
        {rowTable(workers,[['Nombre',x=>x.nombre||x.docId],['Rol',x=>x.rolId||'—'],['Activo',x=>x.activo?'Sí':'No'],['Identificador',x=>String(x.docId).slice(0,14)]],'fechaActualizacion')}
      </Panel>;
      case 'roles': return <Panel title="Roles y permisos" subtitle="Vista informativa. Los permisos se administran desde la app móvil para evitar cambios accidentales.">
        {rowTable(roles,[['Rol',x=>x.nombre||x.docId],['Permisos de lectura',x=>Object.keys(x.ver||{}).filter(k=>x.ver?.[k]).length],['Permisos de edición',x=>Object.keys(x.editar||{}).filter(k=>x.editar?.[k]).length]],'fechaActualizacion')}
      </Panel>;
      case 'reportes': return <><Status feed={sales}/><Status feed={received}/><Status feed={robberies}/><AdvancedStats sales={sales.rows} products={products.rows} inventory={inventory.rows} received={received.rows} robberies={robberies.rows}/></>;
      case 'categorias': return <CategoriesScreen uid={uid} products={products.rows} categories={categories.rows} loading={categories.loading} error={categories.error}/>;
      case 'existencias': return <Panel title="Estado de existencias" subtitle="Productos agotados, en mínimo y disponibles, actualizados en tiempo real"><Status feed={products}/><Status feed={inventory}/><div className="table-wrap"><table><thead><tr><th>Producto</th><th>Categoría</th><th>Unidades</th><th>Mínimo</th><th>Estado</th></tr></thead><tbody>{[...products.rows].sort((a,b)=>Number(stock.get(a.docId)?.stockActual||0)-Number(stock.get(b.docId)?.stockActual||0)).map(p=>{const st=stock.get(p.docId)||{};const n=Number(st.stockActual||0),min=Number(st.stockMinimo||0);return <tr key={p.docId}><td><strong>{p.nombre}</strong><small>{p.codigoBarras}</small></td><td>{p.categoria||'Sin categoría'}</td><td>{n}</td><td>{min}</td><td><span className={'chip '+(n<=min?'danger':'success')}>{stockStatusLabel(n, min)}</span></td></tr>})}</tbody></table></div></Panel>;
      case 'colores': return <><Status feed={settings}/><AppearancePanel theme={selectedTheme.id} mobileTheme={generalConfig.colorPrincipal} mobileAccent={generalConfig.colorIconos} premiumEnabled={premiumEnabled} benefitError={benefitError} busy={themeBusy} onSave={async next=>{setThemeBusy(true);try{await saveWebTheme(uid,next);setNotice('✅ Color aplicado a la web.');}catch(e){setNotice('❌ '+e.message);}finally{setThemeBusy(false);}}}/></>;
      case 'configuracion': {
        const general = settings.rows.find(x=>x.docId==='general') || {};
        return <Panel title="Configuración del negocio" subtitle="Ajustes compartidos con Android e iOS"><Status feed={settings}/><div className="settings-grid"><div className="settings-item"><span>Teléfono de contacto</span><strong>{general.telefonoContacto||'Sin configurar'}</strong></div><div className="settings-item"><span>Notificaciones</span><strong>{general.notificacionesActivas?'Activadas':'Desactivadas'}</strong></div><div className="settings-item"><span>Alertas por stock</span><strong>{general.notificacionesStock?'Activadas':'Desactivadas'}</strong></div><div className="settings-item"><span>Tema de la aplicación</span><strong>{general.tema||'Predeterminado'}</strong></div></div>
            <button className="btn primary" onClick={()=>setEdit({type:'settings',row:general})}>Editar ajustes compatibles</button><p className="muted small-note">Las compras premium, biometría y ajustes nativos de notificaciones continúan administrándose desde Android/iOS.</p></Panel>;
      }
      case 'spei': {
        const pay = settings.rows.find(x=>x.docId==='posInitPay') || {};
        return <Panel title="POS Init Pay · SPEI" subtitle="Datos bancarios utilizados por el punto de venta web"><Status feed={settings}/><div className="settings-grid"><div className="settings-item"><span>Banco</span><strong>{pay.banco||'No configurado'}</strong></div><div className="settings-item"><span>Titular</span><strong>{pay.titular||'No configurado'}</strong></div><div className="settings-item"><span>CLABE</span><strong>{pay.clabe?'•••• •••• •••• '+String(pay.clabe).slice(-4):'No configurada'}</strong></div><div className="settings-item"><span>Pagos con tarjeta</span><strong>Se administran por Stripe Connect</strong></div></div><button className="btn primary" onClick={()=>setEdit({type:'spei',row:pay})}>Configurar SPEI</button>
          <p className="message warn">Esta sección no confirma depósitos automáticamente. Siempre comprueba los movimientos reales en tu banco.</p></Panel>;
      }
      case 'cuenta': return <Panel title="Mi negocio" subtitle="Cuenta principal registrada en POS Init"><div className="settings-grid"><div className="settings-item"><span>Empresa</span><strong>{profile.nombreEmpresa||profile.nombreNegocio||'—'}</strong></div><div className="settings-item"><span>Correo del propietario</span><strong>{owner.email}</strong></div><div className="settings-item"><span>Código del negocio</span><strong>{profile.businessId}</strong></div><div className="settings-item"><span>Sincronización</span><strong>Activada</strong></div></div><button className="btn outline" onClick={()=>sendPasswordResetEmail(auth,owner.email).then(()=>setNotice('Te enviamos un correo de recuperación.')).catch(e=>setNotice(e.message))}>Solicitar cambio de contraseña</button></Panel>;
      case 'clientes': return <Panel title="Clientes" subtitle="Función disponible en Android"><p>El ZIP móvil utiliza una base local Room para clientes. No encontré una colección equivalente en las reglas compartidas de Firestore. Para evitar inventar información, esta pantalla no muestra datos ni los sincroniza todavía.</p><div className="message warn">Se requiere una migración segura de clientes locales antes de habilitar este módulo web.</div></Panel>;
      default: return null;
    }
  };

  const editor = () => {
    if (!edit) return null;
    switch (edit.type) {
      case 'product': return <ProductEditor key={edit.row?.docId || 'new'} product={edit.row} uid={uid} products={products.rows} categories={categories.rows} onSaved={setNotice} onClose={()=>setEdit(null)}/>;
      case 'stock': return <EditForm title={'Ajustar stock · '+edit.row.nombre} defaults={{stockActual:edit.stock?.stockActual??0,stockMinimo:edit.stock?.stockMinimo??0}} fields={[{name:'stockActual',label:'Unidades disponibles',type:'number',min:0,required:true},{name:'stockMinimo',label:'Mínimo permitido',type:'number',min:0,required:true}]} onClose={()=>setEdit(null)} onSave={v=>saveStock(uid,edit.row,v.stockActual,v.stockMinimo)}/>;
      case 'provider': return <EditForm title={edit.row?'Editar proveedor':'Nuevo proveedor'} defaults={{nombre:edit.row?.nombre||'',empresa:edit.row?.empresa||'',codigoPais:edit.row?.codigoPais||'+52',telefono:edit.row?.telefono||''}} fields={[{name:'nombre',label:'Nombre',required:true},{name:'empresa',label:'Empresa'},{name:'codigoPais',label:'Clave país'},{name:'telefono',label:'Teléfono'}]} onClose={()=>setEdit(null)} onSave={v=>saveProvider(uid,v,edit.row)}/>;
      case 'offer': return <OfferEditor edit={edit} uid={uid} close={()=>setEdit(null)}/>;
      case 'settings': return <EditForm title="Ajustes generales" defaults={{telefonoContacto:edit.row.telefonoContacto||'',notificacionesActivas:edit.row.notificacionesActivas?'1':'0',notificacionesStock:edit.row.notificacionesStock?'1':'0'}} fields={[{name:'telefonoContacto',label:'Teléfono de contacto'},{name:'notificacionesActivas',label:'Notificaciones (1=Sí, 0=No)'},{name:'notificacionesStock',label:'Avisos por stock (1=Sí, 0=No)'}]} onClose={()=>setEdit(null)} onSave={v=>saveSettings(uid,{telefonoContacto:v.telefonoContacto,notificacionesActivas:v.notificacionesActivas==='1',notificacionesStock:v.notificacionesStock==='1'})}/>;
      case 'spei': return <EditForm title="Configurar cuenta SPEI" defaults={{banco:edit.row.banco||'',titular:edit.row.titular||'',clabe:edit.row.clabe||''}} fields={[{name:'banco',label:'Banco',required:true},{name:'titular',label:'Titular de la cuenta',required:true},{name:'clabe',label:'CLABE de 18 dígitos',required:true}]} onClose={()=>setEdit(null)} onSave={v=>saveSpei(uid,v)}/>;
      default: return null;
    }
  };

  return <div className={'app-shell '+(selectedTheme.id==='negro'?'web-dark':'')} style={{'--accent':selectedTheme.accent,'--sidebar-color':selectedTheme.sidebar,'--page-background':selectedTheme.background}}>
    {navOpen && <button className="nav-backdrop" onClick={()=>setNavOpen(false)} aria-label="Cerrar menú"/>}
    <aside className={'sidebar '+(navOpen?'open':'')}><div className="sidebar-brand"><div className="logo">P</div><span><strong>POS Init</strong><small>WEB APP · ADMIN</small></span></div>
      <div className="business-chip"><div className="business-avatar">🏪</div><div><strong>{profile.nombreEmpresa||profile.nombreNegocio||'Mi negocio'}</strong><small>Propietario · {profile.businessId}</small></div></div>
      <nav className="sidebar-nav" aria-label="Navegación principal">{NAV.map(group=><div className="nav-group" key={group.title}><p>{group.title}</p>{group.children.map(([key,emoji,label])=><button key={key} className={'nav-item '+(screen===key?'active':'')} onClick={()=>navigate(key)}><span>{emoji}</span>{label}{screen===key?<b>●</b>:null}</button>)}</div>)}</nav>
      <button className="signout" onClick={()=>signOut(auth)}>↪ Cerrar sesión</button>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="left-top"><button className="menu-button" onClick={()=>setNavOpen(true)} aria-label="Abrir menú">☰</button><div><span className="crumb">POSInitWebApp / Administración</span><h2>{SECTION_NAME[screen]}</h2></div></div><div className="top-actions"><span className="online-pill">● En tiempo real</span><div className="user-circle" title={owner.email}>{owner.email?.charAt(0).toUpperCase()}</div></div></header>
      <div className="page-content">
        {!['inicio','reportes','configuracion','spei','cuenta','clientes','etiquetas'].includes(screen) && <div className="search-row"><label className="search-input">⌕ <input placeholder={'Buscar en '+SECTION_NAME[screen]?.toLowerCase()+'...'} value={search} onChange={e=>setSearch(e.target.value)}/></label><span className="sync-label">🔄 {activeFeed.error?'Sin conexión':activeFeed.fromCache?'Sincronización pendiente':'Sincronizado'}</span></div>}
        {notice && <div role="status" className="message info">{notice}</div>}
        {content()}
        <div className="bottom-note">POSInitWebApp · Administración privada · Android / iOS / Web</div>
      </div>
    </main>
    {editor()}
    {detail && <Modal title="Detalle del registro" onClose={()=>setDetail(null)}><div className="detail-list">{Object.entries(detail).filter(([k])=>k!=='docId' && !k.startsWith('_') ).map(([k,v])=><div key={k}><span>{k}</span><strong>{DATE_COLUMNS.includes(k)?when(v):Array.isArray(v)?JSON.stringify(v,null,2):typeof v==='object'?JSON.stringify(v):String(v??'—')}</strong></div>)}</div></Modal>}
  </div>;
}

function OfferEditor({ edit, uid, close }) {
  const [price,setPrice] = useState(edit.offer?.precioOferta || '');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const run = async job => {setBusy(true);setError('');try{await job();close();}catch(e){setError(e.message||'No se pudo guardar.');}finally{setBusy(false);}};
  return <Modal title={'Oferta · '+edit.row.nombre} onClose={close}>
    <p>Precio normal: <strong>{money(edit.row.precioVenta)}</strong></p><label className="field"><span>Precio especial</span><input type="number" min="0.01" step="0.01" value={price} onChange={e=>setPrice(e.target.value)}/></label>
    {error && <div className="message error">{error}</div>}
    <div className="form-actions"><button className="btn ghost" onClick={close}>Cancelar</button>{edit.offer?.activa&&<button disabled={busy} className="btn danger-button" onClick={()=>run(()=>disableOffer(uid,edit.row))}>Eliminar oferta</button>}<button disabled={busy} className="btn primary" onClick={()=>run(()=>saveOffer(uid,edit.row,price))}>{busy?'Guardando…':'Guardar oferta'}</button></div>
  </Modal>;
}
function numDate(x) { const v=x?.fechaHora;return typeof v?.toMillis==='function'?v.toMillis():Number(v||0); }
