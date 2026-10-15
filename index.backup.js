const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");

const admin = require("firebase-admin");

admin.initializeApp();

setGlobalOptions({
  region: "us-central1",
  maxInstances: 10,
});

// =====================================================
// POS INIT - PRUEBA DE FUNCIONES
// =====================================================

exports.posPinStatus = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Debes iniciar sesión para consultar el PIN."
    );
  }

  return {
    tienePin: false,
    vencido: false,
  };
});