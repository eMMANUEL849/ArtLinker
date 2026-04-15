import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAkgW1rV8VhoXNL8DE7EZH6HyEEblTql8Q",
  authDomain: "artlinker-2d4a2.firebaseapp.com",
  projectId: "artlinker-2d4a2",
  storageBucket: "artlinker-2d4a2.firebasestorage.app",
  messagingSenderId: "4188995756",
  appId: "1:4188995756:web:7e2b8334bafdda98d89f09",
  measurementId: "G-L8Z7SR9HCM"
};

const app = initializeApp(firebaseConfig);

// Services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

