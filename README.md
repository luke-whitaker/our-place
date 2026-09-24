# Our Place

An invite-only community platform built on trust, belonging, and genuine human connection. Every account represents someone you've met face-to-face.

![The Our Place feed](screenshots/feed.png)

## What is Our Place?

Our Place is a community platform built on one conviction: **online spaces should be rooted in real-world relationships.** It brings the analog back into the digital — every account begins with a face-to-face connection, and everything the platform does is meant to push interaction back out into the real world.

There is no public registration. Accounts are created in person by existing members who have met you face-to-face. This "web of trust" means every person here is a real human, vouched for by someone in the community — and it's how Our Place grows beyond its first members.

Most social media silos people into echo chambers and infinite scroll. Our Place is the opposite: a digital layer for real communities, where you keep up with what's happening locally and turn online conversations into in-person ones.

### Two ways to experience it

- **The forum** — a Reddit-/Discord-inspired space to follow the communities you care about: post, comment, and react. Familiar social media, without the dark patterns.
- **The world** — an **8-bit RPG overworld** you can teleport into, where each community is a building in a town. Instead of scrolling mindlessly, you wander, explore, and build — leaving room for the kind of boredom that turns into a creative idea. Approach a building and step inside to reach its forum content. Think Roblox meets Reddit, but pixel art.

The forum is fully functional today. The world is actively in development.

## Philosophy

- **Social Media That's Actually Social** — The goal isn't time-on-app, it's getting people offline and together. Digital interaction here is a means to real-world connection, not a replacement for it.
- **In-Person First** — Accounts are created face-to-face by an admin or trusted member. No anonymous sign-ups, no bots, no strangers. Every user is someone a real person has met and vouched for.
- **Web of Trust** — The community grows organically through real relationships. You can trace every account back to a chain of people who know each other.
- **Your Algorithm, Your Rules** — Users will control their own feed algorithm. No engagement-maximizing dark patterns, no infinite dopamine loops. You decide what you see.
- **Physical Third Spaces** — The long-term vision includes physical community spaces (coffee shops, coworking hubs) where Our Place serves as the digital layer for a real neighborhood.

## Features

### Forum Platform

- **Communities** — Create or join communities organized by category (Gaming, Creative, Tech, etc.)
- **Rich Posts** — Text, photo, video, and rich editor post types
- **Comments & Reactions** — Threaded comments and emoji reactions on posts
- **Interaction controls** — The author chooses per post whether it can be liked, disliked, or commented on. Dislikes are off unless the author opts in.
- **Feed** — Three chronological views (your friends, your communities, everyone), each stating under its heading what it shows and how it is ordered. Nothing is ranked.
- **People** — A member directory that shows who invited whom, plus friend requests and your friends list
- **My Place** — Personal profile space for each user, friends-only
- **File Uploads** — Image and media uploads with validation

### Authentication & Security

- **Invite-only accounts** — admin-only account creation via dashboard (`/admin`); every account records the member who invited them
- JWT auth with httpOnly cookies and bcrypt password hashing
- Password reset flow
- Rate limiting on all auth and content creation routes
- Zod schema validation on all API request bodies
- Role-based access control (admin/user roles)
- **Account settings** — update your name, email, phone, and password (current password required)

### Three Themes

Three hand-built retro themes, switchable any time in **profile → Account → Appearance**:

- **Platinum** — System 7 / classic-Mac chrome: pinstriped window cards, 1-bit hard shadows, a dithered desktop, and a pixel wordmark.
- **Terminal** — dark phosphor: monospace body text, `$`-prompt headings with a blinking cursor, and faint CRT scanlines.
- **Pixel Dusk** — warm paper, chunky plum RPG-dialog borders, hard offset shadows, and buttons that press down when you click them.

The default, **Auto**, follows the clock — Platinum by day, Terminal at night — so the place looks different depending on when you visit. Your choice saves to your account and follows you across devices.

### 8-Bit World (In Progress)

An **isometric 2.5D** overworld you teleport into:

- **Isometric engine** — React + HTML Canvas, a 2:1 diamond projection with an autotiled ground, depth-sorted free-standing objects, and an 8-direction animated character
- Player movement (WASD/arrows + an on-screen joystick on touch devices), a camera that follows and clamps to the map, and per-tile collision
- **Ports** — walk into a building's door and you are inside it; sit at the computer to log on to that community's forum view. Portal buttons drop you back at its doorstep
- **Mushroom warp network** — discover shrines to unlock fast travel between them
- **The Capital** — an authored starter town with a building (and a Ports door) for each community
- **Interiors** — every community building has a room behind its door, and every island house one inside it, each furnished to suit the place
- **PCs** — the terminal in each room: log on to that community's page, or travel PC to PC across the network
- **Floating My Place islands** — Every member has an island generated from their account: a cottage you can walk into, a garden path, a shrine back to the Capital, and trees in the biome they chose. Members pick who may visit: anyone, friends, or no one.
- **The mycelium network** — Shrines link places: Home from any shrine in the Capital, the Capital from any island
- **Avatar builder** — gender-neutral character customization on first login

## Screenshots

### Three themes, one place

The same My Place profile rendered in each built-in theme. **Auto** mode switches between Platinum and Terminal with the time of day.

<table>
  <tr>
    <td align="center"><strong>Platinum</strong><br><sub>System 7 · day</sub></td>
    <td align="center"><strong>Terminal</strong><br><sub>phosphor · night</sub></td>
    <td align="center"><strong>Pixel Dusk</strong><br><sub>warm paper · opt-in</sub></td>
  </tr>
  <tr>
    <td><img src="screenshots/profile-platinum.png" alt="My Place in the Platinum theme" width="270"></td>
    <td><img src="screenshots/profile-terminal.png" alt="My Place in the Terminal theme" width="270"></td>
    <td><img src="screenshots/profile-pixel-dusk.png" alt="My Place in the Pixel Dusk theme" width="270"></td>
  </tr>
</table>

### Around the platform

**Communities** — discover and join spaces organized by category.

![Browsing communities](screenshots/communities.png)

**Inside a community** — posts, threaded comments, and emoji reactions.

![A community page with a post](screenshots/community.png)

## Tech Stack

| Layer      | Technology                     |
| ---------- | ------------------------------ |
| Framework  | Next.js 16 (App Router)        |
| Language   | TypeScript                     |
| ORM        | Prisma 7                       |
| Database   | PostgreSQL                     |
| Styling    | Tailwind CSS                   |
| Auth       | JWT + bcrypt                   |
| Validation | Zod                            |
| Testing    | Vitest (unit), Playwright (UI) |

## Project Structure

```
src/
├── app/
│   ├── api/            # REST API routes
│   │   ├── admin/      # Account creation (admin only)
│   │   ├── auth/       # Login, account settings, avatar, password reset
│   │   ├── communities/# CRUD, join/leave, posts
│   │   ├── posts/      # Comments, reactions, deletion
│   │   ├── feed/       # Friends, communities, everyone (all chronological)
│   │   ├── friends/    # Friend requests
│   │   ├── users/      # Member directory and public profiles
│   │   ├── my-place/   # Personal space posts
│   │   ├── upload/     # Media uploads to R2
│   │   └── version/    # The commit the running instance was built from
│   ├── admin/          # Admin dashboard
│   ├── auth/           # Login and password reset pages
│   ├── communities/    # Community browsing and detail pages
│   ├── feed/           # The feed
│   ├── people/         # Member directory and friends
│   ├── profile/        # My Place (yours and other members')
│   ├── avatar-builder/ # First-login character customization
│   ├── world/          # The isometric overworld: the Capital, your island, or a friend's
│   └── iso-lab/        # Engine sandbox (dev only)
├── components/         # React components (feed/ holds the feed's subcomponents)
├── test/               # Route-test harness (helpers, setup) for npm run test:routes
├── generated/prisma/   # Generated Prisma client (not committed)
└── lib/
    ├── game/           # The isometric engine (see .claude/rules/world-engine.md)
    │   └── worlds/     # The Capital, the island generator, and the lab town
    ├── types/          # Wire types by domain
    ├── api-client.ts   # apiFetch: the client-side API helper
    ├── auth.ts         # JWT, cookies, session revocation
    ├── db.ts           # Prisma client singleton
    ├── schemas.ts      # Zod schemas for every request body
    ├── storage.ts      # Cloudflare R2 uploads
    └── rate-limit.ts   # In-memory rate limiters
prisma/
├── schema.prisma       # Database schema (source of truth)
├── migrations/         # Prisma migration history
└── seed.ts             # Seed data (9 starter communities)
scripts/
├── backup-db.ts        # Nightly database dump to private R2 storage
├── create-admin.ts     # Bootstrap the first admin account
└── upload-world-art.ts # Push runtime art to R2
.github/workflows/      # CI, nightly backup, weekly restore check, deploy-drift alarm
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- PostgreSQL (local or hosted)

### Installation

```bash
git clone https://github.com/luke-whitaker/our-place.git
cd our-place
npm install
```

### Database Setup

1. Create a PostgreSQL database (locally or on a service like Railway)
2. Copy `.env.example` to `.env.local` and set your `DATABASE_URL`
3. Run migrations and seed:

```bash
npx prisma migrate dev    # Apply schema migrations
npm run db:seed           # Seed starter communities
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Other Commands

| Command               | Purpose                        |
| --------------------- | ------------------------------ |
| `npm run build`       | Production build               |
| `npm run lint`        | ESLint                         |
| `npm run format`      | Prettier auto-fix              |
| `npm run test`        | Run unit tests                 |
| `npm run test:routes` | Run API route tests (Postgres) |
| `npm run test:watch`  | Run tests in watch mode        |
| `npm run db:migrate`  | Run Prisma migrations          |
| `npm run db:seed`     | Seed starter communities       |
| `npm run db:studio`   | Open Prisma Studio (DB viewer) |

## Roadmap

- [x] Core forum platform (communities, posts, comments, reactions)
- [x] Invite-only auth with admin dashboard
- [x] Rich post types and file uploads
- [x] Feed system with explore/friends tabs
- [x] My Place personal profiles
- [x] Security hardening (rate limits, Zod validation, transactions)
- [x] Game engine foundation (canvas, movement, camera, interactions)
- [x] PostgreSQL + Prisma migration (see v0.2.0 below)
- [x] Deploy to Railway (PostgreSQL + Dockerfile — see v0.3.0 below)
- [x] 32px tile upgrade + Aseprite generation pipeline
- [x] Avatar builder (gender-neutral first-login customization)
- [x] Procedural frontier world generator (500×500, 6 biomes, capital stamp, mushroom network)
- [x] Wire generated world into `WorldCanvas` (Phase B: loader + renderer)
- [x] Mushroom warp UI (warp menu, discovery tracking, teleport transition)
- [x] Ports v1 — two-way travel between forum view and world view (Portal buttons + doors)
- [x] Isometric world — 2.5D engine (iso projection, autotiled ground, depth-sorted objects, 8-direction character) with collision, doors, warp shrines, region toasts, and Ports
- [x] Authored capital town — a building with a Ports door for each community, composed as a serializable world document
- [x] Distinct building art — each community building is one of the six Evergrow Town_House sprites, half-scaled to fit the town's lots, with collision matched to each base
- [x] Water autotiling (4-edge blob autotiler + the animated pond in the Capital)
- [x] First-run onboarding — new members build a character, step straight into the world as it, and start in the Welcome Center
- [x] Operations backbone — CI on every push, nightly database backups with weekly restore verification, and a deploy-drift alarm
- [x] People page and honest feeds — a member directory with the web of trust visible, friend requests in one place, and chronological feeds that say what they show
- [x] Terrain tint experiment — autumn, snow, dusk, swamp, and scorched variants from the one forest sheet, in the engine sandbox
- [x] Viewport culling — the renderer draws only the diagonal bands and sprites the camera can see, with tests proving the output is unchanged
- [x] More space to explore — outskirts around the Capital
- [x] Floating My Place islands — one house, a biome you choose, a mushroom shrine back to the Capital, and a visitor setting
- [x] Post interaction controls — the author chooses whether a post can be liked, disliked, or commented on
- [x] API route tests — the reaction, comment, post, and island routes run against a real Postgres in CI
- [ ] Polls (designed, not built)
- [ ] Welcome tour — a once-per-version walkthrough for new members on their first visit and everyone else on their next (designed, not built)
- [ ] Wilderness with tinted biomes and user-placed content sprites
- [x] Ports v2 — building interiors with PC sprites
- [x] The world on a phone — a canvas sized to the screen, a touch joystick, and an interaction prompt you can't miss
- [ ] Player identity bound to world position (the name above the avatar is in)
- [ ] Real-time multiplayer presence (the engine is built with the seams for it)

---

## Version History

### v0.10.5 — Skin Shading and Fresh Art (September 2026)

**Why:** The neck, ears, and hands mid-stride were painted with a color the avatar recolor
filed under hair, so they took the hair color: orange-brown on dark or green skin. And after
v0.10.4 shipped, browsers kept showing the old blushing character for days, because world art
is replaced in place and the art host sends no cache instructions.

**What changed:**

- **Necks, ears, and hands follow the skin tone:** that color is now the skin's deepest
  shadow, as dark as the original art drew it, in any skin color.
- **Art refreshes on every deploy:** world art addresses carry the deployed version, so every
  browser fetches the current art once after each deploy instead of keeping an old copy.

**What didn't change:** no API, schema, or art changes.

### v0.10.4 — Short Hair, and No Blush (September 2026)

**Why:** The avatar builder had no hair choice, because only the long-hair sheet was ready.
The short-hair sheet is now finished. The builder had also been quietly saving "short" as
everyone's hair style, a default nobody picked, while the world only ever drew long hair.
And both characters had pink blush on their cheeks, which Luke wanted gone.

**What changed:**

- **Short or long hair:** the avatar builder has a Hair style choice, and the world draws
  whichever you pick, in your colors.
- **Everyone keeps the look they have:** a one-time update sets existing avatars to long
  hair, the look members chose their colors against. New members also start with long hair
  and can switch in the builder.
- **No blush:** the pink cheek patches are painted out of both characters. The face keeps
  its shading.
- **No more pink flecks:** in browsers with anti-fingerprinting protection (Luke's Firefox,
  and likely Brave and Safari), reading the character's pixels returned about one in eight a
  shade off on purpose. Those pixels missed the recolor and kept the original pink shirt and
  blue pants, so every avatar had pink and purple flecks. The recolor now matches each pixel
  to the nearest paint within a tiny margin, and a browser that scrambles pixel reads entirely
  gets the character in its original colors instead of static.

**What didn't change:** no API changes and no schema change. The only data change is the
one-time hair style update.

### v0.10.3 — Full Screen for the World (September 2026)

**Why:** On a phone, the world shared the screen with the browser's address bar and buttons,
our navbar, the page title, and the padding around the world. Held sideways, that left the
world a strip across the middle of the screen. On a laptop it stayed a 960x640 window in the
middle of the page.

**What changed:**

- **A full screen button:** a see-through button in the world's top-right corner lets the
  world take over the screen, on phones, tablets, and laptops. Tap or click it again to
  minimize. It stays on as you travel through doors and PCs, and ends when you go to a forum
  page.
- **The most each device allows:** on Android, iPad, and laptops the browser's own bars
  disappear too, and Esc also leaves full screen. Every browser on an iPhone (Chrome included)
  runs on Safari's engine, which doesn't let web pages go full screen, so there the world
  hides our navbar and padding and fills all the space the browser gives it, about a third
  taller held sideways.
- **Bigger on a laptop, not wider:** in full screen a laptop shows the same view of the world
  as before, scaled up to fill the screen.

**What didn't change:** no API, schema, or art changes.

### v0.10.2 — Tap to Travel on Phones (September 2026)

**Why:** On a phone, the PC and Mycelium Network menus were small rows drawn inside the world,
driven by the joystick one row per push and chosen with A. Reaching "Home" from "Log on" took
nine separate pushes, the rows were about half the height a thumb needs, and on a phone held
sideways the PC menu didn't fit: its title and Cancel row were cut off.

**What changed:**

- **Tap where you want to go:** on phones and tablets, a PC or shrine opens a grid of large
  buttons over the world. "Log on" runs across the top and destinations fill the columns below.
  Tap one and you travel. ✕, or a tap outside the menu, closes it.
- **It fits:** the largest menu shows every button on a phone held sideways, down to a
  320-pixel-tall screen, with no scrolling.
- **The joystick and A button step aside** while a menu is open, so they never cover it.

**What didn't change:** laptops and desktops keep the keyboard menu as it was. No API,
schema, or art changes.

### v0.10.1 — PCs Open Their Menu (September 2026)

**Why:** On a laptop, pressing Enter at a PC could skip its menu or send you out of the
building. Three causes, found one after another:

- Clicking the 🍄 in the navbar to enter the world left keyboard focus on that link, and moving
  between places inside the world never moved it. Enter at a PC then did two things: the prompt
  flashed green, and the browser followed the focused link back to the Capital, where you
  landed at your last saved spot (the door you had walked in through, or the shrine you took
  Home from).
- A held Enter repeated fast enough to pick the menu's first row the moment it opened.
- In five rooms the tile beside the PC was also within reach of the exit, and the exit won.

**What changed:**

- **The world takes the keyboard on arrival:** entering any place clears focus from the
  navbar, and Enter or Space pressed on a focused link or button is left to that link or
  button. The world is also reachable with Tab, so a keyboard user can move focus back to it.
- **Enter ignores key repeat**, so holding it opens the menu without choosing from it.
- **The nearest thing wins:** when a door and a PC are both in reach, the prompt, Enter, and
  walking all act on whichever is closer.

**What didn't change:** no API, schema, or art. Phones were never affected, because the A
button does not go through keyboard focus.

### v0.10.0 — The World on a Phone (September 2026)

**Why:** The world was drawn as a fixed 960x640 desktop view and then shrunk to fit the screen.
On a phone that made the whole world about 374x249 pixels, a strip across the top of the
screen, and the "Press Enter" text at the bottom landed near 4 pixels tall. Even on a desktop
the prompt was small and grey, and easy to miss. The four-button touch pad couldn't walk the
town's streets, which run diagonally on screen, without zigzagging.

**What changed:**

- **The world fits the screen:** on a phone or tablet the world fills the space under the
  navbar in either orientation, and a phone shows fewer tiles at a readable size instead of
  the desktop view in miniature. The zoom is always a whole number of screen pixels per art
  pixel, so the pixel art stays crisp on every screen. Desktop keeps the same 960x640 view.
- **A prompt you can't miss:** walking up to a door, a computer, or a shrine shows a bright
  yellow label just above your character, with the key to press ("Enter", or "A" on touch).
  Press it and the label flashes green for a moment before the door opens or the menu
  appears, so you can see your press land.
- **Readable text:** every piece of world text is sized in real screen pixels, and the
  toasts, menus, and name tags are a little larger than before.
- **A joystick on touch screens:** the four-button pad is now a thumb stick that moves in
  eight directions, so a street is one smooth push. The A button is unchanged.
- **No lost taps:** a quick tap on A, or a press made while the page stutters, is no longer
  missed between game ticks.

**What didn't change:** no API, schema, or migration, and no new art. Doors still open by
walking into them or pressing Enter, and every Ports deep link lands where it did.

### v0.9.0 — Ports v2: Interiors and PCs (September 2026)

**Why:** A door that teleported you to a web page made the world a menu. Buildings had no
inside, so the Capital was a facade you walked past. Ports has always meant that the forum and
the world are two views of one place, with PCs as the travel points between them — that needed
rooms to put the PCs in, and the art for them did not exist until now.

**What changed:**

- **Nine building interiors** — every community building opens into a room sized to the
  building outside it, and each one has its own floor plan. A room is a union of rectangles
  rather than a single box, so a hall can have a set-back annex, a recessed stage, or a wing,
  and a run of wall pieces can partition it into a front room and a back workshop.
- **Doors open two ways** — walk up into one and you are inside, or press Enter. The test is
  on the screen direction of your movement, not the tile row, because the tile axes run
  diagonally: walking east along a street is screen down-right, and reading the row axis alone
  would make both town streets impassable, since every building door sits on one.
- **Rooms are bare on purpose** — a room reads as its own place through its size and shape,
  where the light falls, and the stone patch on its floor. Scattered furniture crowded them
  and, in four rooms, boxed the computer into a corner. Empty and unfinished is the better
  starting point, and furniture has to earn its way back in.
- **Island houses** — the cottage on a member's island opens too. The room is generated from
  their account like the island itself, so a new member has a home the moment they exist, and
  no two houses are furnished alike. Who may come in follows the island: if you can stand on
  the doorstep, you can come inside.
- **PCs** — the computer in every room is the third thing you can interact with, beside doors
  and shrines. Press Enter at one to log on (a community's page from its building, your
  profile from your house) or to travel to another building's PC. A house PC reaches all nine
  buildings; a building PC reaches the other eight and home.
- **Engine** — a world can name its own ground sheet, so an interior paints `grass` as
  floorboards and `dirt` as stone flags with no new terrain kind and no autotiler change. Doors
  gained an optional `warpTo`/`spawnAt`, so a door can open a world instead of porting to a
  page, and the round trip closes itself with no new spawn machinery.
- **A live art bug fixed** — the blush color was listed in the shirt palette ramp but painted
  only on cheeks, so picking a blue shirt gave you blue cheeks. Cheeks are pink again.

**What didn't change:** no API, schema, or migration. Every existing door keeps working —
`warpTo` is optional — and the Ports deep link (`/world?at=<slug>`) still lands you at a
building's door.

### v0.8.0 — Islands, the Outskirts, and Interaction Controls (September 2026)

**Why:** The world had one town and nowhere to be alone in it, and a member's "place" in the
forum had no counterpart in the world beyond a cottage door in the Capital. The forum, meanwhile,
gave authors no say in how people could respond to a post, and the API had no tests at all.

**What changed:**

- **Floating My Place islands** — every member has an island generated from their account
  (nothing about its layout is stored): a cottage whose door ports to their profile, a garden
  path, an island shrine, and trees in a biome they pick in Account settings. The Capital's
  shrines gain a Home entry that lands you at your island shrine; the island shrine takes you
  back to the Capital gate. Members choose who may visit (anyone, friends, or no one, friends
  by default), and a friend's profile shows a "Visit island" Portal when their island is open.
  The Capital's old My Place cottage is gone: from town, the only way home is the network.
- **The outskirts** — the Capital now sits inside a map almost twice its size: a forest ring
  that thins toward town, three dirt trails out (the Old Road south, a west trail to Miller's
  Clearing, an east trail to Mirror Pond), two shrines out in the woods, and the North Woods
  with the pack's tall trees. The lot where the My Place cottage stood is a fenced park with a
  well, lamps, and a bench; the plaza has lamps and crates. Every region is proven reachable.
- **Post interaction controls** — the author chooses at compose time whether a post can be
  liked, disliked, or commented on. Dislikes are opt-in, counted apart from likes, and one
  reaction per member: a dislike replaces a like. Cards show "Comments off" when the author
  said so.
- **API route tests** — the first tests at the API boundary: reactions, comments, post
  creation, and the island visit gate run against a real Postgres, locally and in CI.
- **Engine** — `void` ground for floating places, a tint target on every catalog entry and a
  biome tint per world, links between worlds in the warp menu, per-world save slots, an
  arrival fade-in, and the member's name drawn above their avatar.

**What didn't change:** community, comment, and friendship API shapes. Posts carry four new
fields (`dislike_count`, `allow_reactions`, `allow_comments`, `allow_dislikes`); the reaction
response now returns exact counts. `/api/users/[username]/island` is new.

### v0.7.0 — People, Honest Feeds, and the World Decision (September 2026)

**Why:** The first real members surfaced three kinds of friction in the same week. Finding
someone who had never posted was impossible, because the only path to a profile ran through
a post. The feed's second tab was still labeled "Endless Scroll" from the earliest prototype,
which contradicts the thesis on the front page. And events were half-built: a calendar with
no way to create an event or RSVP. Meanwhile the world's direction had been undecided since
August over one question, whether new biomes need new art.

**What changed:**

- **People page** (`/people`) — friend requests, your friends, and a searchable directory of
  every member, each row showing who invited them. The web of trust is now visible, and
  adding a friend no longer requires finding one of their posts. People also gets a navbar
  link and the feed's bottom-bar slot.
- **Honest feeds** — the "Endless Scroll" tab is now "Everyone", every feed is chronological
  (the everyone feed had been ranked by reactions), and each tab states under its heading
  exactly what it shows and how it is ordered.
- **Events removed** from the UI and API. The tables stay; events come back later, built
  around getting people into a room.
- **Editable display name** in Account settings.
- **Correctness** — community creation is one transaction; HSTS is sent and the deprecated
  `X-XSS-Protection` header is gone; a member's role is read from the database on every
  request, so promotions apply immediately; every client page calls the API through one
  helper that surfaces errors and sends an expired session to the login page instead of
  rendering an empty feed.
- **World direction decided: the world stays isometric.** The terrain tint experiment
  (`/iso-lab?world=capital&tint=autumn`) showed that one HSL pass at load turns the forest
  sheet into autumn, snow, dusk, swamp, and scorched variants that read as different places,
  with pines staying evergreen and buildings keeping their paint. Biome variety no longer
  depends on buying art.
- **Viewport culling** — the isometric renderer now iterates only the diagonal bands of
  tiles and the sprites that can intersect the camera, about a quarter of the Capital per
  frame and under 3,000 tiles of a 500x500 world. A brute-force property test proves the
  culled set always covers every tile that touches the view, and a before-and-after pixel
  comparison of the live world showed no change. This is the prerequisite for a bigger world.
- **Project instructions** restructured: a shorter `CLAUDE.md` plus path-scoped rules under
  `.claude/rules/`.

**What didn't change:** post, comment, community, and friendship API shapes. `/api/events`
is removed and `/api/users` is new.

### v0.6.1 — Photo Uploads Actually Work (September 2026)

**Why:** Adding a photo to a post failed with "Failed to upload file." for every real photo.
R2 requires `Content-Length` on every PUT and has no chunked-upload support, but undici streams
any request body at or above its 64 KiB high-water mark, and a streamed body loses the header
`fetch` would otherwise derive. R2 answered `411 MissingContentLength`. Uploads under roughly
64 KB still succeeded, so the two small test images already in the bucket made the feature look
healthy from the June migration onward. The first real photo from the first real user found it.

**What changed:**

- **Uploads send an explicit `Content-Length`** — `src/lib/storage.ts` sets it from the body
  length. `scripts/backup-db.ts` carried the same defect and was passing only because the
  nightly dump is still far under 64 KB, so it got the same fix before a growing database
  turned it into a failing backup.
- **Storage failures name their cause** — a missing R2 variable raises `StorageConfigError`
  (HTTP 503, logging exactly which variables are absent), and an object R2 refuses raises
  `StorageUploadError` (HTTP 502, carrying the R2 status). Both replace a single opaque 500.

**What didn't change:** API response shapes, accepted file types, and size limits are identical.

### v0.6.0 — The World Goes Isometric (June 2026)

**Why:** The world had been a top-down tile map — functional, but flat. To make it the explorable, characterful place the project is about, it moved to an **isometric 2.5D** view built around a purchased character and the Evergrow Forest art. The migration was also the moment to lay architecture seams for where the world is headed: a shared, multiplayer, player-built space.

**What changed:**

- **Isometric engine** — a 2:1 projection with a diamond-autotiled ground, depth-sorted free-standing objects (trees, rocks, buildings, the warp shrine), and an 8-direction animated character. Movement, collision, doors, warp shrines, region toasts, the warp menu, and fade transitions all carried over from the top-down engine, now in iso. `/world` runs on it; the top-down engine, tileset, sprite generators, and the 500×500 procedural generator were retired.
- **Serializable world model** — a place is a plain `IsoWorld` document (terrain grid + a list of placed objects + doors + shrines + regions) in world-space tile coordinates, validated with Zod and loaded behind a source-agnostic interface (a file today, a database row later). Collision is a pure function over that data — the same code a server could run.
- **The Capital** — an authored starter town: streets and a central plaza, a building for each community (whose door ports you into that community's forum view), framing trees, and the mushroom warp network. Buildings use a placeholder cottage for now; swapping in distinct art is a per-building one-liner.
- **Built for what's next** — the engine models the world as a static map plus an entity collection (the local player is one entity), splits input (`computeIntent`) from movement (`applyMovement`), and keeps positions in world space. Those are the seams that let parallel and real-time multiplayer — and Builder/Creator user-generated spaces — slot in later without a rewrite.

**What didn't change:** the forum, Ports' contract (`/world?at=<slug>` ↔ a door porting back to `/communities/<slug>`), and the avatar builder's procedural preview. The account model and APIs are untouched.

**Not yet done (intentional):** distinct per-building art (the Evergrow Town_House sprites), water autotiling, Ports v2 interiors, and binding player position to identity in the database.

### v0.5.0 — Three Themes: Platinum, Terminal, Pixel Dusk (June 2026)

**Why:** The forum had been deliberately unstyled while the platform went live. This cycle
gave Our Place its look — and instead of picking one retro direction, all three became
user-selectable themes. The default, **Auto**, follows the clock: the place looks different
at night, like a real place does.

**What changed:**

- **Semantic design tokens** — every component now references a single palette
  (`surface` / `ink` / `line` / `accent`) defined in `globals.css` via Tailwind v4 `@theme`;
  retheming is a values-edit in one file.
- **Three themes** —
  **Platinum** (System 7 chrome: pinstriped window cards, 1-bit hard shadows, dithered
  desktop, pixel wordmark), **Terminal** (dark phosphor: monospace body, `$`-prompt headings
  with a blinking cursor, faint CRT scanlines, flat panels), and **Pixel Dusk** (warm paper,
  chunky plum RPG-dialog borders, hard offset shadows, buttons that press down, amber
  wordmark).
- **Auto mode** — Platinum 7am–7pm, Terminal at night; any theme can be pinned in
  profile → Account → **Appearance** (live preview swatches). The choice is saved to the
  account (`users.theme`) and follows you across devices, with a localStorage echo and a
  CSP-nonce'd pre-paint script so the right theme renders with no flash.
- **Theme typography** — Pixelify Sans display headings (Platinum/Dusk), VT323 + IBM Plex
  Mono (Terminal), loaded via `next/font`.

**What didn't change:** layout, components, and API shapes. Themes are token values plus a
thin chrome layer — no component was redesigned.

### v0.4.1 — Media Moves to Cloudflare R2 (June 2026)

**Why:** Uploads were written to a persistent volume on the host, which tied media to a single
deploy environment, required the container to start as root to fix mount ownership, and left
bandwidth egress as the looming cost driver. Object storage with zero egress fees is the right
long-term home for media.

**What changed:**

- **Uploads go to Cloudflare R2** — the upload API now does a signed PUT to R2
  (`src/lib/storage.ts`, via the dependency-free `aws4fetch`) and returns the absolute public
  URL. Object keys mirror the old `/uploads/<type>/<uuid>.<ext>` layout.
- **CSP follows the media** — the R2 public host is added to `img-src`/`media-src` in
  `src/proxy.ts`, derived from `R2_PUBLIC_BASE_URL` at runtime.
- **Volume teardown** — with no runtime writes to `public/`, the Dockerfile now runs as the
  `nextjs` user from the start (`USER` directive); the root-start + `su-exec` privilege drop
  and the `start.sh` ownership fixups are gone, along with the volume itself.

**What didn't change:** API response shapes, accepted file types, and size limits are identical.

### v0.4.0 — The World Goes Live: Ports v1 (June 2026)

**Why:** The generated frontier had been sitting on disk since April. This cycle made it the
actual, explorable heart of the platform — and introduced **Ports**: the idea that the forum
and the world are two views of the same place, and you travel between them deliberately.

**What changed:**

- **World loader** — `WorldCanvas` now fetches the generated 500×500 frontier
  (`world.bin` + `world.meta.json`) and renders it through the existing frustum-culled
  engine. The hand-built test map is retired from the live page.
- **Ports (v1)** — "Portal" buttons on My Place and community pages drop you into the world
  at that building's door (`/world?at=<slug>`); walking into a door ports you back to that
  place's forum view. Two views, one place.
- **Mushroom fast travel** — walking up to a shrine discovers it ("Sun Beach Shrine
  discovered!"); pressing Enter opens the Mycelium Network warp menu listing your discovered
  shrines. The Capital Gate starts unlocked. Warps ride the existing fade transition.
- **Region toasts** — entering the capital or any of the 6 frontier nodes shows a brief
  banner with the region's name.
- **Per-device persistence** — position and discovered shrines are saved to localStorage
  (a stopgap until player position is bound to identity in the DB).
- **Account settings** — profile → Account now edits email, phone, and password
  (current password required, rate-limited).
- **Production fixes** — media rendering after the Prisma migration (video embeds, photo
  galleries), upload permissions on the Railway volume, date parsing fossils.

**Next (Ports v2):** building interiors with PC sprites — enter a building, sit at the PC,
and choose to "log on" (exit to the forum view) or warp to another PC.

### v0.3.0 — Railway Deployment + Avatar Builder + Frontier World (April 2026)

**Why:** With the platform on Postgres and the forum stable, this cycle focused on three things: getting Our Place actually running in production, making the first-login experience feel personal, and laying the groundwork for the 8-bit world to be more than a bare test map.

**What changed:**

- **Deployed to Railway** — production Dockerfile (multi-stage build with standalone Next.js output), PostgreSQL service linked, healthcheck on `/`. Several iterations to get the Docker runner stage correct: full `node_modules` copy (native binaries + Prisma/effect runtime deps), Prisma schema copied into deps stage, dummy env vars for build-time Next.js compilation, `.npmrc` removed so native binary installs work.
- **Avatar builder** — gender-neutral character customization shown on first login. Hair style, skin tone, shirt color, pants color, stored as JSON on the user record. No male/female selector.
- **Audit overhaul** — invite-only auth tightened, admin dashboard cleanup, `createUserSchema` consolidation (removed orphaned `registerSchema`), code-quality pass across the admin surface.
- **32px tile upgrade** — tile size doubled from 16px to 32px for better readability at modern resolutions. New Aseprite Lua scripts (`scripts/generate-tiles.lua`, `scripts/generate-player.lua`) for sprite-sheet generation.
- **Procedural frontier world generator** (`scripts/generate-world.ts`, `npm run world:generate`) — deterministic 500×500 tile world built from a single seed. 9-stage pipeline: base fill → 8 passages (tree-walled corridors with tall-grass patches) → lakes + rivers (Iowa River N-S) → 6 themed nodes (flower meadow, beach, mountain valley, island, misty grove, ancient ruins) → capital stamp at (220,230) → wilderness fill (noise-driven forest vs. clearing) → border wall → mushroom warp network (1 capital gate + 6 node shrines, full-mesh connections). Emits `public/world/world.bin` (one byte per tile) and `world.meta.json` (spawn, doors, node bounds, passages, mushroom network).
- **8 new tile types** — `TALL_GRASS`, `FLOWER_RED/YELLOW/PURPLE`, `SAND`, `MOUNTAIN`, `MUSHROOM`, `STONE_RUIN` — palette entries and placeholder procedural sprites (to be refined in Aseprite later).
- **Seed trimmed** — 12 starter communities → 9, with simpler names.

**Not yet done (intentional):** The generated world is on disk but not yet read by `WorldCanvas`. Phase B — loader + renderer + mushroom warp UI — is the next cycle.

### v0.2.0 — PostgreSQL + Prisma Migration (April 2026)

**Why:** SQLite (better-sqlite3) was the right choice for prototyping — zero setup, file-based, fast to iterate. But Our Place is a multi-user platform headed for production deployment. SQLite can't handle concurrent writes from multiple users reliably, and it doesn't work on most cloud hosting platforms (Railway, Render, etc.) without workarounds. PostgreSQL is the industry standard for this kind of app.

**What changed:**

- **Database engine**: SQLite (better-sqlite3) → PostgreSQL, using `@prisma/adapter-pg` driver
- **ORM**: Raw SQL queries → Prisma 7 with full type-safe client
- **Schema**: Defined in `prisma/schema.prisma` (single source of truth) instead of inline `CREATE TABLE` statements in `db.ts`
- **Migrations**: Runtime column-checking hacks (`PRAGMA table_info`) → Prisma's migration system (`prisma migrate dev`)
- **Seeding**: Moved from `initializeDatabase()` to a dedicated `prisma/seed.ts` script
- **All 18 API routes** converted from synchronous `db.prepare().run/get/all()` to async Prisma client calls
- **SQLite-specific syntax** replaced: `datetime('now')` → `@default(now())`, `MAX(0, x)` → `GREATEST(0, x)`, `COLLATE NOCASE` → Prisma's `mode: "insensitive"`, `INSERT OR IGNORE` → `upsert`
- **Config updates**: Removed `better-sqlite3` from dependencies, updated `next.config.ts`, added Prisma scripts to `package.json`

**What didn't change:** All API response shapes are identical. The frontend is unaffected — no client-side code was modified.

### v0.1.0 — Initial Build (Feb 2026)

Forum platform with full auth, communities, posts, comments, reactions, events, file uploads, feed, and "My Place" profiles. 8-bit game engine prototype with tile rendering, player movement, camera system, and building interactions. Built with Next.js 16, TypeScript, SQLite, and Tailwind CSS.

---

## Related

- [Portfolio Site](https://github.com/luke-whitaker/portfolio-site) — My pixel-art RPG portfolio, the prototype that inspired the game engine in this project

## Author

**Luke Whitaker** — Linguist, researcher, and developer working at the intersection of language, technology, and digital interfaces.
