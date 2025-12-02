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

      alert('Grade submitted and notification sent!');
      gradeValueEl.value=''; gradeRemarksEl.value='';
    } catch(e){ console.error(e); alert('Failed to submit grade'); }
  });
})();
