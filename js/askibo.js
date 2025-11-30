// js/askibo.js
// Robust Askibo Forums client (real-time posts, comments, reactions, single listeners, stable UI)

let currentUser = null;
const postsMap = new Map();          // postId -> { el, commentsOpen }
const commentsListenerMap = new Map(); // postId -> unsubscribeFn

(async () => {
  currentUser = await loadCurrentUser();
  if (!currentUser) {
    location.href = "index.html";
    return;
  }

  // Ensure DOM elements exist
  const createBtn = document.getElementById("createPostBtn");
  if (createBtn) createBtn.addEventListener("click", createPost);

  // Start real-time posts listener
  loadPostsRealtime();
})();

//
// CREATE POST
//
async function createPost() {
  const titleEl = document.getElementById("postTitle");
  const bodyEl = document.getElementById("postBody");
  const title = titleEl?.value?.trim();
  const body = bodyEl?.value?.trim();

  if (!title || !body) {
    alert("Please enter a title and message.");
    return;
  }

  try {
    await db.collection("askibo_posts").add({
      uid: currentUser.uid,
      authorName: currentUser.fullName || currentUser.name || "Unknown",
      authorEmail: currentUser.email,
      title,
      body,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      likes: 0,
      dislikes: 0
    });

    if (titleEl) titleEl.value = "";
    if (bodyEl) bodyEl.value = "";
  } catch (err) {
    console.error("Error creating post:", err);
    alert("Failed to create post. Check console.");
  }
}

//
// LOAD POSTS REAL-TIME
//
function loadPostsRealtime() {
  const postsRef = db.collection("askibo_posts").orderBy("createdAt", "desc");
  postsRef.onSnapshot(snapshot => {
    const listEl = document.getElementById("postsList");
    if (!listEl) return;

    snapshot.docChanges().forEach(change => {
      const doc = change.doc;
      const id = doc.id;
      const data = doc.data();

      if (change.type === "added") {
        const el = renderPostElement(id, data);
        postsMap.set(id, { el, commentsOpen: false });
        listEl.insertBefore(el, listEl.firstChild);
      }

      if (change.type === "modified") {
        const item = postsMap.get(id);
        if (item && item.el) {
          patchPostElement(item.el, data);
        }
      }

      if (change.type === "removed") {
        const item = postsMap.get(id);
        if (item && item.el && item.el.parentNode) {
          removeCommentsListener(id);
          item.el.parentNode.removeChild(item.el);
          postsMap.delete(id);
        }
      }
    });

    if (snapshot.empty) {
      listEl.innerHTML = "<p>No posts yet.</p>";
    }
  }, err => {
    console.error("Posts realtime error:", err);
  });
}

//
// RENDER POST ELEMENT
//
function renderPostElement(postId, data) {
  const box = document.createElement("div");
  box.className = "post";
  box.dataset.postId = postId;

  const date = data.createdAt?.seconds
    ? new Date(data.createdAt.seconds * 1000).toLocaleString()
    : "Just now";

  box.innerHTML = `
    <div class="post-meta">
      <div style="display:flex;flex-direction:column;">
        <strong class="post-author">${escapeHtml(data.authorName)}</strong>
        <span class="timestamp">${escapeHtml(date)}</span>
      </div>
    </div>
    <div class="post-title">${escapeHtml(data.title)}</div>
    <div class="post-body">${escapeHtml(data.body)}</div>
    <div class="actions-row" style="margin-top:10px;">
      <div class="react-row" style="gap:12px;">
        <button class="react-btn like-btn" data-post="${postId}">👍 <span class="count like-count">${data.likes||0}</span></button>
        <button class="react-btn dislike-btn" data-post="${postId}">👎 <span class="count dislike-count">${data.dislikes||0}</span></button>
      </div>
      <div style="margin-left:auto;display:flex;gap:8px;align-items:center;">
        <button class="btn small comment-toggle" data-post="${postId}">Comments</button>
      </div>
    </div>
    <div class="comments-area" id="comments-area-${postId}" style="display:none; margin-top:12px;">
      <div class="comments-list" id="comments-${postId}"></div>
      <div class="comment-composer" style="margin-top:8px;">
        <textarea id="composer-${postId}" placeholder="Write a comment..." rows="2"></textarea>
        <button class="btn small" data-post="${postId}" id="sendComment-${postId}">Send</button>
      </div>
    </div>
  `;

  // LIKE BUTTON
  const likeBtn = box.querySelector(".like-btn");
  likeBtn?.addEventListener("click", async () => {
    const span = likeBtn.querySelector(".like-count");
    const prev = Number(span.innerText||0);
    span.innerText = prev + 1;
    try {
      await db.collection("askibo_posts").doc(postId).update({
        likes: firebase.firestore.FieldValue.increment(1)
      });
    } catch(err) {
      console.error("Like error:", err);
      span.innerText = prev;
      alert("Failed to like post.");
    }
  });

  // DISLIKE BUTTON
  const dislikeBtn = box.querySelector(".dislike-btn");
  dislikeBtn?.addEventListener("click", async () => {
    const span = dislikeBtn.querySelector(".dislike-count");
    const prev = Number(span.innerText||0);
    span.innerText = prev + 1;
    try {
      await db.collection("askibo_posts").doc(postId).update({
        dislikes: firebase.firestore.FieldValue.increment(1)
      });
    } catch(err) {
      console.error("Dislike error:", err);
      span.innerText = prev;
      alert("Failed to dislike post.");
    }
  });

  // COMMENT TOGGLE
  const commentToggle = box.querySelector(".comment-toggle");
  commentToggle?.addEventListener("click", () => toggleCommentsUI(postId));

  // SEND COMMENT
  const sendBtn = box.querySelector(`#sendComment-${postId}`);
  sendBtn?.addEventListener("click", async () => {
    const ta = document.getElementById(`composer-${postId}`);
    if (!ta) return;
    const text = ta.value.trim();
    if (!text) return alert("Enter a comment.");
    try {
      await db.collection("askibo_posts").doc(postId)
        .collection("comments").add({
          body: text,
          byName: currentUser.fullName || currentUser.name || "Unknown",
          byEmail: currentUser.email || "",
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          likes: 0
        });
      ta.value = "";
    } catch(err) {
      console.error("Comment error:", err);
      alert("Failed to comment.");
    }
  });

  return box;
}

//
// PATCH POST ELEMENT (update counts safely)
//
function patchPostElement(el, data) {
  const likeSpan = el.querySelector(".like-count");
  const dislikeSpan = el.querySelector(".dislike-count");
  const titleEl = el.querySelector(".post-title");
  const bodyEl = el.querySelector(".post-body");
  const authorEl = el.querySelector(".post-author");
  const tsEl = el.querySelector(".timestamp");

  if (likeSpan) likeSpan.innerText = typeof data.likes==="number"?data.likes:likeSpan.innerText;
  if (dislikeSpan) dislikeSpan.innerText = typeof data.dislikes==="number"?data.dislikes:dislikeSpan.innerText;
  if (titleEl) titleEl.innerText = data.title||"";
  if (bodyEl) bodyEl.innerText = data.body||"";
  if (authorEl) authorEl.innerText = data.authorName||data.authorEmail||"";
  if (tsEl) tsEl.innerText = data.createdAt?.seconds
    ? new Date(data.createdAt.seconds*1000).toLocaleString()
    : tsEl.innerText;
}

//
// TOGGLE COMMENTS UI (lazy attach listener)
//
function toggleCommentsUI(postId) {
  const area = document.getElementById(`comments-area-${postId}`);
  if (!area) return;
  const open = area.style.display !== "none";
  if (open) {
    area.style.display = "none";
    postsMap.get(postId).commentsOpen = false;
    return;
  }
  area.style.display = "block";
  postsMap.get(postId).commentsOpen = true;

  if (!commentsListenerMap.has(postId)) {
    const commentsRef = db.collection("askibo_posts").doc(postId)
      .collection("comments").orderBy("createdAt","asc");
    const unsub = commentsRef.onSnapshot(snapshot => {
      const container = document.getElementById(`comments-${postId}`);
      if (!container) return;
      container.innerHTML = "";
      if (snapshot.empty) {
        const p = document.createElement("div");
        p.className = "text-muted";
        p.innerText = "No comments yet.";
        container.appendChild(p);
        return;
      }
      snapshot.forEach(doc => {
        const c = doc.data();
        const cid = doc.id;
        container.appendChild(renderCommentElement(postId,cid,c));
      });
    }, err => console.error("Comments listener error:",err));
    commentsListenerMap.set(postId, unsub);
  }
}

//
// RENDER COMMENT ELEMENT
//
function renderCommentElement(postId, commentId, c) {
  const wrapper = document.createElement("div");
  wrapper.className = "comment";

  const time = c.createdAt?.seconds?new Date(c.createdAt.seconds*1000).toLocaleString():"Just now";

  wrapper.innerHTML = `
    <div class="comment-meta">
      <strong>${escapeHtml(c.byName||c.byEmail||"Anon")}</strong>
      <span class="timestamp">${escapeHtml(time)}</span>
    </div>
    <div class="comment-body">${escapeHtml(c.body||"")}</div>
    <div class="comment-footer">
      <button class="like-btn">👍 <span class="count">${c.likes||0}</span></button>
    </div>
  `;

  const likeBtn = wrapper.querySelector(".like-btn");
  likeBtn?.addEventListener("click", async () => {
    const span = likeBtn.querySelector(".count");
    const prev = Number(span.innerText||0);
    span.innerText = prev+1;
    try {
      await db.collection("askibo_posts").doc(postId)
        .collection("comments").doc(commentId)
        .update({ likes: firebase.firestore.FieldValue.increment(1) });
    } catch(err) {
      console.error("Comment like error:",err);
      span.innerText = prev;
      alert("Failed to like comment.");
    }
  });

  return wrapper;
}

//
// ESCAPE HTML
//
function escapeHtml(s) {
  if (!s) return "";
  return String(s).replace(/[&<>"']/g,m=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[m]));
}



