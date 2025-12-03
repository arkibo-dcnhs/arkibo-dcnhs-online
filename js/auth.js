// js/auth.js
document.addEventListener('DOMContentLoaded', () => {
  const roleEl = document.getElementById('regRole');
  if (roleEl) {
    roleEl.addEventListener('change', () => {
      const studentFields = document.getElementById('studentFields');
      if (roleEl.value === 'student') studentFields.classList.remove('hidden');
      else studentFields.classList.add('hidden');
    });
  }

  const registerBtn = document.getElementById('registerBtn');
  if (registerBtn) registerBtn.addEventListener('click', registerFlow);

  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) loginBtn.addEventListener('click', loginFlow);
});

/* ----------------------------------------------------
   REGISTER
---------------------------------------------------- */
async function registerFlow() {
  const name = (document.getElementById('regFullName')||{}).value?.trim();
  const email = (document.getElementById('regEmail')||{}).value?.trim();
  const pass = (document.getElementById('regPass')||{}).value;
  const role = (document.getElementById('regRole')||{}).value;

  if (!name || !email || !pass || !role) { 
    alert('Please fill all fields'); 
    return; 
  }

  let studentData = {};
  if (role === 'student') {
    const lrn = (document.getElementById('regLRN')||{}).value.trim();
    const section = (document.getElementById('regSection')||{}).value.trim();
    if (!lrn || !section) { alert('Fill LRN and section'); return; }
    studentData = { lrn, section };
  }

  try {
    const userCredential = await auth.createUserWithEmailAndPassword(email, pass);
    const uid = userCredential.user.uid;

    /* BASE FIRESTORE USER DATA */
    const base = {
      fullName: name,
      email,
      role,
      approved: role === 'student' ? false : true, // students start unapproved
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    const userdata = Object.assign(base, studentData);

    /* AUTO-APPROVE TEACHERS (IF MATCHING CONFIG) */
    const approvedTeachers = await getApprovedTeachers();
    if (role === 'teacher' && approvedTeachers.includes(email)) {
      userdata.approved = true;
      if (email === 'malacatnicolorenzo@gmail.com') {
        userdata.role = 'admin';
        userdata.isAdmin = true;
      }
    }

    /* SAVE USER IN PRIMARY USERS COLLECTION */
    await db.collection('users').doc(uid).set(userdata);

    /* ENSURE LEADERBOARD PROFILE EXISTS */
    await ensureUserDoc(
      uid,
      name,
      email,
      userdata.role,
      userdata.section || ""
    );

    try { 
      await userCredential.user.sendEmailVerification(); 
    } catch(e){}

    alert('Registered successfully. Student accounts require admin approval.');
    window.location.href = 'index.html';

  } catch (e) {
    alert(e.message);
  }
}

/* ----------------------------------------------------
   LOGIN
---------------------------------------------------- */
async function loginFlow() {
  const email = (document.getElementById('loginEmail')||{}).value?.trim();
  const pass = (document.getElementById('loginPass')||{}).value;
  const remember = document.getElementById('rememberMe')?.checked;

  if (!email || !pass) { alert('Enter email and password'); return; }

  try {
    if (remember)
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    else
      await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);

    const uc = await auth.signInWithEmailAndPassword(email, pass);

    const doc = await db.collection('users').doc(uc.user.uid).get();
    if (!doc.exists) {
      alert('No user data found — contact admin.');
      return;
    }

    const data = doc.data();
    data.uid = uc.user.uid;

    if (data.role === 'student' && !data.approved) {
      alert('Your account is pending verification by an administrator.');
      await auth.signOut();
      return;
    }

    /* ENSURE USER LEADERBOARD PROFILE EXISTS */
    await ensureUserDoc(
      data.uid,
      data.fullName,
      data.email,
      data.role,
      data.section || ""
    );

    /* Save session */
    localStorage.setItem('arkibo_user', JSON.stringify(data));
    window.location.href = 'main.html';

  } catch (e) {
    alert(e.message);
  }
}
