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

  // Get student record
  const studentSnap = await db.collection('users')
    .where('email','==',studentEmail)
    .limit(1)
    .get();

  if(studentSnap.empty){
    alert('Student not found');
    return;
  }

  const studentDoc = studentSnap.docs[0];
  const studentData = studentDoc.data();

  let studentName = studentData.fullName || studentData.name || studentEmail;
  let gradeLevel = studentData.gradeLevel || '-';

  studentNameEl.innerText = studentName;
  yearSectionEl.innerText = `Year & Section: ${gradeLevel}`;

  submitBtn.addEventListener('click', async ()=>{
    const val = gradeValueEl.value;
    if(val === '' || val === null || val === undefined){
      alert('Enter a grade');
      return;
    }

    const remarks = gradeRemarksEl.value;
    const numericGrade = Number(val) || 0;

    try{
      // Store student grade
      await db.collection('activities').doc(activityId)
        .collection('grades').doc(studentDoc.id)
        .set({
          value: numericGrade,
          remarks,
          gradedBy: user.fullName||user.name||user.email,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

      // Notify student
      await db.collection('notifications').add({
        studentEmail,
        teacherName: user.fullName||user.name||user.email,
        message: `Your activity has been graded.`,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // ⭐ Award star points = same as grade value (ex: grade 85 = +85)
      const pointsAwarded = Math.max(0, Math.floor(numericGrade));
      if(pointsAwarded > 0){
        await incrementStarPoints(studentDoc.id, pointsAwarded);
        console.log(`Awarded ${pointsAwarded} points for grade.`);
      }

      alert(`Grade submitted! Star Points awarded: ${pointsAwarded}`);

      gradeValueEl.value='';
      gradeRemarksEl.value='';

    } catch(e){
      console.error(e);
      alert('Failed to submit grade');
    }
  });
})();

