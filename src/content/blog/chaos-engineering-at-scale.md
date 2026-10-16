---
title: "Chaos engineering at scale: lessons from 100+ Kubernetes workloads"
date: 2025-02-28
excerpt: "The failures you inject are less dangerous than the ones you discover. Running ChaosMesh across 100+ Kubernetes workloads at IONOS Cloud — what we found and what we fixed."
draft: false
---

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

The chaos engineering tooling is the easy part. The organizational scaffolding around it — the hypothesis discipline, the approval process, the findings ownership — is where chaos programmes succeed or fail. The tool is table stakes. The rest is just rigour.
