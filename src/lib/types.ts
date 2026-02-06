export interface User {
  id: string;
  username: string;
  display_name: string;
  email: string;
  phone: string;
  password_hash?: string;
  bio: string;
  avatar_color: string;
  is_verified: number;
  verification_code: string | null;
  verification_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserPublic {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_color: string;
  is_verified: number;
  created_at: string;
}

export interface Community {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  icon: string;
  banner_color: string;
  guidelines: string;
  creator_id: string;
  is_official: number;
  member_count: number;
  created_at: string;
}

export interface CommunityWithMembership extends Community {
  is_member: number;
  role: string | null;
}

export interface Post {
  id: string;
  author_id: string;
  community_id: string;
  title: string;
  content: string;
  comment_count: number;
  reaction_count: number;
  created_at: string;
  updated_at: string;
  author_name?: string;
  author_username?: string;
  author_avatar_color?: string;
  community_name?: string;
  community_slug?: string;
  community_icon?: string;
  user_reaction?: string | null;
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author_name?: string;
  author_username?: string;
  author_avatar_color?: string;
}

export interface Reaction {
  id: string;
  post_id: string;
  user_id: string;
  type: string;
  created_at: string;
}

export interface CommunityMember {
  id: string;
  user_id: string;
  community_id: string;
  role: string;
  joined_at: string;
  display_name?: string;
  username?: string;
  avatar_color?: string;
}

export interface AuthPayload {
  userId: string;
  username: string;
  is_verified: number;
}

export const COMMUNITY_CATEGORIES = [
  'General',
  'Technology',
  'Science',
  'Arts & Culture',
  'Health & Wellness',
  'Education',
  'Sports & Fitness',
  'Food & Cooking',
  'Music',
  'Gaming',
  'Books & Literature',
  'Environment',
  'Local & Events',
  'Support & Advice',
  'Hobbies & Crafts',
  'Business & Finance',
  'Humor',
  'Pets & Animals',
  'Travel',
  'Parenting',
] as const;

export const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#ef4444', '#f97316',
  '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#6366f1',
] as const;
