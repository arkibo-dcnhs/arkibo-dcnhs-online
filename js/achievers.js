// js/achievers.js
(async()=>{
  const currentUser = await loadCurrentUser();
  if(!currentUser){ location.href='index.html'; return; }

  const leaderboardTableBody = document.querySelector('#leaderboardTable tbody');
  const topAchieversDiv = document.getElementById('topAchievers');
  const sectionModal = document.getElementById('sectionModal');
  const sectionSelect = document.getElementById('sectionSelect');
  const saveSectionBtn = document.getElementById('saveSectionBtn');

  // Helper to update user's section
  async function saveUserSection(section){
    if(!section) return alert('Please select a section.');
    try{
      await db.collection('users').doc(currentUser.uid).set({ section }, { merge:true });
      sectionModal.style.display='none';
    }catch(e){ console.error(e); alert('Failed to save section.'); }
  }

  // Prompt student to select section if not already set
  if(currentUser.role==='student' && !currentUser.section){
    sectionModal.style.display='flex';
  }

  saveSectionBtn.addEventListener('click', ()=>{
    const selected = sectionSelect.value;
    saveUserSection(selected);
  });

  // Function to render leaderboard
  function renderLeaderboard(users){
    leaderboardTableBody.innerHTML='';
    let rank=1;
    users.forEach(u=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${rank}</td>
        <td>${u.fullName||u.name||u.email}</td>
        <td>${u.section||'-'}</td>
        <td>${u.starPoints||0}</td>
      `;
      leaderboardTableBody.appendChild(tr);
      rank++;
    });

    // Top 3 Achievers
    const top3 = users.slice(0,3);
    if(top3.length>0){
      topAchieversDiv.innerHTML = 'Top Arkibo Achievers: ' + top3.map(u => `${u.fullName||u.name||u.email} (${u.starPoints||0})`).join(' | ');
    } else topAchieversDiv.innerHTML='';
  }

  // Real-time listener for top 10 students by star points
  db.collection('users')
    .where('role','==','student')
    .orderBy('starPoints','desc')
    .limit(10)
    .onSnapshot(snapshot=>{
      const students=[];
      snapshot.forEach(doc=>{
        students.push(doc.data());
      });
      renderLeaderboard(students);
    }, err=>{ console.error('Leaderboard error:', err); });
})();
