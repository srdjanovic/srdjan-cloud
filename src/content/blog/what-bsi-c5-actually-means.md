---
title: "What BSI C5 actually means for a cloud operations team"
date: 2025-01-15
excerpt: "C5 compliance for a live cloud operations team is not an audit exercise. It's an operational discipline that surfaces architectural questions nobody thought to ask."
draft: false
---

The first thing you notice about BSI C5 is that it was written by people who have never had to produce the evidence themselves.

This isn't a criticism, exactly. The BSI (Bundesamt für Sicherheit in der Informationstechnik — Germany's federal cybersecurity agency) wrote a framework that is genuinely comprehensive. Seventeen control domains, hundreds of criteria, clear delineation between basic and enhanced requirements. On paper, it's a serious piece of work.

On paper is also, unfortunately, where most compliance frameworks live.

## What C5 actually is

BSI C5 is Germany's Cloud Computing Compliance Criteria Catalogue. If you operate cloud services in Germany — or for German public sector clients — C5 is the framework auditors use to assess whether your security controls are adequate. It covers the obvious (encryption, access control, incident response) and the less obvious (supply chain security, customer data residency, the independence of your audit function).

At IONOS Cloud, I've owned C5 evidence for DNS, CDN, and Domains products since 2023. These products handle hundreds of thousands of requests per day, which means the evidence isn't theoretical. It's operational — which is both the point and the difficulty.

## The gap between "having a policy" and "having evidence"

The first thing a C5 audit reveals is not that your controls are bad. It's that your documentation of your controls is worse than you thought.

Most teams that take cloud security seriously have reasonable practices: access reviews happen, changes go through approval pipelines, incidents get postmortems. The C5 problem is that "happening" and "being auditable" are different things. When an auditor asks for evidence that privileged access is reviewed quarterly, they don't want to hear that it happens. They want a log, a ticket, a report — something with a timestamp that says this specific thing happened on this specific date with this specific outcome.

Producing that evidence retroactively is possible, but it's miserable. The right approach is to instrument your processes for auditability *before* the audit, which requires knowing in advance exactly what evidence each criterion requires. This is, predictably, not obvious until you've done it once.

## The domains that generate the most operational work

C5 has 17 control domains. For a cloud infrastructure team, the ones that create the most day-to-day friction are:

- **OIS (Operational Information Security)** — change management, vulnerability management, patch cycles. Every infrastructure change needs a traceable approval record. Your GitOps pipeline handles this naturally; out-of-band kubectl commands made during incidents do not.
- **BCM (Business Continuity Management)** — availability targets, failover tests, RTO/RPO evidence. Not "we have HA architecture." Evidence that it works, from actual tests.
- **INM (Incident Management)** — response procedures, escalation paths, postmortem documentation. Postmortem templates improve when compliance depends on them.
- **CRY (Cryptography)** — key management, algorithm compliance, certificate lifecycle. If your certificate rotation is manual and tribal-knowledge-dependent, C5 will find it.

Each domain requires not just policies but *evidence*: logs, audit trails, test results, configuration exports. The gap between having a policy and having auditable evidence is where most teams discover gaps they didn't know existed.

## Where it actually gets interesting

C5 is most useful not as a compliance exercise but as a structural forcing function. When you work through the criteria and try to produce evidence for "all privileged access is granted on a need-to-have basis and regularly reviewed," you discover quickly which systems have grown organically in ways that don't match the principle of least privilege.

A few specific examples from the IONOS work:

**Access control**: Working through the criteria revealed RBAC configurations that had accumulated over time in ways that wouldn't survive a least-privilege audit. Nobody had been careless; it just hadn't been a requirement before. The audit process drove the cleanup.

**Change management**: Our GitOps pipeline produces change records naturally (every merge is a record). Out-of-band changes made during incidents — directly via kubectl — had no documentation trail. C5 drove formalization of incident change procedures.

**Incident documentation**: C5 requires documented incident response procedures and evidence that they're followed. The distinction between "we have a process" and "we have a documented, followed, evidenced process" turned out to be more productive than expected.

## The underrated part

C5 is designed as a technical framework, but its most valuable effects are organizational. The criteria force conversations about ownership, approval chains, and what "reviewed" actually means in practice — conversations that often haven't happened explicitly, even on teams that think they've had them.

I'd still rather the forcing function was something other than "auditors are coming in Q2." But the outputs — clearer ownership, better documentation, more auditable processes — are worth having independent of the audit itself.

The compliance work is not glamorous. It involves a lot of spreadsheets, a lot of evidence collection, and meetings that feel more like audit prep than engineering. The question is whether you'd prefer to discover the gaps on your own schedule or on the auditor's.
