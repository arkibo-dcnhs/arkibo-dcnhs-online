// js/firebase-config.js

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCoqKe0g7urASGXrAIRB4s1Xq2xWZTrYWw",
  authDomain: "arkibo-online-8f03f.firebaseapp.com",
  projectId: "arkibo-online-8f03f",
  storageBucket: "arkibo-online-8f03f.firebasestorage.app",
  messagingSenderId: "569143518592",
  appId: "1:569143518592:web:529597c97f4ca949fa0d65"
};

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

// Approved teachers list for immediate testing
const approvedTeachersForTesting = [
  "malacatnicolorenzo@gmail.com"
];

// helper: returns approvedTeachers config doc if present; otherwise fallback
async function getApprovedTeachers() {
  try {
    const doc = await db.collection("config").doc("approvedTeachers").get();
    if (doc.exists) {
      const data = doc.data();
      if (Array.isArray(data.list)) return data.list;
    }
  } catch (e) {
    console.warn("No approvedTeachers config doc — using local fallback.");
  }
  return approvedTeachersForTesting;
}

