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

    // Clear composer
    if (titleEl) titleEl.value = "";
    if (bodyEl) bodyEl.value = "";
  } catch (err) {
    console.error("Error creating post:", err);
    alert("Failed to create post. Check console.");
  }
}

//
// Load posts realtime with incremental changes
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
        // create and insert
        const el = renderPostElement(id, data);
        postsMap.set(id, { el, commentsOpen: false });
        // insert at top (newest first)
        listEl.insertBefore(el, listEl.firstChild);
      }

      if (change.type === "modified") {
        const item = postsMap.get(id);
        if (item && item.el) {
          // update counts and post body/title/meta, but keep comment area & its state
          patchPostElement(item.el, data);
        } else {
          // fallback: create new
          const el = renderPostElement(id, data);
          postsMap.set(id, { el, commentsOpen: false });
          listEl.insertBefore(el, listEl.firstChild);
        }
      }

      if (change.type === "removed") {
        const item = postsMap.get(id);
        if (item && item.el && item.el.parentNode) {
          // remove comment listener if exists
          removeCommentsListener(id);
          item.el.parentNode.removeChild(item.el);
          postsMap.delete(id);
        }
      }
    });

    // If no posts at all
    if (snapshot.empty) {
      listEl.innerHTML = "<p>No posts yet.</p>";
    }
  }, err => {
    console.error("Posts realtime error:", err);
    const listEl = document.getElementById("postsList");
    if (listEl) listEl.innerHTML = "<p>Error loading posts. Check console.</p>";
  });
}

//
// One-time refresh (optional)
//
async function loadPostsSnapshotOnce() {
  const snapshot = await db.collection("askibo_posts").orderBy("createdAt", "desc").get();
  const listEl = document.getElementById("postsList");
  if (!listEl) return;
  listEl.innerHTML = "";
  postsMap.forEach((v, k) => {
    // remove listeners
    removeCommentsListener(k);
  });
  postsMap.clear();

  snapshot.forEach(doc => {
    const el = renderPostElement(doc.id, doc.data());
    postsMap.set(doc.id, { el, commentsOpen: false });
    listEl.appendChild(el);
  });
}

//
// RENDER POST ELEMENT (initial create)
//
function renderPostElement(postId, data) {
  const box = document.createElement("div");
  box.className = "post";
  box.dataset.postId = postId;

  // formatted time
  const date = data.createdAt?.seconds
    ? new Date(data.createdAt.seconds * 1000).toLocaleString()
    : "Just now";

  // build inner HTML skeleton (we will patch dynamic bits later)
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

  // attach event listeners (like/dislike/comment toggle/send/cancel)
  const likeBtn = box.querySelector(".like-btn");
  const dislikeBtn = box.querySelector(".dislike-btn");
  const commentToggle = box.querySelector(".comment-toggle");
  const sendBtn = box.querySelector(`#sendComment-${postId}`);
  const cancelBtn = box.querySelector(`#cancelComment-${postId}`);

  likeBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    // optimistic UI: increment displayed count immediately
    const span = likeBtn.querySelector(".like-count");
    const prev = Number(span.innerText || 0);
    span.innerText = prev + 1;
    try {
      await db.collection("askibo_posts").doc(postId).update({
        likes: firebase.firestore.FieldValue.increment(1)
      });
    } catch (err) {
      console.error("Like error:", err);
      // revert UI on error
      span.innerText = prev;
      alert("Failed to like. Check console.");
    }
  });

  dislikeBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    const span = dislikeBtn.querySelector(".dislike-count");
    const prev = Number(span.innerText || 0);
    span.innerText = prev + 1;
    try {
      await db.collection("askibo_posts").doc(postId).update({
        dislikes: firebase.firestore.FieldValue.increment(1)
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
      ta.value = "";
      // keep comments area open (onSnapshot will append the comment)
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

  // start comments listener but only if the creator toggles open later — we *register* listener lazily on first open
  // Do NOT call loadComments here to avoid duplicate attachments; we handle it on toggle.

  return box;
}

//
// Update certain parts of the element when post changes (keep comments UI state)
//
function patchPostElement(el, data) {
  try {
    const titleEl = el.querySelector(".post-title");
    const bodyEl = el.querySelector(".post-body");
    const authorEl = el.querySelector(".post-author");
    const tsEl = el.querySelector(".timestamp");
    const likeSpan = el.querySelector(".like-count");
    const dislikeSpan = el.querySelector(".dislike-count");

    if (titleEl) titleEl.innerText = data.title || "";
    if (bodyEl) bodyEl.innerText = data.body || "";
    if (authorEl) authorEl.innerText = data.authorName || data.authorEmail || "";
    if (tsEl) tsEl.innerText = data.createdAt && data.createdAt.seconds
      ? new Date(data.createdAt.seconds * 1000).toLocaleString()
      : tsEl.innerText || "Just now";

    if (likeSpan) likeSpan.innerText = typeof data.likes === "number" ? data.likes : (likeSpan.innerText || 0);
    if (dislikeSpan) dislikeSpan.innerText = typeof data.dislikes === "number" ? data.dislikes : (dislikeSpan.innerText || 0);
  } catch (err) {
    console.error("patchPostElement error", err);
  }
}

//
// Toggle comments UI and attach/detach real-time listener lazily
//
function toggleCommentsUI(postId) {
  const area = document.getElementById(`comments-area-${postId}`);
  if (!area) return;
  const currentlyOpen = area.style.display !== "none";
  if (currentlyOpen) {
    area.style.display = "none";
    // we keep listener active to show live updates in background OR we could remove to save reads
    // (to save reads in production, uncomment the remove listener line)
    // removeCommentsListener(postId);
    // mark closed
    const m = postsMap.get(postId);
    if (m) m.commentsOpen = false;
    return;
  }

  // open UI
  area.style.display = "block";
  const m = postsMap.get(postId);
  if (m) m.commentsOpen = true;

  // ensure comments listener exists
  if (!commentsListenerMap.has(postId)) {
    const commentsRef = db.collection("askibo_posts").doc(postId).collection("comments").orderBy("createdAt", "asc");
    const unsubscribe = commentsRef.onSnapshot(snapshot => {
      const container = document.getElementById(`comments-${postId}`);
      if (!container) return;
      container.innerHTML = ""; // replace safely (composer is outside this container)

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
        const commentEl = renderCommentElement(postId, cid, c);
        container.appendChild(commentEl);
      });
    }, err=>{
      console.error("comments listener error:", err);
      const container = document.getElementById(`comments-${postId}`);
      if (container) container.innerHTML = "<p class='text-muted'>Error loading comments.</p>";
    });

    commentsListenerMap.set(postId, unsubscribe);
  }
}

//
// Remove comment listener (if desired)
//
function removeCommentsListener(postId) {
  const un = commentsListenerMap.get(postId);
  if (typeof un === "function") {
    try { un(); } catch(e){/*ignore*/ }
  }
  commentsListenerMap.delete(postId);
}

//
// Render a single comment (with reply/like UI stub — replies not nested in this version but the structure can support it)
//
function renderCommentElement(postId, commentId, c) {
  const wrapper = document.createElement("div");
  wrapper.className = "comment";
  wrapper.dataset.commentId = commentId;

  const time = c.createdAt?.seconds ? new Date(c.createdAt.seconds * 1000).toLocaleString() : "Just now";

  wrapper.innerHTML = `
    <div class="comment-meta">
      <strong>${escapeHtml(c.byName || c.byEmail || "Anon")}</strong>
      <span class="timestamp">${escapeHtml(time)}</span>
    </div>
    <div class="comment-body">${escapeHtml(c.body || "")}</div>
    <div class="comment-footer">
      <button class="like-btn">👍 <span class="count">${c.likes||0}</span></button>
      <button class="reply-btn">Reply</button>
    </div>
  `;

  const likeBtn = wrapper.querySelector(".like-btn");
  const replyBtn = wrapper.querySelector(".reply-btn");

  likeBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    const span = likeBtn.querySelector(".count");
    const prev = Number(span.innerText || 0);
    span.innerText = prev + 1; // optimistic
    try {
      await db.collection("askibo_posts").doc(postId)
        .collection("comments").doc(commentId)
        .update({ likes: firebase.firestore.FieldValue.increment(1) });
    } catch (err) {
      console.error("comment like error:", err);
      span.innerText = prev;
      alert("Failed to like comment.");
    }
  });

  replyBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    // simple inline reply prompt; for richer UI create a small composer
    const reply = prompt("Enter your reply:");
    if (!reply || !reply.trim()) return;
    try {
      await db.collection("askibo_posts").doc(postId)
        .collection("comments").add({
          body: `(reply to ${escapeHtml(c.byName||'user')}) ${reply.trim()}`,
          byName: currentUser.fullName || currentUser.name || "Unknown",
          byEmail: currentUser.email || "",
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          likes: 0,
          dislikes: 0
        });
    } catch (err) {
      console.error("reply error:", err);
      alert("Failed to post reply.");
    }
  });

  return wrapper;
}

//
// Escape HTML
//
function escapeHtml(s) {
  if (!s) return "";
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}


