import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyChuCgQxtfR7TlSzoCy-Vk8rxyvr8CbN4Y",
  authDomain: "sdoh-patient-risk.firebaseapp.com",
  projectId: "sdoh-patient-risk",
  storageBucket: "sdoh-patient-risk.firebasestorage.app",
  messagingSenderId: "770562173419",
  appId: "1:770562173419:web:32cf2deaeb8870c13891ae"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export default app;
