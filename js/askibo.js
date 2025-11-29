// js/askibo.js
// Firestore collections: posts -> comments subcollection; likes collection per post

(async ()=>{
  const user = await loadCurrentUser();
  if(!user) { location.href='index.html'; return; }

  // check guidelines agreement
  if (!user.hasAgreedGuidelines) {
    document.getElementById('guidelinesModal').classList.add('open');
    document.getElementById('agreeGuidelines').addEventListener('click', async ()=>{
      await db.collection('users').doc(user.uid).update({ hasAgreedGuidelines: true });
      user.hasAgreedGuidelines = true;
      localStorage.setItem('arkibo_user', JSON.stringify(user));
      document.getElementById('guidelinesModal').classList.remove('open');
    });
    document.getElementById('disagreeGuidelines').addEventListener('click', ()=>{
      alert('You must agree to the community guidelines to use AsKibo.');
      location.href='main.html';
    });
  }

  // post create
  document.getElementById('createPostBtn').addEventListener('click', createPost);

  // realtime load posts using onSnapshot
  db.collection('posts').orderBy('createdAt','desc').onSnapshot(snapshot => {
    const container = document.getElementById('postsList');
    container.innerHTML = '';
    snapshot.forEach(doc=>{
      const d = doc.data();
      container.appendChild(renderPost(doc.id, d));
    });
  });
})();

async function createPost() {
  const title = document.getElementById('postTitle').value?.trim();
  const body = document.getElementById('postBody').value?.trim();
  if (!title || !body) { alert('Enter title and message'); return; }

  const user = await loadCurrentUser();
  if(!user) return;

  // create post
  await db.collection('posts').add({
    title, body,
    authorName: user.fullName || user.name,
    authorEmail: user.email,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    likes: 0,
    dislikes: 0
  });

  document.getElementById('postTitle').value = '';
  document.getElementById('postBody').value = '';
  // onSnapshot will auto-update the posts
}

function renderPost(postId, data) {
  const wrapper = document.createElement('div');
  wrapper.className = 'post';

  const meta = document.createElement('div');
  meta.className = 'post-meta';
  meta.innerHTML = `<div><strong>${escapeHtml(data.authorName)}</strong></div>
                    <div>${new Date((data.createdAt && data.createdAt.seconds)? data.createdAt.seconds*1000 : Date.now()).toLocaleString()}</div>`;

  const title = document.createElement('div');
  title.className = 'post-title';
  title.innerText = data.title;

  const body = document.createElement('div');
  body.innerText = data.body;

  // action row
  const actions = document.createElement('div');
  actions.style.marginTop = '8px';

  const likeBtn = document.createElement('button');
  likeBtn.className = 'react-btn';
  likeBtn.innerHTML = `👍 <span class="count">${data.likes||0}</span>`;
  likeBtn.onclick = async ()=>{
    await db.collection('posts').doc(postId).update({ likes: (data.likes||0)+1 });
  };

  const dislikeBtn = document.createElement('button');
  dislikeBtn.className = 'react-btn';
  dislikeBtn.innerHTML = `👎 <span class="count">${data.dislikes||0}</span>`;
  dislikeBtn.onclick = async ()=>{
    await db.collection('posts').doc(postId).update({ dislikes: (data.dislikes||0)+1 });
  };

  const commentBtn = document.createElement('button');
  commentBtn.className = 'btn secondary';
  commentBtn.style.width = 'auto';
  commentBtn.innerText = 'Comments';
  commentBtn.onclick = ()=> toggleComments(postId);

  actions.appendChild(likeBtn);
  actions.appendChild(dislikeBtn);
  actions.appendChild(commentBtn);

  // comment container
  const commentWrapper = document.createElement('div');
  commentWrapper.id = `comments-${postId}`;
  commentWrapper.style.marginTop = '8px';
  commentWrapper.style.display = 'none';
  commentWrapper.style.paddingLeft = '12px';
  commentWrapper.style.borderLeft = '2px solid #eee';

  wrapper.appendChild(meta);
  wrapper.appendChild(title);
  wrapper.appendChild(body);
  wrapper.appendChild(actions);
  wrapper.appendChild(commentWrapper);

  // setup real-time comments listener
  db.collection('posts').doc(postId).collection('comments')
    .orderBy('createdAt','asc')
    .onSnapshot(snapshot=>{
      const cw = document.getElementById(`comments-${postId}`);
      cw.innerHTML = '';
      snapshot.forEach(doc=>{
        const c = doc.data();
        const div = document.createElement('div');
        div.className = 'comment';
        div.style.marginBottom = '4px';
        div.innerHTML = `<strong>${escapeHtml(c.byName)}</strong>: ${escapeHtml(c.body)}`;
        cw.appendChild(div);
      });
    });

  return wrapper;
}

function toggleComments(postId){
  const cw = document.getElementById(`comments-${postId}`);
  if(!cw) return;
  if(cw.style.display==='none'){
    const commentText = prompt('Enter your comment:');
    if(commentText) addComment(postId, commentText);
  }
  cw.style.display = cw.style.display==='none' ? 'block' : 'none';
}

async function addComment(postId, text){
  const user = await loadCurrentUser();
  if(!user) return;
  await db.collection('posts').doc(postId).collection('comments').add({
    body: text,
    byName: user.fullName || user.name,
    byEmail: user.email,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    likes: 0,
    dislikes: 0
  });
  // no need to refresh; onSnapshot will handle it
}

function escapeHtml(s){ if(!s) return ''; return s.replace(/[&<>"']/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])); }

