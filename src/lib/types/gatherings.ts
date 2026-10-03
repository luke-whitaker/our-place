// Gathering wire types, as the /api/gatherings routes return them.

/** The most members a host may pick by hand. A community gathering invites the
 * whole community instead, capped by MAX_COMMUNITY_INVITEES. */
export const MAX_PICKED_INVITEES = 100;

/** A community gathering invites every member; past this many, it's refused
 * rather than writing an unbounded number of letters in one request. */
export const MAX_COMMUNITY_INVITEES = 500;

/** In person (with an address) or in the world (from v0.20.0). */
export type GatheringKind = "in_person" | "world";

export type GatheringStatus = "scheduled" | "cancelled";

/** A member's answer to a gathering. */
export type GatheringAnswer = "pending" | "accepted" | "declined";

export interface GatheringPerson {
  username: string;
  display_name: string;
}

/** One gathering on a calendar or in an Upcoming list. Never carries the
 * address: that shows only on the gathering's own page. */
export interface GatheringEntry {
  id: string;
  title: string;
  kind: GatheringKind;
  starts_at: string;
  ends_at: string;
  host: GatheringPerson;
  community: { slug: string; name: string } | null;
  /** The viewer's answer, or null when they have no invite row yet (a member
   * who joined the community after the gathering was made). */
  my_response: GatheringAnswer | null;
  /** A world gathering's portal into the world, landing beside its planted
   * Event Mushroom; null until it's planted and once it's over or cancelled. */
  portal: string | null;
}

/** GET /api/gatherings/calendar */
export interface GatheringCalendar {
  /** Gatherings overlapping the requested range, by start time. */
  gatherings: GatheringEntry[];
  /** The next few that haven't ended, by start time. */
  upcoming: GatheringEntry[];
}

/** GET /api/gatherings/[id] */
export interface GatheringDetail extends GatheringEntry {
  description: string;
  address: string;
  status: GatheringStatus;
  is_host: boolean;
  /** Worked out by the server at request time, so pages don't read the clock
   * while rendering: answers close at the start, cancelling at the end. */
  started: boolean;
  ended: boolean;
  /** Who's going (accepted), host included. */
  going: GatheringPerson[];
  /** The host's full list; null for everyone else. */
  attendees: {
    accepted: GatheringPerson[];
    pending: GatheringPerson[];
    declined: GatheringPerson[];
  } | null;
  /** A world gathering's mushroom: whether it's planted, and whether the host
   * still has it to plant. Null for a gathering in person. */
  mushroom: { planted: boolean } | null;
}

/** GET /api/gatherings/mushrooms?world=: one planted Event Mushroom. Position
 * only; `invited` says whether this viewer may open the gathering, so the
 * world knows whether to show its card or one line, without another request. */
export interface PlantedMushroomWire {
  gathering_id: string;
  col: number;
  row: number;
  host: string;
  invited: boolean;
}

/** GET /api/gatherings/travel: a gathering whose mushroom the caller can
 * travel to on the Mycelium Network right now. */
export interface GatheringTravelStop {
  gathering_id: string;
  title: string;
  starts_at: string;
  /** The `?place=` and `?at=` that land beside the mushroom. */
  place: string;
  spawn_at: string;
}

/** A pocketed Event Mushroom's gathering, for the Plant here action. */
export interface PocketMushroomInfo {
  title: string;
  starts_at: string;
  /** World ids the host may plant in. */
  worlds: string[];
}

/** What an invitation letter or notification shows about its gathering. */
export interface GatheringInviteSummary {
  id: string;
  title: string;
  starts_at: string;
  status: GatheringStatus;
  my_response: GatheringAnswer | null;
  /** Answers close once it starts; the server decides, at request time. */
  started: boolean;
}
