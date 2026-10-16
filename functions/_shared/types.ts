export interface Post {
  slug:    string;
  title:   string;
  date:    string; // YYYY-MM-DD
  excerpt: string;
  content: string;
  draft:   boolean;
}

export type PostMeta = Omit<Post, 'content'>;

export interface Env {
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string; // random string, independent of the password
  GITHUB_TOKEN:   string; // fine-grained PAT: Contents read/write on this repo only
  GITHUB_REPO:    string; // "owner/name"
  GITHUB_BRANCH?: string; // defaults to "main"
  CF_ANALYTICS_TOKEN?: string; // API token with Account Analytics: Read
  CF_ACCOUNT_ID?:      string; // optional; discovered from the token if unset
}
