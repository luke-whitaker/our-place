import { z } from "zod";
import { TINT_PRESETS } from "@/lib/game/terrain-tint";
import { MAILBOX_COLORS } from "@/lib/game/mailbox-colors";
import { DESK_SLOTS, NOTE_MAX_CHARS } from "@/lib/items";
import { isAllowedMediaUrl, MAX_IMAGES_PER_POST } from "@/lib/media-utils";
import {
  EMOTES,
  HAIR_STYLES,
  MAX_PICKED_INVITEES,
  OUTFIT_NAME_MAX,
  PRESENCE_DIRS,
  type IslandVisibility,
} from "@/lib/types";

const ISLAND_VISIBILITIES: readonly IslandVisibility[] = ["anyone", "friends", "nobody"];

// bcrypt reads only the first 72 bytes, so a longer password adds nothing but
// hashing work. New passwords stop at 128 characters.
export const PASSWORD_MAX = 128;
const newPassword = (requiredError: string) =>
  z
    .string({ error: requiredError })
    .min(8, "Password must be at least 8 characters.")
    .max(PASSWORD_MAX, `Password must be ${PASSWORD_MAX} characters or fewer.`);

// A password being checked rather than set gets a looser bound: a member who
// chose a longer one before the cap must still be able to sign in.
const PASSWORD_CHECK_MAX = 1024;

// ── Auth schemas ──

// Phone numbers are optional and stored digits-only, so formatting
// differences can't bypass the unique constraint (one human, one account).
// Returns null for empty/formatting-only input, meaning "no phone on file."
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

export const createUserSchema = z.object({
  username: z
    .string({ error: "All fields are required." })
    .min(3, "Username must be 3-24 characters.")
    .max(24, "Username must be 3-24 characters.")
    .regex(/^[a-z0-9_]+$/, "Lowercase letters, numbers, and underscores only."),
  display_name: z.string({ error: "All fields are required." }).min(1, "All fields are required."),
  email: z
    .string({ error: "All fields are required." })
    .email("Please enter a valid email address."),
  phone: z.string().max(30, "Phone number is too long.").optional(),
  password: newPassword("All fields are required."),
});

// The admin dashboard's create-account form: the web of trust requires every
// invited member to name their inviter. The base createUserSchema stays
// inviter-free for the trust roots (scripts/create-admin.ts bootstrap).
export const adminCreateUserSchema = createUserSchema.extend({
  invited_by_id: z.uuid({ error: "Pick the member who invited this person." }),
});

export const loginSchema = z.object({
  login: z
    .string({ error: "Please enter your email/username and password." })
    .min(1, "Please enter your email/username and password.")
    .max(254, "Invalid email/username or password."),
  password: z
    .string({ error: "Please enter your email/username and password." })
    .min(1, "Please enter your email/username and password.")
    .max(PASSWORD_CHECK_MAX, "Invalid email/username or password."),
});

export const updateAccountSchema = z
  .object({
    display_name: z
      .string()
      .trim()
      .min(1, "Name can't be empty.")
      .max(50, "Name must be 50 characters or fewer.")
      .optional(),
    email: z.string().email("Please enter a valid email address.").optional(),
    // An empty string clears the phone number (phone is optional).
    phone: z.string().max(30, "Phone number is too long.").optional(),
    theme: z.enum(["auto", "platinum", "terminal", "dusk"]).optional(),
    biome: z.enum(TINT_PRESETS).optional(),
    mailbox_color: z.enum(MAILBOX_COLORS).optional(),
    island_visibility: z.enum(ISLAND_VISIBILITIES).optional(),
    exclude_from_metrics: z.boolean().optional(),
    current_password: z
      .string()
      .max(PASSWORD_CHECK_MAX, "Current password is incorrect.")
      .optional(),
    new_password: newPassword("Password must be at least 8 characters.").optional(),
  })
  .refine(
    (d) =>
      d.display_name ||
      d.email ||
      d.phone !== undefined ||
      d.theme ||
      d.biome ||
      d.mailbox_color ||
      d.island_visibility ||
      d.exclude_from_metrics !== undefined ||
      d.new_password,
    { message: "Nothing to update." },
  )
  // Email and phone need the password too: with only a session, changing the
  // email and then resetting the password would take over the account.
  .refine((d) => !needsCurrentPassword(d) || (d.current_password ?? "").length > 0, {
    message: "Enter your current password to change your email, phone, or password.",
  });

/** Whether an account update touches sign-in details, so the current password must come too. */
export function needsCurrentPassword(d: {
  email?: string;
  phone?: string;
  new_password?: string;
}): boolean {
  return d.email !== undefined || d.phone !== undefined || d.new_password !== undefined;
}

export const forgotPasswordSchema = z.object({
  email: z.string({ error: "Email is required." }).email("Please enter a valid email address."),
});

export const resetPasswordSchema = z.object({
  email: z
    .string({ error: "Email, reset code, and new password are all required." })
    .min(1, "Email, reset code, and new password are all required."),
  code: z
    .string({ error: "Email, reset code, and new password are all required." })
    .min(1, "Email, reset code, and new password are all required.")
    .max(16, "Invalid email or reset code."),
  new_password: newPassword("Email, reset code, and new password are all required."),
});

// ── Friendship schemas ──

export const sendFriendRequestSchema = z.object({
  username: z
    .string({ error: "Pick someone to send a friend request to." })
    .min(1, "Pick someone to send a friend request to."),
});

// ── Content schemas ──

// Today's longest are a few hundred characters; these leave room without
// letting one community page carry a novel.
export const COMMUNITY_DESCRIPTION_MAX = 1000;
export const COMMUNITY_GUIDELINES_MAX = 5000;

export const createCommunitySchema = z.object({
  name: z
    .string({ error: "Name, description, and category are required." })
    .min(3, "Community name must be 3-50 characters.")
    .max(50, "Community name must be 3-50 characters."),
  description: z
    .string({ error: "Name, description, and category are required." })
    .min(20, "Description must be at least 20 characters.")
    .max(
      COMMUNITY_DESCRIPTION_MAX,
      `Description must be ${COMMUNITY_DESCRIPTION_MAX} characters or fewer.`,
    ),
  category: z
    .string({ error: "Name, description, and category are required." })
    .min(1, "Name, description, and category are required.")
    .max(50, "Category must be 50 characters or fewer."),
  icon: z.string().max(32, "Pick an icon from the list.").optional(),
  guidelines: z
    .string()
    .max(
      COMMUNITY_GUIDELINES_MAX,
      `Guidelines must be ${COMMUNITY_GUIDELINES_MAX} characters or fewer.`,
    )
    .optional(),
});

const postTypeEnum = z.enum(["text", "photo", "video", "rich"]);

const mediaItemSchema = z.object({
  media_type: z.string().optional(),
  media_source: z.string().optional(),
  // Read at parse time, not import time, so tests and dev can set the base.
  url: z
    .string()
    .max(2048, "That media link is too long.")
    .refine((url) => isAllowedMediaUrl(url, process.env.R2_PUBLIC_BASE_URL), {
      message: "Media must be uploaded here or linked from YouTube or Vimeo.",
    }),
  filename: z.string().optional().nullable(),
  file_size: z.number().optional().nullable(),
});

// Interaction controls the author picks at compose time. Reactions and
// comments are on unless switched off; dislikes are off unless opted in.
const interactionControlFields = {
  allow_reactions: z.boolean().default(true),
  allow_comments: z.boolean().default(true),
  allow_dislikes: z.boolean().default(false),
};

export const createPostSchema = z.object({
  post_type: postTypeEnum.default("text"),
  title: z.string().max(200, "Title must be under 200 characters.").default(""),
  content: z.string().max(50000, "Post content must be under 50,000 characters.").default(""),
  media: z
    .array(mediaItemSchema)
    .max(MAX_IMAGES_PER_POST, "Maximum 10 images per post.")
    .default([]),
  post_to_profile: z.union([z.boolean(), z.number()]).optional(),
  ...interactionControlFields,
});

export const createMyPlacePostSchema = z.object({
  post_type: postTypeEnum.default("text"),
  title: z.string().max(200, "Title must be under 200 characters.").default(""),
  content: z.string().max(50000, "Post content must be under 50,000 characters.").default(""),
  media: z
    .array(mediaItemSchema)
    .max(MAX_IMAGES_PER_POST, "Maximum 10 images per post.")
    .default([]),
  ...interactionControlFields,
});

export const createCommentSchema = z.object({
  content: z
    .string({ error: "Comment cannot be empty." })
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(1, "Comment cannot be empty.")
        .max(5000, "Comment must be under 5,000 characters."),
    ),
});

export const REACTION_TYPES = ["like", "love", "laugh", "wow", "sad", "angry", "dislike"] as const;

export const createReactionSchema = z.object({
  type: z.enum(REACTION_TYPES).default("like"),
});

// ── Avatar schema ──

const hexColorRegex = /^#[0-9a-fA-F]{6}$/;

export const updateAvatarSchema = z.object({
  hairStyle: z.enum(["short", "long"]),
  hairColor: z.string().regex(hexColorRegex, "Invalid hair color."),
  skinTone: z.string().regex(hexColorRegex, "Invalid skin tone color."),
  shirtColor: z.string().regex(hexColorRegex, "Invalid shirt color."),
  pantsColor: z.string().regex(hexColorRegex, "Invalid pants color."),
  shoesColor: z.string().regex(hexColorRegex, "Invalid shoes color."),
});

// ── Notebook schema ──

export const notebookPageSchema = z.object({
  body: z
    .string({ error: "Write something first." })
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(1, "Write something first.")
        .max(NOTE_MAX_CHARS, `Drafts are ${NOTE_MAX_CHARS} characters or fewer.`),
    ),
});

// ── Mailbox schema ──

export const leaveLetterSchema = z.object({
  item_id: z.uuid({ error: "Pick something to leave." }),
});

// ── Gathering schemas ──

export const createGatheringSchema = z.object({
  kind: z.enum(["in_person", "world"], { error: "Choose in person or in the world." }),
  title: z
    .string({ error: "Give your gathering a name." })
    .trim()
    .min(1, "Give your gathering a name.")
    .max(100, "Names can be up to 100 characters."),
  description: z
    .string()
    .trim()
    .max(2000, "Descriptions can be up to 2,000 characters.")
    .default(""),
  starts_at: z.iso.datetime({ offset: true, error: "Choose when it starts." }),
  ends_at: z.iso.datetime({ offset: true, error: "Choose when it ends." }),
  address: z.string().trim().max(300, "Addresses can be up to 300 characters.").default(""),
  community_id: z.uuid().nullable().default(null),
  invitee_ids: z
    .array(z.uuid())
    .max(MAX_PICKED_INVITEES, `You can invite up to ${MAX_PICKED_INVITEES} people by name.`)
    .default([]),
});

export const gatheringResponseSchema = z.object({
  response: z.enum(["accepted", "declined"], { error: "Answer accept or decline." }),
});

export const gatheringCalendarSchema = z.object({
  from: z.iso.datetime({ offset: true, error: "A calendar needs a start date." }),
  to: z.iso.datetime({ offset: true, error: "A calendar needs an end date." }),
  community: z.string().min(1).max(100).optional(),
});

// ── Desk schema ──

export const deskStoreSchema = z.object({
  item_id: z.uuid({ error: "Pick something to put away." }),
  slot: z
    .number()
    .int()
    .min(0)
    .max(DESK_SLOTS - 1, "That drawer doesn't exist.")
    .optional(),
});

// ── Helper ──

export function getZodErrorMessage(result: z.ZodSafeParseError<unknown>): string {
  return result.error.issues[0]?.message ?? "Invalid input.";
}

// ── Presence ──

/** A world id as the engine names worlds: "capital", "<slug>-inside",
 * "island:<uuid>", "island:<uuid>:inside". The route decides who may be there. */
const worldIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9:-]+$/i, "Unknown world.");

/** Tile coordinates stay well inside any world we build; the bound only stops
 * absurd values reaching other members. */
const tileCoordSchema = z.number().finite().min(-1000).max(1000);

export const presenceMoveSchema = z.object({
  world_id: worldIdSchema,
  col: tileCoordSchema,
  row: tileCoordSchema,
  dir: z.enum(PRESENCE_DIRS),
  moving: z.boolean(),
});

export const presenceEmoteSchema = z.object({
  world_id: worldIdSchema,
  emote: z.enum(EMOTES),
});

// ── Armoire ──

const outfitColor = (part: string) => z.string().regex(hexColorRegex, `Invalid ${part} color.`);
const outfitName = z
  .string()
  .trim()
  .max(OUTFIT_NAME_MAX, `Keep an outfit's name to ${OUTFIT_NAME_MAX} characters.`);

/** A look: hair and clothes. Any hex color is allowed, like the avatar
 * builder, so what a member already wears can always be saved as it is. There
 * is no skin here, on purpose: the armoire never changes skin. */
export const outfitLookSchema = z.object({
  hair_style: z.enum(HAIR_STYLES),
  hair_color: outfitColor("hair"),
  shirt: outfitColor("shirt"),
  pants: outfitColor("pants"),
  shoes: outfitColor("shoes"),
});

/** Save an outfit: a look and an optional name. */
export const createOutfitSchema = outfitLookSchema.extend({ name: outfitName.optional() });

/** Edit a saved outfit: its name, any part of its look, or both, at least one. */
export const updateOutfitSchema = createOutfitSchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Nothing to change.");

export const ghostModeSchema = z.object({ on: z.boolean() });
