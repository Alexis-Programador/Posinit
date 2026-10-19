import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

// POS Init Pay — coordinación de pagos parciales (Stripe TEST).
// No registra ventas ni modifica inventario: la confirmación final debe ser
// una transacción de Ventas.jsx que compruebe TODOS los pagos.
const centavos = (n) => Math.round(Number(n) * 100);
const pesos = (c) => c / 100;
const clave = (uid) => `posinit:cobroMixto:v1:${uid}`;
const idNuevo = () => {
  if (!globalThis.crypto?.randomUUID) throw new Error("Se requiere HTTPS para crear IDs seguros.");
  return globalThis.crypto.randomUUID().replaceAll("-", "");
};

function validarProductos(productos, totalC) {
  if (!Array.isArray(productos) || !productos.length) throw new Error("Carrito vacío.");
  const items = productos.map((p) => ({
    id: String(p.id ?? ""), nombre: String(p.nombre || "Producto").slice(0, 120),
    cantidad: Number(p.cantidad), precio: Number(p.precio),
  }));
  if (items.some((p) => !p.id || !Number.isInteger(p.cantidad) || p.cantidad < 1 || !Number.isFinite(p.precio) || p.precio < 0)) {
    throw new Error("El carrito contiene productos inválidos.");
  }
  const suma = items.reduce((n, p) => n + centavos(p.precio) * p.cantidad, 0);
  if (suma !== totalC) throw new Error("El total no coincide con los productos.");
  return items;
}

export function crearPlanMixto({ ownerUid, total, productos, filas }) {
  if (!ownerUid) throw new Error("Falta el propietario del negocio.");
  const totalC = centavos(total);
  if (!Number.isSafeInteger(totalC) || totalC < 1) throw new Error("Total inválido.");
  const detalle = validarProductos(productos, totalC);
  if (!Array.isArray(filas) || filas.length < 2 || filas.length > 50) {
    throw new Error("El cobro combinado requiere entre 2 y 50 métodos.");
  }
  const pagos = filas.map((fila, i) => {
    const tipo = fila.tipo;
    const importeC = centavos(fila.importe);
    if (!["efectivo", "tarjeta"].includes(tipo) || !Number.isSafeInteger(importeC) || importeC <= 0) {
      throw new Error(`Importe o método inválido en la fila ${i + 1}.`);
    }
    if (tipo === "tarjeta" && importeC < 1000) throw new Error("Cada tarjeta debe cubrir al menos $10 MXN.");
    return { id: idNuevo(), tipo, importeCentavos: importeC, pagoId: null };
  });
  if (pagos.reduce((n, p) => n + p.importeCentavos, 0) !== totalC) {
    throw new Error("La suma de los pagos debe coincidir exactamente con la venta.");
  }
  if (!pagos.some((p) => p.tipo === "tarjeta")) throw new Error("Esta modalidad requiere al menos una tarjeta.");
  const plan = {
    version: 1, id: idNuevo(), ownerUid, totalCentavos: totalC,
    productos: detalle, pagos, creadoEn: new Date().toISOString(),
  };
  guardarPlanMixto(plan);
  return plan;
}

export function guardarPlanMixto(plan) {
  if (!plan?.ownerUid || !plan?.id) throw new Error("Plan inválido.");
  const anterior = recuperarPlanMixto(plan.ownerUid);
  if (anterior && anterior.id !== plan.id) {
    throw new Error("Existe un cobro combinado pendiente. Recupéralo antes de iniciar otro.");
  }
  localStorage.setItem(clave(plan.ownerUid), JSON.stringify(plan));
}

export function recuperarPlanMixto(ownerUid) {
  try {
    const raw = localStorage.getItem(clave(ownerUid));
    if (!raw) return null;
    const plan = JSON.parse(raw);
    return plan.version === 1 && plan.ownerUid === ownerUid ? plan : null;
  } catch { return null; }
}

// SOLO borrar después de que Ventas.jsx haya confirmado la venta en Firestore.
export function limpiarPlanMixto(ownerUid, cobroMixtoId) {
  const plan = recuperarPlanMixto(ownerUid);
  if (!plan || plan.id !== cobroMixtoId) throw new Error("No coincide el cobro pendiente.");
  localStorage.removeItem(clave(ownerUid));
}

function confirmarStripe(pago, importeCentavos) {
  const s = pago?.stripeConfirmacion;
  return pago?.estado === "pendiente" && s?.proveedor === "stripe" &&
    s?.entorno === "test" && s?.estado === "paid" && s?.moneda === "mxn" &&
    Number(s?.importeCentavos) === importeCentavos &&
    typeof s?.sessionId === "string" && !!s.sessionId &&
    typeof s?.eventId === "string" && !!s.eventId;
}

export function revisarPagoMixto(plan, indice, datos) {
  const fila = plan?.pagos?.[indice];
  if (!fila || fila.tipo !== "tarjeta") throw new Error("Fila de tarjeta inválida.");
  if (!datos) return { estado: "no_disponible", verificado: false };
  const correcto = datos.ownerUid === plan.ownerUid &&
    datos.cobroMixtoId === plan.id &&
    centavos(datos.totalVenta) === plan.totalCentavos &&
    centavos(datos.total) === fila.importeCentavos;
  if (!correcto) return { estado: "inconsistente", verificado: false };
  return {
    estado: datos.estado || "desconocido",
    verificado: confirmarStripe(datos, fila.importeCentavos),
    sessionId: datos.stripeConfirmacion?.sessionId || null,
  };
}

// Crea como máximo un documento por tarjeta y conserva el ID para reintentos.
// Requiere las reglas preparadas que aceptan cobroMixtoId y totalVenta.
export async function prepararTarjetaMixta(plan, indice, configBancaria) {
  const fila = plan?.pagos?.[indice];
  if (!fila || fila.tipo !== "tarjeta") throw new Error("No es un pago con tarjeta.");
  const actual = recuperarPlanMixto(plan.ownerUid);
  if (!actual || actual.id !== plan.id) throw new Error("El plan ya no está disponible en este dispositivo.");
  const banco = String(configBancaria?.banco || "").trim();
  const titular = String(configBancaria?.titular || "").trim();
  const clabe = String(configBancaria?.clabe || "").trim();
  if (!banco || !titular || !/^\d{18}$/.test(clabe)) throw new Error("Configura la cuenta bancaria de POS Init Pay.");
  const pagoId = actual.pagos[indice].pagoId || idNuevo();
  if (!actual.pagos[indice].pagoId) {
    actual.pagos[indice].pagoId = pagoId;
    guardarPlanMixto(actual); // Persistir ID ANTES de escribir en Firestore.
  }
  const ref = doc(db, "pagosPosInit", pagoId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      ownerUid: plan.ownerUid, total: pesos(fila.importeCentavos),
      totalVenta: pesos(plan.totalCentavos), cobroMixtoId: plan.id,
      estado: "pendiente", banco, titular, clabe,
      productos: plan.productos, creadoEn: serverTimestamp(),
    });
  } else {
    const d = snap.data();
    if (d.ownerUid !== plan.ownerUid || d.cobroMixtoId !== plan.id || centavos(d.total) !== fila.importeCentavos) {
      throw new Error("El documento de pago no coincide con el plan. No se generará otro cargo.");
    }
  }
  return { pagoId, urlPago: `${window.location.origin}${window.location.pathname}?pago=${encodeURIComponent(pagoId)}` };
}

export function observarTarjetaMixta(plan, indice, callback, onError) {
  const fila = plan?.pagos?.[indice];
  if (fila?.tipo !== "tarjeta" || !fila.pagoId) throw new Error("Primero prepara el pago de la tarjeta.");
  return onSnapshot(doc(db, "pagosPosInit", fila.pagoId),
    (snap) => callback(revisarPagoMixto(plan, indice, snap.exists() ? snap.data() : null)),
    onError);
}

export function resumenMixto(plan, estados = {}) {
  const tarjetas = plan.pagos.filter((p) => p.tipo === "tarjeta");
  const confirmadas = tarjetas.filter((p) => estados[p.id]?.verificado);
  const efectivoC = plan.pagos.filter((p) => p.tipo === "efectivo").reduce((n, p) => n + p.importeCentavos, 0);
  return {
    total: pesos(plan.totalCentavos), efectivo: pesos(efectivoC),
    tarjetasConfirmadas: confirmadas.length, tarjetasTotales: tarjetas.length,
    importeTarjetasConfirmado: pesos(confirmadas.reduce((n, p) => n + p.importeCentavos, 0)),
    listoParaFinalizar: confirmadas.length === tarjetas.length,
  };
}