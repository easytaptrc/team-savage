// Firebase: inicialización y exportaciones compartidas
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  onAuthStateChanged, updatePassword, deleteUser, EmailAuthProvider, reauthenticateWithCredential,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc,
  collection, query, where, orderBy, limit, getDocs, onSnapshot, serverTimestamp, Timestamp,
  runTransaction, writeBatch, increment,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyDJwDTPa9iEsEhDFtHqEkNTeSFJaYM4Aho",
  authDomain: "teamsavge-2eff8.firebaseapp.com",
  projectId: "teamsavge-2eff8",
  storageBucket: "teamsavge-2eff8.firebasestorage.app",
  messagingSenderId: "624766562457",
  appId: "1:624766562457:web:e5e6bc22db32da79874808",
  measurementId: "G-619L22V5YE",
};

// Clave VAPID para notificaciones push (Firebase Console → Configuración del proyecto →
// Cloud Messaging → Certificados push web → Generar par de claves). Vacía = solo notificaciones en la app.
export const VAPID_KEY = "";

// Dominio interno para convertir usuario/ID en correo de Firebase Auth (no se envían correos).
export const AUTH_DOMAIN = "teamsavage.app";
export const ADMIN_USER = "sebas";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Caché compartida entre pestañas (el coach puede tener el panel abierto en varias)
export const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

// Analytics solo si el navegador lo soporta
import("https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js")
  .then(async (m) => { if (await m.isSupported()) m.getAnalytics(app); })
  .catch(() => {});

export {
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
  updatePassword, deleteUser, EmailAuthProvider, reauthenticateWithCredential,
  doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc, collection, query, where, orderBy, limit,
  getDocs, onSnapshot, serverTimestamp, Timestamp, runTransaction, writeBatch, increment,
};

export const adminEmail = () => `${ADMIN_USER}@${AUTH_DOMAIN}`;
export const memberEmail = (id, v) => `${String(id).toLowerCase()}-${v}@${AUTH_DOMAIN}`;
export const memberIdFromEmail = (email) => (email || "").split("@")[0].split("-")[0].toUpperCase();
export const isAdminUser = (user) => !!user && user.email === adminEmail();

// Push (FCM) — requiere VAPID_KEY; si falla, la app sigue funcionando con notificaciones internas.
export async function registerPush(ownerKey) {
  if (!VAPID_KEY || !("serviceWorker" in navigator)) return null;
  try {
    const { getMessaging, getToken, isSupported, onMessage } =
      await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js");
    if (!(await isSupported())) return null;
    const reg = await navigator.serviceWorker.ready;
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (token) await setDoc(doc(db, "tokens", token), { owner: ownerKey, at: serverTimestamp() });
    onMessage(messaging, () => {}); // en primer plano lo maneja el listener de Firestore
    return token;
  } catch (e) { console.warn("Push no disponible:", e); return null; }
}
