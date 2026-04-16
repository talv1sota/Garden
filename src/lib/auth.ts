import { cookies } from 'next/headers';
import sql from './db';

const SESSION_COOKIE = 'garden_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable is required');
}
const SESSION_SECRET = process.env.SESSION_SECRET;

async function sign(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${payload}.${hex}`;
}

async function verify(token: string): Promise<string | null> {
  const dot = token.lastIndexOf('.');
  if (dot === -1) return null;
  const payload = token.slice(0, dot);
  const expected = await sign(payload);
  // Constant-time comparison
  if (expected.length !== token.length) return null;
  let match = true;
  for (let i = 0; i < expected.length; i++) {
    if (expected[i] !== token[i]) match = false;
  }
  return match ? payload : null;
}

export async function createSession(userId: string): Promise<void> {
  const token = await sign(userId);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
}

export async function getSession(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const userId = await verify(token);
  if (!userId) return null;
  const rows = await sql`SELECT id FROM users WHERE id = ${userId}`;
  return rows.length > 0 ? userId : null;
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
