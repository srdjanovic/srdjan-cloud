import type { Env, Post } from '../_shared/types';
import {
  verifySession, createSessionCookie, clearSessionCookie,
} from '../_shared/auth';
import {
  seedIfEmpty, listAll, getPost, upsertPost, deletePost,
} from '../_shared/kv';

// ── Helpers ────────────────────────────────────────────────────

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });
}

function html(body: string): Response {
  return new Response(body, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// ── Admin HTML ─────────────────────────────────────────────────
// Served as a self-contained SPA for /admin and /admin/
const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin — srdjan.cloud</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/marked@9/marked.min.js"><\/script>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#080D17;--surface:rgba(255,255,255,0.04);
  --border:rgba(0,212,255,0.15);--border-h:rgba(0,212,255,0.5);
  --accent:#00D4FF;--green:#39FF14;--text:#E2E8F0;--muted:#64748B;
  --red:#FF4444;--radius:8px;
}
html{height:100%}
body{background:var(--bg);color:var(--text);font-family:'Inter',sans-serif;min-height:100%;line-height:1.6}
::-webkit-scrollbar{width:5px}
::-webkit-scrollbar-track{background:var(--bg)}
::-webkit-scrollbar-thumb{background:var(--accent);border-radius:3px}
a{color:var(--accent);text-decoration:none}

/* ─ Buttons ─ */
button,input[type=submit]{font-family:'JetBrains Mono',monospace;background:transparent;color:var(--accent);
  border:1px solid var(--border);padding:.5rem 1.1rem;border-radius:var(--radius);cursor:pointer;
  font-size:.8rem;transition:border-color .2s,background .2s;white-space:nowrap}
button:hover{border-color:var(--accent);background:rgba(0,212,255,.08)}
button.primary{background:var(--accent);color:var(--bg);border-color:var(--accent);font-weight:600}
button.primary:hover{background:rgba(0,212,255,.85)}
button.danger{color:var(--red);border-color:rgba(255,68,68,.25)}
button.danger:hover{border-color:var(--red);background:rgba(255,68,68,.08)}
button.sm{padding:.3rem .7rem;font-size:.75rem}

/* ─ Inputs ─ */
input,textarea,select{width:100%;background:rgba(255,255,255,.03);border:1px solid var(--border);
  color:var(--text);padding:.65rem .9rem;border-radius:var(--radius);font-family:'Inter',sans-serif;
  font-size:.9rem;outline:none;transition:border-color .2s,box-shadow .2s}
input:focus,textarea:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(0,212,255,.08)}
input::placeholder,textarea::placeholder{color:var(--muted)}
textarea{font-family:'JetBrains Mono',monospace;font-size:.8rem;resize:vertical}
label{display:block;font-family:'JetBrains Mono',monospace;font-size:.72rem;text-transform:uppercase;
  letter-spacing:.06em;color:var(--muted);margin-bottom:.35rem}
.field{margin-bottom:1.1rem}

/* ─ Layout ─ */
#app{display:flex;flex-direction:column;min-height:100vh}
header{display:flex;align-items:center;justify-content:space-between;padding:.9rem 1.75rem;
  border-bottom:1px solid var(--border);background:rgba(8,13,23,.96);position:sticky;top:0;z-index:50}
.logo{font-family:'JetBrains Mono',monospace;font-size:1rem;color:var(--accent)}
.logo span{color:var(--green)}
main{flex:1;padding:1.75rem;max-width:960px;width:100%;margin:0 auto}

/* ─ Login ─ */
#login-wrap{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1.5rem}
.login-box{background:var(--surface);border:1px solid var(--border);border-radius:12px;
  padding:2.5rem;width:100%;max-width:380px;backdrop-filter:blur(8px)}
.login-box h1{font-family:'JetBrains Mono',monospace;color:var(--accent);font-size:1.3rem;margin-bottom:.3rem}
.login-box p{color:var(--muted);font-size:.85rem;margin-bottom:1.75rem}
.err-msg{color:var(--red);font-size:.82rem;margin-top:.5rem;display:none}

/* ─ Posts list ─ */
.toolbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.75rem;gap:1rem}
.toolbar h2{font-family:'JetBrains Mono',monospace;font-size:1.1rem}
.post-row{display:flex;align-items:center;gap:1rem;padding:1rem 1.25rem;
  background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
  margin-bottom:.6rem;transition:border-color .2s}
.post-row:hover{border-color:var(--border-h)}
.post-row .info{flex:1;min-width:0}
.post-row .title{font-weight:600;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.post-row .meta{font-family:'JetBrains Mono',monospace;font-size:.72rem;color:var(--muted);margin-top:.15rem}
.badge{font-family:'JetBrains Mono',monospace;font-size:.65rem;padding:.15rem .5rem;
  border-radius:20px;border:1px solid;flex-shrink:0}
.badge.published{color:var(--green);border-color:var(--green);background:rgba(57,255,20,.07)}
.badge.draft{color:var(--muted);border-color:var(--muted)}
.row-actions{display:flex;gap:.4rem;flex-shrink:0}
.empty{color:var(--muted);font-size:.875rem;padding:1.5rem 0}

/* ─ Editor ─ */
#editor{display:none}
.ed-header{display:flex;align-items:center;gap:.75rem;margin-bottom:1.5rem;flex-wrap:wrap}
.ed-header h2{font-family:'JetBrains Mono',monospace;font-size:1rem;flex:1}
.ed-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.1rem}
.ed-full{grid-column:1/-1}
.ed-split{display:grid;grid-template-columns:1fr 1fr;gap:1rem;grid-column:1/-1}
.preview-wrap{display:flex;flex-direction:column;gap:.35rem}
.preview-label{font-family:'JetBrains Mono',monospace;font-size:.7rem;text-transform:uppercase;
  letter-spacing:.06em;color:var(--muted)}
.preview-pane{background:rgba(255,255,255,.02);border:1px solid var(--border);border-radius:var(--radius);
  padding:1rem;min-height:280px;max-height:460px;overflow-y:auto;font-size:.875rem;line-height:1.7}
.preview-pane h1,.preview-pane h2,.preview-pane h3{font-family:'JetBrains Mono',monospace;
  color:var(--accent);margin:1.2rem 0 .5rem;line-height:1.25}
.preview-pane p{margin-bottom:.75rem}
.preview-pane code{font-family:'JetBrains Mono',monospace;background:rgba(0,212,255,.1);
  color:var(--accent);padding:.1em .35em;border-radius:3px;font-size:.82em}
.preview-pane pre{background:rgba(0,0,0,.35);padding:1rem;border-radius:6px;overflow-x:auto;margin-bottom:.75rem}
.preview-pane blockquote{border-left:3px solid var(--accent);padding:.4rem 0 .4rem 1rem;color:var(--muted)}
.preview-pane ul,.preview-pane ol{padding-left:1.4rem;margin-bottom:.75rem}

/* ─ Toggle ─ */
.toggle-row{display:flex;align-items:center;gap:.75rem;grid-column:1/-1}
.toggle{position:relative;width:42px;height:22px;flex-shrink:0}
.toggle input{opacity:0;width:0;height:0;position:absolute}
.slider{position:absolute;inset:0;background:rgba(255,255,255,.1);border-radius:22px;
  cursor:pointer;transition:.2s}
.slider::before{content:'';position:absolute;width:16px;height:16px;left:3px;top:3px;
  background:var(--muted);border-radius:50%;transition:.2s}
.toggle input:checked+.slider{background:rgba(57,255,20,.18)}
.toggle input:checked+.slider::before{background:var(--green);transform:translateX(20px)}
.toggle-label{font-family:'JetBrains Mono',monospace;font-size:.8rem;color:var(--muted)}

/* ─ Alerts ─ */
.alert{padding:.65rem 1rem;border-radius:var(--radius);font-size:.8rem;margin-top:1rem;display:none}
.alert.ok{background:rgba(57,255,20,.08);border:1px solid rgba(57,255,20,.25);color:var(--green)}
.alert.err{background:rgba(255,68,68,.08);border:1px solid rgba(255,68,68,.25);color:var(--red)}

@media(max-width:620px){
  .ed-grid{grid-template-columns:1fr}
  .ed-split{grid-template-columns:1fr}
  .post-row{flex-direction:column;align-items:flex-start}
}
</style>
</head>
<body>

<!-- Login -->
<div id="login-wrap">
  <div class="login-box">
    <h1>admin<span>@</span>srdjan.cloud</h1>
    <p>Enter your password to manage blog posts.</p>
    <div class="field">
      <label for="pw">Password</label>
      <input type="password" id="pw" placeholder="••••••••" autocomplete="current-password">
    </div>
    <button class="primary" style="width:100%" onclick="doLogin()">Log in</button>
    <p id="login-err" class="err-msg">Incorrect password.</p>
  </div>
</div>

<!-- App (shown after auth) -->
<div id="app" style="display:none">
  <header>
    <span class="logo">srdjan<span>.cloud</span> / admin</span>
    <button onclick="doLogout()" class="sm">Log out</button>
  </header>
  <main>

    <!-- Posts list view -->
    <div id="list-view">
      <div class="toolbar">
        <h2>Blog Posts</h2>
        <button class="primary" onclick="openNew()">+ New Post</button>
      </div>
      <div id="posts-container"><p class="empty">Loading…</p></div>
    </div>

    <!-- Editor view -->
    <div id="editor">
      <div class="ed-header">
        <button onclick="backToList()">← Back</button>
        <h2 id="ed-heading">New Post</h2>
        <button class="primary" onclick="savePost()">Save</button>
      </div>
      <div class="ed-grid">
        <div class="field ed-full">
          <label>Title</label>
          <input id="f-title" type="text" placeholder="Post title" oninput="syncSlug()">
        </div>
        <div class="field">
          <label>Slug</label>
          <input id="f-slug" type="text" placeholder="post-slug">
        </div>
        <div class="field">
          <label>Date</label>
          <input id="f-date" type="date">
        </div>
        <div class="field ed-full">
          <label>Excerpt</label>
          <input id="f-excerpt" type="text" placeholder="Short summary for the blog listing">
        </div>
        <div class="toggle-row">
          <label class="toggle">
            <input type="checkbox" id="f-pub" onchange="updateToggleLabel()">
            <span class="slider"></span>
          </label>
          <span id="toggle-label" class="toggle-label">Draft</span>
        </div>
        <div class="ed-split">
          <div class="field" style="display:flex;flex-direction:column">
            <label>Markdown Content</label>
            <textarea id="f-content" rows="22" placeholder="Write your post in Markdown…" oninput="updatePreview()"></textarea>
          </div>
          <div class="preview-wrap">
            <span class="preview-label">Live Preview</span>
            <div class="preview-pane" id="preview"></div>
          </div>
        </div>
        <div id="save-alert" class="alert ed-full"></div>
      </div>
    </div>

  </main>
</div>

<script>
var editingSlug = null;

document.getElementById('pw').addEventListener('keydown', function(e){ if(e.key==='Enter') doLogin(); });
document.getElementById('f-pub').addEventListener('change', updateToggleLabel);

function updateToggleLabel(){
  document.getElementById('toggle-label').textContent = document.getElementById('f-pub').checked ? 'Published' : 'Draft';
}

async function doLogin(){
  var pw = document.getElementById('pw').value;
  var r = await fetch('/admin/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw}),credentials:'include'});
  if(r.ok){
    document.getElementById('login-wrap').style.display='none';
    document.getElementById('app').style.display='flex';
    loadPosts();
  } else {
    document.getElementById('login-err').style.display='block';
  }
}

async function doLogout(){
  await fetch('/admin/api/logout',{method:'POST',credentials:'include'});
  location.reload();
}

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function loadPosts(){
  var r = await fetch('/api/posts',{credentials:'include'});
  var posts = await r.json();
  var el = document.getElementById('posts-container');
  if(!posts.length){ el.innerHTML='<p class="empty">No posts yet. Create your first one.</p>'; return; }
  var html = '';
  for(var i=0;i<posts.length;i++){
    var p=posts[i];
    html += '<div class="post-row">' +
      '<div class="info"><div class="title">'+esc(p.title)+'</div><div class="meta">'+esc(p.slug)+' &middot; '+esc(p.date)+'</div></div>' +
      '<span class="badge '+esc(p.status)+'">'+esc(p.status)+'</span>' +
      '<div class="row-actions">' +
        '<button class="sm" onclick="openEdit(\''+esc(p.slug)+'\')">Edit</button>' +
        '<button class="sm danger" onclick="delPost(\''+esc(p.slug)+'\')">Delete</button>' +
      '</div></div>';
  }
  el.innerHTML=html;
}

function clearEditor(){
  document.getElementById('f-title').value='';
  document.getElementById('f-slug').value='';
  document.getElementById('f-date').value=new Date().toISOString().split('T')[0];
  document.getElementById('f-excerpt').value='';
  document.getElementById('f-content').value='';
  document.getElementById('f-pub').checked=false;
  document.getElementById('toggle-label').textContent='Draft';
  document.getElementById('preview').innerHTML='';
  document.getElementById('save-alert').style.display='none';
}

function openNew(){
  editingSlug=null;
  clearEditor();
  document.getElementById('ed-heading').textContent='New Post';
  document.getElementById('list-view').style.display='none';
  document.getElementById('editor').style.display='block';
}

async function openEdit(slug){
  var r = await fetch('/api/posts/'+encodeURIComponent(slug),{credentials:'include'});
  if(!r.ok){ alert('Could not load post.'); return; }
  var p = await r.json();
  editingSlug=slug;
  document.getElementById('f-title').value=p.title;
  document.getElementById('f-slug').value=p.slug;
  document.getElementById('f-date').value=p.date;
  document.getElementById('f-excerpt').value=p.excerpt;
  document.getElementById('f-content').value=p.content;
  document.getElementById('f-pub').checked=p.status==='published';
  updateToggleLabel();
  updatePreview();
  document.getElementById('ed-heading').textContent='Edit Post';
  document.getElementById('save-alert').style.display='none';
  document.getElementById('list-view').style.display='none';
  document.getElementById('editor').style.display='block';
}

function backToList(){
  document.getElementById('editor').style.display='none';
  document.getElementById('list-view').style.display='block';
  loadPosts();
}

function syncSlug(){
  if(editingSlug) return;
  var t=document.getElementById('f-title').value;
  document.getElementById('f-slug').value=t.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}

function updatePreview(){
  var md=document.getElementById('f-content').value;
  document.getElementById('preview').innerHTML = (typeof marked!=='undefined') ? marked.parse(md) : md;
}

async function savePost(){
  var post={
    title:document.getElementById('f-title').value,
    slug:document.getElementById('f-slug').value,
    date:document.getElementById('f-date').value,
    excerpt:document.getElementById('f-excerpt').value,
    content:document.getElementById('f-content').value,
    status:document.getElementById('f-pub').checked?'published':'draft'
  };
  var method=editingSlug?'PUT':'POST';
  var url=editingSlug?'/admin/api/posts/'+encodeURIComponent(editingSlug):'/admin/api/posts';
  var r=await fetch(url,{method:method,credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(post)});
  var alert_el=document.getElementById('save-alert');
  if(r.ok){
    editingSlug=post.slug;
    document.getElementById('ed-heading').textContent='Edit Post';
    alert_el.textContent='Saved successfully.';
    alert_el.className='alert ok';
  } else {
    var body=await r.json().catch(function(){ return {}; });
    alert_el.textContent='Save failed: '+(body.error||'unknown error');
    alert_el.className='alert err';
  }
  alert_el.style.display='block';
  setTimeout(function(){ alert_el.style.display='none'; }, 4000);
}

async function delPost(slug){
  if(!confirm('Delete "'+slug+'"? This cannot be undone.')) return;
  var r=await fetch('/admin/api/posts/'+encodeURIComponent(slug),{method:'DELETE',credentials:'include'});
  if(r.ok) loadPosts();
  else alert('Delete failed.');
}

// Auto-check session on load
fetch('/admin/api/check',{credentials:'include'}).then(function(r){
  if(r.ok){
    document.getElementById('login-wrap').style.display='none';
    document.getElementById('app').style.display='flex';
    loadPosts();
  }
});
<\/script>
</body>
</html>`;

// ── Route handler ──────────────────────────────────────────────

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  const url  = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  await seedIfEmpty(env);

  // ── Serve admin SPA ──────────────────────────────────────────
  if ((path === '/admin' || path === '/admin/') && method === 'GET') {
    return html(ADMIN_HTML);
  }

  // ── Auth endpoints ───────────────────────────────────────────

  if (path === '/admin/api/login' && method === 'POST') {
    let body: { password?: string };
    try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
    if (!body.password || body.password !== env.ADMIN_PASSWORD) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const cookie = await createSessionCookie(env.ADMIN_PASSWORD);
    return json({ ok: true }, 200, { 'Set-Cookie': cookie });
  }

  if (path === '/admin/api/logout' && method === 'POST') {
    return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
  }

  if (path === '/admin/api/check' && method === 'GET') {
    if (await verifySession(request, env.ADMIN_PASSWORD)) {
      return json({ ok: true });
    }
    return json({ error: 'Unauthorized' }, 401);
  }

  // ── Protected admin API ──────────────────────────────────────

  if (path.startsWith('/admin/api/')) {
    if (!(await verifySession(request, env.ADMIN_PASSWORD))) {
      return json({ error: 'Unauthorized' }, 401);
    }

    // POST /admin/api/posts  — create
    if (path === '/admin/api/posts' && method === 'POST') {
      let post: Post;
      try { post = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
      if (!post.slug || !post.title) return json({ error: 'Missing slug or title' }, 400);
      const existing = await getPost(env, post.slug);
      if (existing) return json({ error: 'Slug already exists' }, 409);
      await upsertPost(env, post);
      return json({ ok: true, slug: post.slug }, 201);
    }

    // PUT /admin/api/posts/:slug  — update
    const putMatch = path.match(/^\/admin\/api\/posts\/([^/]+)$/);
    if (putMatch && method === 'PUT') {
      const oldSlug = decodeURIComponent(putMatch[1]);
      let post: Post;
      try { post = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
      if (!post.slug || !post.title) return json({ error: 'Missing slug or title' }, 400);
      await upsertPost(env, post, oldSlug);
      return json({ ok: true });
    }

    // DELETE /admin/api/posts/:slug  — delete
    const delMatch = path.match(/^\/admin\/api\/posts\/([^/]+)$/);
    if (delMatch && method === 'DELETE') {
      const slug = decodeURIComponent(delMatch[1]);
      await deletePost(env, slug);
      return json({ ok: true });
    }

    return json({ error: 'Not found' }, 404);
  }

  return json({ error: 'Not found' }, 404);
};
