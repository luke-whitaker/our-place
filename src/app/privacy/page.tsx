import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_CONTACT, LegalPage, LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy policy · Our Place" };

// Every claim here mirrors what the code does today (retention constants in
// src/lib/calls.ts, notifications.ts, activity.ts, and scripts/backup-db.ts;
// cookies in src/lib/auth.ts). Change this page when those change.

const SECTIONS = [
  { id: "collect", title: "What we collect" },
  { id: "never", title: "What we never do" },
  { id: "see", title: "Who can see what" },
  { id: "voice", title: "Voice calls" },
  { id: "email", title: "Emails we send" },
  { id: "cookies", title: "Cookies and browser storage" },
  { id: "services", title: "Services that help run the site" },
  { id: "keep", title: "How long we keep things" },
  { id: "choices", title: "Your choices and rights" },
  { id: "security", title: "Keeping your data safe" },
  { id: "age", title: "Adults only" },
  { id: "changes", title: "Changes to this policy" },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="October 13, 2026"
      summary={[
        "We collect what you give us to run your account and what you choose to share with other members.",
        "No ads, no trackers, no selling or sharing your data for marketing. Ever.",
        "Only signed-in members see what's on Our Place, and you choose who sees your island and personal posts.",
        "Voice calls are never recorded.",
        "You can download everything or delete your account at any time, from Account settings.",
      ]}
      sections={SECTIONS}
    >
      <LegalSection id="collect" title="1. What we collect">
        <p>
          <strong>Your account:</strong> your name, username, email address, phone number if you
          gave one, and which member invited you. Your password is stored only as a one-way hash, so
          nobody, including us, can read it.
        </p>
        <p>
          <strong>What you make and share:</strong> posts, photos, videos, comments, reactions, poll
          votes, letters, gifts, gatherings (including the address of an in-person gathering), your
          avatar and outfits, your island, and the things you plant or keep in the world.
        </p>
        <p>
          <strong>Your connections:</strong> your friends, the communities you join, and anyone you
          block.
        </p>
        <p>
          <strong>Activity counts:</strong> the days you signed in and how long you spent in the
          world each day. We use these only as totals, to see whether Our Place is working.
        </p>
        <p>
          <strong>In the world:</strong> which parts of the map you&apos;ve uncovered. Where you
          stand is shared live with members in the world with you and is never saved, so there is no
          history of where you walked.
        </p>
      </LegalSection>

      <LegalSection id="never" title="2. What we never do">
        <ul>
          <li>Show ads or let advertisers in.</li>
          <li>Use analytics or tracking tools, ours or anyone else&apos;s.</li>
          <li>Sell, rent, or trade your data.</li>
          <li>Record what you read or rank your feed. Feeds are newest first.</li>
          <li>Record voice calls.</li>
        </ul>
      </LegalSection>

      <LegalSection id="see" title="3. Who can see what">
        <ul>
          <li>
            <strong>Visitors who aren&apos;t signed in</strong> see only the front page and the
            sign-in page.
          </li>
          <li>
            <strong>Members</strong> see your name, username, profile, who invited you, your
            community posts, and you in the world, unless you turn on Ghost Mode at your armoire.
          </li>
          <li>
            <strong>Your island and personal posts</strong> are friends-only by default. You can
            change who may visit your island.
          </li>
          <li>
            <strong>Your email and phone number</strong> are seen only by you and the admin, who
            creates and looks after accounts.
          </li>
          <li>
            <strong>Photos and videos</strong> are stored at long, hard-to-guess web addresses.
            Anyone who has the exact address can open the file, so a member could share it outside
            Our Place. Before a photo is stored, we remove the location, time, and camera details
            your phone may have saved in it. Videos are stored as you send them, which can include
            where they were filmed.
          </li>
          <li>
            <strong>The admin</strong> can see everything stored on the site when needed to run it,
            fix problems, or act on a report. Admin metrics show totals only, never what any one
            person did.
          </li>
        </ul>
        <p>
          We share your data outside Our Place only with the services in section 7, or if the law
          requires it.
        </p>
      </LegalSection>

      <LegalSection id="voice" title="4. Voice calls">
        <p>
          Call audio travels through LiveKit, a voice service, and is never recorded by us or by
          them. We keep who was in a call for 30 days, then only the date, for about 3 months, to
          count calls. Your browser asks before it uses your microphone.
        </p>
      </LegalSection>

      <LegalSection id="email" title="5. Emails we send">
        <p>
          We email you only for your account (password reset codes, a notice when your email address
          changes) and about gatherings you&apos;re invited to. You can turn off gathering emails in
          Account settings or with the link in any of those emails. We never send newsletters or
          marketing.
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="6. Cookies and browser storage">
        <ul>
          <li>
            <strong>Sign-in cookie:</strong> keeps you signed in. It lasts 24 hours.
          </li>
          <li>
            <strong>Trusted device cookie:</strong> remembers that you&apos;ve signed in on this
            browser before, so failed sign-in attempts by someone else can&apos;t lock you out. It
            lasts a year.
          </li>
          <li>
            <strong>Browser storage:</strong> your theme, the members you&apos;ve muted in calls,
            and your place in the world, saved on your own device.
          </li>
        </ul>
        <p>There are no tracking or advertising cookies, so there is no cookie banner.</p>
      </LegalSection>

      <LegalSection id="services" title="7. Services that help run the site">
        <p>These companies handle data only to provide their service to us:</p>
        <ul>
          <li>
            <strong>Railway:</strong> runs the site and its database.
          </li>
          <li>
            <strong>Cloudflare:</strong> stores photos, videos, world art, and private backups.
          </li>
          <li>
            <strong>Resend:</strong> sends our automatically generated emails.
          </li>
          <li>
            <strong>LiveKit:</strong> carries voice call audio.
          </li>
          <li>
            <strong>YouTube and Vimeo:</strong> when a post includes one of their videos, your
            browser loads it from them, and their own privacy policies apply.
          </li>
        </ul>
        <p>Our data is stored in the United States.</p>
      </LegalSection>

      <LegalSection id="keep" title="8. How long we keep things">
        <ul>
          <li>Your account and what you make: until you delete them.</li>
          <li>Notifications: 90 days.</li>
          <li>Daily activity counts: about 13 months.</li>
          <li>Voice call records: see section 4.</li>
          <li>
            Backups: 30 days. Something you delete can stay in a backup until that backup expires.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="choices" title="9. Your choices and rights">
        <p>In Account settings and around the site, you can:</p>
        <ul>
          <li>Download a copy of everything about you.</li>
          <li>
            Delete your account. You choose whether your posts and comments, with their photos and
            videos, are deleted or stay up signed &quot;A former member&quot;. Letters you sent stay
            with the people you sent them to. Everything else is deleted.
          </li>
          <li>Correct your name, email, phone number, and password.</li>
          <li>Leave yourself out of the activity counts.</li>
          <li>Go unseen in the world with Ghost Mode.</li>
          <li>Choose who may visit your island.</li>
          <li>Turn off gathering emails.</li>
          <li>Block another member.</li>
        </ul>
        <p>
          For anything else, such as a question about your data, write to{" "}
          <a href={`mailto:${LEGAL_CONTACT}`} className="text-accent-600 hover:underline">
            {LEGAL_CONTACT}
          </a>
          . We answer within 30 days.
        </p>
      </LegalSection>

      <LegalSection id="security" title="10. Keeping your data safe">
        <p>
          The site uses encrypted connections, hashed passwords, and sign-in cookies that scripts
          can&apos;t read. No system is perfectly secure. If your data is ever exposed, we&apos;ll
          tell you promptly and explain what happened.
        </p>
      </LegalSection>

      <LegalSection id="age" title="11. Adults only">
        <p>
          Our Place is for people 18 and older. We don&apos;t knowingly create accounts for anyone
          younger. See the{" "}
          <Link href="/terms" className="text-accent-600 hover:underline">
            terms
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection id="changes" title="12. Changes to this policy">
        <p>
          If this policy changes in a way that matters, we&apos;ll tell members on the site before
          the change takes effect. The date at the top shows the latest version.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
