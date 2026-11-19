import { useEffect, useState } from 'react';
import {
  collection, doc, getDoc, onSnapshot, runTransaction,
  serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';
import { db, auth } from './firebase';

export function useLive(ownerUid, name, enabled = true) {
  const [value, setValue] = useState({ rows: [], loading: true, error: '', fromCache: false });
  useEffect(() => {
    if (!ownerUid || !enabled) {
      setValue({ rows: [], loading: false, error: '', fromCache: false });
      return;
    }
    setValue({ rows: [], loading: true, error: '', fromCache: false });
    const path = collection(db, 'usuarios', ownerUid, name);
    return onSnapshot(path, { includeMetadataChanges: true }, snapshot => {
      setValue({
        rows: snapshot.docs.map(d => ({ docId: d.id, ...d.data() })),
        loading: false, error: '', fromCache: snapshot.metadata.fromCache,
      });
    }, error => setValue({ rows: [], loading: false, error: error.message, fromCache: false }));
  }, [ownerUid, name, enabled]);
  return value;
}

export function assertOwner(uid) {
  if (!uid || !auth.currentUser || auth.currentUser.uid !== uid || auth.currentUser.isAnonymous) {
    throw new Error('La sesión del propietario no es válida. Inicia sesión de nuevo.');
  }
}

function newNumericId() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(100000000 + (values[0] % 1800000000));
}

const asInt = v => Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 2000000000;
const safeText = (value, limit = 120) => String(value ?? '').trim().slice(0, limit);
const num = v => Number(v ?? 0);

// Respeta el modelo Android de IDs numéricos y la revisión atómica del catálogo
// exigida por las reglas Firestore del proyecto.
export async function saveProduct(uid, input, existing = null) {
  assertOwner(uid);
  const id = existing?.docId || newNumericId();
  const nombre = safeText(input.nombre), codigoBarras = safeText(input.codigoBarras, 90);
  const categoria = safeText(input.categoria);
  const precioVenta = num(input.precioVenta);
  const imagenUri = String(input.imagenUri || '').trim() || existing?.imagenUri || null;
  if (imagenUri && (!/^https:\/\//i.test(imagenUri) || imagenUri.length > 2000)) {
    throw new Error('La imagen debe tener una dirección HTTPS válida.');
  }
  if (!nombre || !codigoBarras || !categoria || !Number.isFinite(precioVenta) || precioVenta < 0) {
    throw new Error('Completa nombre, código, categoría y precio válido.');
  }
  if (!asInt(id)) throw new Error('El ID del producto no es compatible con Android.');
  const refControl = doc(db, 'usuarios', uid, '_control', 'catalogo');
  const refProd = doc(db, 'usuarios', uid, 'productos', id);
  const refInv = doc(db, 'usuarios', uid, 'inventario', id);
  await runTransaction(db, async tx => {
    const [control, previo, inventario] = await Promise.all([
      tx.get(refControl), tx.get(refProd), tx.get(refInv),
    ]);
    if (!existing && previo.exists()) throw new Error('Se generó un ID ocupado. Intenta guardar de nuevo.');
    if (existing && !previo.exists()) throw new Error('Producto eliminado. Actualiza el catálogo.');
    const revision = Number(control.data()?.revision || 0);
    const ahora = Date.now();
    tx.set(refProd, {
      ...(previo.data() || {}), id: Number(id), nombre, codigoBarras, categoria,
      precioVenta, imagenUri,
      propietarioUid: uid, fechaActualizacion: ahora,
    });
    if (!inventario.exists()) {
      tx.set(refInv, {
        productoId: Number(id), stockActual: 0, stockMinimo: 0,
        propietarioUid: uid, fechaActualizacion: ahora,
      });
    }
    tx.set(refControl, {
      revision: revision + 1, propietarioUid: uid, fechaActualizacion: ahora,
    }, { merge: true });
  });
}

export async function saveStock(uid, product, stockActual, stockMinimo) {
  assertOwner(uid);
  if (!asInt(stockActual) || !asInt(stockMinimo)) throw new Error('El stock debe ser un entero positivo.');
  const id = product.docId;
  if (!id) throw new Error('Producto no identificado.');
  await setDoc(doc(db, 'usuarios', uid, 'inventario', id), {
    productoId: Number(id), propietarioUid: uid,
    stockActual: Number(stockActual), stockMinimo: Number(stockMinimo),
    fechaActualizacion: Date.now(),
  }, { merge: true });
}

export async function saveProvider(uid, input, previous = null) {
  assertOwner(uid);
  const nombre = safeText(input.nombre);
  if (!nombre) throw new Error('Escribe el nombre del proveedor.');
  const id = previous?.docId || newNumericId();
  const ref = doc(db, 'usuarios', uid, 'proveedores', id);
  const fields = {
    id: Number(id), nombre, codigoPais: safeText(input.codigoPais, 10),
    telefono: safeText(input.telefono, 32), empresa: safeText(input.empresa),
    protegido: previous?.protegido || false, propietarioUid: uid,
    fechaActualizacion: Date.now(),
  };
  if (previous) await updateDoc(ref, fields);
  else await setDoc(ref, fields);
}

export async function saveOffer(uid, product, price) {
  assertOwner(uid);
  const precioOferta = Number(price);
  if (!Number.isFinite(precioOferta) || precioOferta <= 0 || precioOferta >= Number(product.precioVenta)) {
    throw new Error('La oferta debe ser mayor que $0 y menor al precio de venta.');
  }
  await setDoc(doc(db, 'usuarios', uid, 'ofertas', product.docId), {
    productoId: product.docId, precioOferta, activa: true, actualizadoEn: serverTimestamp(),
  });
}

export async function disableOffer(uid, product) {
  assertOwner(uid);
  const ref = doc(db, 'usuarios', uid, 'ofertas', product.docId);
  const existing = await getDoc(ref);
  if (!existing.exists()) return;
  await updateDoc(ref, { activa: false, actualizadoEn: serverTimestamp() });
}

export async function saveSpei(uid, input) {
  assertOwner(uid);
  const banco = safeText(input.banco), titular = safeText(input.titular);
  const clabe = String(input.clabe || '').replace(/\s/g, '');
  if (!banco || !titular || !/^\d{18}$/.test(clabe)) throw new Error('Se necesita banco, titular y CLABE de 18 dígitos.');
  await setDoc(doc(db, 'usuarios', uid, 'configuracion', 'posInitPay'), {
    propietarioUid: uid, banco, titular, clabe, actualizadoEn: serverTimestamp(),
  }, { merge: true });
}

export async function saveSettings(uid, input) {
  assertOwner(uid);
  await setDoc(doc(db, 'usuarios', uid, 'configuracion', 'general'), {
    propietarioUid: uid,
    telefonoContacto: safeText(input.telefonoContacto, 30),
    notificacionesActivas: Boolean(input.notificacionesActivas),
    notificacionesStock: Boolean(input.notificacionesStock),
    fechaActualizacion: Date.now(),
  }, { merge: true });
}

export function money(value) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value || 0));
}
export function when(value) {
  if (!value) return '—';
  const v = typeof value?.toDate === 'function' ? value.toDate() : new Date(Number(value));
  return Number.isNaN(v.getTime()) ? '—' : v.toLocaleString('es-MX');
}
export function csvDownload(name, headers, rows) {
  const quoted = v => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const data = '\uFEFF' + [headers, ...rows].map(row => row.map(quoted).join(',')).join('\r\n');
  const blob = new Blob([data], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}


// Recepción atómica compatible con los registros de Android.
// Todas las lecturas se hacen antes de las escrituras dentro de la transacción.
export async function receiveMerchandiseBatch(uid, cart, provider = '') {
  assertOwner(uid);
  if (!Array.isArray(cart) || cart.length === 0 || cart.length > 60) {
    throw new Error('Selecciona entre 1 y 60 productos para la recepción.');
  }
  const ids = cart.map(p => String(p.docId));
  if (new Set(ids).size !== ids.length) throw new Error('Hay artículos duplicados en la recepción.');
  if (cart.some(p => !Number.isInteger(Number(p.cantidad)) || Number(p.cantidad) < 1 || Number(p.cantidad) > 2147483647)) {
    throw new Error('Revisa las cantidades; deben ser números enteros positivos.');
  }
  const items = cart.map(p => ({
    producto: p,
    productRef: doc(db, 'usuarios', uid, 'productos', String(p.docId)),
    stockRef: doc(db, 'usuarios', uid, 'inventario', String(p.docId)),
    recordId: newNumericId(),
  }));
  const batchIds = items.map(x=>x.recordId);
  if(new Set(batchIds).size !== batchIds.length) throw new Error('No se generaron folios únicos. Intenta de nuevo.');
  const now = Date.now();
  const result = await runTransaction(db, async tx => {
    // Resolver lecturas en paralelo; ninguna escritura comienza hasta terminarlas.
    const data = await Promise.all(items.map(async item => {
      const recordRef = doc(db, 'usuarios', uid, 'registrosMercancia', item.recordId);
      const [product, stock, existing] = await Promise.all([
        tx.get(item.productRef), tx.get(item.stockRef), tx.get(recordRef),
      ]);
      return { ...item, recordRef, product, stock, existing };
    }));
    for (const item of data) {
      if(!item.product.exists()) throw new Error('No existe el producto '+item.producto.nombre+'. Actualiza el catálogo.');
      if(item.existing.exists()) throw new Error('Folio duplicado. Vuelve a intentarlo.');
      if(item.stock.exists() && item.stock.data().propietarioUid !== uid) throw new Error('Inventario inválido para '+item.producto.nombre+'.');
      const p=item.product.data();
      if(p.propietarioUid!==uid) throw new Error('Este producto pertenece a otra cuenta.');
      const quantity=Number(item.producto.cantidad);
      const previous=Number(item.stock.data()?.stockActual ?? 0);
      const minimum=Number(item.stock.data()?.stockMinimo ?? 0);
      if(!Number.isSafeInteger(previous)||previous<0||!Number.isSafeInteger(minimum)||minimum<0||previous+quantity>2147483647) {
        throw new Error('Las existencias de '+p.nombre+' exceden el límite permitido.');
      }
      const next=previous+quantity;
      tx.set(item.stockRef,{
        productoId:Number(item.producto.docId),propietarioUid:uid,stockActual:next,
        stockMinimo:minimum,fechaActualizacion:now,
      },{merge:true});
      tx.set(item.recordRef,{
        id:Number(item.recordId),folio:now,productoId:Number(item.producto.docId),
        producto:String(p.nombre),codigo:String(p.codigoBarras),cantidadRecibida:quantity,
        stockAnterior:previous,stockResultante:next,proveedor:provider?String(provider).slice(0,120):null,
        fechaHora:now,propietarioUid:uid,fechaActualizacion:now,
      });
    }
    return data.length;
  });
  return result;
}

// Tema propio de la página de administración. Nunca altera premiumColores.
export async function saveWebTheme(uid, theme) {
  assertOwner(uid);
  const valid = ['azul','celeste','verde','morado','naranja','oscuro'];
  if (!valid.includes(theme)) throw new Error('Tema no admitido.');
  await setDoc(doc(db,'usuarios',uid,'configuracion','webApp'), {
    propietarioUid:uid,temaWeb:theme,fechaActualizacion:Date.now(),
  },{merge:true});
}


// Registro de robo compatible con la app móvil: descuento y folio atómicos.
export async function registerLoss(uid, product, quantity, observation='') {
  assertOwner(uid);
  const n=Number(quantity);
  const id=String(product?.docId||'');
  if(!id || !Number.isSafeInteger(n) || n<1 || n>2147483647) throw new Error('Producto o cantidad inválidos.');
  const nota=String(observation||'').trim();
  if(nota.length>500) throw new Error('La observación supera 500 caracteres.');
  const recordId=crypto.randomUUID();
  const pRef=doc(db,'usuarios',uid,'productos',id);
  const invRef=doc(db,'usuarios',uid,'inventario',id);
  const lossRef=doc(db,'usuarios',uid,'robos',recordId);
  await runTransaction(db,async tx=>{
    const registro=await tx.get(lossRef);
    const producto=await tx.get(pRef);
    const inventario=await tx.get(invRef);
    if(registro.exists()) throw new Error('Ya existe un registro con ese folio.');
    if(!producto.exists()||producto.data().propietarioUid!==uid) throw new Error('El producto no corresponde al negocio.');
    if(!inventario.exists()||inventario.data().propietarioUid!==uid) throw new Error('No existe el inventario de este artículo.');
    const prev=Number(inventario.data().stockActual);
    const price=Number(producto.data().precioVenta);
    if(!Number.isSafeInteger(prev)||prev<n||!Number.isFinite(price)||price<0) {
      throw new Error('Cambiaron las existencias o el precio; revisa el inventario.');
    }
    const fecha=Date.now();
    tx.update(invRef,{stockActual:prev-n,fechaActualizacion:fecha});
    tx.set(lossRef,{
      propietarioUid:uid,productoId:Number(id),nombre:String(producto.data().nombre),
      codigo:String(producto.data().codigoBarras),unidades:n,
      precioUnitario:price,importe:Number((price*n).toFixed(2)),
      stockAnterior:prev,stockResultante:prev-n,nota,fechaHora:fecha,
    });
  });
}
