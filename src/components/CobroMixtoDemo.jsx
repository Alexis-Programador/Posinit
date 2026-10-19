
ayer 16:26

Se ha pegado el código(20261017-222605).js
JavaScript

Texto pegado (2)(2).txt
Documento


Se ha pegado el código(20261018-224946).js
JavaScript


Se ha pegado el código(20261018-231250).js
JavaScript
este es mi codigo 


Pegado text(20261018-232420).txt
Documento


Se ha pegado el código(20261018-233057).js
JavaScript


Pegado text(20261018-233309).txt
Documento
damelas y aqui esat ventas por si vas a cambiar  import React, { useMemo, useState } from 'react'; 
 
// DEMO VISUAL: no cobra tarjetas, no crea ventas, no modifica inventario. 
// Puedes importarlo temporalmente en una ruta/pantalla de pruebas. 
const centavos = v => Math.max(0, Math.round((Number(v) || 0) * 100)); 
const pesos = v => (v / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }); 
const nuevaFila = (tipo = 'efectivo') => ({ id: globalThis.crypto?.randomUUID?.() || ${Date.now()}-${Math.random()}, tipo, importe: '' }); 
 
export default function CobroMixtoDemo({ total = 600, onCerrar = () => {} }) { 
  const [filas, setFilas] = useState([nuevaFila()]); 
  const [seleccionada, setSeleccionada] = useState(0); 
  const [aviso, setAviso] = useState(''); 
  const totalC = centavos(total); 
  const abonadoC = useMemo(() => filas.reduce((s, f) => s + centavos(f.importe), 0), [filas]); 
  const restanteC = Math.max(0, totalC - abonadoC); 
  const excesoC = Math.max(0, abonadoC - totalC); 
  const tarjetaInvalida = filas.some(f => f.tipo === 'tarjeta' && centavos(f.importe) > 0 && centavos(f.importe) < 1000); 
  const valido = totalC > 0 && restanteC === 0 && !tarjetaInvalida && filas.every(f => centavos(f.importe) > 0) && !(excesoC && filas.some(f => f.tipo === 'tarjeta')); 
  const actualizar = (id, cambios) => setFilas(a => a.map(f => f.id === id ? { ...f, ...cambios } : f)); 
  const agregar = tipo => { setFilas(a => [...a, nuevaFila(tipo)]); setSeleccionada(filas.length); setAviso(''); }; 
  const quitar = id => { setFilas(a => a.length > 1 ? a.filter(f => f.id !== id) : a); setSeleccionada(0); }; 
  const cambiarTipo = (id, tipo) => actualizar(id, { tipo }); 
  const teclas = e => { 
    if (e.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return; 
    if (e.key === '+') { e.preventDefault(); agregar('efectivo'); } 
    if (e.key === '-') { e.preventDefault(); agregar('tarjeta'); } 
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { 
      e.preventDefault(); const i = Math.max(0, Math.min(filas.length - 1, seleccionada + (e.key === 'ArrowDown' ? 1 : -1))); 
      setSeleccionada(i); 
    } 
    if (e.key === 'Escape') onCerrar(); 
  }; 
  return <div onKeyDown={teclas} tabIndex={0} style={{ minHeight:'100vh', background:'#dfe9f6', display:'grid', placeItems:'center', padding:16, fontFamily:'system-ui, sans-serif', color:'#12203c' }}> 
    <section style={{ width:'min(760px, 100%)', maxHeight:'94vh', overflow:'auto', background:'#fff', borderRadius:22, boxShadow:'0 20px 65px #20334b44', padding:24 }}> 
      <header style={{ display:'flex', justifyContent:'space-between', alignItems:'start', gap:12 }}><div><h2 style={{ margin:'0 0 5px' }}>🛒 Cobrar venta</h2><span style={{ color:'#63748f' }}>Divide el pago entre efectivo y tantas tarjetas como necesites.</span></div><button onClick={onCerrar} aria-label="Cerrar">✕</button></header> 
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', margin:'18px 0', padding:'16px 18px', background:'#eaf3ff', borderRadius:14 }}><b>Total a pagar</b><strong style={{ fontSize:27, color:'#075cdd' }}>{pesos(totalC)}</strong></div> 
      <h3 style={{ margin:'12px 0' }}>Métodos de pago</h3> 
      {filas.map((f, i) => <div key={f.id} onClick={() => setSeleccionada(i)} style={{ border: seleccionada === i ? '2px solid #1672f5' : '1px solid #d9e3ef', background:f.tipo === 'efectivo' ? '#effcf5' : '#eef5ff', borderRadius:14, padding:13, marginBottom:10 }}> 
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}> 
          <b style={{ minWidth:90 }}>{f.tipo === 'efectivo' ? '💵 Efectivo' : 💳 Tarjeta ${filas.slice(0,i+1).filter(x=>x.tipo==='tarjeta').length}}</b> 
          <select aria-label={Método ${i+1}} value={f.tipo} onChange={e => cambiarTipo(f.id,e.target.value)} style={{ padding:9, borderRadius:9, border:'1px solid #cbd7e6' }}><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta (Stripe)</option></select> 
          <input aria-label={Importe ${i+1}} type="number" inputMode="decimal" min="0" step="0.01" placeholder="Importe $" value={f.importe} onChange={e => actualizar(f.id, { importe:e.target.value })} style={{ flex:'1 1 140px', minWidth:110, padding:10, borderRadius:9, border:'1px solid #cbd7e6', fontSize:17 }} /> 
          <button onClick={() => quitar(f.id)} disabled={filas.length === 1} title="Quitar método">✕</button> 
        </div> 
        {f.tipo === 'tarjeta' && <small style={{ display:'block', marginTop:8, color:centavos(f.importe)>0&&centavos(f.importe)<1000?'#b45309':'#526684' }}>{centavos(f.importe)>0&&centavos(f.importe)<1000?'⚠️ Stripe requiere al menos $10.00 MXN por tarjeta.':'🔒 El QR individual se habilitará al integrar el Worker y la verificación de Stripe.'}</small>} 
      </div>)} 
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', margin:'14px 0' }}><button onClick={()=>agregar('efectivo')} style={botonClaro}>＋ Agregar efectivo</button><button onClick={()=>agregar('tarjeta')} style={botonClaro}>＋ Agregar tarjeta</button></div> 
      <div style={{ background:'#f2f6fc', borderRadius:14, padding:16, display:'grid', gap:9 }}><div style={fila}><span>Distribuido</span><b>{pesos(abonadoC)}</b></div><div style={fila}><span>Restante</span><b style={{color:restanteC?'#b45309':'#059669'}}>{pesos(restanteC)}</b></div>{excesoC>0&&<div style={fila}><span>Excedente {filas.every(f=>f.tipo==='efectivo')?'(posible cambio)':'(no permitido en tarjeta)'}</span><b>{pesos(excesoC)}</b></div>}</div> 
      <p style={{ color:'#95501b', background:'#fff2df', borderRadius:12, padding:12, fontSize:13 }}>🧾 Los pagos combinados no deben imprimir automáticamente. Esta pantalla es una <b>demostración</b>: todavía no genera QR, no procesa cargos y no registra ventas.</p> 
      {aviso&&<p role="status" style={{ color:'#1255a3' }}>{aviso}</p>} 
      <footer style={{ display:'flex', gap:10 }}><button onClick={onCerrar} style={{...botonClaro, flex:1}}>Cancelar</button><button disabled={!valido} onClick={()=>setAviso('Distribución correcta. Falta integrar el cobro real y la confirmación segura de cada tarjeta.')} style={{ flex:2, background:valido?'#075ff0':'#9daec7', color:'#fff', border:0, padding:14, borderRadius:12, fontWeight:700, cursor:valido?'pointer':'not-allowed' }}>✓ Validar distribución (demo)</button></footer> 
      <small style={{ display:'block', marginTop:12, color:'#68788c' }}>Atajos fuera de los campos: + efectivo · - tarjeta · ↑/↓ seleccionar · Esc cerrar</small> 
    </section> 
  </div>; 
} 
const fila={ display:'flex', justifyContent:'space-between' }; 
const botonClaro={ background:'#eef4fc', border:'1px solid #cbd9ed', borderRadius:12, padding:'12px 14px', cursor:'pointer', fontWeight:650 }; 
      y aqui esta cobro mixto

¡Listo! 💻 Te preparé las dos vistas previas con el código completo, para que puedas abrirlas, revisarlas y copiar el código sin descargar un ZIP.

🔥 1. Reglas de Firebase Firestore
483 líneas de código.

👉 

⚡ 2. Cloudflare Worker — POS Init Pay
1,189 líneas de código.

👉 

✅ ¿Qué incluyen las vistas previas?
Código completo, sin recortes.

Formato para leerlo cómodamente.

Botón «Copiar código completo».

No necesitas instalar nada.

⚠️ Importante: Son las versiones preparatorias que tenemos actualmente. Todavía no implementan por completo los cobros combinados con varias tarjetas, así que no reemplaces las versiones publicadas todavía.






ya ahora?

Ahora sigue activar el cobro combinado real en POS Init. 🚀

Ya tenemos las vistas previas de las reglas de Firebase y del Worker. Sin embargo, todavía no debes publicarlas como una integración terminada.

🔧 Lo que falta
CobroMixtoDemo.jsx: convertir la demostración en un sistema que genere un QR independiente por cada tarjeta.

ModalCobro.jsx: conectar el cobro combinado con POS Init Pay.

Ventas.jsx: registrar una sola venta cuando todos los pagos estén confirmados, descontando el inventario una sola vez.

Worker y Firebase: adaptar la validación de pagos parciales y evitar cobros duplicados.

Caja y tickets: registrar por separado cuánto se recibió en efectivo y cuánto con tarjeta.

💳 Así debe funcionar
Supongamos una venta de $600:

Pago	Importe	Estado
💵 Efectivo	$30	Registrado
💳 Tarjeta 1	$250	✅ Confirmado por Stripe
💳 Tarjeta 2	$320	⏳ Pendiente
Restante	$320	
Si falla la segunda tarjeta, los $250 de la primera permanecen registrados como pago confirmado. La venta y el descuento de inventario siguen pendientes.

Cuando se complete el pago, se registra una sola venta de $600.

✅ Siguiente paso
Voy a trabajar sobre los archivos completos que me compartiste, no sobre versiones simplificadas.

Primero debemos terminar la lógica de pagos y las validaciones del Worker y Firestore; después conectar las pantallas. Así evitamos que el sistema registre ventas incompletas o cobre dos veces.

Y te entregaré los archivos completos en vistas previas, como los anteriores, sin obligarte a descargar un ZIP.


dale lo que sigue

¡Seguimos con POS Init! 🚀

Ya preparé la siguiente versión completa de CobroMixtoDemo.jsx, conservando el diseño que me enviaste.

👁️ Vista previa del archivo completo

La vista previa incluye un botón para copiar todo el código.

✅ Cambios realizados
+ agrega un pago en efectivo.

- agrega un pago con tarjeta.

↑ / ↓ permiten seleccionar métodos de pago.

Enter valida y bloquea la distribución.

Escape cierra la pantalla.

Puedes desbloquear la distribución para corregir importes.

Se mantiene la validación del importe mínimo de $10 por tarjeta.

⚠️ Estado de la integración
Esta versión mejora la interfaz, pero todavía es una demostración: no genera cargos de Stripe ni registra ventas.

Para convertirla en un cobro real, falta conectar los pagos individuales con el Worker y modificar la transacción de Ventas.jsx para verificar todos los pagos antes de registrar la venta.

No reemplaces todavía tu versión publicada. La siguiente parte crítica es la integración de pagos reales, no solamente la pantalla.

<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>POS Init — CobroMixtoDemo.jsx</title><style>body{background:#0b1220;color:#e2e8f0;font:15px system-ui;margin:0;padding:24px}main{max-width:1100px;margin:auto}h1{font-size:24px}p{color:#aabbd2}button{padding:12px 18px;border:0;border-radius:10px;background:#3b82f6;color:white;font-weight:bold;cursor:pointer}pre{background:#101b30;padding:20px;overflow:auto;line-height:1.55;border-radius:12px;white-space:pre}code{font:13px Consolas,monospace}</style></head><body><main><h1>💵💳 POS Init — CobroMixtoDemo.jsx</h1><p>Archivo completo actualizado. Es una demostración; no crea pagos ni ventas.</p><button onclick="navigator.clipboard.writeText(document.querySelector('code').textContent).then(()=>alert('Código copiado'))">Copiar código completo</button><pre><code>import React, { useEffect, useMemo, useRef, useState } from &#x27;react&#x27;;

// DEMO VISUAL: no cobra tarjetas, no crea ventas, no modifica inventario.
// Puedes importarlo temporalmente en una ruta/pantalla de pruebas.
const centavos = v =&gt; Math.max(0, Math.round((Number(v) || 0) * 100));
const pesos = v =&gt; (v / 100).toLocaleString(&#x27;es-MX&#x27;, { style: &#x27;currency&#x27;, currency: &#x27;MXN&#x27; });
const nuevaFila = (tipo = &#x27;efectivo&#x27;) =&gt; ({ id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, tipo, importe: &#x27;&#x27; });

export default function CobroMixtoDemo({ total = 600, onCerrar = () =&gt; {} }) {
  const [filas, setFilas] = useState([nuevaFila()]);
  const contenedorRef = useRef(null);
  const [planBloqueado, setPlanBloqueado] = useState(false);
  const [seleccionada, setSeleccionada] = useState(0);
  const [aviso, setAviso] = useState(&#x27;&#x27;);
  const totalC = centavos(total);
  const abonadoC = useMemo(() =&gt; filas.reduce((s, f) =&gt; s + centavos(f.importe), 0), [filas]);
  const restanteC = Math.max(0, totalC - abonadoC);
  const excesoC = Math.max(0, abonadoC - totalC);
  const tarjetaInvalida = filas.some(f =&gt; f.tipo === &#x27;tarjeta&#x27; &amp;&amp; centavos(f.importe) &gt; 0 &amp;&amp; centavos(f.importe) &lt; 1000);
  const valido = totalC &gt; 0 &amp;&amp; restanteC === 0 &amp;&amp; !tarjetaInvalida &amp;&amp; filas.every(f =&gt; centavos(f.importe) &gt; 0) &amp;&amp; !(excesoC &amp;&amp; filas.some(f =&gt; f.tipo === &#x27;tarjeta&#x27;));
  const actualizar = (id, cambios) =&gt; {
    if (planBloqueado) return;
    setFilas(a =&gt; a.map(f =&gt; f.id === id ? { ...f, ...cambios } : f));
  };
  const agregar = tipo =&gt; { if (planBloqueado) return; setFilas(a =&gt; [...a, nuevaFila(tipo)]); setSeleccionada(filas.length); setAviso(&#x27;&#x27;); };
  const quitar = id =&gt; { if (planBloqueado) return; setFilas(a =&gt; a.length &gt; 1 ? a.filter(f =&gt; f.id !== id) : a); setSeleccionada(0); };
  const cambiarTipo = (id, tipo) =&gt; actualizar(id, { tipo });
  const teclas = e =&gt; {
    if (e.target instanceof HTMLElement &amp;&amp; [&#x27;INPUT&#x27;, &#x27;SELECT&#x27;, &#x27;TEXTAREA&#x27;].includes(e.target.tagName)) return;
    if (e.key === &#x27;+&#x27;) { e.preventDefault(); agregar(&#x27;efectivo&#x27;); }
    if (e.key === &#x27;-&#x27;) { e.preventDefault(); agregar(&#x27;tarjeta&#x27;); }
    if (e.key === &#x27;ArrowDown&#x27; || e.key === &#x27;ArrowUp&#x27;) {
      e.preventDefault(); const i = Math.max(0, Math.min(filas.length - 1, seleccionada + (e.key === &#x27;ArrowDown&#x27; ? 1 : -1)));
      setSeleccionada(i);
    }
    if (e.key === &#x27;Escape&#x27;) onCerrar();
    if (e.key === &#x27;Enter&#x27; &amp;&amp; valido &amp;&amp; !planBloqueado) { e.preventDefault(); setPlanBloqueado(true); setAviso(&#x27;Distribución bloqueada para revisión. No se ha cobrado ninguna tarjeta.&#x27;); }
  };
  useEffect(() =&gt; { contenedorRef.current?.focus(); }, []);
  return &lt;div ref={contenedorRef} onKeyDown={teclas} tabIndex={0} style={{ minHeight:&#x27;100vh&#x27;, background:&#x27;#dfe9f6&#x27;, display:&#x27;grid&#x27;, placeItems:&#x27;center&#x27;, padding:16, fontFamily:&#x27;system-ui, sans-serif&#x27;, color:&#x27;#12203c&#x27; }}&gt;
    &lt;section style={{ width:&#x27;min(760px, 100%)&#x27;, maxHeight:&#x27;94vh&#x27;, overflow:&#x27;auto&#x27;, background:&#x27;#fff&#x27;, borderRadius:22, boxShadow:&#x27;0 20px 65px #20334b44&#x27;, padding:24 }}&gt;
      &lt;header style={{ display:&#x27;flex&#x27;, justifyContent:&#x27;space-between&#x27;, alignItems:&#x27;start&#x27;, gap:12 }}&gt;&lt;div&gt;&lt;h2 style={{ margin:&#x27;0 0 5px&#x27; }}&gt;🛒 Cobrar venta&lt;/h2&gt;&lt;span style={{ color:&#x27;#63748f&#x27; }}&gt;Divide el pago entre efectivo y tantas tarjetas como necesites.&lt;/span&gt;&lt;/div&gt;&lt;button onClick={onCerrar} aria-label=&quot;Cerrar&quot;&gt;✕&lt;/button&gt;&lt;/header&gt;
      &lt;div style={{ display:&#x27;flex&#x27;, justifyContent:&#x27;space-between&#x27;, alignItems:&#x27;center&#x27;, margin:&#x27;18px 0&#x27;, padding:&#x27;16px 18px&#x27;, background:&#x27;#eaf3ff&#x27;, borderRadius:14 }}&gt;&lt;b&gt;Total a pagar&lt;/b&gt;&lt;strong style={{ fontSize:27, color:&#x27;#075cdd&#x27; }}&gt;{pesos(totalC)}&lt;/strong&gt;&lt;/div&gt;
      &lt;h3 style={{ margin:&#x27;12px 0&#x27; }}&gt;Métodos de pago&lt;/h3&gt;
      {filas.map((f, i) =&gt; &lt;div key={f.id} onClick={() =&gt; setSeleccionada(i)} style={{ border: seleccionada === i ? &#x27;2px solid #1672f5&#x27; : &#x27;1px solid #d9e3ef&#x27;, background:f.tipo === &#x27;efectivo&#x27; ? &#x27;#effcf5&#x27; : &#x27;#eef5ff&#x27;, borderRadius:14, padding:13, marginBottom:10 }}&gt;
        &lt;div style={{ display:&#x27;flex&#x27;, gap:10, alignItems:&#x27;center&#x27;, flexWrap:&#x27;wrap&#x27; }}&gt;
          &lt;b style={{ minWidth:90 }}&gt;{f.tipo === &#x27;efectivo&#x27; ? &#x27;💵 Efectivo&#x27; : `💳 Tarjeta ${filas.slice(0,i+1).filter(x=&gt;x.tipo===&#x27;tarjeta&#x27;).length}`}&lt;/b&gt;
          &lt;select disabled={planBloqueado} aria-label={`Método ${i+1}`} value={f.tipo} onChange={e =&gt; cambiarTipo(f.id,e.target.value)} style={{ padding:9, borderRadius:9, border:&#x27;1px solid #cbd7e6&#x27; }}&gt;&lt;option value=&quot;efectivo&quot;&gt;Efectivo&lt;/option&gt;&lt;option value=&quot;tarjeta&quot;&gt;Tarjeta (Stripe)&lt;/option&gt;&lt;/select&gt;
          &lt;input disabled={planBloqueado} aria-label={`Importe ${i+1}`} type=&quot;number&quot; inputMode=&quot;decimal&quot; min=&quot;0&quot; step=&quot;0.01&quot; placeholder=&quot;Importe $&quot; value={f.importe} onChange={e =&gt; actualizar(f.id, { importe:e.target.value })} style={{ flex:&#x27;1 1 140px&#x27;, minWidth:110, padding:10, borderRadius:9, border:&#x27;1px solid #cbd7e6&#x27;, fontSize:17 }} /&gt;
          &lt;button onClick={() =&gt; quitar(f.id)} disabled={planBloqueado || filas.length === 1} title=&quot;Quitar método&quot;&gt;✕&lt;/button&gt;
        &lt;/div&gt;
        {f.tipo === &#x27;tarjeta&#x27; &amp;&amp; &lt;small style={{ display:&#x27;block&#x27;, marginTop:8, color:centavos(f.importe)&gt;0&amp;&amp;centavos(f.importe)&lt;1000?&#x27;#b45309&#x27;:&#x27;#526684&#x27; }}&gt;{centavos(f.importe)&gt;0&amp;&amp;centavos(f.importe)&lt;1000?&#x27;⚠️ Stripe requiere al menos $10.00 MXN por tarjeta.&#x27;:&#x27;🔒 El QR individual se habilitará al integrar el Worker y la verificación de Stripe.&#x27;}&lt;/small&gt;}
      &lt;/div&gt;)}
      &lt;div style={{ display:&#x27;flex&#x27;, gap:10, flexWrap:&#x27;wrap&#x27;, margin:&#x27;14px 0&#x27; }}&gt;&lt;button disabled={planBloqueado} onClick={()=&gt;agregar(&#x27;efectivo&#x27;)} style={botonClaro}&gt;＋ Agregar efectivo&lt;/button&gt;&lt;button disabled={planBloqueado} onClick={()=&gt;agregar(&#x27;tarjeta&#x27;)} style={botonClaro}&gt;＋ Agregar tarjeta&lt;/button&gt;&lt;/div&gt;
      &lt;div style={{ background:&#x27;#f2f6fc&#x27;, borderRadius:14, padding:16, display:&#x27;grid&#x27;, gap:9 }}&gt;&lt;div style={fila}&gt;&lt;span&gt;Distribuido&lt;/span&gt;&lt;b&gt;{pesos(abonadoC)}&lt;/b&gt;&lt;/div&gt;&lt;div style={fila}&gt;&lt;span&gt;Restante&lt;/span&gt;&lt;b style={{color:restanteC?&#x27;#b45309&#x27;:&#x27;#059669&#x27;}}&gt;{pesos(restanteC)}&lt;/b&gt;&lt;/div&gt;{excesoC&gt;0&amp;&amp;&lt;div style={fila}&gt;&lt;span&gt;Excedente {filas.every(f=&gt;f.tipo===&#x27;efectivo&#x27;)?&#x27;(posible cambio)&#x27;:&#x27;(no permitido en tarjeta)&#x27;}&lt;/span&gt;&lt;b&gt;{pesos(excesoC)}&lt;/b&gt;&lt;/div&gt;}&lt;/div&gt;
      &lt;p style={{ color:&#x27;#95501b&#x27;, background:&#x27;#fff2df&#x27;, borderRadius:12, padding:12, fontSize:13 }}&gt;🧾 Los pagos combinados no deben imprimir automáticamente. Esta pantalla es una &lt;b&gt;demostración&lt;/b&gt;: todavía no genera QR, no procesa cargos y no registra ventas.&lt;/p&gt;
      {aviso&amp;&amp;&lt;p role=&quot;status&quot; style={{ color:&#x27;#1255a3&#x27; }}&gt;{aviso}&lt;/p&gt;}
      &lt;footer style={{ display:&#x27;flex&#x27;, gap:10 }}&gt;&lt;button onClick={onCerrar} style={{...botonClaro, flex:1}}&gt;Cancelar&lt;/button&gt;&lt;button disabled={!valido || planBloqueado} onClick={()=&gt;{setPlanBloqueado(true);setAviso(&#x27;Distribución bloqueada para revisión. No se ha cobrado ninguna tarjeta.&#x27;)}} style={{ flex:2, background:valido?&#x27;#075ff0&#x27;:&#x27;#9daec7&#x27;, color:&#x27;#fff&#x27;, border:0, padding:14, borderRadius:12, fontWeight:700, cursor:valido?&#x27;pointer&#x27;:&#x27;not-allowed&#x27; }}&gt;✓ Bloquear distribución (demo)&lt;/button&gt;&lt;/footer&gt;
      {planBloqueado &amp;&amp; &lt;button type=&quot;button&quot; onClick={()=&gt;{setPlanBloqueado(false);setAviso(&#x27;Puedes editar la distribución.&#x27;)}} style={{...botonClaro,marginTop:10}}&gt;Editar distribución&lt;/button&gt;}
      &lt;small style={{ display:&#x27;block&#x27;, marginTop:12, color:&#x27;#68788c&#x27; }}&gt;Atajos fuera de los campos: + efectivo · - tarjeta · ↑/↓ seleccionar · Enter validar · Esc cerrar&lt;/small&gt;
    &lt;/section&gt;
  &lt;/div&gt;;
}
const fila={ display:&#x27;flex&#x27;, justifyContent:&#x27;space-between&#x27; };
const botonClaro={ background:&#x27;#eef4fc&#x27;, border:&#x27;1px solid #cbd9ed&#x27;, borderRadius:12, padding:&#x27;12px 14px&#x27;, cursor:&#x27;pointer&#x27;, fontWeight:650 };
</code></pre></main></body></html>


