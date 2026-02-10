import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  try {
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
    }

    const db = getDb();

    // Get upcoming events from the user's communities + events they've RSVP'd to
    const events = db.prepare(`
      SELECT DISTINCT e.*,
        u.display_name as creator_name,
        u.username as creator_username,
        u.avatar_color as creator_avatar_color,
        c.name as community_name,
        c.icon as community_icon,
        (SELECT COUNT(*) FROM event_rsvps WHERE event_id = e.id) as rsvp_count,
        (SELECT status FROM event_rsvps WHERE event_id = e.id AND user_id = ?) as user_rsvp
      FROM events e
      JOIN users u ON e.creator_id = u.id
      LEFT JOIN communities c ON e.community_id = c.id
      LEFT JOIN community_members cm ON cm.community_id = e.community_id AND cm.user_id = ?
      LEFT JOIN event_rsvps er ON er.event_id = e.id AND er.user_id = ?
      WHERE e.event_date >= datetime('now')
        AND (cm.user_id IS NOT NULL OR er.user_id IS NOT NULL OR e.creator_id = ?)
      ORDER BY e.event_date ASC
      LIMIT 50
    `).all(auth.userId, auth.userId, auth.userId, auth.userId);

    // Get events the user has RSVP'd to (for calendar view)
    const myEvents = db.prepare(`
      SELECT e.*, er.status as user_rsvp,
        c.name as community_name,
        c.icon as community_icon
      FROM events e
      JOIN event_rsvps er ON er.event_id = e.id AND er.user_id = ?
      LEFT JOIN communities c ON e.community_id = c.id
      WHERE e.event_date >= datetime('now', '-7 days')
      ORDER BY e.event_date ASC
    `).all(auth.userId);

    return NextResponse.json({ events, myEvents });
  } catch (error) {
    console.error('Events error:', error);
    return NextResponse.json({ error: 'Failed to load events.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
    }

    const { title, description, location, event_date, event_end_date, community_id } = await request.json();

    if (!title || !description || !event_date) {
      return NextResponse.json({ error: 'Title, description, and date are required.' }, { status: 400 });
    }

    const db = getDb();
    const id = uuidv4();

    db.prepare(`
      INSERT INTO events (id, title, description, location, event_date, event_end_date, community_id, creator_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, description, location || '', event_date, event_end_date || null, community_id || null, auth.userId);

    // Auto-RSVP the creator
    db.prepare(`
      INSERT INTO event_rsvps (id, event_id, user_id, status)
      VALUES (?, ?, ?, 'going')
    `).run(uuidv4(), id, auth.userId);

    return NextResponse.json({ id, message: 'Event created!' }, { status: 201 });
  } catch (error) {
    console.error('Create event error:', error);
    return NextResponse.json({ error: 'Failed to create event.' }, { status: 500 });
  }
}
