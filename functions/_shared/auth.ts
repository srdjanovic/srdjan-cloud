export const COOKIE_NAME     = 'admin_session';
export const SESSION_MS      = 24 * 60 * 60 * 1000; // 24 h

async function hmac(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key  = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export async function createSessionCookie(secret: string): Promise<string> {
  const payload = JSON.stringify({ exp: Date.now() + SESSION_MS });
  const encoded = btoa(payload);
  const sig     = await hmac(encoded, secret);
  const token   = encoded + '.' + sig;
  return (
    COOKIE_NAME + '=' + token +
    '; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=' + SESSION_MS / 1000
  );
}

export async function verifySession(request: Request, secret: string): Promise<boolean> {
  const cookie = request.headers.get('Cookie') ?? '';
  const match  = cookie.match(new RegExp('(?:^|;\\s*)' + COOKIE_NAME + '=([^;]*)'));
  if (!match) return false;

  const [encoded, sig] = match[1].split('.');
  if (!encoded || !sig) return false;

  const expected = await hmac(encoded, secret);
  if (expected !== sig) return false;

  try {
    const { exp } = JSON.parse(atob(encoded));
    return typeof exp === 'number' && exp > Date.now();
  } catch {
    return false;
  }
}

export function clearSessionCookie(): string {
  return COOKIE_NAME + '=; HttpOnly; SameSite=Strict; Secure; Path=/; Max-Age=0';
}
