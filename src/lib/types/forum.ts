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

export type PostType = "text" | "photo" | "video" | "rich";

export interface PostMedia {
  id: string;
  post_id: string;
  media_type: "image" | "video";
  media_source: "upload" | "youtube" | "vimeo" | "external";
  url: string;
  filename: string | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  sort_order: number;
  created_at: string;
}

export interface RichContentBlock {
  type: "text" | "image" | "video";
  content?: string;
  url?: string;
  alt?: string;
  media_source?: "upload" | "youtube" | "vimeo";
}

export interface Post {
  id: string;
  author_id: string;
  community_id: string | null;
  post_type: PostType;
  posted_to_profile: number;
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
  media?: PostMedia[];
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

export const COMMUNITY_CATEGORIES = [
  "General",
  "Technology",
  "Science",
  "Arts & Culture",
  "Health & Wellness",
  "Education",
  "Sports & Fitness",
  "Food & Cooking",
  "Music",
  "Gaming",
  "Books & Literature",
  "Environment",
  "Local & Events",
  "Support & Advice",
  "Hobbies & Crafts",
  "Business & Finance",
  "Humor",
  "Pets & Animals",
  "Travel",
  "Parenting",
] as const;
