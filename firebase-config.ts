import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyC9zotWzBBcXAwkh4Cl1H3Cv84rfVdlFVI",
  authDomain: "blumb-37a35.firebaseapp.com",
  projectId: "blumb-37a35",
  storageBucket: "blumb-37a35.firebasestorage.app",
  messagingSenderId: "901926699378",
  appId: "1:901926699378:web:1340b702ee7144dbda9deb",
  measurementId: "G-JNE15LQWMV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export const getFirebaseServices = () => {
  return { auth, db, storage };
};

export const isFirebaseInitialized = () => true;

// Legacy support if needed, effectively no-op as config is static
export const initializeFirebase = (config: any) => true;