export type { AuthPayload } from "./auth";
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
} from "./forum";
export { COMMUNITY_CATEGORIES } from "./forum";

export type {
  FriendshipStatus,
  FriendEntry,
  FriendIsland,
  PublicProfile,
  PeopleEntry,
  IslandInfo,
  IslandVisibility,
} from "./social";

export type { AvatarConfig } from "./game";
export {
  SKIN_TONES,
  HAIR_COLORS,
  SHIRT_COLORS,
  PANTS_COLORS,
  SHOES_COLORS,
  DEFAULT_AVATAR,
} from "./game";

export type {
  PocketItem,
  NotebookPageDraft,
  NpcTalkState,
  NpcTalkResult,
  MailboxStatus,
  MailboxContents,
  DeskContents,
} from "./items";

export type {
  Emote,
  PresenceDir,
  PresencePlayer,
  PresenceMoveBody,
  PresenceEmoteBody,
  PresenceSnapshotEvent,
  PresenceLeaveEvent,
} from "./presence";
export { EMOTES, PRESENCE_DIRS } from "./presence";

export type { Outfit, OutfitLook, HairStyle, ArmoireContents } from "./outfits";
export { MAX_OUTFITS, OUTFIT_NAME_MAX, HAIR_STYLES } from "./outfits";

export type { NotificationActor, NotificationPost, NotificationItem } from "./notifications";

export type {
  GatheringKind,
  GatheringStatus,
  GatheringAnswer,
  GatheringPerson,
  GatheringEntry,
  GatheringCalendar,
  GatheringDetail,
  GatheringInviteSummary,
} from "./gatherings";

export { MAX_PICKED_INVITEES } from "./gatherings";
