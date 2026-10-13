import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_CONTACT, LegalPage, LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms · Our Place" };

const SECTIONS = [
  { id: "join", title: "Who can join" },
  { id: "account", title: "Your account" },
  { id: "conduct", title: "How we treat each other" },
  { id: "content", title: "What you post stays yours" },
  { id: "meeting", title: "Meeting in person" },
  { id: "calls", title: "Voice calls" },
  { id: "enforce", title: "When someone breaks the rules" },
  { id: "leave", title: "Leaving" },
  { id: "as-is", title: "The site as it is" },
  { id: "liability", title: "Limits on our responsibility" },
  { id: "ours", title: "The name, logo, and art" },
  { id: "changes", title: "Changes to these terms" },
  { id: "law", title: "Governing law" },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms"
      updated="October 13, 2026"
      summary={[
        "Our Place is for adults, and the admin creates every account, so there are no bots and no strangers.",
        "Treat people here the way you would face to face.",
        "What you post is yours. You let us show it to the people you choose, and nothing more.",
        "You can leave at any time and take your data with you.",
        "The site is run by one person and comes with no guarantees.",
      ]}
      sections={SECTIONS}
    >
      <LegalSection id="join" title="1. Who can join">
        <ul>
          <li>You must be 18 or older.</li>
          <li>
            Anyone who&apos;s open-minded, cool, inclusive, creative, and looking for a fun,
            creative space online with other cool people you&apos;d actually want to spend time with
            in person.
          </li>
          <li>
            Anyone who is sick of platforms that exploit your humanity, manipulate your psychology,
            get you addicted, and sell your attention for profit.
          </li>
          <li>
            There is no public sign-up. Right now, the admin is the only one who creates accounts.
            If you know the admin and want to request an account for yourself or someone else, email
            us at{" "}
            <a href={`mailto:${LEGAL_CONTACT}`} className="text-accent-600 hover:underline">
              {LEGAL_CONTACT}
            </a>
            . If you don&apos;t know the admin and would like an account, use the same address to
            ask to meet him.
          </li>
          <li>
            We chose this bottleneck on purpose, to keep out bots, duplicate accounts, and bad
            actors. We aren&apos;t perfect, but we want this space to be as organically human and
            community-driven as possible. We believe that starts with a good-faith effort to keep
            Our Place our place.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="account" title="2. Your account">
        <p>
          Keep your password to yourself, and don&apos;t let anyone else use your account. If you
          think someone has gotten in, change your password and write to{" "}
          <a href={`mailto:${LEGAL_CONTACT}`} className="text-accent-600 hover:underline">
            {LEGAL_CONTACT}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection id="conduct" title="3. How we treat each other">
        <p>Don&apos;t use Our Place to:</p>
        <ul>
          <li>Harass, threaten, bully, or stalk anyone.</li>
          <li>Attack people for who they are.</li>
          <li>Post sexual content involving anyone under 18, ever.</li>
          <li>Post sexual or graphic violent content.</li>
          <li>Share someone&apos;s private information, photos, or messages without their okay.</li>
          <li>Spam, scam, or sell.</li>
          <li>Break the law, or help someone else break it.</li>
          <li>Pretend to be someone else, or keep more than one account.</li>
          <li>Get around a block, or try to break into accounts or the site.</li>
          <li>Use bots or automated tools.</li>
        </ul>
        <p>
          If something here bothers you, block the member and write to{" "}
          <a href={`mailto:${LEGAL_CONTACT}`} className="text-accent-600 hover:underline">
            {LEGAL_CONTACT}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection id="content" title="4. What you post stays yours">
        <p>
          You own what you post. By posting it, you give Our Place permission to store it and show
          it to the members you share it with, only to run the site. That permission ends when you
          delete it, apart from backups, which expire within 30 days.
        </p>
        <p>
          Post only what you have the right to share. If you believe something here infringes your
          copyright, write to us and we&apos;ll look into it.
        </p>
      </LegalSection>

      <LegalSection id="meeting" title="5. Meeting in person">
        <p>
          Our Place exists to bring people together in real life, but you decide whether to go to a
          gathering and you&apos;re responsible for your own safety there. We don&apos;t check
          gatherings, places, or guests. Meet somewhere you&apos;re comfortable, and leave if
          something feels wrong.
        </p>
      </LegalSection>

      <LegalSection id="calls" title="6. Voice calls">
        <p>
          Don&apos;t record a call, or share what someone said in one, unless everyone in the call
          has agreed.
        </p>
      </LegalSection>

      <LegalSection id="enforce" title="7. When someone breaks the rules">
        <p>
          We may remove content, or pause or close an account, that breaks these terms or puts
          members at risk. When we can, we&apos;ll tell you why and give you a chance to respond and
          download your data first.
        </p>
      </LegalSection>

      <LegalSection id="leave" title="8. Leaving">
        <p>
          You can download your data or delete your account at any time from Account settings. See
          the{" "}
          <Link href="/privacy" className="text-accent-600 hover:underline">
            privacy policy
          </Link>{" "}
          for what deleting removes.
        </p>
      </LegalSection>

      <LegalSection id="as-is" title="9. The site as it is">
        <p>
          Our Place is provided as it is, without promises that it will always work, stay the same,
          or never lose data. Features may change or be removed. If Our Place ever shuts down,
          we&apos;ll give at least 30 days&apos; notice so you can download your data.
        </p>
      </LegalSection>

      <LegalSection id="liability" title="10. Limits on our responsibility">
        <p>
          As far as the law allows, Our Place and the people who run it aren&apos;t responsible for
          what members say or do, on the site or in person, or for indirect losses from using the
          site. If we are found responsible for something, the most we owe you is what you paid us
          in membership fees in the last 12 months.
        </p>
      </LegalSection>

      <LegalSection id="ours" title="11. The name, logo, and art">
        <p>
          The Our Place name, the mushroom logo, and the world&apos;s art aren&apos;t yours to
          reuse. Some of the art is licensed from other artists and is used in accordance with their
          license terms.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="12. Changes to these terms">
        <p>
          If these terms change in a way that matters, we&apos;ll tell members on the site before
          the change takes effect. Using Our Place after that means you accept the new terms.
        </p>
      </LegalSection>

      <LegalSection id="law" title="13. Governing law">
        <p>These terms follow the laws of Iowa, in the United States.</p>
      </LegalSection>
    </LegalPage>
  );
}
