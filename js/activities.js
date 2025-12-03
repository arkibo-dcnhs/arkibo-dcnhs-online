// js/activities.js
(() => {
  let currentUser = null;

  function escapeHtml(s){
    if(!s) return '';
    return String(s).replace(/[&<>"']/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]));
  }

  async function loadCurrentUserOrRedirect(){
    const user = await loadCurrentUser();
    if(!user){ location.href='index.html'; return null; }
    return user;
  }

  // HELPER: Add star points
  async function addStarPoints(points, reason='') {
    if(!currentUser || currentUser.role!=='student') return;
    try{
      const ref = db.collection('users').doc(currentUser.uid);
      await ref.set({
        starPoints: firebase.firestore.FieldValue.increment(points)
      }, { merge:true });

      // Log points
      await db.collection('star_points_logs').add({
        uid: currentUser.uid,
        points,
        reason,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }catch(e){ console.error('Failed to add star points:', e); }
  }

  function renderActivityElement(docId, data) {
    const wrapper = document.createElement('div');
    wrapper.className = 'announcement';

    let studentButtons = '';
    if(currentUser.role==='student'){
      studentButtons = `
        <div class="actions-row" style="margin-top:8px; display:flex; gap:8px;">
          <button class="btn small" id="doneBtn-${docId}">Notify Teacher "I'm Done"</button>
          <button class="btn small secondary" id="gradeBtn-${docId}">View Grade</button>
          <button class="btn small secondary" id="copyLink-${docId}">Copy Link</button>
        </div>
      `;
    }

    wrapper.innerHTML = `
      <div class="meta" style="margin-bottom:8px;">
        <strong>${escapeHtml(data.title)}</strong>
        <div style="font-size:13px;color:var(--muted)">${escapeHtml(data.yearSubject||'')}</div>
        <div style="font-size:12px;color:var(--muted)">Deadline: ${data.deadline||'N/A'}</div>
      </div>
      <div style="margin-top:8px;">
        <a href="${escapeHtml(data.link)}" target="_blank" id="activityLink-${docId}">📄 Open Activity / Quiz</a>
      </div>
      ${studentButtons}
    `;

    if(currentUser.role==='student'){
      // CLICK ACTIVITY/QUIZ -> +30 points
      const linkEl = wrapper.querySelector(`#activityLink-${docId}`);
      if (linkEl) {
        linkEl.addEventListener('click', async ()=>{
          try {
            await addStarPoints(30, `Opened Activity/Quiz "${data.title}"`);
          } catch(e){ console.error('Error awarding points for opening activity', e); }
        });
      }

      // Notify teacher "I'm done"
      const doneBtn = wrapper.querySelector(`#doneBtn-${docId}`);
      if (doneBtn) {
        doneBtn.addEventListener('click', async ()=>{
          const studentName = currentUser.fullName||currentUser.name||currentUser.email;
          const gradeLevel = currentUser.gradeLevel||'-';
          if(!confirm(`Submit completion for "${data.title}"?`)) return;
          try{
            await db.collection('activities').doc(docId)
              .collection('submissions').doc(currentUser.uid)
              .set({
                doneAt: firebase.firestore.FieldValue.serverTimestamp(),
                uid: currentUser.uid,
                studentName,
                gradeLevel
              }, { merge:true });

            await db.collection('notifications').add({
              activityId: docId,
              activityName: data.title,
              teacherEmail: data.authorEmail,
              studentName,
              studentEmail: currentUser.email,
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Award +50 points
            await addStarPoints(50, `Notified teacher completion for "${data.title}"`);
            alert('Teacher notified!');
          }catch(e){ console.error(e); alert('Failed to notify teacher.'); }
        });
      }

      // View grade
      const gradeBtn = wrapper.querySelector(`#gradeBtn-${docId}`);
      if (gradeBtn) {
        gradeBtn.addEventListener('click', async ()=> {
          try {
            const snap = await db.collection('activities').doc(docId)
              .collection('grades').doc(currentUser.uid).get();
            if(snap.exists){
              const d = snap.data();
              alert(`Grade: ${d.value}\nRemarks: ${d.remarks||'None'}`);
            } else alert('No grade available yet. Please wait for teacher.');
          } catch(e){ console.error('Error fetching grade', e); alert('Failed to fetch grade'); }
        });
      }

      // Copy link
      const copyBtn = wrapper.querySelector(`#copyLink-${docId}`);
      if (copyBtn) {
        copyBtn.addEventListener('click', ()=>{
          navigator.clipboard.writeText(data.link||'').then(()=>{ alert('Link copied to clipboard!'); })
          .catch(()=>{ alert('Failed to copy link.'); });
        });
      }
    }

    return wrapper;
  }

  async function postActivity() {
    const title = (document.getElementById('activityTitle')?.value||'').trim();
    const yearSubject = (document.getElementById('activityYear')?.value||'').trim();
    const deadline = (document.getElementById('activityDeadline')?.value||'').trim();
    const link = (document.getElementById('activityLink')?.value||'').trim();
    if(!title||!yearSubject||!link) return alert('Please fill required fields.');
    if(currentUser.role!=='teacher' && currentUser.role!=='admin') return alert('Only teachers/admins can post.');

    try{
      await db.collection('activities').add({
        title,
        yearSubject,
        deadline,
        link,
        authorName: currentUser.fullName||currentUser.name||currentUser.email,
        authorEmail: currentUser.email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      document.getElementById('activityTitle').value='';
      document.getElementById('activityYear').value='';
      document.getElementById('activityDeadline').value='';
      document.getElementById('activityLink').value='';
      alert('Activity published!');
    }catch(e){ console.error(e); alert('Failed to publish activity.'); }
  }

  (async ()=>{
    currentUser = await loadCurrentUserOrRedirect();
    if(!currentUser) return;

    // TEACHER/ADMIN CREATE AREA
    const createArea = document.getElementById('createActivityArea');
    const postBtn = document.getElementById('postActivityBtn');
    if(createArea && postBtn){
      if(currentUser.role==='teacher'||currentUser.role==='admin'){
        createArea.classList.remove('hidden');
        postBtn.addEventListener('click', postActivity);
      } else createArea.classList.add('hidden');
    }

    const container = document.getElementById('activitiesContainer');
    if(!container) return;

    // Real-time listener for all activities
    db.collection('activities').orderBy('createdAt','desc')
      .onSnapshot(snapshot=>{
        container.innerHTML='';
        if(snapshot.empty){ container.innerHTML='<p style="color:var(--muted)">No activities yet.</p>'; return; }
        snapshot.forEach(doc=>{
          const el = renderActivityElement(doc.id, doc.data());
          container.appendChild(el);
        });
      }, err=>{ console.error(err); container.innerHTML='<p style="color:var(--muted)">Error loading activities</p>'; });
  })();
})();
