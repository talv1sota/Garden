import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import sql from '@/lib/db';
import { createSession } from '@/lib/auth';
import { rateLimit } from '@/lib/rateLimit';

const USERNAME_RE = /^[a-zA-Z0-9_.\-]{1,30}$/;
const SALT_ROUNDS = 12;

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const wait = rateLimit(`register:${ip}`, 3, 60);
    if (wait !== null) {
      return NextResponse.json({ error: `Too many attempts. Try again in ${wait}s.` }, { status: 429 });
    }

    const body = await req.json();
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const inviteCode = typeof body.inviteCode === 'string' ? body.inviteCode.trim() : '';

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required.' }, { status: 400 });
    }

    const validCode = process.env.INVITE_CODE;
    if (!validCode || inviteCode !== validCode) {
      return NextResponse.json({ error: 'Valid invite code required.' }, { status: 403 });
    }
    if (!USERNAME_RE.test(username)) {
      return NextResponse.json({ error: 'Username must be 3-30 chars: letters, numbers, underscores, dots, or hyphens.' }, { status: 400 });
    }
    if (password.length < 8 || password.length > 128) {
      return NextResponse.json({ error: 'Password must be 8-128 characters.' }, { status: 400 });
    }

    // Check if username taken
    const existing = await sql`SELECT id FROM users WHERE username = ${username}`;
    if (existing.length > 0) {
      return NextResponse.json({ error: 'Username already taken.' }, { status: 409 });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const rows = await sql`
      INSERT INTO users (username, password_hash)
      VALUES (${username}, ${hash})
      RETURNING id
    `;

    await createSession(rows[0].id);
    return NextResponse.json({ ok: true, userId: rows[0].id });
  } catch (e: any) {
    console.error('Register error:', e);
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
