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

/* --------------------------------------------------------
   APPROVED TEACHERS — REMAINS SAME
-------------------------------------------------------- */
const approvedTeachersForTesting = [
  "malacatnicolorenzo@gmail.com"
];

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

/* --------------------------------------------------------
   COLLECTION REFERENCES (EXPANDED for LEADERBOARD SYSTEM)
-------------------------------------------------------- */
const collections = {
  announcements: db.collection("announcements"),
  activities: db.collection("activities"),
  config: db.collection("config"),
  users: db.collection("users"),            // 🔥 stores user profiles (students + teachers)
  starPoints: db.collection("starPoints")  // 🔥 central point tracking system
};

/* --------------------------------------------------------
   HELPERS — SUBMISSIONS (existing)
-------------------------------------------------------- */
function getActivitySubmissionRef(activityId, studentUid) {
  return collections.activities
    .doc(activityId)
    .collection("submissions")
    .doc(studentUid);
}

function getActivitySubmissionsRef(activityId) {
  return collections.activities
    .doc(activityId)
    .collection("submissions");
}

/* --------------------------------------------------------
   NEW HELPERS — STAR POINT SYSTEM
-------------------------------------------------------- */

/**
 * Ensures a user exists in the 'users' collection.
 * Called on login.
 */
async function ensureUserDoc(uid, name, email, role, section = "") {
  const ref = collections.users.doc(uid);
  const snap = await ref.get();

  if (!snap.exists) {
    await ref.set({
      uid,
      name,
      email,
      role,        // "student" or "teacher"
      section,     // students only
      starPoints: 0
    });
  }
}

/**
 * Awards star points to a student.
 * @param {string} uid - student user ID
 * @param {number} amount - points to add
 */
async function addStarPoints(uid, amount) {
  const ref = collections.users.doc(uid);
  await ref.update({
    starPoints: firebase.firestore.FieldValue.increment(amount)
  });

  // also logged into starPoints history
  await collections.starPoints.add({
    uid,
    amount,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
}

/**
 * Sets or updates a student's section.
 */
async function setStudentSection(uid, section) {
  await collections.users.doc(uid).update({ section });
}

/**
 * Fetch top 10 achievers (real-time)
 */
function getTopAchievers(limitCount = 10) {
  return collections.users
    .where("role", "==", "student")
    .orderBy("starPoints", "desc")
    .limit(limitCount);
}




