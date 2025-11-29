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
    } catch(e){ localStorage.removeItem('arkibo_user'); }
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
      } catch(e){ console.error(e); resolve(null); }
    });
  });
}
