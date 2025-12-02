// js/notifications.js
(async()=>{
  const user = await loadCurrentUser();
  if(!user){ location.href='index.html'; return; }

  const container = document.getElementById('notifContainer');

  // Load notifications for student or teacher
  const query = user.role==='student'
    ? db.collection('notifications').where('studentEmail','==',user.email).orderBy('createdAt','desc')
    : db.collection('notifications').where('teacherEmail','==',user.email).orderBy('createdAt','desc');

  query.onSnapshot(snapshot=>{
    container.innerHTML='';
    if(snapshot.empty){ container.innerHTML='<p style="color:var(--muted)">No notifications.</p>'; return; }

    snapshot.forEach(doc=>{
      const d = doc.data();
      const card = document.createElement('div');
      card.className='card';
      card.style.marginBottom='8px';
      if(user.role==='student'){
        card.innerHTML=`<p>${d.message || `Teacher ${d.teacherName || ''} has graded your activity.`}</p>`;
      } else {
        card.innerHTML=`<p>${d.studentName} has finished ${d.activityName}</p>`;
        const btn = document.createElement('button');
        btn.className='btn small';
        btn.innerText='Grade';
        btn.addEventListener('click', ()=>{
          window.location.href=`grade_student.html?activityId=${d.activityId}&studentEmail=${d.studentEmail}`;
        });
        card.appendChild(btn);
      }
      container.appendChild(card);
    });
  });

})();
