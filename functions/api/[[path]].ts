import type { Env } from '../_shared/types';
import { seedIfEmpty, listPublished, getPost } from '../_shared/kv';

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': status === 200 ? 'public, s-maxage=60, max-age=30' : 'no-store',
      ...extra,
    },
  });
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  const url  = new URL(request.url);
  const path = url.pathname; // e.g. /api/posts or /api/posts/some-slug

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  await seedIfEmpty(env);

  // GET /api/posts
  if (path === '/api/posts') {
    const posts = await listPublished(env);
    return json(posts);
  }

  // GET /api/posts/:slug
  const slugMatch = path.match(/^\/api\/posts\/([^/]+)$/);
  if (slugMatch) {
    const slug = decodeURIComponent(slugMatch[1]);
    const post = await getPost(env, slug);
    if (!post) return json({ error: 'Not found' }, 404);
    return json(post);
  }

  return json({ error: 'Not found' }, 404);
};
