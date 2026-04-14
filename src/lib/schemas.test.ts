import { describe, it, expect } from "vitest";
import {
  registerSchema,
  loginSchema,
  createPostSchema,
  createCommentSchema,
  createReactionSchema,
  getZodErrorMessage,
} from "./schemas";

// ── Register schema ──

describe("registerSchema", () => {
  const valid = {
    username: "testuser",
    display_name: "Test User",
    email: "test@example.com",
    phone: "555-1234",
    password: "securepass123",
  };

  it("accepts valid input", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects short username", () => {
    expect(registerSchema.safeParse({ ...valid, username: "ab" }).success).toBe(false);
  });

  it("rejects username with special characters", () => {
    expect(registerSchema.safeParse({ ...valid, username: "user@name" }).success).toBe(false);
  });

  it("rejects invalid email", () => {
    expect(registerSchema.safeParse({ ...valid, email: "notanemail" }).success).toBe(false);
  });

  it("rejects short password", () => {
    expect(registerSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
  });
});

// ── Login schema ──

describe("loginSchema", () => {
  it("accepts valid credentials", () => {
    expect(loginSchema.safeParse({ login: "user@test.com", password: "pass123" }).success).toBe(
      true,
    );
  });

  it("rejects empty login", () => {
    expect(loginSchema.safeParse({ login: "", password: "pass123" }).success).toBe(false);
  });
});

// ── Post schema ──

describe("createPostSchema", () => {
  it("accepts minimal text post", () => {
    const result = createPostSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.post_type).toBe("text");
      expect(result.data.media).toEqual([]);
    }
  });

  it("rejects invalid post type", () => {
    expect(createPostSchema.safeParse({ post_type: "audio" }).success).toBe(false);
  });

  it("accepts post with media", () => {
    const result = createPostSchema.safeParse({
      post_type: "photo",
      title: "My photo",
      media: [{ url: "https://example.com/photo.jpg" }],
    });
    expect(result.success).toBe(true);
  });
});

// ── Comment schema ──

describe("createCommentSchema", () => {
  it("accepts valid comment", () => {
    expect(createCommentSchema.safeParse({ content: "Great post!" }).success).toBe(true);
  });

  it("rejects empty comment", () => {
    expect(createCommentSchema.safeParse({ content: "" }).success).toBe(false);
  });

  it("trims whitespace-only comment and rejects it", () => {
    expect(createCommentSchema.safeParse({ content: "   " }).success).toBe(false);
  });
});

// ── Reaction schema ──

describe("createReactionSchema", () => {
  it("defaults to like", () => {
    const result = createReactionSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.type).toBe("like");
  });

  it("accepts valid reaction types", () => {
    for (const type of ["like", "love", "laugh", "wow", "sad", "angry"]) {
      expect(createReactionSchema.safeParse({ type }).success).toBe(true);
    }
  });

  it("rejects invalid reaction types", () => {
    expect(createReactionSchema.safeParse({ type: "dislike" }).success).toBe(false);
    expect(createReactionSchema.safeParse({ type: "custom" }).success).toBe(false);
  });
});

// ── Error message helper ──

describe("getZodErrorMessage", () => {
  it("returns first issue message", () => {
    const result = registerSchema.safeParse({ username: "a" });
    if (!result.success) {
      expect(getZodErrorMessage(result)).toBe("Username must be 3-24 characters.");
    }
  });
});
