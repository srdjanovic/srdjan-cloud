import type { Env, Post } from '../_shared/types';
import {
  verifySession, createSessionCookie, clearSessionCookie, safeEqual,
} from '../_shared/auth';
import {
  listPosts, getPost, savePost, removePost, GitHubError,
} from '../_shared/github';

// ── Helpers ────────────────────────────────────────────────────

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });
}

function html(body: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type':    'text/html; charset=utf-8',
      'Cache-Control':   'no-store',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'X-Robots-Tag':    'noindex',
    },
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
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js"></script>
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
.alert.info{background:rgba(0,212,255,.06);border:1px solid var(--border);color:var(--accent)}
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
    <form onsubmit="event.preventDefault(); doLogin()">
      <div class="field">
        <label for="pw">Password</label>
        <input type="password" id="pw" placeholder="••••••••" autocomplete="current-password">
      </div>
      <button type="submit" class="primary" style="width:100%">Log in</button>
    </form>
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
      <p class="empty" style="padding:0 0 1rem">Saving commits to GitHub; the site rebuilds and changes go live in ~1–2 minutes.</p>
      <div id="posts-container"><p class="empty">Loading…</p></div>
    </div>

    <!-- Editor view -->
    <div id="editor">
      <div class="ed-header">
        <button onclick="backToList()">← Back</button>
        <h2 id="ed-heading">New Post</h2>
        <a id="view-live" target="_blank" rel="noopener" style="display:none;font-size:.8rem">View live ↗</a>
        <button class="primary" id="save-btn" onclick="savePost()">Save</button>
      </div>
      <div class="ed-grid">
        <div class="field ed-full">
          <label>Title</label>
          <input id="f-title" type="text" placeholder="Post title" oninput="syncSlug()">
        </div>
        <div class="field">
          <label>Slug</label>
          <input id="f-slug" type="text" placeholder="post-slug" pattern="[a-z0-9]+(-[a-z0-9]+)*">
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
var JSON_HDR = {'Content-Type':'application/json'};

function $(id){ return document.getElementById(id); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function showApp(){ $('login-wrap').style.display='none'; $('app').style.display='flex'; loadPosts(); }

function updateToggleLabel(){
  $('toggle-label').textContent = $('f-pub').checked ? 'Published' : 'Draft';
}

// Every API call carries X-Requested-With; the server rejects requests without it (CSRF guard).
async function api(url, opts){
  opts = opts || {};
  opts.credentials = 'same-origin';
  opts.headers = Object.assign({'X-Requested-With':'admin'}, opts.headers || {});
  var r = await fetch(url, opts);
  if (r.status === 401 && url !== '/admin/api/login' && url !== '/admin/api/check') {
    location.reload(); throw new Error('session expired');
  }
  return r;
}

async function doLogin(){
  var r = await api('/admin/api/login',{method:'POST',headers:JSON_HDR,body:JSON.stringify({password:$('pw').value})});
  if(r.ok){ $('pw').value=''; $('login-err').style.display='none'; showApp(); }
  else {
    var b = await r.json().catch(function(){ return {}; });
    $('login-err').textContent = r.status===401 ? 'Incorrect password.' : (b.error || 'Login failed.');
    $('login-err').style.display='block';
  }
}

async function doLogout(){
  await api('/admin/api/logout',{method:'POST'});
  location.reload();
}

async function loadPosts(){
  var el = $('posts-container');
  el.innerHTML = '<p class="empty">Loading…</p>';
  var r = await api('/admin/api/posts');
  if(!r.ok){
    var b = await r.json().catch(function(){ return {}; });
    el.innerHTML = '<p class="empty" style="color:var(--red)">Could not load posts: '+esc(b.error||r.status)+'</p>';
    return;
  }
  var posts = await r.json();
  if(!posts.length){ el.innerHTML='<p class="empty">No posts yet. Create your first one.</p>'; return; }
  el.innerHTML = posts.map(function(p){
    var status = p.draft ? 'draft' : 'published';
    return '<div class="post-row">' +
      '<div class="info"><div class="title">'+esc(p.title)+'</div><div class="meta">'+esc(p.slug)+' &middot; '+esc(p.date)+'</div></div>' +
      '<span class="badge '+status+'">'+status+'</span>' +
      '<div class="row-actions">' +
        '<button class="sm" data-act="edit" data-slug="'+esc(p.slug)+'">Edit</button>' +
        '<button class="sm danger" data-act="del" data-slug="'+esc(p.slug)+'">Delete</button>' +
      '</div></div>';
  }).join('');
}

$('posts-container').addEventListener('click', function(e){
  var b = e.target.closest('button[data-act]');
  if(!b) return;
  if(b.dataset.act==='edit') openEdit(b.dataset.slug);
  else delPost(b.dataset.slug);
});

function setLiveLink(){
  var a = $('view-live');
  if(editingSlug && $('f-pub').checked){ a.href='/blog/'+encodeURIComponent(editingSlug)+'/'; a.style.display='inline'; }
  else a.style.display='none';
}

function showEditor(heading){
  $('ed-heading').textContent=heading;
  $('save-alert').style.display='none';
  $('list-view').style.display='none';
  $('editor').style.display='block';
  setLiveLink();
}

function openNew(){
  editingSlug=null;
  $('f-title').value=''; $('f-slug').value=''; $('f-excerpt').value=''; $('f-content').value='';
  $('f-date').value=new Date().toISOString().split('T')[0];
  $('f-pub').checked=false;
  updateToggleLabel(); updatePreview();
  showEditor('New Post');
}

async function openEdit(slug){
  var r = await api('/admin/api/posts/'+encodeURIComponent(slug));
  if(!r.ok){ alert('Could not load post.'); return; }
  var p = await r.json();
  editingSlug=slug;
  $('f-title').value=p.title; $('f-slug').value=p.slug; $('f-date').value=p.date;
  $('f-excerpt').value=p.excerpt; $('f-content').value=p.content;
  $('f-pub').checked=!p.draft;
  updateToggleLabel(); updatePreview();
  showEditor('Edit Post');
}

function backToList(){
  $('editor').style.display='none';
  $('list-view').style.display='block';
  loadPosts();
}

function syncSlug(){
  if(editingSlug) return;
  $('f-slug').value=$('f-title').value.toLowerCase().replace(/đ/g,'dj').normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}

function updatePreview(){
  var md=$('f-content').value;
  $('preview').innerHTML = (window.marked && window.DOMPurify) ? DOMPurify.sanitize(marked.parse(md)) : esc(md);
}

function flash(text, kind, persist){
  var el=$('save-alert');
  el.textContent=text; el.className='alert ed-full '+kind; el.style.display='block';
  clearTimeout(flash.t);
  if(!persist) flash.t=setTimeout(function(){ el.style.display='none'; }, 6000);
}

async function savePost(){
  var post={
    title:$('f-title').value.trim(),
    slug:$('f-slug').value.trim(),
    date:$('f-date').value,
    excerpt:$('f-excerpt').value.trim(),
    content:$('f-content').value,
    draft:!$('f-pub').checked
  };
  if(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(post.slug)){ flash('Slug may only contain lowercase letters, digits and single dashes.','err'); return; }
  var btn=$('save-btn'); btn.disabled=true; btn.textContent='Saving…';
  flash('Committing to GitHub…','info',true);
  try {
    var r=await api(editingSlug?'/admin/api/posts/'+encodeURIComponent(editingSlug):'/admin/api/posts',
      {method:editingSlug?'PUT':'POST',headers:JSON_HDR,body:JSON.stringify(post)});
    if(r.ok){
      editingSlug=post.slug;
      $('ed-heading').textContent='Edit Post';
      setLiveLink();
      flash('Saved. The site is rebuilding — live in ~1–2 minutes.','ok');
    } else {
      var b=await r.json().catch(function(){ return {}; });
      flash('Save failed: '+(b.error||('HTTP '+r.status)),'err');
    }
  } catch(e) {
    flash('Save failed: '+e.message,'err');
  } finally { btn.disabled=false; btn.textContent='Save'; }
}

async function delPost(slug){
  if(!confirm('Delete "'+slug+'"? It stays recoverable from git history.')) return;
  var r=await api('/admin/api/posts/'+encodeURIComponent(slug),{method:'DELETE'});
  if(r.ok) loadPosts();
  else alert('Delete failed.');
}

$('f-pub').addEventListener('change', setLiveLink);

// Auto-check session on load
api('/admin/api/check').then(function(r){ if(r.ok) showApp(); }).catch(function(){});
</script>
</body>
</html>`;

// ── Validation ─────────────────────────────────────────────────

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validate(body: any): Post | string {
  if (!body || typeof body !== 'object') return 'Bad request';
  const { slug, title, date, excerpt, content, draft } = body;
  if (typeof slug !== 'string' || !SLUG_RE.test(slug) || slug.length > 100) return 'Invalid slug';
  if (typeof title !== 'string' || !title.trim() || title.length > 200) return 'Title is required (max 200 chars)';
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) return 'Invalid date';
  if (typeof excerpt !== 'string' || excerpt.length > 500) return 'Excerpt must be at most 500 chars';
  if (typeof content !== 'string' || content.length > 500_000) return 'Invalid content';
  if (typeof draft !== 'boolean') return 'Invalid status';
  return { slug, title: title.trim(), date, excerpt: excerpt.trim(), content, draft };
}

function errorResponse(err: unknown): Response {
  if (err instanceof GitHubError) {
    if (err.status === 404 || err.status === 409) return json({ error: err.message }, err.status);
    console.error(err.message);
    if (err.status === 401 || err.status === 403) {
      return json({ error: 'GitHub rejected the token — check GITHUB_TOKEN permissions/expiry' }, 502);
    }
    return json({ error: 'GitHub API error (' + err.status + ')' }, 502);
  }
  console.error(err);
  return json({ error: 'Internal error' }, 500);
}

async function readBody(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { return null; }
}

// ── Route handler ──────────────────────────────────────────────

const ADMIN_HOSTS = ['srdjan.cloud', 'localhost', '127.0.0.1'];

const REQUIRED_ENV = ['ADMIN_PASSWORD', 'SESSION_SECRET', 'GITHUB_TOKEN', 'GITHUB_REPO'] as const;

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  const url    = new URL(request.url);
  const path   = url.pathname;
  const method = request.method;

  // Cloudflare Access guards /admin on srdjan.cloud only; the *.pages.dev
  // hostnames can't be covered, so the admin refuses to answer there.
  if (!ADMIN_HOSTS.includes(url.hostname)) {
    return new Response('Not found', { status: 404 });
  }

  const missing = REQUIRED_ENV.filter(k => !env[k]);
  if (missing.length) {
    return new Response(
      'Admin is not configured. Missing environment variables: ' + missing.join(', '),
      { status: 503, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } },
    );
  }

  // ── Serve admin SPA ──────────────────────────────────────────
  if ((path === '/admin' || path === '/admin/') && method === 'GET') {
    return html(ADMIN_HTML);
  }

  if (!path.startsWith('/admin/api/')) return json({ error: 'Not found' }, 404);

  // CSRF guard: a custom header can't be sent cross-site without a CORS
  // preflight, and we never answer preflights.
  if (request.headers.get('X-Requested-With') !== 'admin') {
    return json({ error: 'Forbidden' }, 403);
  }

  // ── Auth endpoints ───────────────────────────────────────────

  if (path === '/admin/api/login' && method === 'POST') {
    const body = await readBody(request) as { password?: unknown } | null;
    const ok = typeof body?.password === 'string' && await safeEqual(body.password, env.ADMIN_PASSWORD);
    if (!ok) {
      await new Promise(r => setTimeout(r, 1000)); // slow down guessing
      return json({ error: 'Unauthorized' }, 401);
    }
    return json({ ok: true }, 200, { 'Set-Cookie': await createSessionCookie(env.SESSION_SECRET) });
  }

  if (path === '/admin/api/logout' && method === 'POST') {
    return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
  }

  if (!(await verifySession(request, env.SESSION_SECRET))) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // ── Protected admin API ──────────────────────────────────────

  try {
    if (path === '/admin/api/check' && method === 'GET') {
      return json({ ok: true });
    }

    if (path === '/admin/api/posts') {
      if (method === 'GET') return json(await listPosts(env));
      if (method === 'POST') {
        const post = validate(await readBody(request));
        if (typeof post === 'string') return json({ error: post }, 400);
        await savePost(env, post);
        return json({ ok: true, slug: post.slug }, 201);
      }
    }

    const m = path.match(/^\/admin\/api\/posts\/([^/]+)$/);
    if (m) {
      const slug = decodeURIComponent(m[1]);
      if (!SLUG_RE.test(slug)) return json({ error: 'Not found' }, 404);

      if (method === 'GET') {
        const post = await getPost(env, slug);
        return post ? json(post) : json({ error: 'Not found' }, 404);
      }
      if (method === 'PUT') {
        const post = validate(await readBody(request));
        if (typeof post === 'string') return json({ error: post }, 400);
        await savePost(env, post, slug);
        return json({ ok: true });
      }
      if (method === 'DELETE') {
        return (await removePost(env, slug)) ? json({ ok: true }) : json({ error: 'Not found' }, 404);
      }
    }

    return json({ error: 'Not found' }, 404);
  } catch (err) {
    return errorResponse(err);
  }
};
