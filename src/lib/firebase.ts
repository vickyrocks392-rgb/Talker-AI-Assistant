import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth();

// Enable robust offline persistence for seamless cross-platform syncing
try {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn("Firestore: Multiple tabs open, offline persistence is active in another tab.");
    } else if (err.code === 'unimplemented') {
      console.warn("Firestore: Browser lacks support for offline persistence.");
    }
  });
} catch (error) {
  console.error("Firestore: System error while booting IndexedDbCache:", error);
}
