import type { Env, Post, PostMeta } from './types';

// Posts are stored as src/content/blog/<slug>.md in the repo. Every write is a
// commit to the branch, which triggers the deploy workflow and rebuilds the site.
const DIR = 'src/content/blog';

export class GitHubError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

function branch(env: Env): string {
  return env.GITHUB_BRANCH || 'main';
}

async function gh(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch('https://api.github.com' + path, {
    ...init,
    headers: {
      'Authorization':        'Bearer ' + env.GITHUB_TOKEN,
      'Accept':               'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent':           'srdjan-cloud-admin',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok && res.status !== 404) {
    throw new GitHubError(res.status, `GitHub API ${res.status}: ${await res.text()}`);
  }
  return res;
}

// ── Base64 <-> UTF-8 ───────────────────────────────────────────

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function toB64(text: string): string {
  return bytesToB64(new TextEncoder().encode(text));
}

function fromB64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

// ── Front matter ───────────────────────────────────────────────
// We write a tiny YAML subset (JSON-quoted strings are valid YAML) and read it
// back leniently, so hand-edited files in the repo still load.

export function serialize(p: Post): string {
  return [
    '---',
    `title: ${JSON.stringify(p.title)}`,
    `date: ${p.date}`,
    `excerpt: ${JSON.stringify(p.excerpt)}`,
    `draft: ${p.draft}`,
    '---',
    '',
    p.content.replace(/\r\n/g, '\n').trimEnd(),
    '',
  ].join('\n');
}

function parseValue(raw: string): string {
  const v = raw.trim();
  if (v.startsWith('"')) { try { return JSON.parse(v); } catch { /* fall through */ } }
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}

export function parse(slug: string, text: string): Post {
  const m = text.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const fm: Record<string, string> = {};
  if (m) {
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^(\w+):\s*(.*)$/);
      if (kv) fm[kv[1]] = parseValue(kv[2]);
    }
  }
  return {
    slug,
    title:   fm.title ?? slug,
    date:    (fm.date ?? '').slice(0, 10),
    excerpt: fm.excerpt ?? '',
    draft:   fm.draft === 'true',
    content: (m ? m[2] : text).replace(/^\n+/, ''),
  };
}

// ── Operations ─────────────────────────────────────────────────

// One GraphQL request for every post (the REST API would need one call per
// file, and Pages Functions cap subrequests at 50 per invocation).
export async function listPosts(env: Env): Promise<PostMeta[]> {
  const [owner, name] = env.GITHUB_REPO.split('/');
  const res = await gh(env, '/graphql', {
    method: 'POST',
    body: JSON.stringify({
      query: `query($owner:String!,$name:String!,$expr:String!){
        repository(owner:$owner,name:$name){
          object(expression:$expr){ ... on Tree { entries { name object { ... on Blob { text } } } } }
        }
      }`,
      variables: { owner, name, expr: `${branch(env)}:${DIR}` },
    }),
  });
  const body: any = await res.json();
  if (body.errors) throw new GitHubError(502, JSON.stringify(body.errors));
  const entries: { name: string; object: { text?: string } }[] =
    body.data?.repository?.object?.entries ?? [];

  return entries
    .filter(e => e.name.endsWith('.md') && typeof e.object?.text === 'string')
    .map(e => {
      const { content: _c, ...meta } = parse(e.name.slice(0, -3), e.object.text!);
      return meta;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

async function getFile(env: Env, slug: string): Promise<{ sha: string; text: string } | null> {
  const res = await gh(env, `/repos/${env.GITHUB_REPO}/contents/${DIR}/${slug}.md?ref=${branch(env)}`);
  if (res.status === 404) return null;
  const f: any = await res.json();
  return { sha: f.sha, text: fromB64(f.content) };
}

export async function getPost(env: Env, slug: string): Promise<Post | null> {
  const f = await getFile(env, slug);
  return f ? parse(slug, f.text) : null;
}

async function putFile(env: Env, slug: string, text: string, message: string, sha?: string) {
  await gh(env, `/repos/${env.GITHUB_REPO}/contents/${DIR}/${slug}.md`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: toB64(text), branch: branch(env), ...(sha ? { sha } : {}) }),
  });
}

async function deleteFile(env: Env, slug: string, sha: string, message: string) {
  await gh(env, `/repos/${env.GITHUB_REPO}/contents/${DIR}/${slug}.md`, {
    method: 'DELETE',
    body: JSON.stringify({ message, sha, branch: branch(env) }),
  });
}

/** Create (oldSlug undefined) or update/rename a post. Throws 404/409 GitHubErrors. */
export async function savePost(env: Env, post: Post, oldSlug?: string): Promise<void> {
  const text = serialize(post);

  if (!oldSlug) {
    if (await getFile(env, post.slug)) throw new GitHubError(409, 'Slug already exists');
    await putFile(env, post.slug, text, `blog: add "${post.title}"`);
    return;
  }

  const old = await getFile(env, oldSlug);
  if (!old) throw new GitHubError(404, 'Post not found');

  if (oldSlug === post.slug) {
    await putFile(env, post.slug, text, `blog: update "${post.title}"`, old.sha);
    return;
  }

  // Rename: refuse to clobber another post, write new file, then remove old one.
  if (await getFile(env, post.slug)) throw new GitHubError(409, 'Slug already exists');
  await putFile(env, post.slug, text, `blog: rename ${oldSlug} -> ${post.slug}`);
  await deleteFile(env, oldSlug, old.sha, `blog: rename ${oldSlug} -> ${post.slug}`);
}

export async function removePost(env: Env, slug: string): Promise<boolean> {
  const f = await getFile(env, slug);
  if (!f) return false;
  await deleteFile(env, slug, f.sha, `blog: delete ${slug}`);
  return true;
}

// ── Images ─────────────────────────────────────────────────────
// Stored under public/blog/images/<yyyy-mm>/ and served at /blog/images/...

const IMAGE_DIR = 'public/blog/images';

export async function uploadImage(env: Env, filename: string, ext: string, bytes: Uint8Array): Promise<string> {
  const month = new Date().toISOString().slice(0, 7);
  const base  = filename.replace(/\.[^.]*$/, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'image';
  const name  = `${base}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const path  = `${IMAGE_DIR}/${month}/${name}`;
  await gh(env, `/repos/${env.GITHUB_REPO}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({ message: `blog: upload image ${name}`, content: bytesToB64(bytes), branch: branch(env) }),
  });
  return `/blog/images/${month}/${name}`;
}
