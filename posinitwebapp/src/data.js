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

const asInt = v => Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 2000000000;
const safeText = (value, limit = 120) => String(value ?? '').trim().slice(0, limit);
const num = v => Number(v ?? 0);

// Respeta el modelo Android de IDs numéricos y la revisión atómica del catálogo
// exigida por las reglas Firestore del proyecto.
export async function saveProduct(uid, input, existing = null) {
  assertOwner(uid);
  const id = existing?.docId || String(Math.floor(Math.random() * 1800000000) + 100000000);
  const nombre = safeText(input.nombre), codigoBarras = safeText(input.codigoBarras, 90);
  const categoria = safeText(input.categoria);
  const precioVenta = num(input.precioVenta);
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
      precioVenta, imagenUri: previo.data()?.imagenUri || null,
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
  const id = previous?.docId || String(Math.floor(Math.random() * 1800000000) + 100000000);
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
