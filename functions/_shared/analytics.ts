import type { Env } from './types';

// Visitor stats from Cloudflare Web Analytics (cookie-free RUM beacon) via the
// GraphQL Analytics API. All panels go in one aliased query for speed; if that
// fails, each panel is retried on its own so one bad field only breaks itself.

const API = 'https://api.cloudflare.com/client/v4';

let cachedAccount: string | undefined;

async function accountId(env: Env): Promise<string> {
  if (env.CF_ACCOUNT_ID) return env.CF_ACCOUNT_ID;
  if (cachedAccount) return cachedAccount;
  const res = await fetch(API + '/accounts?per_page=5', {
    headers: { Authorization: 'Bearer ' + env.CF_ANALYTICS_TOKEN },
  });
  const body: any = await res.json().catch(() => ({}));
  if (!body.success || !body.result?.length) {
    const why = body.errors?.map((e: any) => e.message).join('; ') || `HTTP ${res.status}`;
    throw new Error(`Could not determine the Cloudflare account (${why}) — set CF_ACCOUNT_ID`);
  }
  return (cachedAccount = body.result[0].id as string);
}

async function gql(env: Env, query: string, variables: Record<string, unknown>): Promise<any> {
  const res = await fetch(API + '/graphql', {
    method: 'POST',
    headers: {
      Authorization:  'Bearer ' + env.CF_ANALYTICS_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let body: any = {};
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  if (body.errors?.length) {
    throw new Error('GraphQL: ' + body.errors.map((e: any) => e.message || JSON.stringify(e)).join('; '));
  }
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}: ${text.slice(0, 200)}`);
  const acct = body.data?.viewer?.accounts?.[0];
  if (!acct) throw new Error('Token has no analytics access to this account (HTTP ' + res.status + ')');
  return acct;
}

export interface Row { key: string; visits: number; views: number }

const FILTER = 'filter: { datetime_geq: $s, datetime_leq: $u }';
const VARS   = '$a: String!, $s: Time!, $u: Time!';
const query  = (fields: string) =>
  `query(${VARS}) { viewer { accounts(filter: { accountTag: $a }) { ${fields} } } }`;

const BREAKDOWNS = {
  pages:     'requestPath',
  referrers: 'refererHost',
  countries: 'countryName',
  devices:   'deviceType',
  browsers:  'userAgentBrowser',
  os:        'userAgentOS',
} as const;

const toRow = (g: any, dim: string): Row => ({
  key:    String(g.dimensions?.[dim] ?? ''),
  visits: g.sum?.visits ?? 0,
  views:  g.count ?? 0,
});

interface PanelDef { field: string; parse: (g: any) => unknown }

function panels(step: string): Record<string, PanelDef> {
  const defs: Record<string, PanelDef> = {
    totals: {
      field: `rumPageloadEventsAdaptiveGroups(limit: 1, ${FILTER}) { count sum { visits } }`,
      parse: g => ({ visits: g?.[0]?.sum?.visits ?? 0, views: g?.[0]?.count ?? 0 }),
    },
    series: {
      field: `rumPageloadEventsAdaptiveGroups(limit: 1000, ${FILTER}, orderBy: [${step}_ASC]) { count sum { visits } dimensions { ${step} } }`,
      parse: g => (g ?? []).map((x: any) => toRow(x, step)),
    },
    // pageLoadTime is reported in microseconds.
    perf: {
      field: `rumPerformanceEventsAdaptiveGroups(limit: 1, ${FILTER}) { count quantiles { pageLoadTimeP50 pageLoadTimeP75 } }`,
      parse: g => {
        const q = g?.[0]?.quantiles ?? {};
        return {
          samples: g?.[0]?.count ?? 0,
          p50ms:   q.pageLoadTimeP50 != null ? Math.round(q.pageLoadTimeP50 / 1000) : null,
          p75ms:   q.pageLoadTimeP75 != null ? Math.round(q.pageLoadTimeP75 / 1000) : null,
        };
      },
    },
  };
  for (const [name, dim] of Object.entries(BREAKDOWNS)) {
    defs[name] = {
      field: `rumPageloadEventsAdaptiveGroups(limit: 10, ${FILTER}, orderBy: [count_DESC]) { count sum { visits } dimensions { ${dim} } }`,
      parse: g => (g ?? []).map((x: any) => toRow(x, dim)),
    };
  }
  return defs;
}

export async function getAnalytics(env: Env, days: number) {
  const until = new Date();
  const since = new Date(until.getTime() - days * 86_400_000);
  const vars  = { a: await accountId(env), s: since.toISOString(), u: until.toISOString() };
  const step  = days <= 1 ? 'datetimeHour' : 'date';
  const defs  = panels(step);
  const out: Record<string, unknown> = {};

  try {
    const acct = await gql(env, query(
      Object.entries(defs).map(([name, d]) => `${name}: ${d.field}`).join('\n'),
    ), vars);
    for (const [name, d] of Object.entries(defs)) out[name] = d.parse(acct[name]);
  } catch {
    // Slow path: isolate the failing panel(s).
    await Promise.all(Object.entries(defs).map(async ([name, d]) => {
      try {
        const acct = await gql(env, query(`${name}: ${d.field}`), vars);
        out[name] = d.parse(acct[name]);
      } catch (e) {
        out[name] = { error: e instanceof Error ? e.message : String(e) };
      }
    }));
  }

  return { days, step, since: vars.s, until: vars.u, generatedAt: until.toISOString(), ...out };
}
