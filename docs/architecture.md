# Architecture

The website is a real, readable page that doubles as a playable 2D scene. Visitors can grab, throw, bomb or blow away every element, while a monkey comments, flees, hangs on elements and rebuilds the page. Most of what follows is decided but not built yet: [todo.md](todo.md) tracks the work.

## Two layers: content, then game

Pages are normal server-rendered Twig, with semantic HTML that is readable without JavaScript. That HTML is the site for search engines, assistive technology and old devices.

The game is a layer on top. Elements opt in with `data-physics` attributes in Twig: `letter`, `block`, `link` and so on, plus their properties (grabbable, hangable, breakable, weight). The engine measures the marked elements and turns them into physics bodies (Matter.js). Adding a page needs Twig only, no game code.

## The monkey

Every behaviour belongs to one of four kinds:

| Kind     | Duration                       | Relation to the current task                  | Examples                                                 |
| -------- | ------------------------------ | --------------------------------------------- | -------------------------------------------------------- |
| Reflex   | Instant                        | Overlays it, then lets it continue            | Flinching, a scared face, "Ouch!"                        |
| Activity | Seconds, with a goal and steps | Interrupts it or waits, depending on priority | Rebuilding, looking for the cigarette, climbing, leaving |
| Ambient  | Fills idle time                | Always gives way                              | Smoking, stretching, sleeping                            |
| Line     | Speech only                    | None                                          | A comment on every event                                 |

Each behaviour is one self-contained module, registered once. It declares its kind, its priority, `canStart(context)` and a step-by-step `run`, written as a generator that waits for the Motor between steps.

The monkey is split into layers:

- **Brain:** chooses the activity from the context and the priorities, and handles interruption and resumption.
- **Motor:** walks, jumps, carries, hangs and climbs.
- **Voice:** FR/EN lines with cooldowns.
- **Look:** pose, mood and accessories.

The Brain and the activities contain no DOM or physics code, so they can be unit-tested with a fake Motor.

The context they read covers the monkey (grounded, hanging, carrying, cigarette), the scene (danger, broken pieces, gravity), the visitor (last input, what they hold) and the environment (tab visibility, reduced motion, device tier).

Systems communicate through events: `item.freed`, `bomb.placed`, `monkey.hit`, `cig.lost`, `visitor.idle` and so on. The same events go over the network in multiplayer.

## Lifecycle and memory

- A hidden tab stops everything: the loop, the physics and the timers. After about 30 seconds hidden, the Mercure connection closes too.
- After long inactivity the monkey goes to bed. Once the scene is still, the loop stops completely and the page costs almost no CPU. The next input wakes him up.
- Everything time-based goes through one game clock: no scattered `setTimeout`. Listeners are attached through an `AbortController`. Particles, bombs and speech bubbles all have hard limits.

## Device tiers

The tier is chosen from feature checks and a frame-rate probe during the first second, never from the browser's name.

| Tier   | Who                                          | Experience                                                   |
| ------ | -------------------------------------------- | ------------------------------------------------------------ |
| Full   | Modern browsers on capable devices           | Everything, multiplayer included                             |
| Lite   | Weak devices, or a frame rate that collapses | Words instead of letters, no particles or tornado, solo only |
| Static | Old browsers, failed checks                  | The HTML page, with the monkey suggesting rice for the phone |

A device whose frame rate collapses during play is downgraded on the spot, and the monkey says so.

## Long pages and several pages

- **Rooms:** a page is split into rooms, each with its own floor, so pieces fall within their room. Scrolling moves the camera. Only rooms that are visible or contain the monkey are simulated.
- **Mobile:** grabbing is a long press, so a normal swipe still scrolls.
- **Budget:** each page has a cap on moving bodies. Individual letters are reserved for the hero.
- **Several pages:** Turbo would keep the game layer alive across pages (not decided yet: see [ideas.md](ideas.md)).

## Multiplayer

- **Sessions:** optional, up to 4 players, one shared monkey, visible cursors. Mobile and desktop sessions are separate.
- **Same scene for everyone:** each device class has a fixed logical width, the font is self-hosted, and the host's measurements are the reference for the session.
- **Host authority:** the host's browser runs the physics and the Brain and sends snapshots several times a second. The other players send their actions and smooth the movement between snapshots. If the host leaves, another player takes over from the last snapshot.
- **Transport:** Symfony creates and closes sessions and issues short-lived publish tokens scoped to one session. Mercure relays the messages, so PHP doesn't handle each one.
- **Capacity:** to be load-tested on the VPS before relying on any number.

## Decisions

- **The site is a playable scene, not a portfolio.** It has to impress non-developers within seconds, while showing developers real engineering underneath. Rejected along the way:
  - a dot-field hero, too generic and easy to generate with AI
  - a live-metrics dashboard, which explained instead of showing
  - a single "break this site" button, not impressive enough on its own
  - a career timeline and a stack list: LinkedIn covers the history, and experience matters more than tools
  - importing positions through LinkedIn's data portability API, which would rebuild LinkedIn, with unclear terms and an extra dependency
- **Content first, game as a layer.** The same HTML serves SEO, accessibility and old devices, and pages need no game code. The alternative, a canvas-only site, loses all three.
- **Behaviour modules with a Brain, not flags.** The prototype's flags and hand-ordered conditions broke with every new behaviour. One module per behaviour, with declared priorities, makes adding one local.
- **Host authority over server physics.** PHP is not suited to a real-time physics loop, and one browser running it keeps the server a relay. Rejected: every client simulating on its own, because one shared monkey needs a single source of truth.
- **Mercure with scoped tokens.** Relaying through PHP would cost one request per message. Rejected for now: WebRTC, lower latency but heavier to set up (signalling, TURN). It stays an option if latency matters.
- **Fixed logical width per device class.** Without it, four players would see four different layouts. The trade-off: positions come from defined widths and measured elements, not from free responsive flow.
- **Feature checks, not browser names.** Names lie and age badly, while a feature check and a frame-rate probe measure what matters.
- **TypeScript built by Vite, not a no-build setup.** The game layer is a large typed codebase, and `tsc` in `make check` enforces it. Symfony reaches Vite through `pentatrion/vite-bundle` and `vite-plugin-symfony`: in dev, FrankenPHP proxies `/build/` to a Vite service (assets and the HMR websocket on the page's own https origin); in production the image holds only the hashed output, built in a Docker stage, with no Node at runtime. Rejected: AssetMapper and no-build JavaScript with JSDoc, which cannot type or bundle a game layer of this size.
- **The Symfony–Vite integration is a replaceable dependency.** `pentatrion/vite-bundle` and `vite-plugin-symfony` are one maintainer's project, quiet since March 2026 though current with Symfony 8 and Vite 8; Dependabot holds back their majors. If they stop following a Vite or Symfony major, the exit is a small Twig extension of our own: read Vite's native `.vite/manifest.json` in production, emit `@vite/client` and the entry from the dev server in dev, plus modulepreload tags. We use none of the plugin's extras, so nothing else depends on them.
- **CSS follows CUBE CSS, in native CSS.** Composition (layout primitives for the content flow), Utility (single-purpose classes built from the design tokens), Block (the few real components: signs, boards, the dock, the speech bubble, the scene) and Exception, which is state through data attributes only (`[data-state]` for a piece's physics state, `[data-mood]` for the time of day), never modifier classes. `@layer reset, tokens, composition, utilities, blocks, exceptions` fixes the cascade order. The pages are content-first Twig and the game moves elements around, so the markup stays light and the state readable. Rejected: SCSS, whose nesting, variables and ordering native CSS now covers, at the cost of a dependency and a compile step; BEM, verbose on every element; utility-first (Tailwind), class soup in Twig on elements the physics moves; CSS Modules, made for component frameworks we don't use.
- **French and English live under their own URLs.** `/fr/…` and `/en/…`; `/` redirects by `Accept-Language`; every page declares its `hreflang` alternates and a canonical URL. Rejected: one URL with a language toggle, which search engines index in one language only and which can't be shared in the other.
- **No third-party request on the page.** Fonts are self-hosted subsetted woff2 built by Vite, not loaded from Google's CDN: a German court (LG München I, 2022) ruled that loading Google Fonts from Google's servers, which sends the visitor's IP to Google, breaches the GDPR. The same rule covers any future asset.
- **The build targets Baseline "widely available".** That is Vite's default build target; CUBE relies on `@layer`, nesting and container queries, which it covers. A browser below it can't run the bundle at all, so the static tier's message is rendered by Twig in the HTML and hidden by the bundle once the feature checks pass: an old browser gets the readable page and the monkey's message without any JavaScript.
- **Live counters live in SQLite, pushed through Mercure.** FrankenPHP ships the Mercure hub; the counters are a few rows in an SQLite file on a volume. Rejected: Postgres or Redis, a second service for a few integers on a 2 GB VPS.
- **No analytics, no consent-requiring cookies.** The only data kept is the anonymous action counters of the live board (site-wide counts of bombs, tornadoes, throws, rebuilds and visitors online: part of the joke, not a metrics dashboard). The only cookie allowed is a strictly necessary one, such as Mercure's subscription cookie for a private multiplayer session, so the site needs no consent banner. Rejected: third-party analytics, and any cookie that would require consent.
- **Accessibility targets WCAG 2.2 AA.** The page is readable and navigable without the game. Every game action has a keyboard and button alternative to dragging (SC 2.5.7). `prefers-reduced-motion` is a context input the Brain reads: the game stays, without the tornado, particles, shakes or animated falls. CI enforces it: axe-core in the end-to-end tests and a keyboard-only test of the game.
- **Performance has a budget, enforced in CI.** A size cap on the first-load JavaScript and a load-time target, both set from the first real build and checked on every build. The content shows before the game: the Stimulus `game` controller, outside `assets/game/`, imports the game entry dynamically after the first paint, which keeps the ban on dynamic `import()` inside the game code.
- **Matter.js runs the physics.** It is the prototype's engine and the folder rule above keeps it inside `physics/`. Upstream moves slowly; if it stalls, Planck.js (a JavaScript Box2D) or Rapier (WebAssembly) replaces it inside that folder alone.
- **The code is MIT-licensed, the illustrations are not.** The repository is public; the monkey and the scene's artwork stay all rights reserved, listed as an exception in the licence file.
- **Dependencies are audited in CI.** `composer audit` and `pnpm audit` fail the build on a known vulnerability.
- **Stimulus only links the page to the game code.** A controller attaches to an element and hands over to plain TypeScript. It is loaded by Vite through `@hotwired/stimulus`, not by Symfony UX's AssetMapper mode.
- **No Turbo for now.** Pages are plain navigations. Whether the game layer survives across pages is still open: see [ideas.md](ideas.md).
- **pnpm for the JavaScript packages.** The lockfile and the store are cached by CI and by the tools' bind-mounted `.cache/`.
- **Game layer folders, enforced by ESLint and `tsc`.** `assets/game/` holds one folder per module: `brain`, `activities`, `motor`, `voice`, `look`, `physics`, `events`, `clock`, `frame` and `ports`. `config/tools/eslint.architecture.ts` keys its rules on these names, and `tests/eslint/architecture.ts` proves each rule can fail. Only `frame` may use raw timers, `performance`, `Date` or `queueMicrotask`; `matter-js` is importable in `physics` only (an allowlist, deep and dynamic imports included); the game never imports the Stimulus controllers or uses a dynamic `import()`, which would skip these rules. Imports are matched by their text, not resolved: it only matters if a file is named after another layer.
- **`brain`, `activities`, `ports`, `clock` and `events` compile without the DOM lib** (`config/tools/tsconfig.game.json`), and `brain`, `activities` and `ports` import none of `physics`, `look`, `motor`, `voice` or `frame`. The compiler is the one check that cannot miss a DOM global or type, which a list of names in ESLint would. Voice is banned because it draws DOM speech bubbles: the Brain emits lines on the events bus.
- **A `ports` folder holds the interfaces the Brain and activities depend on** (the Motor's first). They cannot import `motor`, so a fake can replace it in unit tests, as above; the implementations in `motor` satisfy the ports.
- **`clock` and `events` are pure, and import no other game module.** Every module uses them, so any import back would create a cycle. The clock advances through `tick(elapsed)` and the bus is a plain typed emitter, not an `EventTarget`, because the no-DOM project compiles everything the Brain imports.
- **One `frame` module owns the browser's loop.** It calls `requestAnimationFrame` and `performance.now` and pushes the elapsed time into the clock. So the Brain, the activities, the clock and the bus run and test in plain Node under a fake time, and only the driver touches the browser.
- **TypeScript stays on 6.0 for now.** typescript-eslint needs the TypeScript JavaScript API, which 7 no longer ships, and pnpm 12 can only alias a peer dependency from `pnpm-workspace.yaml`, which the Docker build would then have to copy. Dependabot ignores the major bump.
- **Vitest and Stryker test the TypeScript, as Pest and its mutation testing do the PHP.** Tests mirror the sources (`tests/assets/game/clock/clock.test.ts` for `assets/game/clock/clock.ts`), which `make layout` enforces, except for the Vite entry. The pure game modules (listed once in `config/tools/game-modules.ts`) run in plain Node, and every other test in happy-dom. `make check` mutation-tests the TypeScript changed since `origin/main`, CI all of it, and every mutation must be caught. Rejected: Jest, which needs a transform for ESM TypeScript that Vitest gets from Vite; jsdom, heavier than happy-dom for the little DOM the controllers use.
- **The clock's time moves at the end of a step.** `tick` adds the clamped step to `now()` first, then runs the callbacks due by then in due order (ties in scheduling order), so a callback reads the time of the end of the step. A callback scheduled during a tick waits for the next tick even when its delay is 0 or already passed, so callbacks cannot loop within a tick. A callback that throws leaves the later due ones queued for the next tick. A negative, infinite or NaN `elapsed` or `delay` is a `RangeError`, and so is a `maxStep` that is not above 0: a silent NaN would stop the game's time for good.
- **The events bus delivers to a snapshot.** A listener removed during an emit is still called by that emit, one added is not. A nested emit is delivered completely before the outer one goes on. Events are named in one `Events` interface per bus (name to payload; an interface, since a `Record` index signature would accept any name), so an event cannot be misspelled or emitted with the wrong payload. A listener is one subscription per function and event: subscribing it twice changes nothing, and any of its unsubscribe functions removes it.
