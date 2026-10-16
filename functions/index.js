const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const bcrypt = require("bcryptjs");

admin.initializeApp();

setGlobalOptions({
  region: "us-central1",
  maxInstances: 10,
});

const db = admin.firestore();

const DIAS_VIGENCIA = 30;
const MAX_INTENTOS = 4;
const COSTO_HASH = 12;

const MILISEGUNDOS_DIA = 24 * 60 * 60 * 1000;

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

function obtenerDatos(request) {
  if (!request.auth?.uid) {
    throw new HttpsError(
      "unauthenticated",
      "Debes iniciar sesión para utilizar esta función."
    );
  }

  const ownerUid = request.data?.ownerUid;
  const usuarioId = request.data?.usuarioId;

  if (
    typeof ownerUid !== "string" ||
    typeof usuarioId !== "string" ||
    !ownerUid.trim() ||
    !usuarioId.trim()
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Faltan datos del usuario."
    );
  }

  if (request.auth.uid !== ownerUid) {
    throw new HttpsError(
      "permission-denied",
      "No tienes autorización para consultar este negocio."
    );
  }

  if (
    ownerUid.includes("/") ||
    usuarioId.includes("/") ||
    ownerUid.length > 128 ||
    usuarioId.length > 128
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Identificador de usuario inválido."
    );
  }

  return { ownerUid, usuarioId };
}

function referenciaSeguridad(ownerUid, usuarioId) {
  return db
    .collection("posPinSeguridad")
    .doc(ownerUid)
    .collection("cajeros")
    .doc(usuarioId);
}

async function comprobarCajero(ownerUid, usuarioId) {
  const referencia = db
    .collection("usuarios")
    .doc(ownerUid)
    .collection("usuariosSistema")
    .doc(usuarioId);

  const documento = await referencia.get();

  if (!documento.exists) {
    throw new HttpsError(
      "not-found",
      "El cajero no existe."
    );
  }

  if (documento.data()?.activo === false) {
    throw new HttpsError(
      "permission-denied",
      "Este cajero está desactivado."
    );
  }
}

function validarPin(pin) {
  if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    throw new HttpsError(
      "invalid-argument",
      "El PIN debe tener exactamente cuatro números."
    );
  }
}

function validarPinNuevo(pin) {
  validarPin(pin);

  if (/^(\d)\1{3}$/.test(pin)) {
    throw new HttpsError(
      "invalid-argument",
      "No puedes utilizar cuatro números iguales."
    );
  }

  let ascendente = true;
  let descendente = true;

  for (let i = 1; i < pin.length; i++) {
    const anterior = Number(pin[i - 1]);
    const actual = Number(pin[i]);

    if (actual !== anterior + 1) {
      ascendente = false;
    }

    if (actual !== anterior - 1) {
      descendente = false;
    }
  }

  if (ascendente || descendente) {
    throw new HttpsError(
      "invalid-argument",
      "No puedes utilizar números consecutivos."
    );
  }
}

function pinVencido(datos) {
  const vencimiento = datos?.venceEn?.toMillis?.();

  if (!vencimiento) {
    return true;
  }

  return Date.now() >= vencimiento;
}

function obtenerIntentos(datos) {
  const intentos = Number(datos?.intentosRestantes);

  if (!Number.isInteger(intentos)) {
    return MAX_INTENTOS;
  }

  return Math.max(0, Math.min(MAX_INTENTOS, intentos));
}

// =====================================================
// 1. CONSULTAR ESTADO DEL PIN
// =====================================================

exports.posPinStatus = onCall(async (request) => {
  const { ownerUid, usuarioId } = obtenerDatos(request);

  await comprobarCajero(ownerUid, usuarioId);

  const referencia = referenciaSeguridad(ownerUid, usuarioId);
  const documento = await referencia.get();

  if (!documento.exists) {
    return {
      tienePin: false,
      vencido: false,
      bloqueado: false,
      intentosRestantes: MAX_INTENTOS,
    };
  }

  const datos = documento.data();
  const tienePin = typeof datos.pinHash === "string";

  return {
    tienePin,
    vencido: tienePin ? pinVencido(datos) : false,
    bloqueado: datos.bloqueado === true,
    intentosRestantes: obtenerIntentos(datos),
  };
});

// =====================================================
// 2. CREAR EL PRIMER PIN
// =====================================================

exports.posPinCreate = onCall(async (request) => {
  const { ownerUid, usuarioId } = obtenerDatos(request);
  const pin = request.data?.pin;

  validarPinNuevo(pin);

  await comprobarCajero(ownerUid, usuarioId);

  const referencia = referenciaSeguridad(ownerUid, usuarioId);

  // Generamos el hash antes de iniciar la transacción.
  const pinHash = await bcrypt.hash(pin, COSTO_HASH);

  const ahora = admin.firestore.Timestamp.now();

  const venceEn = admin.firestore.Timestamp.fromMillis(
    Date.now() + DIAS_VIGENCIA * MILISEGUNDOS_DIA
  );

  await db.runTransaction(async (transaction) => {
    const documento = await transaction.get(referencia);

    if (documento.exists) {
      throw new HttpsError(
        "already-exists",
        "Este cajero ya tiene un PIN registrado."
      );
    }

    transaction.create(referencia, {
      ownerUid,
      usuarioId,
      pinHash,
      historial: [pinHash],
      creadoEn: ahora,
      venceEn,
      intentosRestantes: MAX_INTENTOS,
      bloqueado: false,
      actualizadoEn: ahora,
    });
  });

  return {
    autorizado: true,
    mensaje: "PIN creado correctamente.",
  };
});

// =====================================================
// 3. VERIFICAR PIN Y CONTROLAR LOS CUATRO INTENTOS
// =====================================================

exports.posPinVerify = onCall(async (request) => {
  const { ownerUid, usuarioId } = obtenerDatos(request);
  const pin = request.data?.pin;

  validarPin(pin);

  await comprobarCajero(ownerUid, usuarioId);

  const referencia = referenciaSeguridad(ownerUid, usuarioId);

  return db.runTransaction(async (transaction) => {
    const documento = await transaction.get(referencia);

    if (!documento.exists) {
      throw new HttpsError(
        "not-found",
        "Este cajero todavía no tiene un PIN."
      );
    }

    const datos = documento.data();

    if (datos.bloqueado === true) {
      return {
        autorizado: false,
        bloqueado: true,
        intentosRestantes: 0,
        mensaje:
          "Tu cuenta está bloqueada. Utiliza la opción Restaurar contraseña.",
      };
    }

    const intentosActuales = obtenerIntentos(datos);

    if (intentosActuales <= 0) {
      transaction.update(referencia, {
        bloqueado: true,
        intentosRestantes: 0,
      });

      return {
        autorizado: false,
        bloqueado: true,
        intentosRestantes: 0,
        mensaje:
          "Tu cuenta está bloqueada. Utiliza la opción Restaurar contraseña.",
      };
    }

    const correcto = await bcrypt.compare(pin, datos.pinHash);

    if (!correcto) {
      const restantes = intentosActuales - 1;
      const bloqueado = restantes === 0;

      transaction.update(referencia, {
        intentosRestantes: restantes,
        bloqueado,
        ultimoIntentoFallidoEn:
          admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        autorizado: false,
        bloqueado,
        intentosRestantes: restantes,
        mensaje: bloqueado
          ? "Tu cuenta ha sido bloqueada después de 4 intentos incorrectos. Es posible que alguien haya intentado acceder. Utiliza Restaurar contraseña."
          : `Contraseña incorrecta. Te quedan ${restantes} intento(s).`,
      };
    }

    if (pinVencido(datos)) {
      return {
        autorizado: false,
        vencido: true,
        mensaje:
          "Tu PIN cumplió 30 días. Debes actualizarlo antes de entrar.",
      };
    }

    transaction.update(referencia, {
      intentosRestantes: MAX_INTENTOS,
      ultimoAccesoEn:
        admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      autorizado: true,
      bloqueado: false,
      intentosRestantes: MAX_INTENTOS,
      mensaje: "Acceso autorizado.",
    };
  });
});

// =====================================================
// POS INIT PAY - CREAR SOLICITUD SPEI DESDE EL SERVIDOR
// No procesa tarjetas ni confirma depósitos automáticamente.
// =====================================================
exports.posPayCrearSolicitud = onCall(async (request) => {
  const ownerUid = request.auth?.uid;
  if (!ownerUid || request.data?.ownerUid !== ownerUid) {
    throw new HttpsError("permission-denied", "Se requiere la sesión del propietario.");
  }

  const articulos = request.data?.productos;
  if (!Array.isArray(articulos) || articulos.length < 1 || articulos.length > 80) {
    throw new HttpsError("invalid-argument", "La venta debe incluir entre 1 y 80 productos.");
  }

  const configuracion = await db.doc(`usuarios/${ownerUid}/configuracion/posInitPay`).get();
  const datos = configuracion.data() || {};
  if (!configuracion.exists || typeof datos.banco !== "string" || !datos.banco.trim() ||
      typeof datos.titular !== "string" || !datos.titular.trim() ||
      typeof datos.clabe !== "string" || !/^\d{18}$/.test(datos.clabe)) {
    throw new HttpsError("failed-precondition", "Configura primero una cuenta SPEI válida.");
  }

  const ids = new Set();
  const items = [];
  let centavos = 0;
  for (const articulo of articulos) {
    const id = articulo?.id;
    const cantidad = articulo?.cantidad;
    if (typeof id !== "string" || !id || id.includes("/") || id.length > 128 ||
        !Number.isSafeInteger(cantidad) || cantidad < 1 || cantidad > 10000 || ids.has(id)) {
      throw new HttpsError("invalid-argument", "Producto o cantidad inválidos o duplicados.");
    }
    ids.add(id);
    const snap = await db.doc(`usuarios/${ownerUid}/productos/${id}`).get();
    if (!snap.exists) throw new HttpsError("not-found", "Un producto ya no existe.");
    const producto = snap.data();
    const precio = Number(producto.precioVenta);
    const precioCentavos = Math.round(precio * 100);
    if (!Number.isFinite(precio) || precio < 0 || !Number.isSafeInteger(precioCentavos) ||
        Math.abs(precio * 100 - precioCentavos) > 0.00001) {
      throw new HttpsError("failed-precondition", "El precio del catálogo no es válido.");
    }
    centavos += precioCentavos * cantidad;
    if (!Number.isSafeInteger(centavos) || centavos > 100000000) {
      throw new HttpsError("invalid-argument", "Importe fuera del límite permitido.");
    }
    items.push({ id, nombre: String(producto.nombre || "Producto").slice(0, 160),
      cantidad, precio: precioCentavos / 100 });
  }
  if (centavos <= 0) throw new HttpsError("invalid-argument", "El total debe ser mayor que cero.");
  const total = centavos / 100;
  // El total no se toma del navegador: se calcula con precios del catálogo.
  const pagoRef = db.collection("pagosPosInit").doc();
  await pagoRef.create({
    ownerUid, total, estado: "pendiente", tipo: "spei_manual",
    banco: datos.banco.trim(), titular: datos.titular.trim(), clabe: datos.clabe,
    productos: items, creadoEn: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { pagoId: pagoRef.id, total };
});
