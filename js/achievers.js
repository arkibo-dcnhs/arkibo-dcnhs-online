// js/achievers.js
(async () => {
  const currentUser = await loadCurrentUser();
  if (!currentUser) { location.href = 'index.html'; return; }

  const leaderboardTableBody = document.querySelector('#leaderboardTable tbody');
  const topAchieversDiv = document.getElementById('topAchievers');
  const sectionModal = document.getElementById('sectionModal');
  const sectionSelect = document.getElementById('sectionSelect');
  const saveSectionBtn = document.getElementById('saveSectionBtn');

  // -------------------------------
  // Helper: Save section
  // -------------------------------
  async function saveUserSection(section) {
    if (!section) return alert('Please select a section.');
    try {
      await db.collection('users').doc(currentUser.uid).set({ section }, { merge: true });
      sectionModal.style.display = 'none';
      currentUser.section = section;
    } catch (e) {
      console.error(e);
      alert('Failed to save section.');
    }
  }

  // -------------------------------
  // Show section modal if student has no section
  // -------------------------------
  if (currentUser.role === 'student' && !currentUser.section) {
    sectionModal.style.display = 'flex';
  }

  saveSectionBtn.addEventListener('click', () => {
    const selected = sectionSelect.value;
    saveUserSection(selected);
  });

  // -------------------------------
  // Render leaderboard
  // -------------------------------
  function renderLeaderboard(users) {
    leaderboardTableBody.innerHTML = '';
    let rank = 1;
    users.forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${rank}</td>
        <td>${u.fullName || u.name || u.email}</td>
        <td>${u.section || '-'}</td>
        <td>${u.starPoints || 0}</td>
      `;
      leaderboardTableBody.appendChild(tr);
      rank++;
    });

    const top3 = users.slice(0, 3);
    topAchieversDiv.innerHTML = top3.length
      ? 'Top Arkibo Achievers: ' + top3.map(u => `${u.fullName || u.name || u.email} (${u.starPoints || 0})`).join(' | ')
      : '';
  }

  // -------------------------------
  // Real-time leaderboard
  // -------------------------------
  try {
    db.collection('users')
      .where('role', '==', 'student')
      .where('approved', '==', true)   // Only approved students
      .orderBy('starPoints', 'desc')
      .limit(10)
      .onSnapshot(snapshot => {
        const students = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          data.uid = doc.id;
          students.push(data);
        });
        renderLeaderboard(students);
      }, err => {
        console.error('Leaderboard error:', err);
        leaderboardTableBody.innerHTML = '<tr><td colspan="4" style="color:red;">Failed to load leaderboard</td></tr>';
      });
  } catch (e) {
    console.error('Leaderboard listener failed:', e);
  }
})();

