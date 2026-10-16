import type { Env } from './types';

// Visitor stats from Cloudflare Web Analytics (cookie-free RUM beacon) via the
// GraphQL Analytics API. Each panel is queried separately so one unsupported
// field degrades a single panel instead of the whole dashboard.

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
  return acct.g;
}

const FILTER = 'filter: { datetime_geq: $s, datetime_leq: $u }';
const VARS   = '$a: String!, $s: Time!, $u: Time!';
const wrap   = (inner: string) =>
  `query(${VARS}) { viewer { accounts(filter: { accountTag: $a }) { g: ${inner} } } }`;

export interface Row { key: string; visits: number; views: number }
type Panel<T> = T | { error: string };

async function panel<T>(fn: () => Promise<T>): Promise<Panel<T>> {
  try { return await fn(); }
  catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
}

const toRow = (g: any, dim: string): Row => ({
  key:    String(g.dimensions?.[dim] ?? ''),
  visits: g.sum?.visits ?? 0,
  views:  g.count ?? 0,
});

const BREAKDOWNS = {
  pages:     'requestPath',
  referrers: 'refererHost',
  countries: 'countryName',
  devices:   'deviceType',
  browsers:  'userAgentBrowser',
  os:        'userAgentOS',
} as const;

export async function getAnalytics(env: Env, days: number) {
  const until = new Date();
  const since = new Date(until.getTime() - days * 86_400_000);
  const a     = await accountId(env);
  const vars  = { a, s: since.toISOString(), u: until.toISOString() };
  const step  = days <= 1 ? 'datetimeHour' : 'date';

  const totals = panel(async () => {
    const g = await gql(env, wrap(`rumPageloadEventsAdaptiveGroups(limit: 1, ${FILTER}) { count sum { visits } }`), vars);
    return { visits: g?.[0]?.sum?.visits ?? 0, views: g?.[0]?.count ?? 0 };
  });

  const series = panel(async () => {
    const g = await gql(env, wrap(
      `rumPageloadEventsAdaptiveGroups(limit: 1000, ${FILTER}, orderBy: [${step}_ASC]) { count sum { visits } dimensions { ${step} } }`,
    ), vars);
    return (g ?? []).map((x: any) => toRow(x, step));
  });

  // pageLoadTime is reported in microseconds.
  const perf = panel(async () => {
    const g = await gql(env, wrap(
      `rumPerformanceEventsAdaptiveGroups(limit: 1, ${FILTER}) { count quantiles { pageLoadTimeP50 pageLoadTimeP75 } }`,
    ), vars);
    const q = g?.[0]?.quantiles ?? {};
    return {
      samples: g?.[0]?.count ?? 0,
      p50ms:   q.pageLoadTimeP50 != null ? Math.round(q.pageLoadTimeP50 / 1000) : null,
      p75ms:   q.pageLoadTimeP75 != null ? Math.round(q.pageLoadTimeP75 / 1000) : null,
    };
  });

  const breakdowns = Object.entries(BREAKDOWNS).map(([name, dim]) =>
    panel(async () => {
      const g = await gql(env, wrap(
        `rumPageloadEventsAdaptiveGroups(limit: 10, ${FILTER}, orderBy: [count_DESC]) { count sum { visits } dimensions { ${dim} } }`,
      ), vars);
      return (g ?? []).map((x: any) => toRow(x, dim));
    }).then(v => [name, v] as const),
  );

  const [t, s, p, ...b] = await Promise.all([totals, series, perf, ...breakdowns]);
  return {
    days,
    step,
    since: vars.s,
    until: vars.u,
    totals: t,
    series: s,
    perf:   p,
    ...Object.fromEntries(b),
  };
}
