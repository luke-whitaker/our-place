import { describe, it, expect, afterEach } from "vitest";
import { gatheringEmail, siteUrl, type GatheringEmailFacts } from "./gathering-emails";

// Saturday, October 10, 2026, 6 to 8 pm in Chicago (CDT, UTC-5).
const FACTS: GatheringEmailFacts = {
  id: "g-1",
  title: 'Picnic <in> the "park"',
  kind: "in_person",
  startsAt: new Date("2026-10-10T23:00:00Z"),
  endsAt: new Date("2026-10-11T01:00:00Z"),
  hostName: "Ada & Co",
};

afterEach(() => {
  delete process.env.PUBLIC_SITE_URL;
});

describe("gatheringEmail", () => {
  it("says who, what, and when in Central time, and links to the gathering", () => {
    const email = gatheringEmail("invited", FACTS, "ben@example.test", "tok.en");
    expect(email.to).toBe("ben@example.test");
    expect(email.subject).toBe('Ada & Co invited you to Picnic <in> the "park"');
    expect(email.text).toContain("When: Sat, Oct 10, 6:00 PM to 8:00 PM CDT");
    expect(email.text).toContain("https://www.ourplaceonline.com/gatherings/g-1");
    expect(email.text).toContain("The address is on the gathering page.");
  });

  it("escapes member-written text in the HTML", () => {
    const { html } = gatheringEmail("invited", FACTS, "ben@example.test", "tok.en");
    expect(html).not.toContain("<in>");
    expect(html).toContain("Picnic &#60;in&#62; the &#34;park&#34;");
    expect(html).toContain("Ada &#38; Co");
  });

  it("carries an unsubscribe link and the one-click headers", () => {
    const email = gatheringEmail("cancelled", FACTS, "ben@example.test", "abc.def");
    expect(email.text).toContain("https://www.ourplaceonline.com/unsubscribe?token=abc.def");
    expect(email.headers).toEqual({
      "List-Unsubscribe": "<https://www.ourplaceonline.com/api/unsubscribe?token=abc.def>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("keeps line breaks out of the subject", () => {
    const email = gatheringEmail("cancelled", { ...FACTS, title: "Two\r\nlines" }, "b@x.test", "t");
    expect(email.subject).toBe("Two lines is cancelled");
  });

  it("asks guests to update their answer when the time changes", () => {
    const email = gatheringEmail("time_changed", FACTS, "ben@example.test", "t");
    expect(email.subject).toBe('New time for Picnic <in> the "park"');
    expect(email.text).toContain("New time: Sat, Oct 10, 6:00 PM to 8:00 PM CDT");
    expect(email.text).toContain("If you can't make the new time, update your answer");
  });

  it("explains an unplanted cancellation and where a world gathering happens", () => {
    const world = { ...FACTS, kind: "world" };
    expect(gatheringEmail("unplanted", world, "b@x.test", "t").text).toContain(
      "wasn't planted by the start",
    );
    expect(gatheringEmail("invited", world, "b@x.test", "t").text).toContain(
      "In the world, at the host's Event Mushroom.",
    );
  });
});

describe("siteUrl", () => {
  it("defaults to production and drops a trailing slash", () => {
    expect(siteUrl()).toBe("https://www.ourplaceonline.com");
    process.env.PUBLIC_SITE_URL = "http://localhost:3000/";
    expect(siteUrl()).toBe("http://localhost:3000");
  });
});
