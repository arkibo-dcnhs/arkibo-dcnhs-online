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

  // Start real-time posts listener (incremental updates)
  loadPostsRealtime();

  // Optional: refresh button if present
  const refreshBtn = document.getElementById("refreshPosts");
  if (refreshBtn) refreshBtn.addEventListener("click", () => loadPostsSnapshotOnce());
})();

// HELPER: Add star points to student
async function addStarPoints(points, reason="") {
  if (!currentUser || currentUser.role !== "student") return;
  try {
    const ref = db.collection("users").doc(currentUser.uid);
    await ref.set({
      starPoints: firebase.firestore.FieldValue.increment(points)
    }, { merge: true });

    // Optional log
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

// CREATE POST
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

    // Award star points for creating post
    await addStarPoints(20, "Posted in Askibo Forums");

    // Clear composer
    if (titleEl) titleEl.value = "";
    if (bodyEl) bodyEl.value = "";
  } catch (err) {
    console.error("Error creating post:", err);
    alert("Failed to create post. Check console.");
  }
}

// Load posts realtime with incremental changes
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
        } else {
          const el = renderPostElement(id, data);
          postsMap.set(id, { el, commentsOpen: false });
          listEl.insertBefore(el, listEl.firstChild);
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
    const listEl = document.getElementById("postsList");
    if (listEl) listEl.innerHTML = "<p>Error loading posts. Check console.</p>";
  });
}

// One-time refresh
async function loadPostsSnapshotOnce() {
  const snapshot = await db.collection("askibo_posts").orderBy("createdAt", "desc").get();
  const listEl = document.getElementById("postsList");
  if (!listEl) return;
  listEl.innerHTML = "";
  postsMap.forEach((v, k) => {
    removeCommentsListener(k);
  });
  postsMap.clear();

  snapshot.forEach(doc => {
    const el = renderPostElement(doc.id, doc.data());
    postsMap.set(doc.id, { el, commentsOpen: false });
    listEl.appendChild(el);
  });
}

// Render post element
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

    <div class="comments-area" id="comments-area-${postId}" style="display:none; margin-top:12px;">
      <div class="comments-list" id="comments-${postId}"></div>

      <div class="comment-composer" style="margin-top:8px;">
        <div class="comment-input">
          <textarea id="composer-${postId}" placeholder="Write a comment..." rows="2"></textarea>
        </div>
        <div class="comment-actions" style="margin-top:6px;">
          <button class="btn small" data-post="${postId}" id="sendComment-${postId}">Send</button>
          <button class="btn secondary small" data-post="${postId}" id="cancelComment-${postId}">Cancel</button>
        </div>
      </div>
    </div>
  `;

  const likeBtn = box.querySelector(".like-btn");
  const dislikeBtn = box.querySelector(".dislike-btn");
  const commentToggle = box.querySelector(".comment-toggle");
  const sendBtn = box.querySelector(`#sendComment-${postId}`);
  const cancelBtn = box.querySelector(`#cancelComment-${postId}`);

  // TRANSACTION SAFE: Like post
  likeBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    const span = likeBtn.querySelector(".like-count");
    const prev = Number(span.innerText || 0);
    span.innerText = prev + 1;
    try {
      const postRef = db.collection("askibo_posts").doc(postId);
      await db.runTransaction(async t => {
        const doc = await t.get(postRef);
        const currentLikes = doc.data()?.likes || 0;
        t.update(postRef, { likes: currentLikes + 1 });
      });
    } catch (err) {
      console.error("Like error:", err);
      span.innerText = prev;
      alert("Failed to like. Check console.");
    }
  });

  // TRANSACTION SAFE: Dislike post
  dislikeBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    const span = dislikeBtn.querySelector(".dislike-count");
    const prev = Number(span.innerText || 0);
    span.innerText = prev + 1;
    try {
      const postRef = db.collection("askibo_posts").doc(postId);
      await db.runTransaction(async t => {
        const doc = await t.get(postRef);
        const currentDislikes = doc.data()?.dislikes || 0;
        t.update(postRef, { dislikes: currentDislikes + 1 });
      });
    } catch (err) {
      console.error("Dislike error:", err);
      span.innerText = prev;
      alert("Failed to dislike. Check console.");
    }
  });

  commentToggle?.addEventListener("click", (e) => {
    e.preventDefault();
    toggleCommentsUI(postId);
  });

  sendBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    const ta = document.getElementById(`composer-${postId}`);
    if (!ta) return;
    const text = ta.value.trim();
    if (!text) return alert("Enter a comment.");
    try {
      await db.collection("askibo_posts").doc(postId).collection("comments").add({
        body: text,
        byName: currentUser.fullName || currentUser.name || "Unknown",
        byEmail: currentUser.email || "",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        likes: 0,
        dislikes: 0
      });

      // Award star points for commenting
      await addStarPoints(15, "Commented on post");

      ta.value = "";
    } catch (err) {
      console.error("Add comment error:", err);
      alert("Failed to add comment. Check console.");
    }
  });

  cancelBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    const ta = document.getElementById(`composer-${postId}`);
    if (ta) ta.value = "";
  });

  return box;
}

// The rest of your existing functions (patchPostElement, toggleCommentsUI, removeCommentsListener, renderCommentElement, escapeHtml) remain unchanged.


