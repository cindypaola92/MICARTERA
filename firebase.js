import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyDk4vjExER-qsFzGkNcRFEr_iAZnJK4EWg",
  authDomain: "micartera-f5bed.firebaseapp.com",
  databaseURL: "https://micartera-f5bed-default-rtdb.firebaseio.com",
  projectId: "micartera-f5bed",
  storageBucket: "micartera-f5bed.firebasestorage.app",
  messagingSenderId: "952565072039",
  appId: "1:952565072039:web:78c3c3a1f6992711c0db82",
  measurementId: "G-ZYP5E41N72"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
