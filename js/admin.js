(async () => {
  const user = await loadCurrentUser();
  if (!user || (user.role !== 'admin' && user.role !== 'teacher')) {
    alert('Access denied');
    location.href = 'main.html';
    return;
  }

  const listEl = document.getElementById('pendingList');
  listEl.innerHTML = 'Loading...';

  // FIRESTORE REAL-TIME LISTENER
  db.collection('users')
    .where('role', '==', 'student')
    .where('approved', '==', false)
    .orderBy('createdAt', 'desc')
    .onSnapshot(snapshot => {
      listEl.innerHTML = '';
      if (snapshot.empty) {
        listEl.innerHTML = '<p>No pending accounts.</p>';
        return;
      }

      snapshot.forEach(doc => {
        const data = doc.data();
        const id = doc.id;

        const div = document.createElement('div');
        div.className = 'row';
        div.style.justifyContent = 'space-between';
        div.style.padding = '10px';
        div.style.marginBottom = '8px';
        div.style.background = '#fff';
        div.style.borderRadius = '10px';
        div.innerHTML = `<div><strong>${data.fullName}</strong><br><small>${data.email}</small></div>`;

        const approveBtn = document.createElement('button');
        approveBtn.className = 'btn';
        approveBtn.innerText = 'Verify';
        approveBtn.onclick = async () => {
          await db.collection('users').doc(id).update({
            approved: true,
            approvedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        };

        const denyBtn = document.createElement('button');
        denyBtn.className = 'btn secondary';
        denyBtn.innerText = 'Deny';
        denyBtn.onclick = async () => {
          await db.collection('users').doc(id).delete();
        };

        div.appendChild(approveBtn);
        div.appendChild(denyBtn);
        listEl.appendChild(div);
      });
    }, err => {
      console.error("Error loading pending students:", err);
      listEl.innerHTML = '<p>Error loading pending students. Check console.</p>';
    });
})();

