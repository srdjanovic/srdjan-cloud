import type { Post, PostMeta, Env } from './types';

const INDEX_KEY = 'blog:index';

function postKey(slug: string): string {
  return 'blog:post:' + slug;
}

const DEFAULT_POSTS: Post[] = [
  {
    slug:    'what-bsi-c5-actually-means',
    title:   'What BSI C5 actually means for a cloud operations team',
    date:    '2025-01-15',
    excerpt: 'A practical look at what C5 compliance actually involves day-to-day for a cloud operations team — beyond the audit checklist.',
    status:  'published',
    content: `## What BSI C5 actually means for a cloud operations team

BSI C5 (Cloud Computing Compliance Criteria Catalogue) is Germany's federal cloud security framework. On paper, it looks like another compliance checklist. In practice, owning C5 compliance for a live cloud operations team is a different beast entirely.

### The Gap Between Paper and Practice

Most compliance frameworks were designed for auditors, not operators. C5 is no exception. The criteria are comprehensive — covering everything from change management and availability to cryptography and incident response — but translating each criterion into *operational evidence* requires deep understanding of both the framework and your actual systems.

At IONOS Cloud, I've been responsible for C5 evidence for our DNS, CDN, and Domains products. Here's what that actually looks like in practice.

### What the Criteria Actually Require

C5 is organised into 17 control domains. The ones that generate the most operational work for a cloud infrastructure team are typically:

- **OIS (Operational Information Security)** — change management, vulnerability management, patch cycles
- **BCM (Business Continuity Management)** — availability targets, failover tests, RTO/RPO evidence
- **INM (Incident Management)** — response procedures, escalation paths, postmortem documentation
- **CRY (Cryptography)** — key management, algorithm compliance, certificate lifecycle

Each domain requires not just policies but *evidence*: logs, audit trails, test results, configuration exports. The gap between having a policy and having auditable evidence is where most teams struggle.

### Compliance as an Architectural Driver

One underrated aspect of C5 work is how it surfaces architectural questions that weren't obvious before the mapping exercise. When you try to produce evidence for, say, "all privileged access is logged and reviewed," you quickly discover which systems have gaps in their audit logging — not because anyone was careless, but because it was never a requirement before.

C5 has directly influenced infrastructure decisions at IONOS: how we structure RBAC in Kubernetes, how we handle secret rotation, how we document change management for Helm deployments. Compliance and architecture quality turn out to be more aligned than they first appear.

*(Full post coming soon)*`,
  },
  {
    slug:    'chaos-engineering-at-scale',
    title:   'Chaos engineering at scale: lessons from 100+ Kubernetes workloads',
    date:    '2025-02-28',
    excerpt: 'Running ChaosMesh experiments across 100+ Kubernetes workloads revealed patterns we never expected — and fixed bugs that monitoring never caught.',
    status:  'published',
    content: `## Chaos engineering at scale: lessons from 100+ Kubernetes workloads

Chaos engineering sounds intimidating. Deliberately injecting failures into production? Most teams won't touch it. But after running a structured chaos programme across 100+ Kubernetes workloads at IONOS Cloud, I can tell you: the failures you *inject* are far less dangerous than the failures you *discover*.

### Why We Started

Our DNS and CDN products serve 65,000+ requests per day across redundant infrastructure. We had solid monitoring (VictoriaMetrics, Loki, Grafana), runbooks for known failure modes, and regular postmortems. But we kept finding edge cases in incidents that our runbooks didn't cover.

The chaos programme was born out of a simple question: *what do we actually know about how these systems fail, versus what do we assume?*

### The Setup

We use **ChaosMesh** on Kubernetes — it's the most mature cloud-native chaos engineering tool, with a rich set of fault injection types:

- **PodChaos** — pod failure, container kill
- **NetworkChaos** — network partition, packet loss, latency injection
- **StressChaos** — CPU and memory pressure
- **DNSChaos** — DNS error injection
- **IOChaos** — filesystem error injection

The programme runs on production-equivalent environments (not prod itself), with experiments scoped and gated by a runbook approval process.

### What We Found

Across 100+ workloads, the findings fell into three categories:

**1. Incorrect assumptions about retry behaviour.** Several services assumed upstream retries would mask transient failures. They did — until they didn't. Network partition experiments revealed that some retries were exhausting connection pools under sustained partition conditions, causing cascading failures that wouldn't have been obvious from the code.

**2. PodDisruptionBudget gaps.** A number of deployments had PDBs configured, but the PDB settings didn't match the actual availability requirements. Chaos experiments that killed pods validated whether the service stayed up — and in several cases, it didn't, despite a PDB being present.

**3. Health check misconfigurations.** Liveness probes that were too aggressive caused restart loops under CPU stress that wouldn't occur under normal load. Readiness probes that were too lenient allowed traffic to route to pods that weren't actually ready.

### The Outcome

The 99.99% HA target for covered workloads is now backed by empirical failure data, not architectural intent. That's a different kind of confidence.

*(Full post coming soon)*`,
  },
];

export async function seedIfEmpty(env: Env): Promise<void> {
  const exists = await env.BLOG_KV.get(INDEX_KEY);
  if (exists) return;

  const meta: PostMeta[] = DEFAULT_POSTS.map(({ content: _c, ...m }) => m);
  await env.BLOG_KV.put(INDEX_KEY, JSON.stringify(meta));
  await Promise.all(DEFAULT_POSTS.map(p => env.BLOG_KV.put(postKey(p.slug), JSON.stringify(p))));
}

export async function listPublished(env: Env): Promise<PostMeta[]> {
  const raw = await env.BLOG_KV.get(INDEX_KEY);
  if (!raw) return [];
  const all: PostMeta[] = JSON.parse(raw);
  return all.filter(p => p.status === 'published');
}

export async function listAll(env: Env): Promise<PostMeta[]> {
  const raw = await env.BLOG_KV.get(INDEX_KEY);
  if (!raw) return [];
  return JSON.parse(raw);
}

export async function getPost(env: Env, slug: string): Promise<Post | null> {
  const raw = await env.BLOG_KV.get(postKey(slug));
  return raw ? JSON.parse(raw) : null;
}

export async function upsertPost(env: Env, post: Post, oldSlug?: string): Promise<void> {
  // If slug changed, remove old entry
  if (oldSlug && oldSlug !== post.slug) {
    await env.BLOG_KV.delete(postKey(oldSlug));
  }
  await env.BLOG_KV.put(postKey(post.slug), JSON.stringify(post));

  // Update index
  const raw   = await env.BLOG_KV.get(INDEX_KEY);
  const index: PostMeta[] = raw ? JSON.parse(raw) : [];
  const { content: _c, ...meta } = post;

  const existing = index.findIndex(p => p.slug === (oldSlug ?? post.slug));
  if (existing >= 0) index[existing] = meta;
  else               index.push(meta);

  index.sort((a, b) => b.date.localeCompare(a.date));
  await env.BLOG_KV.put(INDEX_KEY, JSON.stringify(index));
}

export async function deletePost(env: Env, slug: string): Promise<void> {
  await env.BLOG_KV.delete(postKey(slug));
  const raw   = await env.BLOG_KV.get(INDEX_KEY);
  const index: PostMeta[] = raw ? JSON.parse(raw) : [];
  await env.BLOG_KV.put(INDEX_KEY, JSON.stringify(index.filter(p => p.slug !== slug)));
}
