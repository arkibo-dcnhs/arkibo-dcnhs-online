// ========================
// AsKibo Forums JS
// ========================

// Load current user
async function loadCurrentUser() {
  const u = JSON.parse(localStorage.getItem('arkibo_user'));
  return u || null;
}

// Escape HTML
function escapeHtml(s){ 
  if(!s) return ''; 
  return s.replace(/[&<>"']/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])); 
}

// Initialize
(async()=>{
  const user = await loadCurrentUser();
  if(!user){ location.href='index.html'; return; }

  // Guidelines modal
  if(!user.hasAgreedGuidelines){
    document.getElementById('guidelinesModal').classList.add('open');
    document.getElementById('agreeGuidelines').onclick = async ()=>{
      await db.collection('users').doc(user.uid).update({hasAgreedGuidelines:true});
      user.hasAgreedGuidelines=true;
      localStorage.setItem('arkibo_user',JSON.stringify(user));
      document.getElementById('guidelinesModal').classList.remove('open');
    };
    document.getElementById('disagreeGuidelines').onclick = ()=>{
      alert('You must agree to the community guidelines to use AsKibo.');
      location.href='main.html';
    };
  }

  // Event listeners
  document.getElementById('createPostBtn').onclick = createPost;
  document.getElementById('refreshPosts').onclick = loadPosts;

  loadPosts(); // initial load
})();

// Create post
async function createPost(){
  const title = document.getElementById('postTitle').value.trim();
  const body = document.getElementById('postBody').value.trim();
  if(!title || !body) { alert('Enter title and message'); return; }

  const user = await loadCurrentUser();
  if(!user) return;

  await db.collection('posts').add({
    title, body,
    authorName: user.fullName || user.name,
    authorEmail: user.email,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    likes: 0, dislikes:0
  });

  document.getElementById('postTitle').value='';
  document.getElementById('postBody').value='';
}

// Load posts (realtime)
function loadPosts(){
  db.collection('posts').orderBy('createdAt','desc').onSnapshot(snapshot=>{
    const container = document.getElementById('postsList');
    container.innerHTML='';
    snapshot.forEach(doc=>{
      const d = doc.data();
      container.appendChild(renderPost(doc.id, d));
    });
  });
}

// Render a single post
function renderPost(postId, data){
  const wrapper = document.createElement('div');
  wrapper.className='post';

  const meta = document.createElement('div');
  meta.className='post-meta';
  meta.innerHTML=`<div><strong>${escapeHtml(data.authorName)}</strong></div>
                  <div>${new Date((data.createdAt?.seconds || Date.now())*1000).toLocaleString()}</div>`;

  const title = document.createElement('div');
  title.className='post-title';
  title.innerText=data.title;

  const body = document.createElement('div');
  body.innerText=data.body;

  // Actions
  const actions = document.createElement('div');
  actions.style.marginTop='8px';

  const likeBtn = document.createElement('button');
  likeBtn.className='react-btn';
  likeBtn.innerHTML=`👍 <span class="count">${data.likes||0}</span>`;
  likeBtn.onclick = async ()=> await db.collection('posts').doc(postId).update({likes:(data.likes||0)+1});

  const dislikeBtn = document.createElement('button');
  dislikeBtn.className='react-btn';
  dislikeBtn.innerHTML=`👎 <span class="count">${data.dislikes||0}</span>`;
  dislikeBtn.onclick = async ()=> await db.collection('posts').doc(postId).update({dislikes:(data.dislikes||0)+1});

  const commentBtn = document.createElement('button');
  commentBtn.className='btn secondary';
  commentBtn.innerText='Comments';
  commentBtn.onclick = ()=> toggleComments(postId);

  actions.appendChild(likeBtn);
  actions.appendChild(dislikeBtn);
  actions.appendChild(commentBtn);

  // Comments wrapper
  const commentWrapper = document.createElement('div');
  commentWrapper.id=`comments-${postId}`;
  commentWrapper.style.display='none';
  commentWrapper.style.marginTop='8px';
  commentWrapper.style.paddingLeft='12px';
  commentWrapper.style.borderLeft='2px solid #eee';

  wrapper.appendChild(meta);
  wrapper.appendChild(title);
  wrapper.appendChild(body);
  wrapper.appendChild(actions);
  wrapper.appendChild(commentWrapper);

  // Load comments realtime
  db.collection('posts').doc(postId).collection('comments').orderBy('createdAt','asc').onSnapshot(snapshot=>{
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

// Toggle comment input/display
function toggleComments(postId){
  const cw = document.getElementById(`comments-${postId}`);
  if(!cw) return;
  if(cw.style.display==='none'){
    const commentText = prompt('Enter your comment:');
    if(commentText) addComment(postId, commentText);
  }
  cw.style.display = cw.style.display==='none' ? 'block' : 'none';
}

// Add comment
async function addComment(postId, text){
  const user = await loadCurrentUser();
  if(!user) return;
  await db.collection('posts').doc(postId).collection('comments').add({
    body:text,
    byName:user.fullName || user.name,
    byEmail:user.email,
    createdAt:firebase.firestore.FieldValue.serverTimestamp(),
    likes:0, dislikes:0
  });
}


