import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET /api/garden — load the user's garden
export async function GET() {
  const userId = await getSession();
  if (!userId) {
    return NextResponse.json({ error: 'Not logged in.' }, { status: 401 });
  }
  const rows = await sql`
    SELECT id, name, state, updated_at FROM gardens
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  if (rows.length === 0) {
    return NextResponse.json({ garden: null });
  }
  return NextResponse.json({ garden: rows[0] });
}

// POST /api/garden — save/update the user's garden
export async function POST(req: NextRequest) {
  const userId = await getSession();
  if (!userId) {
    return NextResponse.json({ error: 'Not logged in.' }, { status: 401 });
  }

  const body = await req.json();
  const state = body.state;
  const name = body.name || 'My Garden';

  if (!state || typeof state !== 'object') {
    return NextResponse.json({ error: 'Invalid garden state.' }, { status: 400 });
  }

  // Reject if payload is unreasonably large (> 5 MB)
  const stateStr = JSON.stringify(state);
  if (stateStr.length > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Garden data too large.' }, { status: 413 });
  }

  // Upsert: one garden per user+name pair
  const rows = await sql`
    INSERT INTO gardens (user_id, name, state, updated_at)
    VALUES (${userId}, ${name}, ${stateStr}::jsonb, NOW())
    ON CONFLICT (user_id, name)
    DO UPDATE SET state = ${stateStr}::jsonb, updated_at = NOW()
    RETURNING id
  `;

  return NextResponse.json({ ok: true, gardenId: rows[0].id });
}
