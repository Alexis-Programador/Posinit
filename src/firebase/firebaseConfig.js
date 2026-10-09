import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAtKdbzysUTj-Y5Wl7-NP7--CbA3HNobj0",
  authDomain: "ventas-d8342.firebaseapp.com",
  databaseURL: "https://ventas-d8342-default-rtdb.firebaseio.com",
  projectId: "ventas-d8342",
  storageBucket: "ventas-d8342.firebasestorage.app",
  messagingSenderId: "407957676815",
  appId: "1:407957676815:web:cf8c713faf31d18c8dd47a"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;