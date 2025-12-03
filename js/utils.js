// js/utils.js
// helper utilities to get current user object from Firestore + local storage

async function loadCurrentUser() {
  const cached = localStorage.getItem('arkibo_user');
  if (cached) {
    try {
      const userData = JSON.parse(cached);
      if (userData.role === 'student' && !userData.approved) {
        alert('Your account is pending verification by an administrator.');
        localStorage.removeItem('arkibo_user');
        location.href = 'index.html';
        return null;
      }
      return userData;
    } catch (e) {
      localStorage.removeItem('arkibo_user');
    }
  }

  return new Promise((resolve) => {
    auth.onAuthStateChanged(async user => {
      if (!user) { resolve(null); return; }
      try {
        const doc = await db.collection('users').doc(user.uid).get();
        const data = doc.exists ? doc.data() : null;
        if (data) {
          data.uid = user.uid;
          if (data.role === 'student' && !data.approved) {
            alert('Your account is pending verification by an administrator.');
            await auth.signOut();
            localStorage.removeItem('arkibo_user');
            location.href = 'index.html';
            resolve(null);
            return;
          }
          localStorage.setItem('arkibo_user', JSON.stringify(data));
          resolve(data);
        } else { resolve(null); }
      } catch (e) { console.error(e); resolve(null); }
    });
  });
}

/* -----------------------------------------
   🔥 NEW ADDITIONS BELOW — NO REMOVALS
------------------------------------------*/

// Fetch fresh user data safely
async function safeGetUser(uid) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    return doc.exists ? doc.data() : null;
  } catch (e) {
    console.error("safeGetUser() error:", e);
    return null;
  }
}

// Refresh localStorage after updating user
async function updateLocalUser(uid) {
  try {
    const newData = await safeGetUser(uid);
    if (newData) {
      newData.uid = uid;
      localStorage.setItem('arkibo_user', JSON.stringify(newData));
    }
  } catch (e) {
    console.error("updateLocalUser() failed:", e);
  }
}

/* -----------------------------------------
   ⭐ STAR POINTS SYSTEM (GLOBAL UTILITY)
------------------------------------------*/

// amount can be positive or negative
async function incrementStarPoints(uid, amount) {
  if (!uid || !amount) return;

  try {
    const userRef = db.collection('users').doc(uid);
    const doc = await userRef.get();

    if (!doc.exists) return;

    const user = doc.data();

    // Only students can earn points
    if (user.role !== "student") {
      console.warn("Teachers/Admins will NOT earn points.");
      return;
    }

    const newPoints = (user.starPoints || 0) + amount;

    await userRef.set({
      starPoints: newPoints
    }, { merge: true });

    // refresh local cache
    await updateLocalUser(uid);

    console.log(`Star Points Updated: +${amount} → Total = ${newPoints}`);

  } catch (e) {
    console.error("incrementStarPoints() error:", e);
  }
}

