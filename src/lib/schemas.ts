import { z } from "zod";

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
  password: z
    .string({ error: "All fields are required." })
    .min(8, "Password must be at least 8 characters."),
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
    .min(1, "Please enter your email/username and password."),
  password: z
    .string({ error: "Please enter your email/username and password." })
    .min(1, "Please enter your email/username and password."),
});

export const updateAccountSchema = z
  .object({
    email: z.string().email("Please enter a valid email address.").optional(),
    // An empty string clears the phone number (phone is optional).
    phone: z.string().max(30, "Phone number is too long.").optional(),
    theme: z.enum(["auto", "platinum", "terminal", "dusk"]).optional(),
    current_password: z.string().optional(),
    new_password: z.string().min(8, "Password must be at least 8 characters.").optional(),
  })
  .refine((d) => d.email || d.phone !== undefined || d.theme || d.new_password, {
    message: "Nothing to update.",
  })
  .refine((d) => !d.new_password || (d.current_password && d.current_password.length > 0), {
    message: "Your current password is required to set a new one.",
  });

export const forgotPasswordSchema = z.object({
  email: z.string({ error: "Email is required." }).email("Please enter a valid email address."),
});

export const resetPasswordSchema = z.object({
  email: z
    .string({ error: "Email, reset code, and new password are all required." })
    .min(1, "Email, reset code, and new password are all required."),
  code: z
    .string({ error: "Email, reset code, and new password are all required." })
    .min(1, "Email, reset code, and new password are all required."),
  new_password: z
    .string({ error: "Email, reset code, and new password are all required." })
    .min(8, "Password must be at least 8 characters."),
});

// ── Friendship schemas ──

export const sendFriendRequestSchema = z.object({
  username: z
    .string({ error: "Pick someone to send a friend request to." })
    .min(1, "Pick someone to send a friend request to."),
});

// ── Content schemas ──

export const createCommunitySchema = z.object({
  name: z
    .string({ error: "Name, description, and category are required." })
    .min(3, "Community name must be 3-50 characters.")
    .max(50, "Community name must be 3-50 characters."),
  description: z
    .string({ error: "Name, description, and category are required." })
    .min(20, "Description must be at least 20 characters."),
  category: z
    .string({ error: "Name, description, and category are required." })
    .min(1, "Name, description, and category are required."),
  icon: z.string().optional(),
  guidelines: z.string().optional(),
});

const postTypeEnum = z.enum(["text", "photo", "video", "rich"]);

const mediaItemSchema = z.object({
  media_type: z.string().optional(),
  media_source: z.string().optional(),
  url: z.string(),
  filename: z.string().optional().nullable(),
  file_size: z.number().optional().nullable(),
});

export const createPostSchema = z.object({
  post_type: postTypeEnum.default("text"),
  title: z.string().max(200, "Title must be under 200 characters.").default(""),
  content: z.string().max(50000, "Post content must be under 50,000 characters.").default(""),
  media: z.array(mediaItemSchema).default([]),
  post_to_profile: z.union([z.boolean(), z.number()]).optional(),
});

export const createMyPlacePostSchema = z.object({
  post_type: postTypeEnum.default("text"),
  title: z.string().max(200, "Title must be under 200 characters.").default(""),
  content: z.string().max(50000, "Post content must be under 50,000 characters.").default(""),
  media: z.array(mediaItemSchema).default([]),
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

export const REACTION_TYPES = ["like", "love", "laugh", "wow", "sad", "angry"] as const;

export const createReactionSchema = z.object({
  type: z.enum(REACTION_TYPES).default("like"),
});

export const createEventSchema = z.object({
  title: z
    .string({ error: "Title, description, and date are required." })
    .min(1, "Title, description, and date are required."),
  description: z
    .string({ error: "Title, description, and date are required." })
    .min(1, "Title, description, and date are required."),
  event_date: z
    .string({ error: "Title, description, and date are required." })
    .min(1, "Title, description, and date are required."),
  location: z.string().optional(),
  event_end_date: z.string().optional().nullable(),
  community_id: z.string().optional().nullable(),
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

// ── Helper ──

export function getZodErrorMessage(result: z.ZodSafeParseError<unknown>): string {
  return result.error.issues[0]?.message ?? "Invalid input.";
}
