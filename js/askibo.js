// =================
// AsKibo Forums JS
// =================

// Load current user (for testing, create dummy user if none exists)
async function loadCurrentUser() {
  let u = JSON.parse(localStorage.getItem('arkibo_user'));
  if (!u) {
    u = { uid:"testuser", name:"Test User", fullName:"Test User", email:"test@example.com" };
    localStorage.setItem('arkibo_user', JSON.stringify(u));
  }
  return u;
}

function escapeHtml(s){
  if(!s) return '';
  return s.replace(/[&<>"']/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]));
}

(async()=>{
  const user = await loadCurrentUser();

  // Guidelines modal
  const modal = document.getElementById('guidelinesModal');
  if(!user.hasAgreedGuidelines){
    modal.classList.add('open');
    document.getElementById('agreeGuidelines').onclick = async ()=>{
      user.hasAgreedGuidelines = true;
      localStorage.setItem('arkibo_user', JSON.stringify(user));
      modal.classList.remove('open');
    };
    document.getElementById('disagreeGuidelines').onclick = ()=>{
      alert('You must agree to guidelines to use AsKibo.');
      location.href='main.html';
    };
  }

  // Post creation
  document.getElementById('createPostBtn').onclick = createPost;

  // Load posts realtime
  db.collection('posts').orderBy('createdAt','desc').onSnapshot(snapshot=>{
    const container = document.getElementById('postsList');
    container.innerHTML = '';
    snapshot.forEach(doc=>{
      const d = doc.data();
      container.appendChild(renderPost(doc.id, d));
    });
  });
})();

// Create a new post
async function createPost(){
  const title = document.getElementById('postTitle').value.trim();
  const body = document.getElementById('postBody').value.trim();
  if(!title || !body){ alert('Enter title and message'); return; }

  const user = await loadCurrentUser();
  await db.collection('posts').add({
    title,
    body,
    authorName: user.fullName || user.name,
    authorEmail: user.email,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    likes:0,
    dislikes:0
  });

  document.getElementById('postTitle').value='';
  document.getElementById('postBody').value='';
}

// Render a single post
function renderPost(postId, data){
  const wrapper = document.createElement('div');
  wrapper.className='post';

  const meta = document.createElement('div');
  meta.className='post-meta';
  meta.innerHTML=`<strong>${escapeHtml(data.authorName)}</strong> — ${new Date((data.createdAt?.seconds||0)*1000).toLocaleString()}`;

  const title = document.createElement('div');
  title.className='post-title';
  title.innerText = data.title;

  const body = document.createElement('div');
  body.innerText = data.body;

  const actions = document.createElement('div');

  const likeBtn = document.createElement('button');
  likeBtn.className='react-btn';
  likeBtn.innerHTML=`👍 <span class="count">${data.likes||0}</span>`;
  likeBtn.onclick = async ()=> {
    await db.collection('posts').doc(postId).update({likes:(data.likes||0)+1});
  };

  const dislikeBtn = document.createElement('button');
  dislikeBtn.className='react-btn';
  dislikeBtn.innerHTML=`👎 <span class="count">${data.dislikes||0}</span>`;
  dislikeBtn.onclick = async ()=> {
    await db.collection('posts').doc(postId).update({dislikes:(data.dislikes||0)+1});
  };

  const commentBtn = document.createElement('button');
  commentBtn.innerText='Comments';
  commentBtn.onclick = ()=> toggleComments(postId);

  actions.appendChild(likeBtn);
  actions.appendChild(dislikeBtn);
  actions.appendChild(commentBtn);

  const commentWrapper = document.createElement('div');
  commentWrapper.id=`comments-${postId}`;
  commentWrapper.style.marginLeft='10px';
  commentWrapper.style.display='none';

  wrapper.appendChild(meta);
  wrapper.appendChild(title);
  wrapper.appendChild(body);
  wrapper.appendChild(actions);
  wrapper.appendChild(commentWrapper);

  // Load comments realtime
  db.collection('posts').doc(postId).collection('comments').orderBy('createdAt','asc')
    .onSnapshot(snapshot=>{
      const cw = document.getElementById(`comments-${postId}`);
      cw.innerHTML='';
      snapshot.forEach(doc=>{
        const c = doc.data();
        const div = document.createElement('div');
        div.className='comment';
        div.innerHTML=`<strong>${escapeHtml(c.byName)}</strong>: ${escapeHtml(c.body)}`;
        cw.appendChild(div);
      });
    });

  return wrapper;
}

// Toggle comments
async function toggleComments(postId){
  const cw = document.getElementById(`comments-${postId}`);
  if(!cw) return;
  if(cw.style.display==='none'){
    const text = prompt('Enter your comment:');
    if(text) addComment(postId, text);
  }
  cw.style.display = cw.style.display==='none'?'block':'none';
}

// Add a comment
async function addComment(postId, text){
  const user = await loadCurrentUser();
  await db.collection('posts').doc(postId).collection('comments').add({
    body:text,
    byName:user.fullName || user.name,
    byEmail:user.email,
    createdAt:firebase.firestore.FieldValue.serverTimestamp()
  });
}
