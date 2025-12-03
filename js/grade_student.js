// js/grade_student.js
(async()=>{
  const user = await loadCurrentUser();
  if(!user){ location.href='index.html'; return; }
  if(user.role!=='teacher' && user.role!=='admin'){ alert('Access denied'); return; }

  const params = new URLSearchParams(window.location.search);
  const activityId = params.get('activityId');
  const studentEmail = params.get('studentEmail');
  if(!activityId || !studentEmail){ alert('Invalid request'); return; }

  const studentNameEl = document.getElementById('studentName');
  const yearSectionEl = document.getElementById('yearSection');
  const gradeValueEl = document.getElementById('gradeValue');
  const gradeRemarksEl = document.getElementById('gradeRemarks');
  const submitBtn = document.getElementById('submitGrade');

  // HELPER: Add star points to student (by student email lookup)
  async function addStarPoints(points, reason=""){
    try{
      const studentSnap = await db.collection('users').where('email','==',studentEmail).limit(1).get();
      if(studentSnap.empty) return;
      const studentDocId = studentSnap.docs[0].id;
      await db.collection('users').doc(studentDocId).set({
        starPoints: firebase.firestore.FieldValue.increment(points)
      }, { merge:true });

      await db.collection('star_points_logs').add({
        uid: studentDocId,
        points,
        reason,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }catch(e){ console.error('Failed to add star points:', e); }
  }

  // fetch student info
  const studentDocSnap = await db.collection('users').where('email','==',studentEmail).limit(1).get();
  if(studentDocSnap.empty){ alert('Student not found'); return; }
  const studentDoc = studentDocSnap.docs[0]; // firestore doc
  const studentData = studentDoc.data();

  let studentName = studentData.fullName || studentData.name || studentEmail;
  let gradeLevel = studentData.gradeLevel || '-';

  studentNameEl.innerText = studentName;
  yearSectionEl.innerText = `Year & Section: ${gradeLevel}`;

  submitBtn.addEventListener('click', async ()=>{
    const val = gradeValueEl.value;
    if(val === '' || val === null || val === undefined){ alert('Enter a grade'); return; }
    const remarks = gradeRemarksEl.value;

    try{
      // store grade under activity
      await db.collection('activities').doc(activityId)
        .collection('grades').doc(studentDoc.id).set({
          value: val,
          remarks,
          gradedBy: user.fullName||user.name||user.email,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

      // send notification to student
      await db.collection('notifications').add({
        studentEmail,
        teacherName: user.fullName||user.name||user.email,
        message: `Congratulations. Teacher ${user.fullName||user.name} has graded your output. Please check "View Grade".`,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // --- OPTION A: 1 star point per grade point ---
      const numericGrade = Number(val) || 0;
      const pointsAwarded = Math.max(0, Math.floor(numericGrade)); // ensure integer non-negative
      if(pointsAwarded > 0){
        await addStarPoints(pointsAwarded, `Graded activity "${activityId}" with grade ${numericGrade}`);
      }

      alert(`Grade submitted and notification sent! Star Points awarded: ${pointsAwarded}`);
      gradeValueEl.value=''; gradeRemarksEl.value='';
    } catch(e){ console.error(e); alert('Failed to submit grade'); }
  });
})();
