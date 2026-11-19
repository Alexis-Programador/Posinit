import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Configuración PÚBLICA del proyecto Firebase usado por POS Init Android e iOS.
// La seguridad se controla con Firebase Authentication y reglas de Firestore,
// no ocultando estas claves de inicialización.
const firebaseConfig = {
  apiKey: 'AIzaSyAtKdbzysUTj-Y5Wl7-NP7--CbA3HNobj0',
  authDomain: 'ventas-d8342.firebaseapp.com',
  databaseURL: 'https://ventas-d8342-default-rtdb.firebaseio.com',
  projectId: 'ventas-d8342',
  storageBucket: 'ventas-d8342.firebasestorage.app',
  messagingSenderId: '407957676815',
  appId: '1:407957676815:web:cf8c713faf31d18c8dd47a',
};

const app = getApps()[0] ?? initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
