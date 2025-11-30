// js/askibo.js
// FULLY FIXED ASKIBO FORUM ENGINE

let currentUser = null;

(async () => {
  currentUser = await loadCurrentUser();
  if (!currentUser) {
    location.href = "index.html";
    return;
  }

  // Button: Create Post
  document.getElementById("createPostBtn").addEventListener("click", createPost);

  // Load posts realtime
  loadPostsRealtime();
})();


// ----------------------------------------------------------
// CREATE POST
// ----------------------------------------------------------
async function createPost() {
  const title = document.getElementById("postTitle").value.trim();
  const body = document.getElementById("postBody").value.trim();

  if (!title || !body) {
    alert("Please enter a title and message.");
    return;
  }

  await db.collection("askibo_posts").add({
    uid: currentUser.uid,
    authorName: currentUser.fullName || currentUser.name,
    authorEmail: currentUser.email,
    title,
    body,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    likes: 0,
    dislikes: 0
  });

  // Clear fields
  document.getElementById("postTitle").value = "";
  document.getElementById("postBody").value = "";
}


// ----------------------------------------------------------
// REALTIME POSTS LISTENER
// ----------------------------------------------------------
function loadPostsRealtime() {
  db.collection("askibo_posts")
    .orderBy("createdAt", "desc")
    .onSnapshot(snapshot => {
      const container = document.getElementById("postsList");
      container.innerHTML = "";

      snapshot.forEach(doc => {
        container.appendChild(renderPost(doc.id, doc.data()));
      });
    });
}


// ----------------------------------------------------------
// RENDER POST + COMMENTS + BUTTONS
// ----------------------------------------------------------
function renderPost(postId, data) {
  const box = document.createElement("div");
  box.className = "post";

  const date = data.createdAt?.seconds
    ? new Date(data.createdAt.seconds * 1000).toLocaleString()
    : "Just now";

  box.innerHTML = `
      <div class="post-meta">
        <strong>${escapeHtml(data.authorName)}</strong>
        <div class="small">${date}</div>
      </div>

      <div class="post-title">${escapeHtml(data.title)}</div>
      <div class="post-body">${escapeHtml(data.body)}</div>

      <div class="actions" style="margin-top: 8px;">
        <button class="react-btn" id="like-${postId}">👍 ${data.likes || 0}</button>
        <button class="react-btn" id="dislike-${postId}">👎 ${data.dislikes || 0}</button>
        <button class="btn secondary" id="commentBtn-${postId}" style="width:auto;">Comments</button>
      </div>

      <div id="comments-${postId}" style="display:none; margin-left:10px; border-left:2px solid #eee; padding-left:10px;"></div>
  `;

  // Like
  box.querySelector(`#like-${postId}`).onclick = () =>
    db.collection("askibo_posts").doc(postId).update({
      likes: firebase.firestore.FieldValue.increment(1)
    });

  // Dislike
  box.querySelector(`#dislike-${postId}`).onclick = () =>
    db.collection("askibo_posts").doc(postId).update({
      dislikes: firebase.firestore.FieldValue.increment(1)
    });

  // Show Comments
  box.querySelector(`#commentBtn-${postId}`).onclick = () =>
    toggleComments(postId);

  // Start realtime comments listener
  loadComments(postId);

  return box;
}


// ----------------------------------------------------------
// REALTIME COMMENTS
// ----------------------------------------------------------
function loadComments(postId) {
  db.collection("askibo_posts")
    .doc(postId)
    .collection("comments")
    .orderBy("createdAt", "asc")
    .onSnapshot(snapshot => {
      const container = document.getElementById(`comments-${postId}`);
      container.innerHTML = "";

      snapshot.forEach(doc => {
        const c = doc.data();
        const div = document.createElement("div");
        div.className = "comment";
        div.innerHTML = `<strong>${escapeHtml(c.byName)}</strong>: ${escapeHtml(c.body)}`;
        container.appendChild(div);
      });
    });
}


// ----------------------------------------------------------
// ADD COMMENT
// ----------------------------------------------------------
async function toggleComments(postId) {
  const box = document.getElementById(`comments-${postId}`);
  if (box.style.display === "none") {
    const text = prompt("Enter your comment:");
    if (text && text.trim()) {
      await db
        .collection("askibo_posts")
        .doc(postId)
        .collection("comments")
        .add({
          body: text.trim(),
          byName: currentUser.fullName || currentUser.name,
          byEmail: currentUser.email,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
    box.style.display = "block";
  } else {
    box.style.display = "none";
  }
}


// ----------------------------------------------------------
// ESCAPE HTML
// ----------------------------------------------------------
function escapeHtml(s) {
  if (!s) return "";
  return s.replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}

