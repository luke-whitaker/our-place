import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { createCommunityLimiter } from '@/lib/rate-limit';
import { createCommunitySchema, getZodErrorMessage } from '@/lib/schemas';
import { v4 as uuidv4 } from 'uuid';

// GET: List/search all communities
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const category = searchParams.get('category') || '';
    const joined = searchParams.get('joined') || '';

    const db = getDb();
    let query = '';
    const params: (string | number)[] = [];

    if (auth && joined === 'true') {
      query = `
        SELECT c.*, 
          CASE WHEN cm.user_id IS NOT NULL THEN 1 ELSE 0 END as is_member,
          cm.role
        FROM communities c
        INNER JOIN community_members cm ON c.id = cm.community_id AND cm.user_id = ?
        WHERE 1=1
      `;
      params.push(auth.userId);
    } else {
      query = `
        SELECT c.*,
          CASE WHEN cm.user_id IS NOT NULL THEN 1 ELSE 0 END as is_member,
          cm.role
        FROM communities c
        LEFT JOIN community_members cm ON c.id = cm.community_id ${auth ? 'AND cm.user_id = ?' : 'AND 1=0'}
        WHERE 1=1
      `;
      if (auth) params.push(auth.userId);
    }

    if (search) {
      query += ' AND (c.name LIKE ? OR c.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (category) {
      query += ' AND c.category = ?';
      params.push(category);
    }

    query += ' ORDER BY c.member_count DESC, c.created_at DESC';

    const communities = db.prepare(query).all(...params);

    return NextResponse.json({ communities });
  } catch (error) {
    console.error('Communities list error:', error);
    return NextResponse.json({ error: 'Failed to load communities.' }, { status: 500 });
  }
}

// POST: Create a new community
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ error: 'Please log in to create a community.' }, { status: 401 });
    }
    if (!auth.is_verified) {
      return NextResponse.json({ error: 'Please verify your account before creating a community.' }, { status: 403 });
    }

    const limit = createCommunityLimiter.check(auth.userId);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many communities created. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) } }
      );
    }

    const body = await request.json();
    const parsed = createCommunitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }
    const { name, description, category, icon, guidelines } = parsed.data;

    const db = getDb();

    // Check if community already exists
    const existing = db.prepare('SELECT id FROM communities WHERE name = ? COLLATE NOCASE').get(name);
    if (existing) {
      return NextResponse.json({ error: 'A community with this name already exists.' }, { status: 409 });
    }

    const id = uuidv4();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const existingSlug = db.prepare('SELECT id FROM communities WHERE slug = ?').get(slug);
    if (existingSlug) {
      return NextResponse.json({ error: 'A community with a similar name already exists.' }, { status: 409 });
    }

    const bannerColors = ['#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#ef4444', '#f97316', '#f59e0b', '#22c55e', '#10b981', '#0ea5e9', '#3b82f6'];
    const banner_color = bannerColors[Math.floor(Math.random() * bannerColors.length)];

    db.prepare(`
      INSERT INTO communities (id, name, slug, description, category, icon, banner_color, guidelines, creator_id, member_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(id, name, slug, description, category, icon || '🌐', banner_color, guidelines || '', auth.userId);

    // Auto-join creator as admin
    db.prepare(`
      INSERT INTO community_members (id, user_id, community_id, role)
      VALUES (?, ?, ?, 'admin')
    `).run(uuidv4(), auth.userId, id);

    return NextResponse.json({
      message: 'Community created!',
      community: { id, name, slug, description, category, icon: icon || '🌐', banner_color },
    }, { status: 201 });
  } catch (error) {
    console.error('Create community error:', error);
    return NextResponse.json({ error: 'Failed to create community.' }, { status: 500 });
  }
}
