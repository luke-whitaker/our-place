import Database from 'better-sqlite3';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const DB_PATH = process.env.DATABASE_PATH || './data/our-place.db';

let db: Database.Database;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(path.resolve(DB_PATH));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeDatabase();
  }
  return db;
}

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      bio TEXT DEFAULT '',
      avatar_color TEXT DEFAULT '#6366f1',
      is_verified INTEGER DEFAULT 0,
      verification_code TEXT,
      verification_expires_at TEXT,
      reset_code TEXT,
      reset_code_expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS communities (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL COLLATE NOCASE,
      slug TEXT UNIQUE NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      icon TEXT DEFAULT '🌐',
      banner_color TEXT DEFAULT '#6366f1',
      guidelines TEXT DEFAULT '',
      creator_id TEXT NOT NULL,
      is_official INTEGER DEFAULT 0,
      member_count INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (creator_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS community_members (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      community_id TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      joined_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (community_id) REFERENCES communities(id),
      UNIQUE(user_id, community_id)
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL,
      community_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      comment_count INTEGER DEFAULT 0,
      reaction_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (author_id) REFERENCES users(id),
      FOREIGN KEY (community_id) REFERENCES communities(id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (post_id) REFERENCES posts(id),
      FOREIGN KEY (author_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS reactions (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      type TEXT DEFAULT 'like',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (post_id) REFERENCES posts(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(post_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS friendships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      friend_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (friend_id) REFERENCES users(id),
      UNIQUE(user_id, friend_id)
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      location TEXT DEFAULT '',
      event_date TEXT NOT NULL,
      event_end_date TEXT,
      community_id TEXT,
      creator_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (community_id) REFERENCES communities(id),
      FOREIGN KEY (creator_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS event_rsvps (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT DEFAULT 'going',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES events(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(event_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id);
    CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id);
    CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
    CREATE INDEX IF NOT EXISTS idx_events_community ON events(community_id);
    CREATE INDEX IF NOT EXISTS idx_events_creator ON events(creator_id);
    CREATE INDEX IF NOT EXISTS idx_event_rsvps_event ON event_rsvps(event_id);
    CREATE INDEX IF NOT EXISTS idx_event_rsvps_user ON event_rsvps(user_id);

    CREATE INDEX IF NOT EXISTS idx_community_members_user ON community_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_community_members_community ON community_members(community_id);
    CREATE INDEX IF NOT EXISTS idx_posts_community ON posts(community_id);
    CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
    CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
    CREATE INDEX IF NOT EXISTS idx_reactions_post ON reactions(post_id);
    CREATE INDEX IF NOT EXISTS idx_reactions_user_post ON reactions(user_id, post_id);
  `);

  // Seed pre-built communities if none exist
  const count = db.prepare('SELECT COUNT(*) as c FROM communities').get() as { c: number };
  if (count.c === 0) {
    seedCommunities();
  }
}

function seedCommunities() {
  const systemUserId = uuidv4();
  
  // Create system user for official communities
  db.prepare(`
    INSERT INTO users (id, username, display_name, email, phone, password_hash, bio, avatar_color, is_verified)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    systemUserId,
    'ourplace',
    'Our Place',
    'system@ourplace.community',
    '0000000000',
    '$2a$12$placeholder.hash.for.system.user.only',
    'The official Our Place community account.',
    '#6366f1',
    1
  );

  const communities = [
    { name: 'Welcome Center', slug: 'welcome-center', description: 'New to Our Place? Start here! Introduce yourself, ask questions, and learn how to make the most of your experience.', category: 'General', icon: '👋', banner_color: '#6366f1', guidelines: 'Be welcoming and supportive. Help new members find their way.' },
    { name: 'Community Support', slug: 'community-support', description: 'Need help or have feedback? This is the place to connect with the Our Place team and fellow community members.', category: 'Support & Advice', icon: '🤝', banner_color: '#8b5cf6', guidelines: 'Be patient, constructive, and respectful when offering support.' },
    { name: 'Creative Corner', slug: 'creative-corner', description: 'A space for artists, writers, musicians, and creators of all kinds to share their work, get feedback, and inspire each other.', category: 'Arts & Culture', icon: '🎨', banner_color: '#d946ef', guidelines: 'Always give credit. Constructive feedback only. Celebrate creativity in all forms.' },
    { name: 'Tech & Innovation', slug: 'tech-innovation', description: 'Discuss the latest in technology, share projects, ask for help with coding, and explore the future of innovation together.', category: 'Technology', icon: '💡', banner_color: '#0ea5e9', guidelines: 'Share knowledge freely. No gatekeeping. Help others learn.' },
    { name: 'Health & Wellness', slug: 'health-wellness', description: 'Support each other on journeys toward better physical and mental health. Share tips, experiences, and encouragement.', category: 'Health & Wellness', icon: '🌿', banner_color: '#10b981', guidelines: 'Be sensitive and supportive. No medical advice — encourage professional help when needed.' },
    { name: 'Book Club', slug: 'book-club', description: 'For readers and book lovers! Share recommendations, discuss what you\'re reading, and join monthly reading challenges.', category: 'Books & Literature', icon: '📚', banner_color: '#f59e0b', guidelines: 'Use spoiler warnings. Respect different reading tastes. Share your honest thoughts.' },
    { name: 'Local Events & Meetups', slug: 'local-events', description: 'Discover and organize local events, meetups, and gatherings. Connect with people in your area.', category: 'Local & Events', icon: '📍', banner_color: '#ef4444', guidelines: 'Always prioritize safety. Verify event details. Respect privacy.' },
    { name: 'Sustainability Hub', slug: 'sustainability', description: 'Dedicated to environmental awareness, sustainable living, and making a positive impact on our planet together.', category: 'Environment', icon: '🌍', banner_color: '#22c55e', guidelines: 'Focus on actionable solutions. Be encouraging, not judgmental.' },
    { name: 'Music & Sound', slug: 'music-sound', description: 'Share music, discuss artists, collaborate on projects, and discover new sounds from around the world.', category: 'Music', icon: '🎵', banner_color: '#a855f7', guidelines: 'Respect all genres. Share credit for collaborations. Support independent artists.' },
    { name: 'Food & Cooking', slug: 'food-cooking', description: 'Exchange recipes, cooking tips, food photography, and culinary adventures. From home cooks to food enthusiasts!', category: 'Food & Cooking', icon: '🍳', banner_color: '#f97316', guidelines: 'Share complete recipes when possible. Be inclusive of dietary preferences.' },
    { name: 'Fitness & Sports', slug: 'fitness-sports', description: 'Whether you\'re a beginner or an athlete, share workout routines, sports discussions, and fitness goals.', category: 'Sports & Fitness', icon: '💪', banner_color: '#3b82f6', guidelines: 'Encourage all fitness levels. No body shaming. Celebrate personal progress.' },
    { name: 'Gaming Lounge', slug: 'gaming-lounge', description: 'A community for gamers of all platforms. Discuss games, find teammates, share clips, and stay updated on gaming news.', category: 'Gaming', icon: '🎮', banner_color: '#6366f1', guidelines: 'No toxicity. Respect all platforms and playstyles. Help new gamers.' },
  ];

  const insertCommunity = db.prepare(`
    INSERT INTO communities (id, name, slug, description, category, icon, banner_color, guidelines, creator_id, is_official, member_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
  `);

  for (const c of communities) {
    insertCommunity.run(
      uuidv4(),
      c.name,
      c.slug,
      c.description,
      c.category,
      c.icon,
      c.banner_color,
      c.guidelines,
      systemUserId
    );
  }
}

export default getDb;
export { getDb };
