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
  return <Section title={title} subtitle={sorted.length ? 'Datos calculados con el historial de ventas' : 'Sin movimientos en el periodo'}>
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


function SalesGraph({ rows, format }) {
  const [style,setStyle] = useState('linea');
  const width=740,height=238,paddingLeft=58,paddingTop=18,paddingBottom=35,paddingRight=20;
  const plotWidth=width-paddingLeft-paddingRight,plotHeight=height-paddingTop-paddingBottom;
  const max=Math.max(1,...rows.map(x=>Number(x.value)||0));
  const columns=rows.length;
  const step=plotWidth/Math.max(1,columns);
  const points=rows.map((row,i)=>{
    const x=paddingLeft+(i+.5)*step;
    const y=paddingTop+plotHeight-(Number(row.value)||0)/max*plotHeight;
    return {x,y,label:row.label,value:Number(row.value)||0};
  });
  const polyline=points.map(p=>p.x+','+p.y).join(' ');
  const labels=points.filter((_,i)=>i%Math.max(1,Math.ceil(columns/8))===0 || i===columns-1);
  return <section className="panel">
    <div className="panel-header"><div><h2>📈 Ventas a lo largo del periodo</h2><p>Compara la evolución de tus ingresos con gráficas de barras y línea.</p></div>
      <div className="period-options"><button type="button" className={'period-chip '+(style==='barras'?'selected':'')} onClick={()=>setStyle('barras')}>▥ Barras</button><button type="button" className={'period-chip '+(style==='linea'?'selected':'')} onClick={()=>setStyle('linea')}>⌁ Línea</button></div>
    </div>
    <div className="sales-chart" role="img" aria-label={'Gráfica de '+style+' de ingresos por periodo'}>
      <svg viewBox={'0 0 '+width+' '+height} preserveAspectRatio="xMidYMid meet">
        {[0,.25,.5,.75,1].map(f=>{
          const y=paddingTop+plotHeight*(1-f);
          return <g key={f}><line x1={paddingLeft} y1={y} x2={width-paddingRight} y2={y} stroke="#dce5f0" strokeDasharray="4 5"/><text x={paddingLeft-9} y={y+4} textAnchor="end" fontSize="12" fill="#64748b">{format(max*f)}</text></g>;
        })}
        {style==='linea' ? <>
          {points.length>1&&<polyline points={polyline} fill="none" stroke="var(--accent,#1559D6)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>}
          {points.filter((_,i)=>i%Math.max(1,Math.ceil(columns/34))===0).map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="3.3" fill="var(--accent,#1559D6)"><title>{p.label}: {format(p.value)}</title></circle>)}
        </> : points.map((p,i)=><rect key={i} x={p.x+1-step*.41} y={p.y} width={Math.max(2,step*.82-2)} height={Math.max(0,paddingTop+plotHeight-p.y)} rx="2" fill="var(--accent,#1559D6)"><title>{p.label}: {format(p.value)}</title></rect>)}
        {labels.map((p,i)=><text key={i} x={p.x} y={height-10} textAnchor="middle" fontSize="11" fill="#64748b">{p.label}</text>)}
      </svg>
    </div>
  </section>;
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
    <p className="muted">Periodo: {rangeLabel(values.start,values.end)} · Los datos se actualizan en tiempo real.</p>
    <div className="stats-highlights">
      {[['💰','Ingresos',money(values.incomes)],['🧾','Ventas',values.transactions],
        ['🎫','Ticket promedio',money(values.average)],['📦','Mercancía recibida',values.receivedUnits+' uds.'],
        ['📊','Variación',values.change===null?'Sin comparación':values.change.toFixed(1)+'%'],
        ['🏷️','Valor de inventario',money(values.inventoryValue)]].map(([icon,label,value])=>
        <div className="stats-highlight" key={label}><span>{icon} {label}</span><strong>{value}</strong></div>)}
    </div>
    <SalesGraph rows={values.chart} format={money}/>
    <div className="two-col">
      <Bars title="Ventas por periodo (barras)" rows={values.chart} format={money}/>
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

// Mismos 4 colores gratuitos y 28 colores premium que ColoresApp.kt de Android.
const FREE = [
 ['azul','Azul','#1559D6'],['celeste','Celeste','#29B6F6'],
 ['negro','Negro','#111111'],['blanco','Blanco','#FFFFFF'],
];
const PREMIUM = [
 ['rojo','Rojo','#E53935'],['verde','Verde','#43A047'],['morado','Morado','#8E24AA'],
 ['rosa','Rosa','#EC407A'],['naranja','Naranja','#FB8C00'],['amarillo','Amarillo','#FDD835'],
 ['turquesa','Turquesa','#00A896'],['cian','Cian','#00BCD4'],['indigo','Índigo','#3F51B5'],
 ['violeta','Violeta','#7E57C2'],['lima','Lima','#9CCC65'],['cafe','Café','#795548'],
 ['gris','Gris','#616161'],['gris_claro','Gris claro','#BDBDBD'],['azul_rey','Azul rey','#1565C0'],
 ['esmeralda','Esmeralda','#00A86B'],['coral','Coral','#FF6F61'],['dorado','Dorado','#D4AF37'],
 ['menta','Menta','#92D8BA'],['petroleo','Petróleo','#145765'],['terracota','Terracota','#C76C50'],
 ['lavanda','Lavanda','#C2A8E5'],['arena','Arena','#DABF91'],['vino','Vino','#7F2948'],
 ['durazno','Durazno','#FFB38D'],['acero','Acero','#52768C'],['oliva','Oliva','#778449'],
 ['marfil','Marfil','#FFF4DA'],
];
export const WEB_THEMES = [
  ...FREE.map(([id,label,swatch])=>({id,label,swatch,accent:id==='blanco'?'#334155':swatch,sidebar:id==='negro'?'#111827':'#102449',background:id==='negro'?'#182334':'#f2f5fa',premium:false})),
  ...PREMIUM.map(([id,label,swatch])=>({id,label,swatch,accent:swatch,sidebar:'#102449',background:'#f2f5fa',premium:true})),
];
export const themeById = id => WEB_THEMES.find(x=>x.id===id) || WEB_THEMES[0];

export function AppearancePanel({ theme, mobileTheme, mobileAccent, premiumEnabled, benefitError, onSave, busy=false }) {
  return <section className="panel">
    <div className="panel-header"><div><h2>🎨 Colores de POS Init</h2><p>La misma paleta de Android e iOS. Los colores premium necesitan estar habilitados en la cuenta.</p></div></div>
    <h3>Colores básicos · Gratis</h3>
    <div className="mobile-palette">{WEB_THEMES.filter(t=>!t.premium).map(t=><button key={t.id} type="button" disabled={busy} onClick={()=>onSave(t.id)} className={'palette-choice '+(theme===t.id?'active':'')} aria-pressed={theme===t.id}>
      <span className="palette-color" style={{background:t.swatch}}/><strong>{t.label}</strong>{theme===t.id&&<small>✓ Actual</small>}
    </button>)}</div>
    <h3>Color Init · 28 colores premium</h3>
    {benefitError&&<div className="message warn">No se pudo verificar el beneficio de colores; solo puedes usar los colores gratuitos.</div>}
    {!premiumEnabled&&<p className="message info">🔒 Desbloquéalos desde la aplicación móvil. Si ya compraste Color Init, inicia sesión con la misma cuenta del propietario.</p>}
    {premiumEnabled&&<p className="message info">✅ Color Init habilitado para esta cuenta. También puedes utilizar los colores premium en la web.</p>}
    <div className="mobile-palette">{WEB_THEMES.filter(t=>t.premium).map(t=><button key={t.id} type="button" disabled={busy||!premiumEnabled} onClick={()=>onSave(t.id)} className={'palette-choice '+(theme===t.id?'active':'')} aria-pressed={theme===t.id} title={!premiumEnabled?'Disponible con Color Init':t.label}>
      <span className="palette-color" style={{background:t.swatch}}/>{!premiumEnabled&&<span className="lock-overlay">🔒</span>}
      <strong>{t.label}</strong>{theme===t.id&&<small>✓ Actual</small>}
    </button>)}</div>
    <div className="settings-grid"><div className="settings-item"><span>Color principal del móvil</span><strong>{mobileTheme||'Azul'}</strong></div><div className="settings-item"><span>Color de iconos móvil</span><strong>{mobileAccent||'Azul'}</strong></div></div>
  </section>;
}
