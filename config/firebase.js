import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import {
  getAuth,
  initializeAuth,
  getReactNativePersistence,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAkgW1rV8VhoXNL8DE7EZH6HyEEblTql8Q",
  authDomain: "artlinker-2d4a2.firebaseapp.com",
  projectId: "artlinker-2d4a2",
  storageBucket: "artlinker-2d4a2.firebasestorage.app",
  messagingSenderId: "4188995756",
  appId: "1:4188995756:web:7e2b8334bafdda98d89f09",
  measurementId: "G-L8Z7SR9HCM",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let auth;

try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (error) {
  auth = getAuth(app);
}

const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };