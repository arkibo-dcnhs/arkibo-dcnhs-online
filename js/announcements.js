// js/announcements.js
// Full-featured realtime announcements with reactions, comments and nested replies (Option A)
// Requires: firebase (v8), db, auth from firebase-config.js and loadCurrentUser() from utils.js

(() => {
  // Keep track of per-post and per-comment listeners so we can unsubscribe when re-rendering
  const postUnsubMap = new Map();       // postId -> { reactionsUnsub, commentsUnsub, repliesUnsubs: Map(commentId -> unsub) }
  let currentUser = null;

  // small helper to format timestamp (Firestore Timestamp or Date)
  function formatTimestamp(ts) {
    if (!ts) return '';
    let d;
    if (ts.seconds !== undefined) d = new Date(ts.seconds * 1000);
    else if (ts.toDate) d = ts.toDate();
    else d = new Date(ts);
    return d.toLocaleString(); // uses user's locale; you can make this more specific if needed
  }

  function emojiFor(type){ return type==='like'?'👍':type==='love'?'❤️':type==='clap'?'👏':'❤️'; }

  function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])); }

  // Clean up listeners for a post (used before re-rendering)
  function cleanupPostListeners(postId) {
    const obj = postUnsubMap.get(postId);
    if (!obj) return;
    if (obj.reactionsUnsub) try { obj.reactionsUnsub(); } catch(e){/*ignore*/ }
    if (obj.commentsUnsub) try { obj.commentsUnsub(); } catch(e){/*ignore*/ }
    if (obj.repliesUnsubs) {
      obj.repliesUnsubs.forEach(unsub => { try { unsub(); } catch(e){} });
    }
    postUnsubMap.delete(postId);
  }

  // Full cleanup for all posts (when top-level re-renders)
  function cleanupAllPostListeners() {
    postUnsubMap.forEach((_, postId) => cleanupPostListeners(postId));
    postUnsubMap.clear();
  }

  // Render one announcement DOM element
  function renderAnnouncementElement(postId, postData, viewer) {
    // wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'announcement';
    wrapper.style.marginBottom = '18px';
    wrapper.style.paddingBottom = '12px';

    // meta (title + author + timestamp)
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.style.marginBottom = '8px';
    meta.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <strong class="title">${escapeHtml(postData.title)}</strong>
          <div style="font-size:12px;color:var(--muted)">${escapeHtml(postData.authorName || postData.authorEmail)}</div>
        </div>
        <div style="font-size:12px;color:var(--muted)">${formatTimestamp(postData.createdAt)}</div>
      </div>
    `;

    // body
    const body = document.createElement('div');
    body.innerHTML = `<div style="margin-top:8px; white-space:pre-wrap;">${escapeHtml(postData.body)}</div>`;

    // reaction row
    const reactionRow = document.createElement('div');
    reactionRow.className = 'react-row';
    reactionRow.style.marginTop = '12px';
    reactionRow.style.display = 'flex';
    reactionRow.style.gap = '8px';

    // create three reaction buttons (counts will be populated by real-time listeners)
    const reactionButtons = {};
    ['like','love','clap'].forEach(type => {
      const btn = document.createElement('button');
      btn.className = 'react-btn';
      btn.style.gap = '6px';
      btn.innerHTML = `${emojiFor(type)} <span class="count">0</span>`;
      reactionRow.appendChild(btn);
      reactionButtons[type] = btn;

      // click toggles this user's reaction document for this post
      btn.addEventListener('click', async () => {
        if (!viewer || !viewer.uid) { alert('Please log in'); return; }
        const ref = db.collection('announcements').doc(postId).collection('reactions').doc(viewer.uid);
        try {
          const snap = await ref.get();
          if (!snap.exists) {
            await ref.set({ type, by: viewer.uid, at: firebase.firestore.FieldValue.serverTimestamp() });
          } else {
            const existing = snap.data().type;
            if (existing === type) {
              await ref.delete();
            } else {
              await ref.update({ type, at: firebase.firestore.FieldValue.serverTimestamp() });
            }
          }
        } catch (err) {
          console.error('Reaction error', err);
          alert('Error saving reaction');
        }
      });
    });

    // separator
    const hr = document.createElement('div');
    hr.style.height = '1px';
    hr.style.background = '#f1f3f5';
    hr.style.margin = '12px 0';

    // comments area container (comment input + list)
    const commentsContainer = document.createElement('div');
    commentsContainer.style.marginTop = '8px';

    // comment input (for all users)
    const commentBox = document.createElement('div');
    commentBox.style.display = 'flex';
    commentBox.style.flexDirection = 'column';
    commentBox.style.gap = '8px';
    commentBox.style.marginBottom = '8px';

    const commentInput = document.createElement('textarea');
    commentInput.placeholder = 'Write a comment...';
    commentInput.style.padding = '10px';
    commentInput.style.borderRadius = '10px';
    commentInput.style.border = '1px solid #e6e9ef';
    commentInput.style.minHeight = '56px';
    commentInput.style.resize = 'vertical';

    const commentRow = document.createElement('div');
    commentRow.style.display = 'flex';
    commentRow.style.justifyContent = 'space-between';
    commentRow.style.alignItems = 'center';

    const commentBtn = document.createElement('button');
    commentBtn.className = 'btn secondary';
    commentBtn.style.width = 'auto';
    commentBtn.innerText = 'Comment';

    commentBtn.addEventListener('click', async () => {
      const text = (commentInput.value || '').trim();
      if (!text) return alert('Enter your comment');
      const u = viewer;
      if (!u || !u.uid) return alert('Please log in');
      try {
        await db.collection('announcements').doc(postId).collection('comments').add({
          body: text,
          byName: u.fullName || u.name || u.email,
          byEmail: u.email,
          uid: u.uid,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        commentInput.value = '';
      } catch (err) {
        console.error('comment error', err);
        alert('Failed to post comment');
      }
    });

    commentRow.appendChild(commentBtn);
    commentBox.appendChild(commentInput);
    commentBox.appendChild(commentRow);

    // comments list area (will be filled by real-time listener)
    const commentsList = document.createElement('div');
    commentsList.style.marginTop = '8px';
    commentsList.id = `comments-${postId}`;

    commentsContainer.appendChild(commentBox);
    commentsContainer.appendChild(commentsList);

    // assemble wrapper
    wrapper.appendChild(meta);
    wrapper.appendChild(body);
    wrapper.appendChild(reactionRow);
    wrapper.appendChild(hr);
    wrapper.appendChild(commentsContainer);

    // set up real-time listeners for reactions and comments/replies for this post
    setupPostRealtime(postId, reactionButtons, commentsList, viewer);

    return wrapper;
  }

  // set listeners for reactions / comments / replies of a post, store unsubscribes in postUnsubMap
  function setupPostRealtime(postId, reactionButtons, commentsListEl, viewer) {
    // cleanup if already present (to avoid duplicates)
    cleanupPostListeners(postId);

    const repliesUnsubs = new Map();

    // reactions listener (we will keep counts for each type)
    const reactionsRef = db.collection('announcements').doc(postId).collection('reactions');
    const reactionsUnsub = reactionsRef.onSnapshot(snapshot => {
      // compute counts per type and update buttons
      const counts = { like:0, love:0, clap:0 };
      snapshot.forEach(doc => {
        const d = doc.data();
        if (d && d.type && counts.hasOwnProperty(d.type)) counts[d.type]++;
      });
      Object.keys(counts).forEach(t => {
        const btn = reactionButtons[t];
        if (btn) btn.querySelector('.count').innerText = counts[t];
      });

      // Optionally highlight the viewer's current reaction (showing which reaction they set)
      if (viewer && viewer.uid) {
        const myDoc = snapshot.docs.find(d => d.id === viewer.uid);
        Object.keys(reactionButtons).forEach(t => {
          const btn = reactionButtons[t];
          if (!btn) return;
          if (myDoc && myDoc.data().type === t) btn.style.border = '2px solid rgba(26,127,60,0.22)';
          else btn.style.border = '1px solid #eee';
        });
      }
    }, err => {
      console.error('reactions onSnapshot error', err);
    });

    // comments listener
    const commentsRef = db.collection('announcements').doc(postId).collection('comments').orderBy('createdAt','asc');
    const commentsUnsub = commentsRef.onSnapshot(snapshot => {
      commentsListEl.innerHTML = '';
      if (snapshot.empty) {
        const p = document.createElement('p');
        p.style.color = 'var(--muted)';
        p.innerText = 'No comments yet.';
        commentsListEl.appendChild(p);
        return;
      }

      // for every comment, render it + nested replies container and set up replies listener
      snapshot.forEach(doc => {
        const c = doc.data();
        const commentId = doc.id;
        const commentCard = document.createElement('div');
        commentCard.className = 'comment';
        commentCard.style.display = 'flex';
        commentCard.style.flexDirection = 'column';
        commentCard.style.gap = '8px';
        commentCard.style.padding = '10px';
        commentCard.style.marginBottom = '8px';
        commentCard.style.background = '#fff';
        commentCard.style.borderRadius = '10px';
        commentCard.style.border = '1px solid #f1f3f5';

        // comment header (author + timestamp + optional delete if author/admin)
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.innerHTML = `<div style="font-size:13px;color:var(--muted)"><strong>${escapeHtml(c.byName)}</strong></div>
                            <div style="font-size:12px;color:var(--muted)">${formatTimestamp(c.createdAt)}</div>`;

        // comment body
        const body = document.createElement('div');
        body.style.whiteSpace = 'pre-wrap';
        body.innerText = c.body || '';

        // action row: reply button, delete (author or admin)
        const actionRow = document.createElement('div');
        actionRow.style.display = 'flex';
        actionRow.style.gap = '8px';
        actionRow.style.alignItems = 'center';

        const replyBtn = document.createElement('button');
        replyBtn.className = 'btn secondary';
        replyBtn.style.width = 'auto';
        replyBtn.innerText = 'Reply';
        // toggle inline reply form
        let replyFormEl = null;
        replyBtn.addEventListener('click', () => {
          if (replyFormEl) {
            replyFormEl.remove();
            replyFormEl = null;
            return;
          }
          replyFormEl = createReplyForm(postId, commentId);
          commentCard.appendChild(replyFormEl);
        });

        actionRow.appendChild(replyBtn);

        // delete comment if commenter or admin
        if ((viewer && viewer.email === c.byEmail) || (viewer && viewer.role === 'admin')) {
          const delC = document.createElement('button');
          delC.className = 'btn secondary';
          delC.style.width = 'auto';
          delC.innerText = 'Delete';
          delC.addEventListener('click', async () => {
            if (!confirm('Delete comment?')) return;
            await db.collection('announcements').doc(postId).collection('comments').doc(commentId).delete();
            // replies subcollection will remain (or you can cascade-delete if you want)
          });
          actionRow.appendChild(delC);
        }

        // replies container (populated by replies listener)
        const repliesContainer = document.createElement('div');
        repliesContainer.style.marginTop = '8px';
        repliesContainer.style.paddingLeft = '12px';
        repliesContainer.style.borderLeft = '2px solid #f1f3f5';
        repliesContainer.id = `replies-${postId}-${commentId}`;

        commentCard.appendChild(header);
        commentCard.appendChild(body);
        commentCard.appendChild(actionRow);
        commentCard.appendChild(repliesContainer);

        commentsListEl.appendChild(commentCard);

        // set up replies listener for this comment (unsubscribe previous if exists)
        if (repliesUnsubs.has(commentId)) {
          const oldUnsub = repliesUnsubs.get(commentId);
          try { oldUnsub(); } catch(e) {}
          repliesUnsubs.delete(commentId);
        }
        const repliesRef = db.collection('announcements').doc(postId).collection('comments').doc(commentId).collection('replies').orderBy('createdAt','asc');
        const repliesUnsub = repliesRef.onSnapshot(repSnap => {
          const rc = document.getElementById(`replies-${postId}-${commentId}`);
          if (!rc) return;
          rc.innerHTML = '';
          if (repSnap.empty) {
            // nothing
            return;
          }
          repSnap.forEach(rdoc => {
            const r = rdoc.data();
            const rEl = document.createElement('div');
            rEl.style.padding = '8px';
            rEl.style.marginBottom = '6px';
            rEl.style.background = '#fafafa';
            rEl.style.borderRadius = '8px';
            rEl.innerHTML = `<div style="font-size:13px;color:var(--muted)"><strong>${escapeHtml(r.byName)}</strong> <span style="font-size:12px;color:var(--muted);margin-left:8px">${formatTimestamp(r.createdAt)}</span></div>
                             <div style="margin-top:6px; white-space:pre-wrap;">${escapeHtml(r.body)}</div>`;
            // reply delete if author/admin
            if ((viewer && viewer.email === r.byEmail) || (viewer && viewer.role === 'admin')) {
              const delR = document.createElement('button');
              delR.className = 'btn secondary';
              delR.style.width = 'auto';
              delR.style.marginTop = '6px';
              delR.innerText = 'Delete';
              delR.addEventListener('click', async () => {
                if (!confirm('Delete reply?')) return;
                await db.collection('announcements').doc(postId)
                  .collection('comments').doc(commentId)
                  .collection('replies').doc(rdoc.id).delete();
              });
              rEl.appendChild(delR);
            }
            rc.appendChild(rEl);
          });
        }, err => {
          console.error('replies snapshot error', err);
        });
        repliesUnsubs.set(commentId, repliesUnsub);
      });
    }, err => {
      console.error('comments snapshot error', err);
      commentsListEl.innerHTML = '<p style="color:var(--muted)">Error loading comments.</p>';
    });

    // store unsubscribes
    postUnsubMap.set(postId, {
      reactionsUnsub,
      commentsUnsub,
      repliesUnsubs
    });
  }

  // Create a small inline reply form element for a given postId/commentId
  function createReplyForm(postId, commentId) {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '8px';
    wrap.style.marginTop = '8px';

    const input = document.createElement('textarea');
    input.placeholder = 'Write a reply...';
    input.style.minHeight = '48px';
    input.style.padding = '8px';
    input.style.borderRadius = '8px';
    input.style.border = '1px solid #e6e9ef';

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '8px';

    const sendBtn = document.createElement('button');
    sendBtn.className = 'btn';
    sendBtn.style.width = 'auto';
    sendBtn.innerText = 'Reply';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn secondary';
    cancelBtn.style.width = 'auto';
    cancelBtn.innerText = 'Cancel';

    sendBtn.addEventListener('click', async () => {
      const text = (input.value || '').trim();
      if (!text) return alert('Enter reply text');
      const u = currentUser;
      if (!u || !u.uid) { alert('Please log in'); return; }
      try {
        await db.collection('announcements').doc(postId)
          .collection('comments').doc(commentId)
          .collection('replies').add({
            body: text,
            byName: u.fullName || u.name || u.email,
            byEmail: u.email,
            uid: u.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        input.value = '';
        wrap.remove();
      } catch (err) {
        console.error('reply error', err);
        alert('Failed to post reply');
      }
    });

    cancelBtn.addEventListener('click', ()=> wrap.remove());

    row.appendChild(sendBtn);
    row.appendChild(cancelBtn);

    wrap.appendChild(input);
    wrap.appendChild(row);
    return wrap;
  }

  // Post a new announcement (teacher / admin only)
  async function postAnnouncement() {
    const titleEl = document.getElementById('annTitle');
    const bodyEl = document.getElementById('annBody');
    const title = (titleEl?.value || '').trim();
    const body = (bodyEl?.value || '').trim();
    const u = await loadCurrentUser();
    if (!u) { alert('Please login'); return; }
    if (u.role !== 'teacher' && u.role !== 'admin') { alert('Only teachers or admins can post'); return; }
    if (!title || !body) { alert('Fill title and body'); return; }

    try {
      await db.collection('announcements').add({
        title,
        body,
        authorName: u.fullName || u.name || u.email,
        authorEmail: u.email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      if (titleEl) titleEl.value = '';
      if (bodyEl) bodyEl.value = '';
      alert('Published!');
    } catch (err) {
      console.error('publish error', err);
      alert('Failed to publish');
    }
  }

  // Initialize module
  (async function init() {
    try {
      const u = await loadCurrentUser();
      // loadCurrentUser may redirect or sign out pending students, so double-check
      if (!u) { location.href = 'index.html'; return; }
      currentUser = u;

      // show create area only for teachers/admins
      const createArea = document.getElementById('createArea');
      const postBtn = document.getElementById('postAnnBtn');
      if (createArea && postBtn) {
        if (u.role === 'teacher' || u.role === 'admin') {
          createArea.classList.remove('hidden');
          postBtn.addEventListener('click', postAnnouncement);
        } else {
          createArea.classList.add('hidden');
        }
      }

      const annContainer = document.getElementById('announcementsContainer');
      if (!annContainer) {
        console.error('Missing announcementsContainer element');
        return;
      }

      // Top-level announcements listener (realtime)
      // Before attaching, cleanup any prior per-post listeners
      const topUnsub = db.collection('announcements').orderBy('createdAt','desc')
        .onSnapshot(snapshot => {
          // remove per-post listeners for posts that are no longer in snapshot
          const currentPostIds = new Set(snapshot.docs.map(d => d.id));
          // cleanup unsubscribed posts not in current
          Array.from(postUnsubMap.keys()).forEach(pid => {
            if (!currentPostIds.has(pid)) cleanupPostListeners(pid);
          });

          annContainer.innerHTML = '';
          if (snapshot.empty) {
            annContainer.innerHTML = '<p style="color:var(--muted)">No announcements yet.</p>';
            return;
          }

          snapshot.forEach(doc => {
            const d = doc.data();
            const el = renderAnnouncementElement(doc.id, d, currentUser);
            annContainer.appendChild(el);
          });
        }, err => {
          console.error('announcements onSnapshot error', err);
          annContainer.innerHTML = '<p style="color:var(--muted)">Error loading announcements. Check console.</p>';
        });

      // store top-level unsub in map under special key so it can be cleaned if needed
      postUnsubMap.set('__top__', { reactionsUnsub: topUnsub, commentsUnsub: null, repliesUnsubs: new Map() });

    } catch (err) {
      console.error('announcements init error', err);
    }
  })();

})();
