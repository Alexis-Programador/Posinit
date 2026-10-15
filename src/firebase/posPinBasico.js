// ============================================================
// POS INIT - CONTROL BÁSICO DE PIN PARA FIREBASE SPARK
// ============================================================
//
// IMPORTANTE:
// Este sistema verifica los PIN desde el navegador.
// Es un control de acceso básico, NO autenticación segura
// contra personas que manipulen el navegador o Firestore.
//
// No guardar PIN en texto plano.
// ============================================================

import { db } from "./firebaseConfig";

import {
  doc,
  getDoc,
  runTransaction,
} from "firebase/firestore";

const DIAS = 30;
const MAX_INTENTOS = 4;
const ITERACIONES = 150000;
const MS_DIA = 24 * 60 * 60 * 1000;

// ============================================================
// REFERENCIA DEL CAJERO
// ============================================================

function referencia(ownerUid, usuarioId) {
  if (!ownerUid || !usuarioId) {
    throw new Error("Falta identificar al cajero.");
  }

  return doc(
    db,
    "posPinBasico",
    ownerUid,
    "cajeros",
    String(usuarioId)
  );
}

// ============================================================
// CONVERSIÓN DE BYTES
// ============================================================

function bytesHex(bytes) {
  return Array.from(bytes, (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

function hexBytes(hex) {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) {
    throw new Error("Formato de seguridad inválido.");
  }

  return new Uint8Array(
    hex.match(/.{2}/g).map((x) => parseInt(x, 16))
  );
}

// ============================================================
// GENERAR HASH DEL PIN
// ============================================================

async function derivarPin(pin, salHex) {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error("El PIN debe tener cuatro números.");
  }

  if (!globalThis.crypto?.subtle) {
    throw new Error(
      "Este navegador no permite procesar el PIN de forma segura."
    );
  }

  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: hexBytes(salHex),
      iterations: ITERACIONES,
      hash: "SHA-256",
    },
    material,
    256
  );

  return bytesHex(new Uint8Array(bits));
}

// ============================================================
// CONSULTAR ESTADO DEL PIN
// ============================================================

export async function consultarEstadoPin(
  ownerUid,
  usuarioId
) {
  const snap = await getDoc(
    referencia(ownerUid, usuarioId)
  );

  if (!snap.exists()) {
    return {
      tienePin: false,
      vencido: false,
      bloqueado: false,
      intentosRestantes: MAX_INTENTOS,
    };
  }

  const datos = snap.data();

  const intentos = Number(datos.intentosFallidos || 0);

  const vencido =
    typeof datos.creadoEn === "number" &&
    Date.now() >= datos.creadoEn + DIAS * MS_DIA;

  return {
    tienePin: true,
    vencido,
    bloqueado:
      datos.bloqueado === true ||
      intentos >= MAX_INTENTOS,
    intentosRestantes: Math.max(
      0,
      MAX_INTENTOS - intentos
    ),
  };
}

// ============================================================
// CREAR PIN POR PRIMERA VEZ
// ============================================================

export async function crearPinCajero({
  ownerUid,
  usuarioId,
  pin,
}) {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error("El PIN debe tener cuatro números.");
  }

  const ref = referencia(ownerUid, usuarioId);

  const sal = bytesHex(
    crypto.getRandomValues(new Uint8Array(16))
  );

  const hash = await derivarPin(pin, sal);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);

    if (snap.exists()) {
      throw new Error(
        "Este cajero ya tiene un PIN registrado."
      );
    }

    tx.set(ref, {
      sal,
      hash,
      creadoEn: Date.now(),
      intentosFallidos: 0,
      bloqueado: false,
      historial: [hash],
    });
  });

  return {
    autorizado: true,
  };
}

// ============================================================
// VERIFICAR PIN PARA ENTRAR A CAJA
// ============================================================

export async function verificarPinCajero({
  ownerUid,
  usuarioId,
  pin,
}) {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error("El PIN debe tener cuatro números.");
  }

  const ref = referencia(ownerUid, usuarioId);

  const inicial = await getDoc(ref);

  if (!inicial.exists()) {
    return {
      autorizado: false,
      mensaje: "Este cajero todavía no tiene PIN.",
    };
  }

  const previo = inicial.data();

  const hashIntento = await derivarPin(
    pin,
    previo.sal
  );

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);

    if (!snap.exists()) {
      return {
        autorizado: false,
        mensaje: "No existe un PIN registrado.",
      };
    }

    const datos = snap.data();

    const intentos = Number(
      datos.intentosFallidos || 0
    );

    // Bloqueo después de cuatro intentos.
    if (
      datos.bloqueado === true ||
      intentos >= MAX_INTENTOS
    ) {
      return {
        autorizado: false,
        mensaje:
          "PIN bloqueado. Solicita restauración al administrador.",
      };
    }

    // Vencimiento a los 30 días.
    if (
      typeof datos.creadoEn === "number" &&
      Date.now() >= datos.creadoEn + DIAS * MS_DIA
    ) {
      return {
        autorizado: false,
        mensaje:
          "Tu PIN venció después de 30 días. Debes renovarlo.",
      };
    }

    // Evitar validar información modificada durante la consulta.
    if (
      datos.hash !== previo.hash ||
      datos.sal !== previo.sal
    ) {
      throw new Error(
        "El PIN cambió durante la verificación. Intenta nuevamente."
      );
    }

    // PIN correcto.
    if (hashIntento === datos.hash) {
      tx.update(ref, {
        intentosFallidos: 0,
      });

      return {
        autorizado: true,
      };
    }

    // PIN incorrecto.
    const nuevosIntentos = intentos + 1;

    tx.update(ref, {
      intentosFallidos: nuevosIntentos,
      bloqueado: nuevosIntentos >= MAX_INTENTOS,
    });

    return {
      autorizado: false,
      intentosRestantes: Math.max(
        0,
        MAX_INTENTOS - nuevosIntentos
      ),
      mensaje:
        nuevosIntentos >= MAX_INTENTOS
          ? "PIN bloqueado después de cuatro intentos incorrectos."
          : `PIN incorrecto. Te quedan ${
              MAX_INTENTOS - nuevosIntentos
            } intentos.`,
    };
  });
}