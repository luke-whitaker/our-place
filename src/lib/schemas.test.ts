import { describe, it, expect } from "vitest";
import {
  createUserSchema,
  loginSchema,
  updateAccountSchema,
  createPostSchema,
  createMyPlacePostSchema,
  createCommentSchema,
  createReactionSchema,
  getZodErrorMessage,
  normalizePhone,
  resetPasswordSchema,
  createCommunitySchema,
  PASSWORD_MAX,
  COMMUNITY_DESCRIPTION_MAX,
  COMMUNITY_GUIDELINES_MAX,
  pollSchema,
} from "./schemas";

describe("pollSchema", () => {
  it("defaults to single choice, results after you vote, and no close", () => {
    const parsed = pollSchema.parse({ options: [" Park ", "Cafe"] });
    expect(parsed).toEqual({
      options: ["Park", "Cafe"],
      multiple_choice: false,
      results_visible: "after_vote",
    });
  });

  it("takes two to six distinct options of 1 to 80 characters", () => {
    expect(pollSchema.safeParse({ options: ["One"] }).success).toBe(false);
    expect(pollSchema.safeParse({ options: ["a", "b", "c", "d", "e", "f"] }).success).toBe(true);
    expect(pollSchema.safeParse({ options: ["a", "b", "c", "d", "e", "f", "g"] }).success).toBe(
      false,
    );
    expect(pollSchema.safeParse({ options: ["Park", "PARK"] }).success).toBe(false);
    expect(pollSchema.safeParse({ options: ["Park", "  "] }).success).toBe(false);
    expect(pollSchema.safeParse({ options: ["Park", "x".repeat(81)] }).success).toBe(false);
  });

  it("only shows results at close for a poll that closes", () => {
    const options = ["Park", "Cafe"];
    expect(pollSchema.safeParse({ options, results_visible: "after_close" }).success).toBe(false);
    expect(
      pollSchema.safeParse({ options, results_visible: "after_close", closes_in: "1w" }).success,
    ).toBe(true);
  });
});

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

  it("still accepts a long password set before the cap", () => {
    expect(loginSchema.safeParse({ login: "jane", password: "a".repeat(200) }).success).toBe(true);
  });
});

describe("password length", () => {
  const atCap = "a".repeat(PASSWORD_MAX);
  const overCap = "a".repeat(PASSWORD_MAX + 1);

  it("caps a new password at 128 characters when resetting", () => {
    const body = { email: "jane@test.com", code: "123456" };
    expect(resetPasswordSchema.safeParse({ ...body, new_password: atCap }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ ...body, new_password: overCap }).success).toBe(false);
  });

  it("caps a new password at 128 characters when changing it", () => {
    const body = { current_password: "oldpassword" };
    expect(updateAccountSchema.safeParse({ ...body, new_password: overCap }).success).toBe(false);
  });

  it("caps the password an admin sets on a new account", () => {
    const body = { username: "jane", display_name: "Jane", email: "jane@test.com" };
    expect(createUserSchema.safeParse({ ...body, password: overCap }).success).toBe(false);
  });
});

describe("createCommunitySchema", () => {
  const body = { name: "Gardening", description: "A".repeat(20), category: "Hobbies" };

  it("caps the description and guidelines", () => {
    expect(createCommunitySchema.safeParse(body).success).toBe(true);
    const longDescription = { ...body, description: "a".repeat(COMMUNITY_DESCRIPTION_MAX + 1) };
    expect(createCommunitySchema.safeParse(longDescription).success).toBe(false);
    const longGuidelines = { ...body, guidelines: "a".repeat(COMMUNITY_GUIDELINES_MAX + 1) };
    expect(createCommunitySchema.safeParse(longGuidelines).success).toBe(false);
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

  it("accepts an email change with the current password", () => {
    expect(
      updateAccountSchema.safeParse({ email: "new@example.com", current_password: "oldpassword" })
        .success,
    ).toBe(true);
  });

  it("accepts a phone change with the current password", () => {
    expect(
      updateAccountSchema.safeParse({ phone: "555-9876", current_password: "oldpassword" }).success,
    ).toBe(true);
  });

  it("accepts an empty phone with the current password (clears the number)", () => {
    expect(
      updateAccountSchema.safeParse({ phone: "", current_password: "oldpassword" }).success,
    ).toBe(true);
  });

  it.each([{ email: "new@example.com" }, { phone: "555-9876" }, { phone: "" }])(
    "rejects %o without the current password",
    (body) => {
      expect(updateAccountSchema.safeParse(body).success).toBe(false);
    },
  );

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
    expect(
      updateAccountSchema.safeParse({ email: "notanemail", current_password: "oldpassword" })
        .success,
    ).toBe(false);
  });

  it("accepts a biome-only update for each preset", () => {
    for (const biome of ["forest", "autumn", "snow", "dusk", "swamp", "scorched"]) {
      expect(updateAccountSchema.safeParse({ biome }).success).toBe(true);
    }
  });

  it("rejects an unknown biome", () => {
    expect(updateAccountSchema.safeParse({ biome: "desert" }).success).toBe(false);
  });

  it("accepts an island_visibility-only update for each value", () => {
    for (const island_visibility of ["anyone", "friends", "nobody"]) {
      expect(updateAccountSchema.safeParse({ island_visibility }).success).toBe(true);
    }
  });

  it("rejects an unknown island_visibility", () => {
    expect(updateAccountSchema.safeParse({ island_visibility: "everyone" }).success).toBe(false);
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
      media: [{ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }],
    });
    expect(result.success).toBe(true);
  });

  it("defaults interaction controls to reactions and comments on, dislikes off", () => {
    const result = createPostSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.allow_reactions).toBe(true);
      expect(result.data.allow_comments).toBe(true);
      expect(result.data.allow_dislikes).toBe(false);
    }
  });

  it("accepts explicit interaction control overrides", () => {
    const result = createPostSchema.safeParse({
      allow_reactions: false,
      allow_comments: false,
      allow_dislikes: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.allow_reactions).toBe(false);
      expect(result.data.allow_comments).toBe(false);
      expect(result.data.allow_dislikes).toBe(true);
    }
  });
});

// ── My Place post schema ──

describe("createMyPlacePostSchema", () => {
  it("defaults interaction controls to reactions and comments on, dislikes off", () => {
    const result = createMyPlacePostSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.allow_reactions).toBe(true);
      expect(result.data.allow_comments).toBe(true);
      expect(result.data.allow_dislikes).toBe(false);
    }
  });

  it("accepts explicit interaction control overrides", () => {
    const result = createMyPlacePostSchema.safeParse({ allow_dislikes: true });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.allow_dislikes).toBe(true);
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

  it("accepts valid reaction types, including dislike", () => {
    for (const type of ["like", "love", "laugh", "wow", "sad", "angry", "dislike"]) {
      expect(createReactionSchema.safeParse({ type }).success).toBe(true);
    }
  });

  it("rejects invalid reaction types", () => {
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
