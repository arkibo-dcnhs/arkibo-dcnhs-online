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

  // HELPER: Add star points to student
  async function addStarPoints(points, reason=""){
    try{
      const studentSnap = await db.collection('users').where('email','==',studentEmail).limit(1).get();
      if(studentSnap.empty) return;
      const studentDocId = studentSnap.docs[0].id;
      await db.collection('users').doc(studentDocId).set({
        starPoints: firebase.firestore.FieldValue.increment(points)
      }, { merge:true });

      await db.collection('star_points_logs').add({
        uid: studentSnap.docs[0].id,
        points,
        reason,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }catch(e){ console.error('Failed to add star points:', e); }
  }

  // fetch student info
  const studentDoc = await db.collection('users').where('email','==',studentEmail).limit(1).get();
  let studentName='Student', gradeLevel='-';
  if(!studentDoc.empty){
    const s = studentDoc.docs[0].data();
    studentName = s.fullName || s.name || studentEmail;
    gradeLevel = s.gradeLevel || '-';
  }
  studentNameEl.innerText = studentName;
  yearSectionEl.innerText = `Year & Section: ${gradeLevel}`;

  submitBtn.addEventListener('click', async ()=>{
    const val = gradeValueEl.value;
    if(!val){ alert('Enter a grade'); return; }
    const remarks = gradeRemarksEl.value;

    try{
      // store grade under activity
      await db.collection('activities').doc(activityId)
        .collection('grades').doc(studentDoc.docs[0].id).set({
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

      // AWARD STAR POINTS BASED ON GRADE VALUE
      const numericGrade = Number(val);
      let pointsAwarded = 0;
      if(numericGrade>=90) pointsAwarded = 50;
      else if(numericGrade>=75) pointsAwarded = 40;
      else if(numericGrade>=60) pointsAwarded = 30;
      else pointsAwarded = 20;

      await addStarPoints(pointsAwarded, `Graded activity "${activityId}" with grade ${numericGrade}`);

      alert(`Grade submitted and notification sent! Star Points awarded: ${pointsAwarded}`);
      gradeValueEl.value=''; gradeRemarksEl.value='';
    } catch(e){ console.error(e); alert('Failed to submit grade'); }
  });
})();

