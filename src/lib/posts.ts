import { getCollection } from 'astro:content';

export async function getPublishedPosts() {
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

// Dates are stored as plain YYYY-MM-DD (midnight UTC); format in UTC so
// visitors west of Greenwich don't see the previous day.
export function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

export function readingTime(body: string): number {
  return Math.max(1, Math.round(body.split(/\s+/).length / 220));
}
