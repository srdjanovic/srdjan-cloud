export interface Post {
  slug:    string;
  title:   string;
  date:    string;
  excerpt: string;
  content: string;
  status:  'published' | 'draft';
}

export interface PostMeta {
  slug:    string;
  title:   string;
  date:    string;
  excerpt: string;
  status:  'published' | 'draft';
}

export interface Env {
  BLOG_KV:        KVNamespace;
  ADMIN_PASSWORD: string;
}
