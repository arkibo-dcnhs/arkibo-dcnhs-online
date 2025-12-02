// js/view_activity.js
(async () => {
  const user = await loadCurrentUser();
  if(!user){ location.href='index.html'; return; }

  const params = new URLSearchParams(window.location.search);
  const activityId = params.get('id');
  if(!activityId){ document.getElementById('activityCard').innerText = 'Invalid activity.'; return; }

  const card = document.getElementById('activityCard');

  async function fetchActivity(){
    try{
      const doc = await db.collection('activities').doc(activityId).get();
      if(!doc.exists){ card.innerText = 'Activity not found.'; return; }
      const data = doc.data();

      card.innerHTML = `
        <h3>${data.name}</h3>
        <p><strong>Year & Subject:</strong> ${data.yearSubject}</p>
        <p><strong>Deadline:</strong> ${data.deadline ? new Date(data.deadline.seconds*1000).toLocaleString() : '-'}</p>
        <p><strong>Google Forms Link:</strong> <button id="copyLinkBtn" class="btn small">Copy Link</button></p>
        <div id="studentActions" style="margin-top:12px;"></div>
      `;

      // copy link button
      document.getElementById('copyLinkBtn').addEventListener('click', ()=>{
        navigator.clipboard.writeText(data.gformLink || '');
        alert('Link copied!');
      });

      if(user.role==='student'){
        const sa = document.getElementById('studentActions');
        sa.innerHTML = `
          <button id="notifyTeacher" class="btn">Notify Teacher "I'm Done"</button>
          <button id="viewGrade" class="btn secondary">View Grade</button>
          <div id="gradeInfo" style="margin-top:8px;"></div>
        `;

        document.getElementById('notifyTeacher').addEventListener('click', async ()=>{
          const gradeLevel = prompt('Enter your grade level and section:','');
          if(!gradeLevel) return;
          try{
            await db.collection('notifications').add({
              type:'studentDone',
              activityId: activityId,
              studentName: user.fullName || user.name || user.email,
              studentEmail: user.email,
              gradeLevel,
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
              teacherEmail: data.authorEmail,
              activityName: data.name
            });
            alert('Notification sent to teacher!');
          } catch(e){ console.error(e); alert('Failed to notify teacher'); }
        });

        document.getElementById('viewGrade').addEventListener('click', async ()=>{
          const gradeSnap = await db.collection('activities').doc(activityId)
            .collection('grades').doc(user.uid).get();
          const info = document.getElementById('gradeInfo');
          if(gradeSnap.exists){
            const g = gradeSnap.data();
            info.innerHTML = `<p>Grade: ${g.value || '-'}<br>Remarks: ${g.remarks || '-'}</p>`;
          } else info.innerText = 'No grade available currently. Please wait for teacher.';
        });
      }

    } catch(e){ console.error(e); card.innerText = 'Error loading activity.'; }
  }

  fetchActivity();

})();
