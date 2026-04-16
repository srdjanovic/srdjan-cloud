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
    excerpt: 'C5 compliance for a live cloud operations team is not an audit exercise. It\'s an operational discipline that surfaces architectural questions nobody thought to ask.',
    status:  'published',
    content: `## What BSI C5 actually means for a cloud operations team

The first thing you notice about BSI C5 is that it was written by people who have never had to produce the evidence themselves.

This isn't a criticism, exactly. The BSI (Bundesamt für Sicherheit in der Informationstechnik — Germany's federal cybersecurity agency) wrote a framework that is genuinely comprehensive. Seventeen control domains, hundreds of criteria, clear delineation between basic and enhanced requirements. On paper, it's a serious piece of work.

On paper is also, unfortunately, where most compliance frameworks live.

### What C5 actually is

BSI C5 is Germany's Cloud Computing Compliance Criteria Catalogue. If you operate cloud services in Germany — or for German public sector clients — C5 is the framework auditors use to assess whether your security controls are adequate. It covers the obvious (encryption, access control, incident response) and the less obvious (supply chain security, customer data residency, the independence of your audit function).

At IONOS Cloud, I've owned C5 evidence for DNS, CDN, and Domains products since 2023. These products handle hundreds of thousands of requests per day, which means the evidence isn't theoretical. It's operational — which is both the point and the difficulty.

### The gap between "having a policy" and "having evidence"

The first thing a C5 audit reveals is not that your controls are bad. It's that your documentation of your controls is worse than you thought.

Most teams that take cloud security seriously have reasonable practices: access reviews happen, changes go through approval pipelines, incidents get postmortems. The C5 problem is that "happening" and "being auditable" are different things. When an auditor asks for evidence that privileged access is reviewed quarterly, they don't want to hear that it happens. They want a log, a ticket, a report — something with a timestamp that says this specific thing happened on this specific date with this specific outcome.

Producing that evidence retroactively is possible, but it's miserable. The right approach is to instrument your processes for auditability *before* the audit, which requires knowing in advance exactly what evidence each criterion requires. This is, predictably, not obvious until you've done it once.

### The domains that generate the most operational work

C5 has 17 control domains. For a cloud infrastructure team, the ones that create the most day-to-day friction are:

- **OIS (Operational Information Security)** — change management, vulnerability management, patch cycles. Every infrastructure change needs a traceable approval record. Your GitOps pipeline handles this naturally; out-of-band kubectl commands made during incidents do not.
- **BCM (Business Continuity Management)** — availability targets, failover tests, RTO/RPO evidence. Not "we have HA architecture." Evidence that it works, from actual tests.
- **INM (Incident Management)** — response procedures, escalation paths, postmortem documentation. Postmortem templates improve when compliance depends on them.
- **CRY (Cryptography)** — key management, algorithm compliance, certificate lifecycle. If your certificate rotation is manual and tribal-knowledge-dependent, C5 will find it.

Each domain requires not just policies but *evidence*: logs, audit trails, test results, configuration exports. The gap between having a policy and having auditable evidence is where most teams discover gaps they didn't know existed.

### Where it actually gets interesting

C5 is most useful not as a compliance exercise but as a structural forcing function. When you work through the criteria and try to produce evidence for "all privileged access is granted on a need-to-have basis and regularly reviewed," you discover quickly which systems have grown organically in ways that don't match the principle of least privilege.

A few specific examples from the IONOS work:

**Access control**: Working through the criteria revealed RBAC configurations that had accumulated over time in ways that wouldn't survive a least-privilege audit. Nobody had been careless; it just hadn't been a requirement before. The audit process drove the cleanup.

**Change management**: Our GitOps pipeline produces change records naturally (every merge is a record). Out-of-band changes made during incidents — directly via kubectl — had no documentation trail. C5 drove formalization of incident change procedures.

**Incident documentation**: C5 requires documented incident response procedures and evidence that they're followed. The distinction between "we have a process" and "we have a documented, followed, evidenced process" turned out to be more productive than expected.

### The underrated part

C5 is designed as a technical framework, but its most valuable effects are organizational. The criteria force conversations about ownership, approval chains, and what "reviewed" actually means in practice — conversations that often haven't happened explicitly, even on teams that think they've had them.

I'd still rather the forcing function was something other than "auditors are coming in Q2." But the outputs — clearer ownership, better documentation, more auditable processes — are worth having independent of the audit itself.

The compliance work is not glamorous. It involves a lot of spreadsheets, a lot of evidence collection, and meetings that feel more like audit prep than engineering. The question is whether you'd prefer to discover the gaps on your own schedule or on the auditor's.`,
  },
  {
    slug:    'chaos-engineering-at-scale',
    title:   'Chaos engineering at scale: lessons from 100+ Kubernetes workloads',
    date:    '2025-02-28',
    excerpt: 'The failures you inject are less dangerous than the ones you discover. Running ChaosMesh across 100+ Kubernetes workloads at IONOS Cloud — what we found and what we fixed.',
    status:  'published',
    content: `## Chaos engineering at scale: lessons from 100+ Kubernetes workloads

The pitch for chaos engineering is always some version of: "break things on purpose so you find out how they break before a real failure does."

This is true. It also undersells how uncomfortable the "finding out" part actually is.

### Why we started

Our DNS and CDN products at IONOS Cloud handle over 65,000 requests per day across redundant infrastructure. We had solid monitoring — VictoriaMetrics for metrics, Loki for logs, Grafana for dashboards. We had runbooks for known failure modes. We ran regular postmortems. By the usual measures, we were doing operations reasonably well.

But we kept finding things during real incidents that our runbooks didn't cover. Not catastrophic gaps — more like: the procedure assumed behaviour A, and the system did behaviour B, and everyone improvised. Enough times that the question became unavoidable: *what do we actually know about how these systems fail, versus what do we assume?*

The chaos programme was the attempt to find out.

### The setup

We use ChaosMesh, which is the most mature cloud-native chaos engineering tool. It runs as a Kubernetes operator and supports a range of fault injection types: pod failure, container kill, network partition, packet loss, latency injection, CPU and memory stress, DNS error injection, filesystem errors.

The programme ran on production-equivalent environments, not production itself. Each experiment started with a hypothesis — a specific prediction about what would happen — a run procedure, and an observation plan. Experiments that revealed unexpected behaviour went into a finding queue. Findings got owners and remediation deadlines before the experiment ran again.

Over 2023, we ran experiments across 100+ workloads.

### What we found

The findings sorted into three categories, in rough order of how much they changed the architecture:

**Retry behaviour was wrong in ways that weren't obvious from code review.** Several services assumed upstream retries would mask transient failures — and they did, under brief transient conditions. Network partition experiments revealed that under *sustained* partition conditions, some retries exhausted connection pools, causing cascading failures. The code looked correct. The behaviour under sustained pressure was not. The fix was connection pool sizing and retry budget limits, neither of which were obvious until a chaos experiment created the right conditions.

**PodDisruptionBudgets were misconfigured.** A number of deployments had PDBs, but the PDB settings didn't reflect actual availability requirements — they reflected what someone had entered at initial deployment and nobody had revisited. Chaos experiments that killed pods validated whether services stayed up: in several cases, they didn't, despite a PDB being present. The fix here was less technical and more process: PDB configuration now gets reviewed as part of the deployment checklist.

**Health checks were optimistic.** Liveness probes configured too aggressively caused restart loops under CPU stress that never occurred under normal load. Readiness probes configured too leniently allowed traffic to route to pods that weren't actually ready. Neither was visible in monitoring until a chaos experiment created the conditions that exposed them.

### The uncomfortable part

None of these findings were dramatic. No cascading production outage, no data loss, nothing that makes a good conference talk war story. They were quiet gaps — the kind that only become loud when the combination of conditions is exactly wrong.

That's the uncomfortable part of chaos engineering. The failures you find aren't impressive. They're the ones that were quietly waiting for their moment, and you found them before that moment arrived. There's no satisfying reveal, just a remediation ticket and the knowledge that something that would have been a 3am page is now a known-handled case.

The 99.99% HA target for the covered workloads is now backed by empirical failure data. That's a different kind of confidence than "the architecture is correct, therefore it should work." Different and better, but the path there involves a lot of meetings that start with "so we found something."

### What actually makes it work

Chaos engineering programmes fail for predictable reasons: no organizational buy-in, experiments run in environments that don't resemble production, findings go unaddressed because there's no process to close them.

The things that made the IONOS programme work:

**Hypothesis-first experiments.** Every experiment started with a specific prediction about behaviour. When the prediction was wrong, that was the finding. Without the hypothesis, you're just breaking things and taking notes, which is less useful than it sounds.

**Runbook approval process.** Each experiment required a runbook, reviewed before execution. This forced specificity about scope and blast radius, which made conversations with platform teams significantly easier.

**Findings queue with named owners.** Findings without owners don't get fixed. The queue had a weekly review cadence. Every finding had a name attached to it. Not glamorous, but necessary.

The chaos engineering tooling is the easy part. The organizational scaffolding around it — the hypothesis discipline, the approval process, the findings ownership — is where chaos programmes succeed or fail. The tool is table stakes. The rest is just rigour.`,
  },
];

export async function seedIfEmpty(env: Env): Promise<void> {
  const exists = await env.BLOG_KV.get(INDEX_KEY);
  if (exists) return;

  const meta: PostMeta[] = DEFAULT_POSTS.map(({ content: _c, ...m }) => m);
  await env.BLOG_KV.put(INDEX_KEY, JSON.stringify(meta));
  await Promise.all(DEFAULT_POSTS.map(p => env.BLOG_KV.put(postKey(p.slug), JSON.stringify(p))));
}

export async function reseedDefaults(env: Env): Promise<void> {
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
