import { defineCollection, z } from 'astro:content';

// Posts live in src/content/blog/<slug>.md. The /admin editor commits files
// here through the GitHub API; every commit to main redeploys the site.
const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title:   z.string(),
    date:    z.coerce.date(),
    excerpt: z.string(),
    draft:   z.boolean().default(false),
  }),
});

export const collections = { blog };
