const db2 = firebase.firestore();

async function createActivity() {
  const user = await loadCurrentUser();
  if (!user) return;

  if (user.role !== "teacher" && user.role !== "admin") {
    alert("Only teachers/admins can create activities.");
    return;
  }

  const name = document.getElementById("actName").value;
  const subject = document.getElementById("actSubject").value;
  const deadline = document.getElementById("actDeadline").value;
  const link = document.getElementById("actLink").value;

  if (!name || !subject || !deadline || !link) {
    alert("Please fill all fields.");
    return;
  }

  await db2.collection("activities").add({
    name,
    subject,
    deadline,
    formLink: link,
    teacherId: user.uid,
    teacherName: user.fullname,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  alert("Activity posted!");
  location.href = "activities.html";
}
