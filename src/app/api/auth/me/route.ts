import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET() {
  const userId = await getSession();
  if (!userId) {
    return NextResponse.json({ user: null });
  }
  const rows = await sql`SELECT id, username FROM users WHERE id = ${userId}`;
  if (rows.length === 0) {
    return NextResponse.json({ user: null });
  }
  return NextResponse.json({ user: { id: rows[0].id, username: rows[0].username } });
}
