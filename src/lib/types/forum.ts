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

export type PostType = "text" | "photo" | "video" | "rich" | "poll";

export type PollResultsVisible = "after_vote" | "always" | "after_close";

/** A poll as one viewer sees it. `vote_count` is null until results show. */
export interface PollWire {
  id: string;
  multiple_choice: boolean;
  results_visible: PollResultsVisible;
  closes_at: string | null;
  closed: boolean;
  has_voted: boolean;
  show_results: boolean;
  total_votes: number;
  options: { id: string; label: string; vote_count: number | null; voted: boolean }[];
}

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
  dislike_count: number;
  allow_reactions: boolean;
  allow_comments: boolean;
  allow_dislikes: boolean;
  created_at: string;
  updated_at: string;
  author_name?: string;
  author_username?: string;
  author_avatar_color?: string;
  community_name?: string;
  community_slug?: string;
  community_icon?: string;
  // "like", "dislike", another reaction type, or null when the viewer hasn't reacted.
  user_reaction?: string | null;
  media?: PostMedia[];
  // Present on poll posts, null on every other type.
  poll?: PollWire | null;
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
