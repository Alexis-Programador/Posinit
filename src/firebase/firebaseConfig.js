import { initializeApp } from "firebase/app";

import {
  getAuth,
  connectAuthEmulator,
} from "firebase/auth";

import {
  getFirestore,
  connectFirestoreEmulator,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAtKdbzysUTj-Y5Wl7-NP7--CbA3HNobj0",
  authDomain: "ventas-d8342.firebaseapp.com",
  databaseURL: "https://ventas-d8342-default-rtdb.firebaseio.com",
  projectId: "ventas-d8342",
  storageBucket: "ventas-d8342.firebasestorage.app",
  messagingSenderId: "407957676815",
  appId: "1:407957676815:web:cf8c713faf31d18c8dd47a",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// =====================================================
// EMULADORES LOCALES DE FIREBASE
// =====================================================

// Solo se activan cuando ejecutamos Vite en modo emulador.
// La página publicada en GitHub Pages utiliza Firebase real.

const usarEmuladores =
  import.meta.env.DEV &&
  import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true";

if (usarEmuladores) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099");

  connectFirestoreEmulator(db, "127.0.0.1", 8080);

  console.info("POS Init: Firebase conectado a emuladores locales.");
}

export const firebaseEmulatorsEnabled = usarEmuladores;

export default app;