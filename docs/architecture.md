# Architecture

The website is a real, readable page that doubles as a playable 2D scene. Visitors can grab, throw, bomb or blow away every element, while a monkey comments, flees, hangs on elements and rebuilds the page. The physics layer, the behaviour engine and the monkey's body (Motor, Look, Voice) are built (below); his first behaviours are in too (below); the rebuild, the dock and the rest are decided but not built yet: [todo.md](todo.md) tracks the work.

## Two layers: content, then game

Pages are normal server-rendered Twig, with semantic HTML that is readable without JavaScript. That HTML is the site for search engines, assistive technology and old devices.

The game is a layer on top. Elements opt in with `data-physics` attributes in Twig: `letter`, `block`, `link` and so on, plus their properties (grabbable, hangable, breakable, weight). The engine measures the marked elements and turns them into physics bodies (Matter.js). Adding a page needs Twig only, no game code.

### The physics hooks

An element becomes a body with `data-physics`, and only then. The home page (`templates/home.html.twig`) uses:

| `data-physics` | Used for                                              | Defaults (grabbable, hangable, breakable, weight) |
| -------------- | ----------------------------------------------------- | ------------------------------------------------- |
| `letter`       | One letter of the name, a span holding real text      | yes, no, no, light                                |
| `block`        | A box of content: greeting, role, photo, intro, board | yes, no, no, heavy                                |
| `link`         | A link of the navigation                              | yes, yes, no, medium                              |

A property attribute overrides the kind's default, and only exists on an element that has `data-physics`: `data-grabbable`, `data-hangable` and `data-breakable` take `true` or `false`; `data-weight` takes `light`, `medium` or `heavy`. The page sets `data-breakable="true"` on the photo, the intro and the board, and `data-weight="light"` on the greeting and the role. The engine will take its defaults from this table, so a page states only its exceptions.

Nesting: a body's children are not bodies unless they carry `data-physics` themselves. The board is one block, its counters are not bodies. `tests/Controller/HomeControllerTest.php` fails on an unknown kind or property value, and on a property outside a body; a new kind or property is added there and in this table together.

The name is real text: `h1 > span (word) > span[data-physics=letter]`, with a plain space between the words and no `aria-label` or `aria-hidden`, so assistive technology reads the heading as the name. The `partials/letters.html.twig` partial builds it from any string. Repeated patterns are partials, not Twig macros: TwigStan reports the closures Twig compiles macros into.

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
- **Motor** (`motor/`): carries out the Brain's requests on his body in the physics world, and tells the Look what to show. Built: walk, face, stand, stop, pose, mood, carry, place, drop (below). Jumping, hanging and climbing come with their behaviours.
- **Voice** (`voice/`): draws the lines the Brain puts on the bus, in the speech bubble. Picking them (rotation, cooldown, parameters) is pure and lives in `lines/`.
- **Look** (`look/`): the SVG, written through `data-pose`, `data-mood`, `data-facing`, `data-walking` and `data-state`; the CSS does the rest ([monkey-art.md](monkey-art.md)).

`monkey/` builds the three and wires them to the page; it is the only module that knows all of them.

The Brain and the activities contain no DOM or physics code, so they can be unit-tested with a fake Motor. How they work is in [the behaviour engine](#the-behaviour-engine).

The context they read covers the monkey (grounded, hanging, carrying, cigarette), the scene (danger, broken pieces, gravity), the visitor (last input, what they hold) and the environment (tab visibility, reduced motion, device tier).

Systems communicate through events: `item.freed`, `bomb.placed`, `monkey.hit`, `cig.lost`, `visitor.idle` and so on. The same events go over the network in multiplayer.

## The behaviour engine

The engine every character's behaviour runs on is built. The monkey is on the page with a Motor (`engine.attach('monkey', motor, { speaks: true })`). His behaviours so far: the line reactions (`comments.ts`), a flinch when hit, idle smoking, fleeing a bomb, and the rebuild (below). They read the page's width and his position (`pageWidth`, `monkeyX`, `ports/monkey_world.ts`). Adding an interaction means adding files, never editing the core.

- **Actors.** Each actor (the monkey, later the drone, Naïa, the birds) has its own Brain and its own behaviours. Only what two actors will really share is generic: the Brain, the Motor port, the context, the lines. Only the monkey gets a Voice.
- **A behaviour is one file** in `assets/game/activities/<actor>/`, whose default export declares its actor, kind, priority, the events that can trigger it (`triggers`), `canStart(context)` and `run`, a generator that yields the actor's Motor requests (or `wait(ms)`, which the Brain keeps itself) and is given each outcome. Optional: `weight` (variants), `cooldown`, `resumes`, `lines` (the keys it may say). Its id is its path (`monkey/flinch`). `assets/game/registry/behaviours.ts` finds every such file with an eager `import.meta.glob` (static imports after the build), so the file is registered by existing. A subfolder is for a file's helpers.

  ```ts
  // activities/monkey/flinch.ts
  export default defineBehaviour<MonkeyRequest>({
    actor: 'monkey',
    kind: 'reflex',
    priority: 10,
    triggers: ['monkey.hit'],
    canStart: ({ trigger }) => trigger?.name === 'monkey.hit',
    lines: ['hurt'],
    *run(_context, act) {
      act.say('hurt');
      yield { type: 'mood', mood: 'scared', ms: 900 };
    },
  });
  ```

- **A pure line reaction is data**, in the same folder (`activities/monkey/comments.ts`): a list of `{ actor, on, line, where?, when?, params?, priority?, weight?, cooldown?, force? }`. `where` and `when` are conditions on the event's payload and on the context fields (a value, or a list of values; a field that is absent never matches). The most specific reaction wins by priority.

  ```ts
  export default defineReactions([
    { actor: 'monkey', on: 'item.grabbed', line: 'grab' },
    {
      actor: 'monkey',
      on: 'item.grabbed',
      where: { kind: 'letter' },
      line: 'letter',
      priority: 1,
    },
  ]);
  ```

- **What the Brain does** (`brain/`). An event starts at most one behaviour of each kind: the highest priority among those that can start (not running, off cooldown, `canStart` true); equals are drawn by weight, which is how variants of one behaviour are written. Then by kind:
  - a reflex runs on the Motor's overlay layer, on top of the body, and never stops the activity;
  - a line runs beside everything and can only say (and wait);
  - an activity takes the body if it is free or held by an ambient behaviour, interrupts a weaker activity, and otherwise waits its turn (by priority, then order; `canStart` is asked again when its turn comes);
  - an interrupted activity that `resumes` goes on when the stronger one ends, from the request it was in (asked again), before waiting ones of lower priority; the others are dropped;
  - an ambient behaviour fills idle time (5 s after the body frees, or on its own event when idle) and always gives way, never resumed.

  - **The rebuild** is four activities and a reflex, sharing `activities/monkey/rebuild/tidy.ts` (carry the broken pieces home nearest first, reading them again before each, and skip one he cannot carry or place): `rebuild` (priority 50, on `rebuild.requested`, at a run, resumes after a flee), `hurry` (the same when a lazy rebuild is on), `lazy_rebuild` (40, on `visitor.idle`, 15 s after the visitor's last press or key: walking pace, a rest and a grumble after every second piece), `lazy_stop` (60, a grab during a lazy rebuild) and `wrecked` (a reflex: a piece freed within 10 s of one put home). They read `loosePieces` (`ports/monkey_pieces.ts`) and `running` and `restoredAt` (`ports/monkey_activity.ts`) from the context; `Game.rebuild()` emits the request, and the last piece home wipes the scorch marks.

  A behaviour that throws, or whose Motor throws, ends as `failed` and is reported (`console.error` in the game): the game goes on. The Brain's own events are `behaviour.started` and `behaviour.ended` on the bus.

- **The Motor port** (`ports/motor.ts`): `perform(request, done, layer)` returns a cancellable task; `done` is called once with `done` or `failed`. `ports/fake_motor.ts` scripts it request by request in tests (`finish`), so a behaviour is unit-tested as a sequence; with a clock it completes each request after a moment, which stands in for an actor whose Motor is not built.
- **The context** is the world as a behaviour reads it: the actor, the game time, the trigger (event name and payload) and the fields of the _context sources_ the Brain was given (`reducedMotion` today). A source reads some fields; adding a field (time of day, patience) is a module augmentation of `ContextFields` next to the function that reads it, plus a line where the game lists its sources, and changes nothing in `brain/`. A field no source gives is absent, so a condition on it fails closed.
- **Cooldowns and variants** are per behaviour (`cooldown`, from its start; `weight`).

### Lines

The lines are data: `translations/lines+intl-icu.{fr,en}.yaml`, the single source, in the `lines` translation domain (ICU MessageFormat). A key is a pool, a YAML list drawn in turn (`grab.0`, `grab.1`... once flattened) or a single string. `tests/TranslationsTest.php` checks the two languages have the same keys.

- **Delivery.** `App\Game\LineBook` groups the current locale's catalogue into pools, `game_lines(app.locale)` (a Twig function) renders it as JSON in `data-game-lines-value` on the game's element, and the Stimulus controller hands it to `startGame`. The page carries its own language only, in the first response, with no request to make and nothing to build.
- **Speaking.** `lines/speaker.ts`: one Speaker per voiced actor draws each pool in turn, never closer than 1.7 s to the previous line (`force` plays regardless), and formats the message with the parameters of the call. `lines/format.ts` reads the ICU subset the lines need: `{name}`, `{n, plural, ...}` with `#`, `{kind, select, ...}`, nested, with ICU's apostrophe rules. Anything else is refused. The Brain puts the result on the bus as `line.said`; the Voice (later) draws it.
- **Checks.** `tests/assets/game/registry/consistency.test.ts` fails when a behaviour or reaction says a key either catalogue lacks, or listens to an event nothing in the game emits.

### The director panel

A development panel (`assets/game/director/`): it fires any event on the bus (a form with a sample payload per event), starts any registered behaviour of any actor (by the usual rules of priority, ignoring `canStart` and cooldown), and shows each actor's current behaviour and the last 40 events. An actor without a Motor gets a `FakeMotor` and a voice there, so the Brains can be exercised before the Motors exist. An actor that has a Motor and a list of sample requests (`director/samples.ts`, the monkey's) also gets a form that sends one request straight to its Motor, on either layer, and says how it ended: the Brain is bypassed, so a body can be tried without a behaviour. A `line.said` fired from the event form shows in his bubble. Events it fires carry the origin `director` (the second argument of `emit`, the second of a listener): the future counters and the network ignore that origin. Only the Stimulus controller loads it, behind `import.meta.env.DEV`, so a production build contains neither the panel, its style nor the fake Motor: checked on the build output.

## The monkey's body

- **The markup is made by the game**, from `look/monkey.svg` (a Vite `?raw` import), and put in the scene next to the content, outside what the shake moves. A page needs no partial and no game code, the static page carries nothing of him, and `stop()` removes him. He is `aria-hidden`: he is no content. The bubble is a `role="status"`, polite `<p>` that is in the scene from the start and only changes text, so a screen reader announces each line.
- **The body** (`physics/monkey_body.ts`, inside the world): the prototype's 40 by 70 chamfered rectangle (friction 0.8, restitution 0.15), colliding with the ground, the walls, loose pieces and bombs, and standing on pinned ones: a pinned piece is freed by his fall only above 9 px per step (2.2 for any other body). He is on his feet when he is not falling or rising and either his soles are within 6 px of the floor or a contact under him pushes mostly upward (a piece he stands on, not one he bumps or leans on): a slow body in the air, as at the top of a hop, is not grounded. He walks by velocity (3 px per step, 6.5 running), hops when 23 steps in a row got him no further, and is `blocked` after three such hops. Upright again: the angle by a fifth and the spin by three tenths each step on his feet, by 3% in the air. A bomb within 1.15 times its radius throws him, never by less than 0.45 of its strength; a piece he carries is out of the simulation and no blast, gravity change or tornado moves it.
- **The hand takes him like a piece**: the pick hook answers the id `MONKEY` (-1), the spring is the same, a release is capped at 26 px per step (32 for a piece). The input listens on the scene, not on the content, so a press on him reaches it.
- **Events:** `monkey.grabbed`, `monkey.dropped` (let go below 4 px per step), `monkey.thrown` (from 4), `monkey.landed` (back on his feet after 6 steps in the air or more; `speed` is the fastest he came down) and `monkey.hit` (a loose piece or bomb at 7 px per step, the floor or a pinned piece from 10: a fall means the same thing everywhere). A piece that hits him also emits `item.hit` against `monkey`.
- **The Motor's requests** (`ports/monkey.ts`, so that behaviours can type theirs without importing `motor/`): `walk {x, pace?}`, `face {direction}`, `stand`, `stop`, `pose {pose, ms?}`, `mood {mood, ms?}`, `carry {piece, pace?}`, `place {piece, pace?}` and `drop`. Poses: `stand`, `smoke`, `talk`, plus `carry` and `tumble`, which follow the body (tumbling: sent flying faster than a hop, until he has stood 10 steps). Walking is the legs, whatever the pose. With `ms`, a pose or mood lasts that long, then the usual comes back; without, it stays until another is set. On the overlay layer `pose` and `mood` need `ms` (an overlay must end) and nothing else is accepted; the last overlay of each kind shows, over the body's own pose. A line makes him talk, as an overlay, for as long as it is up.
- **Carrying:** `carry` walks to the piece's side (he would push it from its middle), takes it (it leaves the simulation, colliding with nothing) and lifts it overhead in 0.25 s; `place` walks to its home, throws it in an arc over 0.3 s and restores it. A request that cannot be done (a pinned, held or taken piece, a blocked way, hands full, an unknown type) is `failed` at once; the page measured again makes the piece not his any more. A body request that comes while another is pending cuts it and answers it `failed`; one the Brain cancelled first is not answered. A carry or place cut short leaves the piece overhead, not half way. `place` answers `done` with his hands free before the piece is restored and `item.restored` fires, so a behaviour reading the piece from the answer still finds it taken.
- **Reduced motion:** the walk cycle, the breathing, the smoke, the blinks and the eyes following the pointer are off; positions and poses stay.
- **The loop:** a request that needs a frame each time (walk, stand, carry, place) keeps it awake; a timed pose or an overlay is a game timer, which the sleeping loop already waits for.

## The physics layer

`assets/controllers/game_controller.ts` waits for the first paint and the fonts, imports `assets/game/game.ts` dynamically and calls `startGame(element)`; disconnecting calls `stop()`, which gives the page back as the server rendered it. The page is read and written in page coordinates: CSS pixels from the top left of the document, the box on screen plus the scroll, so the screen's pixel density never enters.

- **Bodies:** every `[data-physics]` element becomes a Matter body at its measured box, pinned (static) like the prototype's. A hard enough impact frees it: a body striking it faster than 2.2 px per step. A freed piece's transform is written back each frame; `data-state` (`pinned`, `loose`, `held`) is the CSS hook. The floor is the top of the element marked `data-ground` (the page's bottom when there is none); the side walls are the page's edges and the ceiling its top.
- **The hand:** pointer events. A mouse takes a piece once it moves 4 px (a bare click must not free a link and let it fall); a touch takes it after a 450 ms press and a swipe past 10 px before that is left to the browser to scroll. The piece hangs from a spring at the point it was taken by, and is thrown at the pointer's own velocity over the last 100 ms, capped at 32 px per step. The click that ends a mouse or pen drag is swallowed (only within 50 ms of the release, so a keyboard click later is untouched), so a thrown link is not followed; a plain click is untouched.
- **Effects,** the API the dock calls (`Game`): `bomb(at)`, `tornado(at)`, `setZeroGravity(on)`, `restore(id)` (a piece back home, pinned) and `clearScorches()`. A bomb burns 1.5 s of game time (five at most), then pushes everything within 30% of the page width (220 to 340 px) and leaves a scorch mark and a short shake; a tornado sweeps for 5.2 s and drifts after the pointer; zero gravity frees every piece and sets it floating.
- **Events,** typed in `assets/game/events/game_events.d.ts`: `item.freed` (with its cause), `item.grabbed`, `item.dropped`, `item.thrown`, `item.hit` (relative speed of 7 px per step or more), `item.restored`, `bomb.placed`, `bomb.exploded`, `tornado.started`, `tornado.ended`, `gravity.changed`.
- **The loop** runs only while something moves: a held piece, a pending bomb or tornado, a long press, a resize, or bodies not yet still for 30 steps in a row. Any input wakes it; a hidden tab stops it. Zero gravity alone does not keep it running once everything rests against the ceiling. The physics steps at a fixed 60 Hz and owes at most 50 ms of backlog.
- **Reduced motion** turns the tornado and the shake off; bombs still blow, and pieces answer the hand.

## Lifecycle and memory

- A hidden tab stops everything: the loop, the physics and the timers. After about 30 seconds hidden, the Mercure connection closes too.
- After long inactivity the monkey goes to bed. Once the scene is still, the loop stops completely and the page costs almost no CPU. The next input wakes him up.
- Everything time-based goes through one game clock: no scattered `setTimeout`. Listeners are attached through an `AbortController`: an ESLint rule fails a game `addEventListener` without `{ signal }`. Particles, bombs and speech bubbles all have hard limits.

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
- **The physics hooks are a kind plus overrides, not a flag per property.** `data-physics` names what the element is, and the engine owns the defaults, so Twig stays one attribute in the common case and the numbers can change without touching a page. Rejected: stating every property on every element, which repeats the table in each template. Values are validated by a test on the rendered page rather than by a Twig function, because the test also catches an attribute typed by hand.
- **Letters are nested spans of real text.** Rejected: an `aria-label` on the h1 with `aria-hidden` letters (the prototype), which keeps the name out of the readable text and relies on the label alone. The trade-off: a screen reader in browse mode may still pause between inline spans.
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
- **The CSS layers are files in `assets/styles/`, and Stylelint enforces the conventions.** `app.css` fixes the layer order and imports each file into its layer: `reset.css` and `elements.css` (reset, element selectors, no class), `tokens.css` (the only place for a raw colour, length or font), `composition.css` (`l-` classes), `utilities.css` (`u-` classes) and `blocks/*.css` (plain kebab-case classes, no BEM). State is a data attribute, in `exceptions.css` once a piece needs one: no `is-` or `has-` class and no ARIA selector. Colours, spacing, radii and type sizes come from the tokens, and no selector uses an ID. `config/tools/stylelint.config.ts` holds the rules, `tests/stylelint/rules.ts` proves each can fail, and `config/tools/browserslist` is Vite's target, which that test compares with what Vite resolves. Consequence: `:has()` and anything else newer than the target is a lint error, except nesting, which Vite lowers for the target. Baloo 2 comes from `@fontsource/baloo-2` (SIL OFL 1.1, whose licence file ships in the package): its latin subset covers French and English, in woff2 only, weights 400 to 800.
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
- **Game layer folders, enforced by ESLint and `tsc`.** `assets/game/` holds one folder per module: `brain`, `activities`, `motor`, `voice`, `look`, `monkey`, `physics`, `events`, `clock`, `frame`, `ports`, `lines`, `registry`, `director`, `input` (pointer events) and `page` (reading and writing the DOM), plus the entry `game.ts`. `config/tools/eslint.architecture.ts` keys its rules on these names, and `tests/eslint/architecture.ts` proves each rule can fail. Only `frame` may use raw timers, `performance`, `Date` or `queueMicrotask`; `matter-js` is importable in `physics` only (an allowlist, deep and dynamic imports included); the game never imports the Stimulus controllers or uses a dynamic `import()`, which would skip these rules; only `registry/behaviours.ts` calls `import.meta.glob`, and no game module imports `director`. Imports are matched by their text, not resolved: it only matters if a file is named after another layer.
- **`brain`, `activities`, `ports`, `lines`, `clock` and `events` compile without the DOM lib** (`config/tools/tsconfig.game.json`), and `brain`, `activities`, `ports` and `lines` import none of `physics`, `look`, `motor`, `voice`, `monkey` or `frame`. The compiler is the one check that cannot miss a DOM global or type, which a list of names in ESLint would. Voice is banned because it draws DOM speech bubbles: the Brain emits lines on the events bus.
- **A `ports` folder holds the interfaces the Brain and activities depend on** (the Motor's first). They cannot import `motor`, so a fake can replace it in unit tests, as above; the implementations in `motor` satisfy the ports.
- **`clock` and `events` are pure, and import no other game module.** Every module uses them, so any import back would create a cycle. The clock advances through `tick(elapsed)` and the bus is a plain typed emitter, not an `EventTarget`, because the no-DOM project compiles everything the Brain imports.
- **One `frame` module owns the browser's loop.** It calls `requestAnimationFrame` and `performance.now` and pushes the elapsed time into the clock. So the Brain, the activities, the clock and the bus run and test in plain Node under a fake time, and only the driver touches the browser.
- **TypeScript stays on 6.0 for now.** typescript-eslint needs the TypeScript JavaScript API, which 7 no longer ships, and pnpm 12 can only alias a peer dependency from `pnpm-workspace.yaml`, which the Docker build would then have to copy. Dependabot ignores the major bump.
- **Vitest and Stryker test the TypeScript, as Pest and its mutation testing do the PHP.** Tests mirror the sources (`tests/assets/game/clock/clock.test.ts` for `assets/game/clock/clock.ts`), which `make layout` enforces, except for the Vite entry. The pure game modules (listed once in `config/tools/game-modules.ts`) run in plain Node, and every other test in happy-dom. `make check` mutation-tests the TypeScript changed since `origin/main`, CI all of it, and every mutation must be caught. Rejected: Jest, which needs a transform for ESM TypeScript that Vitest gets from Vite; jsdom, heavier than happy-dom for the little DOM the controllers use.
- **The clock's time moves at the end of a step.** `tick` adds the clamped step to `now()` first, then runs the callbacks due by then in due order (ties in scheduling order), so a callback reads the time of the end of the step. A callback scheduled during a tick waits for the next tick even when its delay is 0 or already passed, so callbacks cannot loop within a tick. A callback that throws leaves the later due ones queued for the next tick. A negative, infinite or NaN `elapsed` or `delay` is a `RangeError`, and so is a `maxStep` that is not above 0: a silent NaN would stop the game's time for good.
- **The events bus delivers to a snapshot.** A listener removed during an emit is still called by that emit, one added is not. A nested emit is delivered completely before the outer one goes on. Events are named in one `Events` interface per bus (name to payload; an interface, since a `Record` index signature would accept any name), so an event cannot be misspelled or emitted with the wrong payload. A listener is one subscription per function and event: subscribing it twice changes nothing, and any of its unsubscribe functions removes it.
- **The physics is a world of pinned pieces, not a canvas.** Pieces stay real elements, moved by a transform, so the page stays readable and selectable until the game starts. Rejected: drawing the content on a canvas, which loses text, SEO and accessibility. `matter-js` is pinned at 0.20.0 (the latest stable release) with `@types/matter-js` 0.20.2.
- **The hand is our own spring, not Matter's `MouseConstraint`.** `MouseConstraint` reads a canvas element and knows nothing of scroll, long presses or links; ours takes page coordinates from pointer events and the prototype's spring (stiffness 0.14, damping 0.08), and throws at the pointer's velocity rather than the body's, which lags behind it.
- **A press frees nothing, a move does.** Taking a piece at the press made a click on a link free it and fall. The trade-off: a mouse held still on a piece does nothing until it moves 4 px.
- **The loop stops when the page is still.** A body counts as still below 0.2 px per step and 0.02 rad per step, and the world rests after 30 such steps in a row: a piece at the top of a throw is still for one step only. Held pieces, pending bombs and a tornado keep it running; floating pieces count as moving until they rest against the ceiling.
- **One tornado at a time, five bombs at a time.** A second tornado while one runs is ignored rather than restarted, so `tornado.started` and `tornado.ended` always pair up.
- **Differences from the prototype.** The ceiling is the top of the page, not 500 px above it, so zero gravity keeps pieces in view. The floor's friction is not set: Matter gives a static body a friction of 1 whatever it is told, so the prototype's 0.9 never applied. A resize rebuilds the world when the width or the measured floor changed (a real resize: the scene is `100svh` high, so a phone's toolbar never moves the ground; a resize back to the built layout cancels a rebuild already scheduled); it drops what is loose, held or pending and cancels fuses with `bomb.cancelled`. Rejected: ignoring height-only resizes, which left the floor stale on orientation changes and desktop window resizes. Not ported yet: the bomb's fuse and flash, the tornado's drawing and the particles, which belong to the effects layer with the monkey.
- **Hooks the page provides.** `data-ground` is on the ground strip in `base.html.twig`. The state styles are in `exceptions.css`: letters as inline-block (a transform ignores an inline box), `[data-state]` cursors and raised z-index when held, `touch-action: manipulation` (pinch-zoom stays), no text selection or callout once the game has set a state, and `[data-scorch]` between the ground and the content. The name's words never wrap between letters. Scorch marks are absolutely positioned children of the ground's parent (the scene, which the shake does not move), so it must sit at the page's top left. The shake is a `translate` on the game's element, decaying by game time (0.86 per 60 Hz step), which becomes the containing block of any `position: fixed` descendant while it shakes.
- **Behaviours are files found by a glob, not a list.** `registry/behaviours.ts` reads `activities/*/*.ts` with an eager `import.meta.glob`, which Vite turns into static imports: it is not a dynamic `import()`, so the ban stands, but the pattern skips the boundary rules, so the lint rule lets only that file call `import.meta.glob` (and `tests/eslint/architecture.ts` proves it). The id is the path and the actor must be the folder's name, so ids cannot clash and a copied file cannot register under the wrong actor. Rejected: a registry array to edit (the core changes with every behaviour, the prototype's problem) and a decorator or side-effect `register()` call (order and double registration).
- **One Brain per actor, generic only where actors share.** The Brain, the Motor port, the context and the lines are written once and instantiated per actor; the requests a Motor understands are each actor's own, so the monkey's `walkTo` is not a drone's. A voice is optional per actor. Rejected: one global Brain with a table of actors (a shared queue would make the drone wait for the monkey) and a base class per actor (nothing to share but the engine).
- **Activities wait, interrupt or resume by priority; reflexes overlay; ambient gives way.** Equal priority waits: a running activity is never cut for an equal one. A cut activity resumes only if it says so (`resumes`), from the request it was in, which is asked again, with the generator's own state intact; the others are dropped, since an activity written as a sequence can't be told where to restart. `canStart` is asked again when a waiting activity gets its turn (the world has changed), not for a resumed one (it is the same activity).
- **A behaviour that throws is reported, not raised.** The Brain ends it as `failed` and keeps playing: a typo in one line must not stop the physics loop. A generator cut from inside its own run (a listener of `line.said` interrupting the behaviour that said it) is closed when it next yields, since a running generator can't be closed.
- **Variants are weights, not a concept.** Behaviours of equal priority that the same event can start are drawn by `weight`. Rejected: a `variantOf` group (a second way to say the same thing).
- **The context is open: sources and module augmentation.** The Brain merges the fields its sources give and the fields are typed by augmenting `ContextFields`, so a time of day or a patience level is a new file and a line of wiring. Rejected: a fixed context object (every field a core change) and a string-keyed bag (untyped conditions).
- **Conditions of a reaction are data (`where`, `when`), parameters and the rest are code.** Equality or one-of on primitive fields covers the prototype's cases (a letter, a link) with no function; a `params` function reads the context for an ICU message. Rejected: a condition mini-language (more to parse than the three conditions ever written).
- **The lines are one catalogue in a `lines` domain, rendered by Twig.** One file per language, so the parity test and the editors' tooling apply, in the ICU domain (`lines+intl-icu`) so the messages are the same on the server and in the client. Delivered in the page as a `data-` attribute (a Stimulus value) of the game's element: no second request, no loading state, cached with the page, only the current language. Rejected: a JSON endpoint (a request after the first paint, and a state where the monkey has nothing to say), a Vite step that bundles both languages (every visitor downloads both, and the build would read the translator's files) and a third-party i18n library (the page makes no third-party request; a small own formatter is enough for `{name}`, plural and select).
- **A small ICU formatter of our own, with a strict subset.** `formatLine` is under 200 lines and refuses what it does not know, rather than shipping a library for three constructs. The risk is the server's translator and the client reading a message differently: the subset is their common ground, and a construct outside it throws when the line is said (reported, the behaviour fails) instead of rendering wrong.
- **Speech is rotation plus a cooldown, per speaker.** A pool is drawn in turn (the prototype's counter), a held-back line does not use its turn, and 1.7 s separates two lines of one speaker unless the line forces itself. The cooldown is the Speaker's, not the behaviour's, so every source of lines shares it.
- **The bus carries an origin.** `emit(name, payload, origin = 'game')` and listeners get `(payload, origin)`; the director marks its events `director`. The "local only" rule of the panel (nothing counted, nothing sent) is then one check in the listeners that count or send. Rejected: a second bus for the panel (the Brain would have to listen to both) and a field in every payload.
- **The director panel is loaded by the controller, behind `import.meta.env.DEV`.** The game can't import it (that would put it in the bundle) nor use a dynamic `import()`; the Stimulus controller is outside that ban, and the build removes the dead branch with its import, so there is nothing to strip afterwards. A lint rule keeps game modules from importing it. Checked on the production build (no panel string, no panel CSS), not only in a test.
- **Development gives actors without a Motor a fake one.** Until the real Motors exist, the panel attaches a `FakeMotor` that finishes each request after 400 ms of game time, so every Brain can be driven from the panel; in production an actor without a Motor simply takes no part.
- **Tests that read the repository.** The consistency test reads the translations and walks the syntax tree of `assets/game` (the development panel apart) for calls of `emit` or `#emit` with a literal name. A scan finds "nothing emits this event" without a list to maintain, and misses an event emitted under a name built at run time (none exists: `emit` takes the typed event names). Mutation testing runs the tests in a copy of the sources whose strings are instrumented, so the scan reads the real tree.
- **The loop sleeps through game timers.** The game clock only moves with the loop, so a timer pending when the loop stops (a behaviour's idle time) would never fire. `Clock.next()` says when the next one is due; when the loop goes idle with one pending, the frame driver sets one real timeout for it, carries the clock to that time and wakes the loop. A wake for any other reason, a hidden tab or a stop clears it. A pending timer does not count as busy, so a still page costs one wake per timer, not a running loop. The trade-off: while asleep, game time follows the wall clock instead of being capped at 250 ms a step, which is the point.
- **A cut activity's Motor task is cancelled even when the cut comes from inside `perform`.** A Motor may emit an event while starting a request; if that starts a stronger activity, the Brain cancels the task it gets back, since nothing else holds it. A request that never ends keeps the Brain busy but not the loop awake: only a Motor's frame-driven work (`busy`) does, and the Brain's timed poses, moods and `wait`s are game timers the sleeping loop wakes for.
- **The monkey is made by the game, not by Twig.** A Twig partial would put kilobytes of SVG in every response, need a state to hide it and leave every page to include it. The game builds him from `look/monkey.svg` when it starts and removes him when it stops. Rejected: the partial.
- **A reserved id, not a piece.** The hand names him `MONKEY` (-1) and the world holds his body apart from the pieces, with his own events: he is no `data-physics` element, and a piece's events (`item.*`) would mean pieces. Rejected: wrapping him as a piece kind.
- **Walking is not a pose.** A carrying monkey also steps, so the legs are `data-walking` and the upper body `data-pose`. The workbench's classes became data attributes; its `.zippo` and the states v1 does not need are left for their behaviours.
- **Tumbling is the body's turn.** The workbench's tumble spun the art; in the scene the body already rotates, so only the limbs flail.
- **Progress is getting further.** "Stuck" counts a step that did not take him further than he had been (pushed back and forth against a wall gains nothing), not a step that did not move him; a first version that reset on any movement never gave up.
- **A request ends with its own outcome, a cut one with none.** A request that cannot be done fails at once (the first step runs inside `perform`); one cut short is not stepped again and undoes what it started (halts him, gives the pose back). `stop` and `stand` rely on that: the request they replace has halted him.
- **The art's lengths are drawing coordinates, and needed no Stylelint override**: the length rule only covers spacing, insets and custom properties, so the art's `transform-origin` and keyframes pass as written.
- **Not done yet:** the tornado does not take him, and he has no cigarette arc, hanging, climbing or special forms.
