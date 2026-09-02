import { describe, it, expect } from "vitest";
import {
  createUserSchema,
  loginSchema,
  updateAccountSchema,
  createPostSchema,
  createCommentSchema,
  createReactionSchema,
  getZodErrorMessage,
  normalizePhone,
} from "./schemas";

// ── Phone normalization ──

describe("normalizePhone", () => {
  it("strips formatting down to digits", () => {
    expect(normalizePhone("(555) 123-4567")).toBe("5551234567");
    expect(normalizePhone("+1 555.123.4567")).toBe("15551234567");
  });

  it("returns null when no digits remain", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
    expect(normalizePhone("n/a")).toBeNull();
  });
});

// ── Create user schema ──

describe("createUserSchema", () => {
  const valid = {
    username: "testuser",
    display_name: "Test User",
    email: "test@example.com",
    phone: "555-1234",
    password: "securepass123",
  };

  it("accepts valid input", () => {
    expect(createUserSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects short username", () => {
    expect(createUserSchema.safeParse({ ...valid, username: "ab" }).success).toBe(false);
  });

  it("rejects username with uppercase", () => {
    expect(createUserSchema.safeParse({ ...valid, username: "UserName" }).success).toBe(false);
  });

  it("rejects username with special characters", () => {
    expect(createUserSchema.safeParse({ ...valid, username: "user@name" }).success).toBe(false);
  });

  it("rejects invalid email", () => {
    expect(createUserSchema.safeParse({ ...valid, email: "notanemail" }).success).toBe(false);
  });

  it("rejects short password", () => {
    expect(createUserSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
  });

  it("accepts input without a phone (phone is optional)", () => {
    expect(createUserSchema.safeParse({ ...valid, phone: undefined }).success).toBe(true);
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

// ── Update account schema ──

describe("updateAccountSchema", () => {
  it("accepts a valid name update", () => {
    expect(updateAccountSchema.safeParse({ display_name: "Jane Doe" }).success).toBe(true);
  });

  it("trims whitespace from the name", () => {
    const result = updateAccountSchema.safeParse({ display_name: "  Jane Doe  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.display_name).toBe("Jane Doe");
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(updateAccountSchema.safeParse({ display_name: "" }).success).toBe(false);
    expect(updateAccountSchema.safeParse({ display_name: "   " }).success).toBe(false);
  });

  it("rejects a name over 50 characters", () => {
    expect(updateAccountSchema.safeParse({ display_name: "a".repeat(51) }).success).toBe(false);
  });

  it("does not treat a display_name-only body as nothing to update", () => {
    const result = updateAccountSchema.safeParse({ display_name: "Jane Doe" });
    expect(result.success).toBe(true);
  });

  it("accepts an email-only update", () => {
    expect(updateAccountSchema.safeParse({ email: "new@example.com" }).success).toBe(true);
  });

  it("accepts a phone-only update", () => {
    expect(updateAccountSchema.safeParse({ phone: "555-9876" }).success).toBe(true);
  });

  it("accepts an empty phone (clears the number)", () => {
    expect(updateAccountSchema.safeParse({ phone: "" }).success).toBe(true);
  });

  it("accepts a password change with current password", () => {
    expect(
      updateAccountSchema.safeParse({
        current_password: "oldpassword",
        new_password: "newsecurepass",
      }).success,
    ).toBe(true);
  });

  it("rejects an empty update", () => {
    expect(updateAccountSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a new password without the current password", () => {
    expect(updateAccountSchema.safeParse({ new_password: "newsecurepass" }).success).toBe(false);
  });

  it("rejects a short new password", () => {
    expect(
      updateAccountSchema.safeParse({ current_password: "oldpassword", new_password: "short" })
        .success,
    ).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(updateAccountSchema.safeParse({ email: "notanemail" }).success).toBe(false);
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
    const result = createUserSchema.safeParse({ username: "a" });
    if (!result.success) {
      expect(getZodErrorMessage(result)).toBe("Username must be 3-24 characters.");
    }
  });
});
