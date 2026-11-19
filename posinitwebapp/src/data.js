import { useEffect, useState } from 'react';
import {
  collection, doc, getDoc, getDocFromServer, getDocsFromServer,
  deleteDoc, onSnapshot, runTransaction,
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
export function normalizeCatalogValue(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-MX');
}
export async function categoryId(name) {
  const normalized = normalizeCatalogValue(name);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export async function saveCategory(uid, name) {
  assertOwner(uid);
  const clean = String(name || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!clean || clean.length > 80) throw new Error('Escribe una categoría de 1 a 80 caracteres.');
  const id = await categoryId(clean);
  const ref = doc(db, 'usuarios', uid, 'categorias', id);
  const existing = await getDocFromServer(ref);
  if (existing.exists()) throw new Error('Esta categoría ya está registrada.');
  await setDoc(ref, { nombre: clean, propietarioUid: uid, fechaActualizacion: Date.now() });
}
export async function deleteCategory(uid, row) {
  assertOwner(uid);
  const categoria = String(row.nombre || '');
  const catalog = await getDocsFromServer(collection(db, 'usuarios', uid, 'productos'));
  if (catalog.docs.some(p => normalizeCatalogValue(p.data().categoria) === normalizeCatalogValue(categoria))) {
    throw new Error('Esta categoría tiene productos. Cambia primero su categoría.');
  }
  const id = await categoryId(categoria);
  await deleteDoc(doc(db, 'usuarios', uid, 'categorias', id));
}
export async function saveProduct(uid, input, existing = null) {
  assertOwner(uid);
  const id = existing?.docId || newNumericId();
  const nombre = String(input.nombre || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  const codigoBarras = String(input.codigoBarras || '').trim();
  const categoria = String(input.categoria || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  const precioVenta = Number(input.precioVenta);
  const imagenUri = String(input.imagenUri || '').trim() || existing?.imagenUri || null;
  if (!nombre || nombre.length > 120 || !codigoBarras || codigoBarras.length > 90 ||
      !categoria || categoria.length > 80 || !Number.isFinite(precioVenta) || precioVenta < 0) {
    throw new Error('Completa nombre, código de barras, categoría y precio válido.');
  }
  if (imagenUri && (!imagenUri.startsWith('https://res.cloudinary.com/') || imagenUri.length > 2000)) {
    throw new Error('Selecciona o toma una imagen para cargarla de forma segura.');
  }
  if (!asInt(id)) throw new Error('El identificador no es compatible con Android.');
  const owner = doc(db, 'usuarios', uid);
  const refControl = doc(owner, '_control', 'catalogo');
  const refProd = doc(owner, 'productos', id);
  const refInv = doc(owner, 'inventario', id);
  const categoryRef = doc(owner, 'categorias', await categoryId(categoria));
  // Igual que Android: versión del catálogo -> catálogo completo -> transacción.
  const version = await getDocFromServer(refControl);
  const expectedRevision = Number(version.data()?.revision || 0);
  const catalog = await getDocsFromServer(collection(owner, 'productos'));
  for (const item of catalog.docs) {
    if (item.id === id) continue;
    if (normalizeCatalogValue(item.data().nombre) === normalizeCatalogValue(nombre)) {
      throw new Error('Ya existe un producto con ese nombre.');
    }
    if (normalizeCatalogValue(item.data().codigoBarras) === normalizeCatalogValue(codigoBarras)) {
      throw new Error('Ese código de barras ya pertenece a otro producto.');
    }
  }
  await runTransaction(db, async tx => {
    const [control, previo, inventario] = await Promise.all([
      tx.get(refControl), tx.get(refProd), tx.get(refInv),
    ]);
    if (Number(control.data()?.revision || 0) !== expectedRevision) {
      throw new Error('Otro dispositivo actualizó el catálogo. Actualiza la lista y vuelve a guardar.');
    }
    if (!existing && previo.exists()) throw new Error('Ya existe un producto con ese identificador. Intenta otra vez.');
    if (existing && !previo.exists()) throw new Error('El producto fue eliminado. Actualiza el catálogo.');
    const ahora = Date.now();
    tx.set(refProd, { ...(previo.data() || {}), id: Number(id), nombre, codigoBarras, categoria,
      precioVenta, imagenUri, propietarioUid: uid, fechaActualizacion: ahora });
    tx.set(categoryRef, { nombre: categoria, propietarioUid: uid, fechaActualizacion: ahora });
    if (!inventario.exists()) {
      tx.set(refInv, { productoId: Number(id), stockActual: 0, stockMinimo: 0,
        propietarioUid: uid, fechaActualizacion: ahora });
    }
    tx.set(refControl, { revision: expectedRevision + 1, propietarioUid: uid, fechaActualizacion: ahora }, { merge: true });
  });
}
export async function deleteProduct(uid, product) {
  assertOwner(uid);
  if (!product?.docId) throw new Error('Producto no encontrado.');
  const reference = doc(db, 'usuarios', uid, 'productos', product.docId);
  const current = await getDocFromServer(reference);
  if (!current.exists()) throw new Error('El producto ya fue eliminado.');
  if (current.data()?.propietarioUid !== uid) throw new Error('No tienes permiso para eliminarlo.');
  // Igual que Android, se borra el producto, no su historial de ventas.
  await deleteDoc(reference);
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
  if (!Number.isFinite(precioOferta) || precioOferta <= 0 || precioOferta >= Number(product.precioVenta) ||
      Math.abs(precioOferta * 100 - Math.round(precioOferta * 100)) > 0.000001) {
    throw new Error('La oferta debe ser mayor que $0 y menor al precio de venta.');
  }
  await setDoc(doc(db, 'usuarios', uid, 'ofertas', product.docId), {
    productoId: product.docId, precioOferta, activa: true, actualizadoEn: serverTimestamp(),
  });
}

export async function disableOffer(uid, product) {
  assertOwner(uid);
  if (!product?.docId) throw new Error('Producto no encontrado.');
  await deleteDoc(doc(db, 'usuarios', uid, 'ofertas', product.docId));
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
  const basic = ['azul','celeste','negro','blanco'];
  const premium = ['rojo','verde','morado','rosa','naranja','amarillo','turquesa','cian','indigo','violeta','lima','cafe','gris','gris_claro','azul_rey','esmeralda','coral','dorado','menta','petroleo','terracota','lavanda','arena','vino','durazno','acero','oliva','marfil'];
  if (!basic.includes(theme) && !premium.includes(theme)) throw new Error('Color no admitido.');
  if (premium.includes(theme)) {
    const benefit = await getDocFromServer(doc(db,'usuarios',uid,'beneficios','premium'));
    if (!benefit.exists() || benefit.data()?.colores !== true) {
      throw new Error('Color Init no está habilitado para esta cuenta. Utiliza un color gratuito.');
    }
  }
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
