import type { Env, Post } from '../_shared/types';
import {
  verifySession, createSessionCookie, clearSessionCookie, safeEqual,
} from '../_shared/auth';
import {
  listPosts, getPost, savePost, removePost, uploadImage, GitHubError,
} from '../_shared/github';
import { getAnalytics } from '../_shared/analytics';

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

/* ─ Tabs / analytics ─ */
.tabs{display:flex;gap:.25rem;flex:1;margin-left:1.5rem}
.tab{border-color:transparent;color:var(--muted)}
.tab.active{border-color:var(--border);color:var(--accent);background:rgba(0,212,255,.06)}
#analytics-view{display:none}
.range{display:flex;gap:.3rem;flex-wrap:wrap}
.range button.active{background:var(--accent);color:var(--bg);border-color:var(--accent)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:.75rem;margin-bottom:1rem}
.kpi,.card-an{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1rem 1.15rem}
.kpi-label,.card-an h3{font-family:'JetBrains Mono',monospace;font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:500}
.kpi-val{font-size:1.75rem;font-weight:600;margin-top:.2rem;font-variant-numeric:tabular-nums}
.kpi-sub{font-size:.72rem;color:var(--muted)}
.card-an{margin-bottom:1rem;min-width:0}
.card-an h3{margin-bottom:.75rem}
.an-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:0 1rem}
.chart-wrap{position:relative}
.chart{width:100%;height:auto;display:block}
.chart .grid{stroke:rgba(255,255,255,.07);stroke-width:1}
.chart .ylab,.chart .xlab{fill:var(--muted);font-size:11px;font-family:'JetBrains Mono',monospace}
.chart .bar{fill:var(--accent)}
.chart .hit{fill:transparent;cursor:default}
.chart .hit.on{fill:rgba(255,255,255,.05)}
.tip{position:absolute;pointer-events:none;background:#0F172A;border:1px solid var(--border-h);border-radius:6px;padding:.4rem .6rem;font-size:.75rem;white-space:nowrap;z-index:5}
.rank{width:100%;border-collapse:collapse;font-size:.82rem;table-layout:fixed}
.rank th{font-family:'JetBrains Mono',monospace;font-size:.65rem;color:var(--muted);text-align:right;font-weight:500;padding-bottom:.3rem;width:4.5rem}
.rank th:first-child{width:auto}
.rank td{padding:.3rem 0 .3rem .75rem;vertical-align:top;font-variant-numeric:tabular-nums;text-align:right;color:var(--muted)}
.rank td:first-child{text-align:left;padding-left:0;color:var(--text)}
.rk-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rk-bar{height:3px;background:var(--accent);opacity:.6;border-radius:2px;margin-top:.25rem}

/* ─ Editor tools ─ */
.content-head{display:flex;align-items:center;gap:.4rem;margin-bottom:.35rem}
.content-head label{margin:0;flex:1}
.hint{font-size:.7rem;color:var(--muted);margin-top:.35rem}
textarea.drop{border-color:var(--accent);box-shadow:0 0 0 3px rgba(0,212,255,.15)}

@media(max-width:620px){
  header{flex-wrap:wrap;gap:.5rem}
  .tabs{order:3;margin-left:0;width:100%}
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
    <nav class="tabs">
      <button class="sm tab active" data-view="posts" onclick="showView('posts');loadPosts()">Posts</button>
      <button class="sm tab" data-view="analytics" onclick="showView('analytics')">Analytics</button>
    </nav>
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
            <div class="content-head">
              <label for="f-content">Markdown Content</label>
              <button type="button" class="sm" onclick="pickImage()">+ Image</button>
              <button type="button" class="sm" onclick="openFullPreview()">Full preview ↗</button>
              <input type="file" id="img-input" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" multiple hidden>
            </div>
            <textarea id="f-content" rows="22" placeholder="Write your post in Markdown…" oninput="updatePreview()"></textarea>
          </div>
          <div class="preview-wrap">
            <span class="preview-label">Quick Preview</span>
            <div class="preview-pane" id="preview"></div>
          </div>
        </div>
        <p class="hint ed-full">Tip: drag &amp; drop or paste images straight into the editor. Max 5 MB each.</p>
        <div id="save-alert" class="alert ed-full"></div>
      </div>
    </div>

    <!-- Analytics view -->
    <div id="analytics-view">
      <div class="toolbar">
        <h2>Visitors</h2>
        <div class="range">
          <button class="sm" data-days="1" onclick="setRange(1)">24 h</button>
          <button class="sm active" data-days="7" onclick="setRange(7)">7 days</button>
          <button class="sm" data-days="30" onclick="setRange(30)">30 days</button>
          <button class="sm" onclick="loadAnalytics()" title="Refresh" aria-label="Refresh">↻</button>
        </div>
      </div>
      <div id="an-body"></div>
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
  showView('editor');
  setLiveLink();
  sendFullPreview();
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
  showView('posts');
  loadPosts();
}

function syncSlug(){
  if(editingSlug) return;
  $('f-slug').value=$('f-title').value.toLowerCase().replace(/đ/g,'dj').normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}

function updatePreview(){
  var md=$('f-content').value;
  $('preview').innerHTML = renderHtml(md);
  sendFullPreview();
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

// ── Views ──────────────────────────────────────────────────────
function showView(name){
  $('list-view').style.display      = name==='posts'     ? 'block' : 'none';
  $('editor').style.display         = name==='editor'    ? 'block' : 'none';
  $('analytics-view').style.display = name==='analytics' ? 'block' : 'none';
  document.querySelectorAll('.tab').forEach(function(t){
    t.classList.toggle('active', t.dataset.view===(name==='editor' ? 'posts' : name));
  });
  if(name==='analytics') loadAnalytics();
}

// ── Images: button, paste, drag & drop ─────────────────────────
// Uploaded images are committed to the repo and only served after the next
// deploy, so previews use a local blob URL in the meantime.
var localImages = {};
var ta = $('f-content');

function isImg(f){ return /^image\\/(png|jpeg|webp|gif|avif)$/.test(f.type); }
function pickImage(){ $('img-input').click(); }

$('img-input').addEventListener('change', function(){
  Array.from(this.files).forEach(uploadImage);
  this.value='';
});
ta.addEventListener('paste', function(e){
  var files = Array.from((e.clipboardData && e.clipboardData.files) || []).filter(isImg);
  if(files.length){ e.preventDefault(); files.forEach(uploadImage); }
});
ta.addEventListener('dragover', function(e){ e.preventDefault(); ta.classList.add('drop'); });
ta.addEventListener('dragleave', function(){ ta.classList.remove('drop'); });
ta.addEventListener('drop', function(e){
  ta.classList.remove('drop');
  var files = Array.from((e.dataTransfer && e.dataTransfer.files) || []).filter(isImg);
  if(files.length){ e.preventDefault(); files.forEach(uploadImage); }
});

function insertAtCursor(text){
  var s=ta.selectionStart, e=ta.selectionEnd;
  ta.value = ta.value.slice(0,s) + text + ta.value.slice(e);
  ta.selectionStart = ta.selectionEnd = s + text.length;
  ta.focus();
  updatePreview();
}

async function uploadImage(file){
  if(!isImg(file)){ flash('Only PNG, JPEG, WebP, GIF or AVIF images.','err'); return; }
  if(file.size > 5*1024*1024){ flash('Image too large (max 5 MB).','err'); return; }
  var alt = file.name.replace(/\\.[^.]*$/,'').replace(/[-_]+/g,' ').trim() || 'image';
  var placeholder = '![Uploading '+alt+'…](uploading-'+Math.random().toString(36).slice(2,8)+')';
  insertAtCursor('\\n'+placeholder+'\\n');
  flash('Uploading '+file.name+'…','info',true);
  var fd = new FormData(); fd.append('file', file);
  try {
    var r = await api('/admin/api/images',{method:'POST',body:fd});
    var b = await r.json().catch(function(){ return {}; });
    if(!r.ok) throw new Error(b.error || ('HTTP '+r.status));
    localImages[b.url] = URL.createObjectURL(file);
    ta.value = ta.value.replace(placeholder, '!['+alt+']('+b.url+')');
    updatePreview();
    flash('Image uploaded — remember to Save the post.','ok');
  } catch(e) {
    ta.value = ta.value.replace('\\n'+placeholder+'\\n','').replace(placeholder,'');
    updatePreview();
    flash('Upload failed: '+e.message,'err');
  }
}

function renderHtml(md){
  if(!(window.marked && window.DOMPurify)) return '<pre>'+esc(md)+'</pre>';
  var html = DOMPurify.sanitize(marked.parse(md));
  Object.keys(localImages).forEach(function(u){
    html = html.split('src="'+u+'"').join('src="'+localImages[u]+'"');
  });
  return html;
}

// ── Full-page preview ──────────────────────────────────────────
// /preview/post/ renders with the real site layout; we push the draft to it.
var previewWin = null;

function openFullPreview(){
  previewWin = window.open('/preview/post/', 'srdjan-post-preview');
}

window.addEventListener('message', function(e){
  if(e.origin===location.origin && e.data && e.data.type==='post-preview-ready') sendFullPreview();
});

function sendFullPreview(){
  if(!previewWin || previewWin.closed) return;
  var d = $('f-date').value;
  var words = $('f-content').value.split(/\\s+/).filter(Boolean).length;
  var dateText = d
    ? new Date(d+'T00:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})
      + ' · ' + Math.max(1, Math.round(words/220)) + ' min read'
    : '';
  previewWin.postMessage({type:'post-preview', post:{
    title: $('f-title').value, excerpt: $('f-excerpt').value,
    dateText: dateText, html: renderHtml($('f-content').value)
  }}, location.origin);
}

['f-title','f-excerpt','f-date'].forEach(function(id){ $(id).addEventListener('input', sendFullPreview); });

// ── Analytics ──────────────────────────────────────────────────
var anDays = 7;
var chartPts = [];

function setRange(d){
  anDays = d;
  document.querySelectorAll('.range button[data-days]').forEach(function(b){
    b.classList.toggle('active', +b.dataset.days===d);
  });
  loadAnalytics();
}

function fmt(n){ return n==null ? '–' : Number(n).toLocaleString('en-GB'); }
function errP(m){ return '<p class="empty" style="color:var(--red)">Unavailable: '+esc(m || 'no data')+'</p>'; }
function kpi(label, val, sub){
  return '<div class="kpi"><div class="kpi-label">'+esc(label)+'</div>' +
    '<div class="kpi-val">'+(val==null ? '–' : esc(typeof val==='number' ? fmt(val) : val))+'</div>' +
    (sub ? '<div class="kpi-sub">'+esc(sub)+'</div>' : '') + '</div>';
}

async function loadAnalytics(){
  var el = $('an-body');
  el.innerHTML = '<p class="empty">Loading…</p>';
  var r = await api('/admin/api/analytics?days='+anDays);
  var raw = await r.text(), d = {};
  try { d = JSON.parse(raw); } catch(e) {}
  if(!r.ok){ el.innerHTML = errP(d.error || ('HTTP '+r.status+': '+raw.replace(/<[^>]*>/g,' ').replace(/\\s+/g,' ').slice(0,300))); return; }

  var t = d.totals || {}, p = d.perf || {};
  var okT = !t.error, okP = !p.error && p.p50ms!=null;
  var h = '<div class="kpis">' +
    kpi('Visits', okT ? t.visits : null) +
    kpi('Page views', okT ? t.views : null) +
    kpi('Pages / visit', okT && t.visits ? (t.views/t.visits).toFixed(1) : null) +
    kpi('Median load time', okP ? (p.p50ms/1000).toFixed(2)+' s' : null,
        okP && p.p75ms!=null ? '75th percentile '+(p.p75ms/1000).toFixed(2)+' s' : '') +
    '</div>';

  h += '<div class="card-an"><h3>Visits per '+(d.step==='date' ? 'day' : 'hour')+'</h3>' +
    (d.series && d.series.error ? errP(d.series.error) : barChart(fillSeries(d))) + '</div>';

  h += '<div class="an-grid">' +
    list('Top pages', d.pages, function(k){ return k || '/'; }) +
    list('Referrers', d.referrers, function(k){ return k || 'Direct / none'; }) +
    list('Countries', d.countries) +
    list('Devices', d.devices) +
    list('Browsers', d.browsers) +
    list('Operating systems', d.os) +
    '</div>';

  h += '<p class="empty" style="font-size:.75rem">Cloudflare Web Analytics — cookie-free, aggregated, no personal data. Loaded '+new Date().toLocaleTimeString('en-GB')+'.</p>';
  el.innerHTML = h;
  wireChart();
}

function fillSeries(d){
  var daily = d.step==='date', stepMs = daily ? 864e5 : 36e5, cut = daily ? 10 : 13;
  var map = {};
  (d.series || []).forEach(function(r){ map[r.key.slice(0,cut)] = r; });
  var start = new Date(new Date(d.since).toISOString().slice(0,cut) + (daily ? 'T00:00:00Z' : ':00:00Z')).getTime();
  var end = new Date(d.until).getTime(), out = [];
  for(var ts=start; ts<=end; ts+=stepMs){
    var k = new Date(ts).toISOString().slice(0,cut), r = map[k];
    out.push({
      label: daily
        ? new Date(ts).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'})
        : new Date(ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}),
      visits: r ? r.visits : 0,
      views:  r ? r.views  : 0
    });
  }
  return out;
}

function barChart(pts){
  chartPts = pts;
  var W=900, H=220, L=40, B=24, T=8, pw=W-L-4, ph=H-B-T;
  var max = Math.max(1, Math.max.apply(null, pts.map(function(p){ return p.visits; })));
  var step = Math.max(1, Math.ceil(max/3)), top = step*3;
  var n = pts.length, slot = pw/n, bw = Math.max(1, slot-2);
  var s = '<svg viewBox="0 0 '+W+' '+H+'" class="chart" role="img" aria-label="Visits over time">';
  for(var g=0; g<=3; g++){
    var gy = T + ph - ph*g/3;
    s += '<line x1="'+L+'" x2="'+W+'" y1="'+gy+'" y2="'+gy+'" class="grid"/>' +
         '<text x="'+(L-8)+'" y="'+(gy+4)+'" class="ylab" text-anchor="end">'+fmt(step*g)+'</text>';
  }
  var every = Math.ceil(n/8);
  pts.forEach(function(p,i){
    var x = L + i*slot + 1, bh = ph*p.visits/top, y = T + ph - bh, r = Math.min(4, bw/2, bh), base = T + ph;
    if(bh > 0){
      s += '<path class="bar" d="M'+x+','+base+'V'+(y+r)+'Q'+x+','+y+' '+(x+r)+','+y +
           'H'+(x+bw-r)+'Q'+(x+bw)+','+y+' '+(x+bw)+','+(y+r)+'V'+base+'Z"/>';
    }
    s += '<rect class="hit" data-i="'+i+'" x="'+(L+i*slot)+'" y="'+T+'" width="'+slot+'" height="'+ph+'"/>';
    if(i % every === 0) s += '<text x="'+(x+bw/2)+'" y="'+(H-6)+'" class="xlab" text-anchor="middle">'+esc(p.label)+'</text>';
  });
  return '<div class="chart-wrap">'+s+'</svg><div class="tip" id="tip" hidden></div></div>';
}

function wireChart(){
  var wrap = document.querySelector('.chart-wrap');
  if(!wrap) return;
  var tip = $('tip');
  wrap.addEventListener('mousemove', function(e){
    var hit = e.target.closest('.hit');
    wrap.querySelectorAll('.hit.on').forEach(function(x){ x.classList.remove('on'); });
    if(!hit){ tip.hidden = true; return; }
    hit.classList.add('on');
    var p = chartPts[+hit.dataset.i];
    tip.innerHTML = '<b>'+esc(p.label)+'</b><br>'+fmt(p.visits)+' visits · '+fmt(p.views)+' page views';
    tip.hidden = false;
    var rc = wrap.getBoundingClientRect(), x = e.clientX - rc.left + 14;
    if(x + tip.offsetWidth > rc.width) x = e.clientX - rc.left - tip.offsetWidth - 14;
    tip.style.left = x+'px';
    tip.style.top  = Math.max(0, e.clientY - rc.top - tip.offsetHeight - 8)+'px';
  });
  wrap.addEventListener('mouseleave', function(){
    tip.hidden = true;
    wrap.querySelectorAll('.hit.on').forEach(function(x){ x.classList.remove('on'); });
  });
}

function list(title, rows, label){
  label = label || function(k){ return k || 'Unknown'; };
  var body;
  if(!rows || rows.error) body = errP(rows && rows.error);
  else if(!rows.length) body = '<p class="empty">No data yet.</p>';
  else {
    rows = rows.slice().sort(function(a,b){ return b.visits - a.visits; });
    var max = rows[0].visits || 1;
    body = '<table class="rank"><thead><tr><th></th><th>Visits</th><th>Views</th></tr></thead><tbody>' +
      rows.map(function(r){
        var l = esc(label(r.key));
        return '<tr><td><div class="rk-label" title="'+l+'">'+l+'</div>' +
          '<div class="rk-bar" style="width:'+(100*r.visits/max).toFixed(1)+'%"></div></td>' +
          '<td>'+fmt(r.visits)+'</td><td>'+fmt(r.views)+'</td></tr>';
      }).join('') + '</tbody></table>';
  }
  return '<div class="card-an"><h3>'+esc(title)+'</h3>'+body+'</div>';
}

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

// Note: never answer 502 — Cloudflare replaces 502 responses with its own
// "Bad gateway" page, hiding our JSON error. Upstream failures use 500.
function errorResponse(err: unknown): Response {
  if (err instanceof GitHubError) {
    if (err.status === 404 || err.status === 409) return json({ error: err.message }, err.status);
    console.error(err.message);
    if (err.status === 401 || err.status === 403) {
      return json({ error: 'GitHub rejected the token — check GITHUB_TOKEN permissions/expiry' }, 500);
    }
    return json({ error: 'GitHub API error (' + err.status + ')' }, 500);
  }
  console.error(err);
  return json({ error: 'Internal error' }, 500);
}

async function readBody(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { return null; }
}

// ── Images ─────────────────────────────────────────────────────

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Trust the file's magic bytes, not its name or declared type (no SVG: it can carry script).
function sniffImage(b: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG')               return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)      return 'jpg';
  if (ascii(0, 4) === 'GIF8')                               return 'gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP')    return 'webp';
  if (ascii(4, 12) === 'ftypavif' || ascii(4, 12) === 'ftypavis') return 'avif';
  return null;
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

    if (path === '/admin/api/analytics' && method === 'GET') {
      if (!env.CF_ANALYTICS_TOKEN) return json({ error: 'CF_ANALYTICS_TOKEN is not set' }, 503);
      const d = Number(url.searchParams.get('days'));
      try {
        return json(await getAnalytics(env, [1, 7, 30].includes(d) ? d : 7));
      } catch (e) {
        const msg = e instanceof Error ? (e.message || e.name) : String(e);
        console.error('analytics failed', e);
        return json({ error: 'Analytics failed: ' + (msg || 'unknown error') }, 500);
      }
    }

    if (path === '/admin/api/images' && method === 'POST') {
      const form = await request.formData().catch(() => null);
      const file = form?.get('file') as unknown as File | string | null | undefined;
      if (!file || typeof file === 'string') return json({ error: 'No file uploaded' }, 400);
      if (file.size > MAX_IMAGE_BYTES) return json({ error: 'Image too large (max 5 MB)' }, 413);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const ext   = sniffImage(bytes);
      if (!ext) return json({ error: 'Only PNG, JPEG, WebP, GIF or AVIF images are allowed' }, 415);
      return json({ ok: true, url: await uploadImage(env, file.name, ext, bytes) }, 201);
    }

    return json({ error: 'Not found' }, 404);
  } catch (err) {
    return errorResponse(err);
  }
};
