// js/askibo.js
// Robust Askibo Forums client (real-time posts, comments, reactions, single listeners, stable UI)

let currentUser = null;
const postsMap = new Map();           // postId -> { el, commentsOpen }
const commentsListenerMap = new Map(); // postId -> unsubscribeFn

//
// ESCAPE HTML (needed for rendering posts/comments safely)
//
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

  // Optional: refresh button if present
  const refreshBtn = document.getElementById("refreshPosts");
  if (refreshBtn) refreshBtn.addEventListener("click", () => loadPostsSnapshotOnce());
})();

//
// HELPER: Add star points to student
//
async function addStarPoints(points, reason="") {
  if (!currentUser || currentUser.role !== "student") return;
  try {
    const ref = db.collection("users").doc(currentUser.uid);
    await ref.set({
      starPoints: firebase.firestore.FieldValue.increment(points)
    }, { merge: true });

    await db.collection("star_points_logs").add({
      uid: currentUser.uid,
      points,
      reason,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error("Failed to add star points:", err);
  }
}

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

    await addStarPoints(20, "Posted in Askibo Forums");

    if (titleEl) titleEl.value = "";
    if (bodyEl) bodyEl.value = "";
  } catch (err) {
    console.error("Error creating post:", err);
    alert("Failed to create post. Check console.");
  }
}

//
// Load posts realtime
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
// TOGGLE COMMENTS UI & LISTENER
//
function toggleCommentsUI(postId) {
  const area = document.getElementById(`comments-area-${postId}`);
  if (!area) return;

  const item = postsMap.get(postId);
  if (!item) return;

  if (area.style.display === "none") {
    area.style.display = "block";
    item.commentsOpen = true;
    startCommentsListener(postId);
  } else {
    area.style.display = "none";
    item.commentsOpen = false;
    removeCommentsListener(postId);
  }
}

//
// COMMENTS REALTIME LISTENER
//
function startCommentsListener(postId) {
  if (commentsListenerMap.has(postId)) return;

  const listEl = document.getElementById(`comments-${postId}`);
  if (!listEl) return;

  const unsubscribe = db.collection("askibo_posts").doc(postId)
    .collection("comments").orderBy("createdAt", "asc")
    .onSnapshot(snapshot => {
      listEl.innerHTML = "";
      snapshot.forEach(doc => {
        const commentEl = renderCommentElement(doc.data());
        listEl.appendChild(commentEl);
      });
      if (snapshot.empty) {
        listEl.innerHTML = "<p class='small' style='color:#888'>No comments yet.</p>";
      }
    });

  commentsListenerMap.set(postId, unsubscribe);
}

function removeCommentsListener(postId) {
  const unsubscribe = commentsListenerMap.get(postId);
  if (unsubscribe) {
    unsubscribe();
    commentsListenerMap.delete(postId);
  }
}

//
// RENDER COMMENT ELEMENT
//
function renderCommentElement(data) {
  const div = document.createElement("div");
  div.className = "comment-item";
  div.style.borderBottom = "1px solid #eee";
  div.style.padding = "6px 0";
  
  const date = data.createdAt?.seconds
    ? new Date(data.createdAt.seconds * 1000).toLocaleString()
    : "Just now";

  div.innerHTML = `
    <div style="font-size:12px; color: var(--green-1);"><strong>${escapeHtml(data.byName)}</strong></div>
    <div style="font-size:14px; margin: 2px 0;">${escapeHtml(data.body)}</div>
    <div class="small" style="font-size:10px; color:#999;">${date}</div>
  `;
  return div;
}

//
// PATCH POST ELEMENT
//
function patchPostElement(el, data) {
  if (!el || !data) return;
  const likeSpan = el.querySelector(".like-count");
  const dislikeSpan = el.querySelector(".dislike-count");
  if (likeSpan) likeSpan.innerText = data.likes || 0;
  if (dislikeSpan) dislikeSpan.innerText = data.dislikes || 0;

  const titleEl = el.querySelector(".post-title");
  const bodyEl = el.querySelector(".post-body");
  if (titleEl) titleEl.innerText = data.title || "";
  if (bodyEl) bodyEl.innerText = data.body || "";
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
        <strong class="post-author">${escapeHtml(data.authorName || data.authorEmail || "")}</strong>
        <span class="timestamp">${escapeHtml(date)}</span>
      </div>
    </div>

    <div class="post-title">${escapeHtml(data.title || "")}</div>
    <div class="post-body">${escapeHtml(data.body || "")}</div>

    <div class="actions-row" style="margin-top:10px;">
      <div class="react-row" style="gap:12px;">
        <button class="react-btn like-btn" data-post="${postId}">👍 <span class="count like-count">${data.likes || 0}</span></button>
        <button class="react-btn dislike-btn" data-post="${postId}">👎 <span class="count dislike-count">${data.dislikes || 0}</span></button>
      </div>
      <div style="margin-left:auto;display:flex;gap:8px;align-items:center;">
        <button class="btn small comment-toggle" data-post="${postId}">Comments</button>
      </div>
    </div>

    <div class="comments-area" id="comments-area-${postId}" style="display:none; margin-top:12px; border-top:1px dashed #ccc; padding-top:10px;">
      <div class="comments-list" id="comments-${postId}"></div>

      <div class="comment-composer" style="margin-top:8px;">
        <div class="comment-input">
          <textarea id="composer-${postId}" placeholder="Write a comment..." rows="2" style="width:100%"></textarea>
        </div>
        <div class="comment-actions" style="margin-top:6px;">
          <button class="btn small send-comment" data-post="${postId}">Send</button>
          <button class="btn secondary small cancel-comment" data-post="${postId}">Cancel</button>
        </div>
      </div>
    </div>
  `;

  // Attach Listeners
  box.querySelector(".like-btn").onclick = () => handleReaction(postId, 'likes');
  box.querySelector(".dislike-btn").onclick = () => handleReaction(postId, 'dislikes');
  box.querySelector(".comment-toggle").onclick = () => toggleCommentsUI(postId);
  
  box.querySelector(".send-comment").onclick = async () => {
    const ta = document.getElementById(`composer-${postId}`);
    const text = ta.value.trim();
    if (!text) return alert("Enter a comment.");
    
    try {
      await db.collection("askibo_posts").doc(postId).collection("comments").add({
        body: text,
        byName: currentUser.fullName || currentUser.name || "Unknown",
        byEmail: currentUser.email || "",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await addStarPoints(15, "Commented on post");
      ta.value = "";
    } catch (err) {
      console.error(err);
    }
  };

  box.querySelector(".cancel-comment").onclick = () => {
    document.getElementById(`composer-${postId}`).value = "";
  };

  return box;
}

// Transaction helper for likes/dislikes
async function handleReaction(postId, type) {
  const postRef = db.collection("askibo_posts").doc(postId);
  try {
    await db.runTransaction(async t => {
      const doc = await t.get(postRef);
      const newVal = (doc.data()[type] || 0) + 1;
      t.update(postRef, { [type]: newVal });
    });
  } catch (err) {
    console.error("Reaction error:", err);
  }
}
