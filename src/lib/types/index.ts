export type { User, UserPublic, AuthPayload } from "./auth";
export { AVATAR_COLORS } from "./auth";

export type {
  Community,
  CommunityWithMembership,
  CommunityMember,
  Post,
  PostType,
  PostMedia,
  RichContentBlock,
  Comment,
  Reaction,
  Friendship,
  Event,
  EventRsvp,
} from "./forum";
export { COMMUNITY_CATEGORIES } from "./forum";

// Game types re-exported from game module
// Import directly from @/lib/game for game-specific types
