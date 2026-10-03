// "Download my data": everything Our Place keeps about one member, as JSON.
// Only their own data: other members appear by username and display name,
// never by email, phone, or anything private. Each list stops at
// EXPORT_ROW_CAP rows and says so in `truncated`, so one request stays bounded
// however long someone has been posting.

import prisma from "@/lib/db";

export const EXPORT_ROW_CAP = 5000;

/** Fetch one more than the cap, so a full list can tell it was cut short. */
const TAKE = EXPORT_ROW_CAP + 1;

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const person = (u: { username: string; displayName: string } | null) =>
  u ? { username: u.username, display_name: u.displayName } : null;

/** Cap a list and note its name in `truncated` when it was cut short. */
function capped<T>(name: string, rows: T[], truncated: string[]): T[] {
  if (rows.length <= EXPORT_ROW_CAP) return rows;
  truncated.push(name);
  return rows.slice(0, EXPORT_ROW_CAP);
}

async function profile(userId: string) {
  const u = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      username: true,
      displayName: true,
      email: true,
      phone: true,
      bio: true,
      avatar: true,
      avatarColor: true,
      theme: true,
      biome: true,
      islandVisibility: true,
      mailboxColor: true,
      ghost: true,
      excludeFromMetrics: true,
      createdAt: true,
      inviter: { select: { username: true, displayName: true } },
    },
  });
  return {
    username: u.username,
    display_name: u.displayName,
    email: u.email,
    phone: u.phone,
    bio: u.bio,
    avatar: u.avatar,
    avatar_color: u.avatarColor,
    theme: u.theme,
    island_biome: u.biome,
    island_visibility: u.islandVisibility,
    mailbox_color: u.mailboxColor,
    ghost_mode: u.ghost,
    left_out_of_activity_counts: u.excludeFromMetrics,
    joined_at: iso(u.createdAt),
    invited_by: person(u.inviter),
  };
}

async function forum(userId: string, truncated: string[]) {
  const [memberships, posts, comments, reactions, friendships] = await Promise.all([
    prisma.communityMember.findMany({
      where: { userId },
      select: { role: true, joinedAt: true, community: { select: { name: true, slug: true } } },
      take: TAKE,
    }),
    prisma.post.findMany({
      where: { authorId: userId },
      orderBy: { createdAt: "asc" },
      take: TAKE,
      select: {
        id: true,
        postType: true,
        title: true,
        content: true,
        postedToProfile: true,
        createdAt: true,
        community: { select: { slug: true } },
        media: { select: { mediaType: true, url: true }, orderBy: { sortOrder: "asc" } },
      },
    }),
    prisma.comment.findMany({
      where: { authorId: userId },
      orderBy: { createdAt: "asc" },
      take: TAKE,
      select: { id: true, postId: true, content: true, createdAt: true },
    }),
    prisma.reaction.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      take: TAKE,
      select: { postId: true, type: true, createdAt: true },
    }),
    prisma.friendship.findMany({
      where: { OR: [{ userId }, { friendId: userId }] },
      take: TAKE,
      select: {
        userId: true,
        status: true,
        createdAt: true,
        user: { select: { username: true, displayName: true } },
        friend: { select: { username: true, displayName: true } },
      },
    }),
  ]);
  return {
    communities: capped("communities", memberships, truncated).map((m) => ({
      name: m.community.name,
      slug: m.community.slug,
      role: m.role,
      joined_at: iso(m.joinedAt),
    })),
    posts: capped("posts", posts, truncated).map((p) => ({
      id: p.id,
      community: p.community?.slug ?? null,
      on_my_place: p.postedToProfile,
      type: p.postType,
      title: p.title,
      content: p.content,
      media: p.media.map((m) => ({ type: m.mediaType, url: m.url })),
      created_at: iso(p.createdAt),
    })),
    comments: capped("comments", comments, truncated).map((c) => ({
      id: c.id,
      post_id: c.postId,
      content: c.content,
      created_at: iso(c.createdAt),
    })),
    reactions: capped("reactions", reactions, truncated).map((r) => ({
      post_id: r.postId,
      type: r.type,
      created_at: iso(r.createdAt),
    })),
    friends: capped("friends", friendships, truncated).map((f) => {
      const sent = f.userId === userId;
      return {
        ...person(sent ? f.friend : f.user),
        status: f.status,
        requested_by_me: sent,
        since: iso(f.createdAt),
      };
    }),
  };
}

async function gatherings(userId: string, truncated: string[]) {
  const [hosted, invites] = await Promise.all([
    prisma.gathering.findMany({
      where: { hostId: userId },
      orderBy: { startsAt: "asc" },
      take: TAKE,
      select: {
        id: true,
        kind: true,
        title: true,
        description: true,
        address: true,
        startsAt: true,
        endsAt: true,
        status: true,
        community: { select: { slug: true } },
      },
    }),
    prisma.gatheringInvite.findMany({
      where: { userId },
      take: TAKE,
      select: {
        status: true,
        respondedAt: true,
        gathering: { select: { id: true, title: true, startsAt: true } },
      },
    }),
  ]);
  return {
    gatherings_hosted: capped("gatherings_hosted", hosted, truncated).map((g) => ({
      id: g.id,
      kind: g.kind,
      title: g.title,
      description: g.description,
      address: g.address,
      community: g.community?.slug ?? null,
      starts_at: iso(g.startsAt),
      ends_at: iso(g.endsAt),
      status: g.status,
    })),
    gathering_answers: capped("gathering_answers", invites, truncated).map((i) => ({
      gathering_id: i.gathering.id,
      title: i.gathering.title,
      starts_at: iso(i.gathering.startsAt),
      answer: i.status,
      answered_at: iso(i.respondedAt),
    })),
  };
}

async function world(userId: string, truncated: string[], now: Date) {
  const [items, pages, outfits, discoveries, plants, activity] = await Promise.all([
    prisma.item.findMany({
      where: { ownerId: userId },
      take: TAKE,
      select: {
        kind: true,
        location: true,
        slot: true,
        body: true,
        color: true,
        placedAt: true,
        createdAt: true,
        from: { select: { username: true, displayName: true } },
      },
    }),
    prisma.notebookPage.findMany({
      where: { ownerId: userId },
      orderBy: { page: "asc" },
      select: { page: true, body: true, updatedAt: true },
    }),
    prisma.outfit.findMany({
      where: { ownerId: userId },
      orderBy: { slot: "asc" },
      select: {
        name: true,
        hairStyle: true,
        hairColor: true,
        shirt: true,
        pants: true,
        shoes: true,
      },
    }),
    prisma.worldDiscovery.findMany({
      where: { userId },
      select: { worldId: true, visited: true, shrines: true, updatedAt: true },
    }),
    prisma.worldPlant.findMany({
      where: { ownerId: userId },
      take: TAKE,
      select: { worldId: true, col: true, row: true, color: true, plantedAt: true, bloomsAt: true },
    }),
    prisma.activityDay.findMany({
      where: { userId },
      orderBy: { day: "asc" },
      take: TAKE,
      select: { day: true, worldSeconds: true },
    }),
  ]);
  return {
    items: capped("items", items, truncated).map((i) => ({
      kind: i.kind,
      where: i.location,
      slot: i.slot,
      text: i.body,
      color: i.color,
      from: person(i.from),
      received_at: iso(i.placedAt ?? i.createdAt),
    })),
    notebook_pages: pages.map((p) => ({
      page: p.page + 1,
      text: p.body,
      saved_at: iso(p.updatedAt),
    })),
    outfits: outfits.map((o) => ({
      name: o.name,
      hair_style: o.hairStyle,
      hair_color: o.hairColor,
      shirt: o.shirt,
      pants: o.pants,
      shoes: o.shoes,
    })),
    map_discoveries: discoveries.map((d) => ({
      world: d.worldId,
      shrines_found: d.shrines,
      visited_chunks_base64: Buffer.from(d.visited).toString("base64"),
      updated_at: iso(d.updatedAt),
    })),
    // A seed's color stays a surprise until it blooms, here as in the world.
    plants: capped("plants", plants, truncated).map((p) => {
      const bloomed = p.bloomsAt === null || p.bloomsAt <= now;
      return {
        world: p.worldId,
        col: p.col,
        row: p.row,
        state: bloomed ? "flower" : "seed",
        color: bloomed ? p.color : null,
        planted_at: iso(p.plantedAt),
      };
    }),
    activity_days: capped("activity_days", activity, truncated).map((a) => ({
      day: a.day.toISOString().slice(0, 10),
      world_seconds: a.worldSeconds,
    })),
  };
}

/** The whole export for one member. */
export async function exportAccount(userId: string) {
  const now = new Date();
  const truncated: string[] = [];
  const [me, forumData, gatheringData, worldData] = await Promise.all([
    profile(userId),
    forum(userId, truncated),
    gatherings(userId, truncated),
    world(userId, truncated, now),
  ]);
  return {
    exported_at: now.toISOString(),
    about: "Everything Our Place keeps about your account. Other members appear by name only.",
    row_cap: EXPORT_ROW_CAP,
    truncated,
    profile: me,
    ...forumData,
    ...gatheringData,
    ...worldData,
  };
}
