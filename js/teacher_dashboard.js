// js/teacher_dashboard.js
(async()=>{
  const user = await loadCurrentUser();
  if(!user){ location.href='index.html'; return; }
  if(user.role!=='teacher' && user.role!=='admin'){ alert('Access denied'); return; }

  const actName = document.getElementById('actName');
  const actYearSubject = document.getElementById('actYearSubject');
  const actDeadline = document.getElementById('actDeadline');
  const actGform = document.getElementById('actGform');
  const postBtn = document.getElementById('postActBtn');
  const actContainer = document.getElementById('activitiesContainer');
  const notifContainer = document.getElementById('notifContainer');

  postBtn.addEventListener('click', async ()=>{
    const name = (actName.value||'').trim();
    const ys = (actYearSubject.value||'').trim();
    const deadline = actDeadline.value ? new Date(actDeadline.value) : null;
    const gform = (actGform.value||'').trim();
    if(!name||!ys||!gform) return alert('Fill all required fields');

    try{
      await db.collection('activities').add({
        name, yearSubject: ys, deadline, gformLink: gform,
        authorEmail: user.email, authorName: user.fullName||user.name||user.email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      alert('Activity posted!');
      actName.value=''; actYearSubject.value=''; actDeadline.value=''; actGform.value='';
    } catch(e){ console.error(e); alert('Failed to post activity'); }
  });

  // load teacher's activities
  db.collection('activities').where('authorEmail','==',user.email).orderBy('createdAt','desc')
    .onSnapshot(snapshot=>{
      actContainer.innerHTML='';
      if(snapshot.empty){ actContainer.innerHTML='<p style="color:var(--muted)">No activities yet.</p>'; return; }
      snapshot.forEach(doc=>{
        const d = doc.data();
        const card = document.createElement('div');
        card.className='card';
        card.style.marginBottom='10px';
        card.innerHTML=`
          <h4>${d.name}</h4>
          <p>Year & Subject: ${d.yearSubject}</p>
          <p>Deadline: ${d.deadline ? new Date(d.deadline.seconds*1000).toLocaleString() : '-'}</p>
          <p>GForms Link: <a href="${d.gformLink}" target="_blank">Open</a></p>
        `;
        actContainer.appendChild(card);
      });
    });

  // load notifications
  db.collection('notifications').where('teacherEmail','==',user.email).orderBy('createdAt','desc')
    .onSnapshot(snapshot=>{
      notifContainer.innerHTML='';
      if(snapshot.empty){ notifContainer.innerHTML='<p style="color:var(--muted)">No notifications.</p>'; return; }
      snapshot.forEach(doc=>{
        const d = doc.data();
        const notif = document.createElement('div');
        notif.className='card';
        notif.style.marginBottom='8px';
        notif.innerHTML = `
          <p><strong>${d.studentName}</strong> has finished <strong>${d.activityName}</strong></p>
          <p>Grade & Section: ${d.gradeLevel}</p>
          <button class="btn small">Grade</button>
        `;
        notif.querySelector('button').addEventListener('click', ()=>{
          // Redirect to grading page (reuse view_activity for grading)
          window.location.href = `grade_student.html?activityId=${d.activityId}&studentEmail=${d.studentEmail}`;
        });
        notifContainer.appendChild(notif);
      });
    });
})();
