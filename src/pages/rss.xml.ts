import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPublishedPosts } from '../lib/posts';

export async function GET(context: APIContext) {
  const posts = await getPublishedPosts();
  return rss({
    title: 'srdjan.cloud — Writing',
    description: 'Notes on cloud infrastructure, reliability, and the operational reality behind the architecture diagrams.',
    site: context.site!,
    items: posts.map(p => ({
      title:       p.data.title,
      pubDate:     p.data.date,
      description: p.data.excerpt,
      link:        `/blog/${p.slug}/`,
    })),
  });
}
