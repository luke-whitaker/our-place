// Gathering emails: the one kind of news worth leaving the site for, because a
// gathering asks you to show up somewhere (Luke, October 3). Sent when you're
// invited, when a gathering you're invited to is cancelled, and when its host
// changes the time. Each email has the title, the host, the time in Central
// time, and a link; never the guest list, the description, or the address,
// since email gets forwarded.
//
// Every send happens after the database work has committed, and nothing here
// throws: a failed send is logged, and the in-site notification already exists.

import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db";
import { EMAIL_BATCH_MAX, escapeHtml, sendEmailBatch, type SendEmailParams } from "@/lib/email";
import { blockedIdsFor } from "@/lib/blocks";
import { signUnsubscribeToken } from "@/lib/unsubscribe";
import { gatheringWhen, WORLD_TIME_ZONE } from "@/lib/time-utils";
import { MAX_COMMUNITY_INVITEES, MAX_PICKED_INVITEES } from "@/lib/types";

type Db = Prisma.TransactionClient | typeof prisma;

export type GatheringEmailKind = "invited" | "cancelled" | "unplanted" | "time_changed";

/** Everyone one gathering can have invited: no email run is ever larger. */
const MAX_RECIPIENTS = MAX_COMMUNITY_INVITEES + MAX_PICKED_INVITEES;
/** Resend allows a couple of requests a second; a pause between batches keeps
 * a large gathering under that. At most MAX_RECIPIENTS / EMAIL_BATCH_MAX
 * (six) batches, so a run takes a few seconds at worst. */
const BATCH_PAUSE_MS = 600;

/** Where links in emails point. Production's address unless overridden, so a
 * missing variable never sends members to localhost. */
export function siteUrl(): string {
  return (process.env.PUBLIC_SITE_URL || "https://www.ourplaceonline.com").replace(/\/+$/, "");
}

export interface GatheringEmailFacts {
  id: string;
  title: string;
  kind: string;
  startsAt: Date;
  endsAt: Date;
  hostName: string;
}

interface EmailCopy {
  subject: string;
  /** The opening sentence. */
  lead: string;
  /** Label and value lines under the lead. */
  details: [string, string][];
  /** The sentence before the link, and the link's words. */
  action: string;
  linkText: string;
}

function copyFor(kind: GatheringEmailKind, g: GatheringEmailFacts): EmailCopy {
  const when = gatheringWhen(g.startsAt.toISOString(), g.endsAt.toISOString(), WORLD_TIME_ZONE);
  const where: [string, string] = [
    "Where",
    g.kind === "world"
      ? "In the world, at the host's Event Mushroom."
      : "In person. The address is on the gathering page.",
  ];
  switch (kind) {
    case "invited":
      return {
        subject: `${g.hostName} invited you to ${g.title}`,
        lead: `${g.hostName} invited you to ${g.title}.`,
        details: [["When", when], where],
        action: "See the details and answer on the gathering page.",
        linkText: "Open the invitation",
      };
    case "time_changed":
      return {
        subject: `New time for ${g.title}`,
        lead: `${g.hostName} changed the time of ${g.title}.`,
        details: [["New time", when], where],
        action: "If you can't make the new time, update your answer on the gathering page.",
        linkText: "Open the gathering",
      };
    case "cancelled":
      return {
        subject: `${g.title} is cancelled`,
        lead: `${g.hostName} cancelled ${g.title}.`,
        details: [["It was planned for", when]],
        action: "You don't need to do anything.",
        linkText: "Open the gathering",
      };
    case "unplanted":
      return {
        subject: `${g.title} is cancelled`,
        lead: `${g.title} is cancelled because its Event Mushroom wasn't planted by the start.`,
        details: [["It was planned for", when]],
        action: "You don't need to do anything.",
        linkText: "Open the gathering",
      };
  }
}

/** One recipient's email: plain text, a small inline-styled HTML body, and
 * the one-click unsubscribe headers mail apps show as their own button. */
export function gatheringEmail(
  kind: GatheringEmailKind,
  g: GatheringEmailFacts,
  to: string,
  unsubscribeToken: string,
): SendEmailParams {
  const copy = copyFor(kind, g);
  const page = `${siteUrl()}/gatherings/${g.id}`;
  const stopPage = `${siteUrl()}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  const oneClick = `${siteUrl()}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  const why = "You're getting this because you were invited to a gathering on Our Place.";

  const text = [
    copy.lead,
    copy.details.map(([label, value]) => `${label}: ${value}`).join("\n"),
    `${copy.action}\n${page}`,
    `${why} To stop emails about gatherings: ${stopPage}`,
  ].join("\n\n");

  const detailRows = copy.details
    .map(
      ([label, value]) =>
        `<p style="font-size: 14px; line-height: 1.5; margin: 0 0 4px;"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`,
    )
    .join("");
  const html = `
  <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
    <h1 style="font-size: 18px; margin: 0 0 16px;">${escapeHtml(copy.lead)}</h1>
    <div style="margin: 0 0 16px;">${detailRows}</div>
    <p style="font-size: 14px; line-height: 1.5; margin: 0 0 16px;">${escapeHtml(copy.action)}</p>
    <p style="margin: 0 0 24px;">
      <a href="${escapeHtml(page)}" style="display: inline-block; padding: 10px 16px; background: #30309c; color: #ffffff; border-radius: 10px; text-decoration: none; font-size: 14px;">${escapeHtml(copy.linkText)}</a>
    </p>
    <p style="font-size: 12px; line-height: 1.5; color: #71717a; margin: 0;">
      ${escapeHtml(why)} <a href="${escapeHtml(stopPage)}" style="color: #71717a;">Stop emails about gatherings</a>.
    </p>
  </div>`;

  return {
    to,
    // A title can't carry a line break into a header.
    subject: copy.subject.replace(/[\r\n]+/g, " "),
    text,
    html,
    headers: {
      "List-Unsubscribe": `<${oneClick}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

/** Everyone still invited to a gathering (pending or going), never the host:
 * the people a cancellation or a new time matters to. */
export async function stillInvitedIds(
  db: Db,
  gatheringId: string,
  hostId: string,
): Promise<string[]> {
  const rows = await db.gatheringInvite.findMany({
    where: { gatheringId, status: { in: ["pending", "accepted"] }, userId: { not: hostId } },
    select: { userId: true },
    take: MAX_RECIPIENTS,
  });
  return rows.map((r) => r.userId);
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Email `recipientIds` about a gathering, skipping anyone who turned gathering
 * emails off, a deleted account, and anyone in a block with the host. Never
 * throws: callers fire it with `void` after their transaction commits, and a
 * failure is only logged. Returns how many emails were handed to the provider.
 */
export async function emailGathering(
  kind: GatheringEmailKind,
  gatheringId: string,
  recipientIds: string[],
): Promise<number> {
  try {
    if (recipientIds.length === 0) return 0;
    const g = await prisma.gathering.findUnique({
      where: { id: gatheringId },
      select: {
        id: true,
        title: true,
        kind: true,
        startsAt: true,
        endsAt: true,
        hostId: true,
        host: { select: { displayName: true } },
      },
    });
    if (!g) return 0;
    const blocked = await blockedIdsFor(g.hostId);
    const recipients = await prisma.user.findMany({
      where: {
        id: { in: recipientIds.filter((id) => id !== g.hostId && !blocked.has(id)) },
        deletedAt: null,
        emailGatherings: true,
      },
      select: { id: true, email: true },
      take: MAX_RECIPIENTS,
    });
    const facts = { ...g, hostName: g.host.displayName };
    const emails = recipients.map((r) =>
      gatheringEmail(kind, facts, r.email, signUnsubscribeToken(r.id)),
    );
    let sent = 0;
    for (let i = 0; i < emails.length; i += EMAIL_BATCH_MAX) {
      if (i > 0) await pause(BATCH_PAUSE_MS);
      const batch = emails.slice(i, i + EMAIL_BATCH_MAX);
      // One failed batch is logged and the next still goes, so a provider
      // hiccup costs at most one batch of emails.
      try {
        await sendEmailBatch(batch);
        sent += batch.length;
      } catch (error) {
        console.error(`Gathering email (${kind}) batch failed:`, error);
      }
    }
    return sent;
  } catch (error) {
    console.error(`Gathering email (${kind}) error:`, error);
    return 0;
  }
}

/** Email everyone still invited (see stillInvitedIds). Never throws, like
 * emailGathering, so a route can fire it after its commit. */
export async function emailStillInvited(
  kind: GatheringEmailKind,
  gatheringId: string,
): Promise<number> {
  try {
    const g = await prisma.gathering.findUnique({
      where: { id: gatheringId },
      select: { hostId: true },
    });
    if (!g) return 0;
    return await emailGathering(kind, gatheringId, await stillInvitedIds(prisma, gatheringId, g.hostId));
  } catch (error) {
    console.error(`Gathering email (${kind}) error:`, error);
    return 0;
  }
}
