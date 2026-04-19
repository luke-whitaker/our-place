import { z } from "zod";

// ── Auth schemas ──

export const registerSchema = z.object({
  username: z
    .string({ error: "All fields are required." })
    .min(3, "Username must be 3-24 characters.")
    .max(24, "Username must be 3-24 characters.")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores."),
  display_name: z.string({ error: "All fields are required." }).min(1, "All fields are required."),
  email: z
    .string({ error: "All fields are required." })
    .email("Please enter a valid email address."),
  phone: z.string({ error: "All fields are required." }).min(1, "All fields are required."),
  password: z
    .string({ error: "All fields are required." })
    .min(8, "Password must be at least 8 characters."),
});

export const loginSchema = z.object({
  login: z
    .string({ error: "Please enter your email/username and password." })
    .min(1, "Please enter your email/username and password."),
  password: z
    .string({ error: "Please enter your email/username and password." })
    .min(1, "Please enter your email/username and password."),
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

// ── Helper ──

export function getZodErrorMessage(result: z.ZodSafeParseError<unknown>): string {
  return result.error.issues[0]?.message ?? "Invalid input.";
}
