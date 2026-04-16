import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import sql from '@/lib/db';
import { createSession } from '@/lib/auth';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;
const SALT_ROUNDS = 12;

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required.' }, { status: 400 });
    }
    if (!USERNAME_RE.test(username)) {
      return NextResponse.json({ error: 'Username must be 3-30 chars: letters, numbers, underscores.' }, { status: 400 });
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
