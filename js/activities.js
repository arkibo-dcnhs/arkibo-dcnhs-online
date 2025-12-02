// js/activities.js
(() => {
  let currentUser = null;

  function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])); }
  
  function formatTimestamp(ts){
    if(!ts) return '';
    if(ts.seconds!==undefined) return new Date(ts.seconds*1000).toLocaleString();
    if(ts.toDate) return ts.toDate().toLocaleString();
    return new Date(ts).toLocaleString();
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
        <a href="${escapeHtml(data.link)}" target="_blank">📄 Open Activity / Quiz</a>
      </div>
      ${studentButtons}
    `;

    // Student actions
    if(currentUser.role==='student'){
      wrapper.querySelector(`#doneBtn-${docId}`).addEventListener('click', async ()=>{
        const studentName = currentUser.fullName||currentUser.name||currentUser.email;
        const gradeLevel = currentUser.gradeLevel||'-';
        const confirmMsg = `Submit your completion for ${data.title}?`;
        if(!confirm(confirmMsg)) return;

        try{
          await db.collection('activities').doc(docId)
            .collection('submissions').doc(currentUser.uid)
            .set({ doneAt: firebase.firestore.FieldValue.serverTimestamp(), uid: currentUser.uid, studentName, gradeLevel }, { merge:true });

          // send notification to teacher
          await db.collection('notifications').add({
            activityId: docId,
            activityName: data.title,
            teacherEmail: data.authorEmail,
            studentName,
            studentEmail: currentUser.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });

          alert('Teacher notified!');
        }catch(e){ console.error(e); alert('Failed to notify'); }
      });

      wrapper.querySelector(`#gradeBtn-${docId}`).addEventListener('click', async ()=>{
        const snap = await db.collection('activities').doc(docId)
          .collection('grades').doc(currentUser.uid).get();
        if(snap.exists){
          const d = snap.data();
          alert(`Grade: ${d.value}\nRemarks: ${d.remarks||'None'}`);
        } else alert('No grade available currently. Please wait for teacher.');
      });

      wrapper.querySelector(`#copyLink-${docId}`).addEventListener('click', ()=>{
        navigator.clipboard.writeText(data.link||'').then(()=>{
          alert('Link copied to clipboard!');
        }).catch(()=>{ alert('Failed to copy'); });
      });
    }

    return wrapper;
  }

  async function postActivity() {
    const title = (document.getElementById('activityTitle')?.value||'').trim();
    const yearSubject = (document.getElementById('activityYear')?.value||'').trim();
    const deadline = (document.getElementById('activityDeadline')?.value||'').trim();
    const link = (document.getElementById('activityLink')?.value||'').trim();
    if(!title||!yearSubject||!link){ return alert('Fill required fields'); }
    if(!currentUser || (currentUser.role!=='teacher' && currentUser.role!=='admin')) return alert('Only teachers/admins can post');

    try{
      await db.collection('activities').add({
        title, yearSubject, deadline, link,
        authorName: currentUser.fullName||currentUser.name||currentUser.email,
        authorEmail: currentUser.email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      document.getElementById('activityTitle').value='';
      document.getElementById('activityYear').value='';
      document.getElementById('activityDeadline').value='';
      document.getElementById('activityLink').value='';
      alert('Activity published!');
    }catch(e){ console.error(e); alert('Failed to publish'); }
  }

  (async ()=>{
    currentUser = await loadCurrentUser();
    if(!currentUser){ location.href='index.html'; return; }

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
