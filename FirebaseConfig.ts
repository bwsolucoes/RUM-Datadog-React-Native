import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
// --- THIS IS THE CORRECT IMPORT FOR FIREBASE WEB SDK (v9+) IN EXPO MANAGED ---
import { initializeAuth, getReactNativePersistence } from 'firebase/auth'; // <--- THIS SHOULD WORK NOW
// -----------------------------------------------------------------------------
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

export const FIREBASE_APP = initializeApp(firebaseConfig);

export const FIREBASE_AUTH = initializeAuth(FIREBASE_APP, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});

export const FIRESTORE_DB = getFirestore(FIREBASE_APP);