import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import sql from '@/lib/db';
import { createSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required.' }, { status: 400 });
    }

    const rows = await sql`SELECT id, password_hash FROM users WHERE username = ${username}`;
    if (rows.length === 0) {
      // Generic message to prevent username enumeration
      return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, rows[0].password_hash);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 });
    }

    await createSession(rows[0].id);
    return NextResponse.json({ ok: true, userId: rows[0].id });
  } catch (e: any) {
    console.error('Login error:', e);
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
