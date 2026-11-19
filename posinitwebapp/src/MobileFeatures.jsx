import { useMemo, useState } from 'react';
import { money, csvDownload } from './data';

function dateMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value === 'string' && Number.isNaN(Number(value))) return Date.parse(value) || 0;
  return Number(value) || 0;
}
const integer = value => Number(value || 0);
const sum = (items, field) => items.reduce((v, item) => v + integer(item[field]), 0);
const chartColor = ['#2d63df', '#22a0a0', '#ef9c33', '#8b5bd7', '#ea647c', '#7f92aa'];

function Section({ title, subtitle, children }) {
  return <section className="panel"><div className="panel-header"><div><h2>{title}</h2><p>{subtitle}</p></div></div>{children}</section>;
}
function Bars({ title, rows, format = String }) {
  const sorted = [...rows].sort((a,b)=>b.value-a.value).slice(0,8);
  const max = Math.max(1,...sorted.map(x=>x.value));
  return <Section title={title} subtitle={sorted.length ? 'Datos calculados con el historial de Firebase' : 'Sin movimientos en el periodo'}>
    <div className="metric-bars">
      {sorted.map((v,i)=><div className="metric-row" key={v.label+'-'+i}>
        <div className="metric-label"><span>{v.label}</span><strong>{format(v.value)}</strong></div>
        <div className="metric-track"><div style={{width:Math.max(v.value/max*100,v.value>0?1.5:0)+'%',background:chartColor[i%chartColor.length]}}/></div>
      </div>)}
      {!sorted.length && <p className="muted">Aún no hay datos que mostrar.</p>}
    </div>
  </Section>;
}
function timestampOf(item) { return dateMs(item.fechaHora || item.fecha || item.creadoEn || item.fechaActualizacion); }
function getRange(period, anchor) {
  const start = new Date(anchor+'T00:00:00');
  if (Number.isNaN(start.getTime())) start.setTime(Date.now());
  if (period==='Semana') start.setDate(start.getDate()-((start.getDay()+6)%7));
  if (period==='Mes') start.setDate(1);
  if (period==='Año') {start.setMonth(0);start.setDate(1);}
  start.setHours(0,0,0,0);
  const end = new Date(start);
  if(period==='Día') end.setDate(end.getDate()+1);
  if(period==='Semana') end.setDate(end.getDate()+7);
  if(period==='Mes') end.setMonth(end.getMonth()+1);
  if(period==='Año') end.setFullYear(end.getFullYear()+1);
  return [start.getTime(),end.getTime()];
}
function rangeLabel(a,b) { return new Date(a).toLocaleDateString('es-MX')+' — '+new Date(b-1).toLocaleDateString('es-MX'); }
function shiftDate(ms,period,delta) {
  const d=new Date(ms);
  if(period==='Día') d.setDate(d.getDate()+delta);
  if(period==='Semana') d.setDate(d.getDate()+delta*7);
  if(period==='Mes') d.setMonth(d.getMonth()+delta);
  if(period==='Año') d.setFullYear(d.getFullYear()+delta);
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
}

function salesBreakdown(current, productNames) {
  const ranking = new Map(), categories = new Map(), payment = new Map(), cashiers = new Map();
  for (const sale of current) {
    const total = integer(sale.total);
    const method = sale.metodoPago || 'Sin clasificar';
    payment.set(method, (payment.get(method) || 0) + total);
    const cashier = sale.nombreUsuario || 'Sin usuario';
    cashiers.set(cashier, (cashiers.get(cashier) || 0) + total);
    const lineItems = Array.isArray(sale.productos) ? sale.productos : [];
    for (const item of lineItems) {
      const product = productNames.get(String(item.productoId || item.id));
      const name = item.nombre || product?.nombre || 'Artículo';
      const count = integer(item.cantidad);
      ranking.set(name, (ranking.get(name) || 0) + count);
      const category = product?.categoria || 'Sin categoría';
      const partial = Number.isFinite(Number(item.subtotal))
        ? Number(item.subtotal) : count * integer(item.precio);
      categories.set(category, (categories.get(category) || 0) + partial);
    }
  }
  return { ranking, categories, payment, cashiers };
}
function numberOfChartBars(period, length) {
  if (period === 'Día') return 24;
  if (period === 'Año') return 12;
  if (period === 'Semana') return 7;
  return Math.max(28, Math.round(length / 86400000));
}
function chartForPeriod(current, period, start, length) {
  const chart = [];
  const barCount = numberOfChartBars(period, length);
  for (let i = 0; i < barCount; i++) {
    let a, b, label;
    if (period === 'Día') {
      a = start + i * 3600000; b = a + 3600000;
      label = String(i).padStart(2, '0') + 'h';
    } else if (period === 'Año') {
      a = new Date(new Date(start).getFullYear(), i, 1).getTime();
      b = new Date(new Date(start).getFullYear(), i + 1, 1).getTime();
      label = new Date(a).toLocaleDateString('es-MX', { month: 'short' });
    } else {
      a = new Date(start);
      a.setDate(a.getDate() + i);
      a = a.getTime();
      b = new Date(a);
      b.setDate(b.getDate() + 1);
      label = new Date(a).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' });
    }
    const value = current.filter(s => timestampOf(s) >= a && timestampOf(s) < b)
      .reduce((v, s) => v + integer(s.total), 0);
    chart.push({ label, value });
  }
  return chart;
}

export function AdvancedStats({ sales, products, inventory, received, robberies }) {
  const [period,setPeriod]=useState('Mes');
  const [anchor,setAnchor]=useState(()=>new Date().toLocaleDateString('en-CA'));
  const values=useMemo(()=>{
    const [start,end]=getRange(period,anchor);
    const length=end-start;
    const current=sales.filter(x=>timestampOf(x)>=start && timestampOf(x)<end);
    const previous=sales.filter(x=>timestampOf(x)>=start-length && timestampOf(x)<start);
    const incomes=sum(current,'total'), before=sum(previous,'total');
    const productNames=new Map(products.map(x=>[String(x.id||x.docId),x]));
    const { ranking, categories, payment, cashiers } = salesBreakdown(current, productNames);
    const periodReceipts=received.filter(r=>timestampOf(r)>=start && timestampOf(r)<end);
    const periodRobberies=robberies.filter(r=>timestampOf(r)>=start && timestampOf(r)<end);
    const chart = chartForPeriod(current, period, start, length);
    const stocks=inventory.filter(x=>products.some(p=>String(p.id||p.docId)===String(x.productoId||x.docId)));
    const inventoryValue=stocks.reduce((v,x)=>v+integer(x.stockActual)*integer(productNames.get(String(x.productoId||x.docId))?.precioVenta),0);
    return {
      start,end,incomes,before,transactions:current.length,average:current.length?incomes/current.length:0,
      change:before?((incomes-before)/before*100):null,
      ranking:[...ranking].map(([label,value])=>({label,value})),
      categories:[...categories].map(([label,value])=>({label,value})),
      payment:[...payment].map(([label,value])=>({label,value})),
      cashiers:[...cashiers].map(([label,value])=>({label,value})),
      chart,receiptCount:periodReceipts.length,receivedUnits:sum(periodReceipts,'cantidadRecibida'),
      robberyCount:periodRobberies.length, inventoryValue,
      missing:stocks.filter(x=>integer(x.stockActual)===0).length,
      low:stocks.filter(x=>integer(x.stockActual)>0&&integer(x.stockActual)<=integer(x.stockMinimo)).length,
      available:stocks.filter(x=>integer(x.stockActual)>integer(x.stockMinimo)).length,
    };
  },[sales,products,inventory,received,robberies,period,anchor]);
  const exportar=()=>csvDownload('posinit-estadisticas-'+period.toLowerCase()+'.csv',
    ['Indicador','Valor'],[['Periodo',rangeLabel(values.start,values.end)],['Ingresos',values.incomes],['Ventas',values.transactions],['Ticket promedio',values.average],['Mercancía recibida',values.receivedUnits],['Valor inventario',values.inventoryValue]]);
  return <div className="extended-page">
    <div className="period-toolbar"><div className="period-options">{['Día','Semana','Mes','Año'].map(p=>
      <button type="button" key={p} className={'period-chip '+(p===period?'selected':'')} onClick={()=>setPeriod(p)}>{p}</button>)}</div>
      <input aria-label="Fecha del informe" type="date" value={anchor} onChange={e=>setAnchor(e.target.value)}/>
      <button type="button" className="btn outline" onClick={()=>setAnchor(shiftDate(values.start,period,-1))}>‹ Anterior</button>
      <button type="button" className="btn outline" onClick={()=>setAnchor(new Date().toLocaleDateString('en-CA'))}>Actual</button>
      <button type="button" className="btn outline" onClick={()=>setAnchor(shiftDate(values.start,period,1))}>Siguiente ›</button>
      <button type="button" className="btn primary" onClick={exportar}>↓ CSV</button>
    </div>
    <p className="muted">Periodo: {rangeLabel(values.start,values.end)} · Los datos se actualizan desde Firestore.</p>
    <div className="stats-highlights">
      {[['💰','Ingresos',money(values.incomes)],['🧾','Ventas',values.transactions],
        ['🎫','Ticket promedio',money(values.average)],['📦','Mercancía recibida',values.receivedUnits+' uds.'],
        ['📊','Variación',values.change===null?'Sin comparación':values.change.toFixed(1)+'%'],
        ['🏷️','Valor de inventario',money(values.inventoryValue)]].map(([icon,label,value])=>
        <div className="stats-highlight" key={label}><span>{icon} {label}</span><strong>{value}</strong></div>)}
    </div>
    <div className="two-col">
      <Bars title="Ritmo de ventas" rows={values.chart} format={money}/>
      <Bars title="Productos más vendidos" rows={values.ranking}/>
      <Bars title="Ingresos por categoría" rows={values.categories} format={money}/>
      <Bars title="Ventas por forma de pago" rows={values.payment} format={money}/>
      <Bars title="Ingresos por cajero" rows={values.cashiers} format={money}/>
      <Section title="Salud del inventario" subtitle="Existencias actuales, con independencia del periodo">
        <div className="inventory-health"><div><strong>{values.missing}</strong><span>Agotados</span></div><div><strong>{values.low}</strong><span>Stock bajo</span></div><div><strong>{values.available}</strong><span>Disponibles</span></div></div>
        <p className="muted">Registros de incidencias en el periodo: {values.robberyCount}</p>
        <p className="muted">Recepciones: {values.receiptCount} · {values.receivedUnits} unidades</p>
      </Section>
    </div>
  </div>;
}

export const WEB_THEMES = [
  {id:'azul',label:'Azul POS Init',accent:'#1559D6',sidebar:'#102449',background:'#f2f5fa'},
  {id:'celeste',label:'Celeste',accent:'#29B6F6',sidebar:'#113e5c',background:'#f2f9fe'},
  {id:'verde',label:'Verde',accent:'#24855b',sidebar:'#153c32',background:'#f0f9f4'},
  {id:'morado',label:'Violeta',accent:'#7454c5',sidebar:'#26204b',background:'#f6f3fe'},
  {id:'naranja',label:'Naranja',accent:'#d46b20',sidebar:'#4f321f',background:'#fff8f1'},
  {id:'oscuro',label:'Modo oscuro',accent:'#5294fa',sidebar:'#111827',background:'#1c273a'},
];
export const themeById = id => WEB_THEMES.find(x=>x.id===id) || WEB_THEMES[0];

export function AppearancePanel({ theme, mobileTheme, mobileAccent, onSave, busy=false }) {
  return <section className="panel">
    <div className="panel-header"><div><h2>🎨 Colores de POS Init WebApp</h2><p>Personaliza la interfaz web sin modificar las compras premium de Android/iOS.</p></div></div>
    <div className="theme-grid">{WEB_THEMES.map(t=><button key={t.id} type="button" disabled={busy}
      onClick={()=>onSave(t.id)} className={'theme-choice '+(t.id===theme?'active':'')} aria-pressed={t.id===theme}>
      <span className="theme-preview" style={{background:t.background}}><i style={{background:t.sidebar}}/><b style={{background:t.accent}}/></span>
      <strong>{t.label}</strong>{t.id===theme&&<span>✓ Seleccionado</span>}
    </button>)}</div>
    <p className="message info">Configuración guardada solo para POSInitWebApp (web). Android e iOS conservan sus temas y beneficios de Color Init.</p>
    <div className="settings-grid"><div className="settings-item"><span>Tema configurado en el móvil</span><strong>{mobileTheme||'Predeterminado'}</strong></div><div className="settings-item"><span>Color principal del móvil</span><strong>{mobileAccent||'Azul'}</strong></div></div>
  </section>;
}

export function CategorySummary({ products, onProducts }) {
  const rows=Object.entries(products.reduce((acc,p)=>{const k=p.categoria||'Sin categoría';acc[k]=(acc[k]||0)+1;return acc;},{})).sort((a,b)=>b[1]-a[1]);
  return <Section title="Categorías del catálogo" subtitle="Resumen de las categorías ya asignadas a los productos de Android/iOS">
    <div className="category-grid">{rows.map(([name,count])=><button className="category-item" onClick={onProducts} key={name}>
      <span>🏷️</span><strong>{name}</strong><small>{count} productos</small>
    </button>)}{!rows.length && <p className="muted">Registra productos para ver sus categorías.</p>}</div>
    <p className="message info">Las categorías creadas en la colección móvil independiente requieren sus reglas propias de Firestore; este resumen no modifica esa colección.</p>
  </Section>;
}
