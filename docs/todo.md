# To do

Committed work only. Add what comes up, delete what is done. Undecided ideas live in [ideas.md](ideas.md).

## Going live

- Read the compose files from the pulled image instead of the SSH caller, so the deploy key stops being root-equivalent.
- Preserve IPv6 client addresses (`enable_ipv6` on the Compose network), then publish an AAAA record.
- Content-Security-Policy: it must account for the Vite dev client (HMR, inline preamble) and any future inline script or style, so it is its own item. The other security headers are in place; they are deferred, so they overwrite a CSP the app sets.
- Remove the `claude` user and its sudo rule from the VPS once the deploy user exists.
- The DNS zone says the domain sends no mail (SPF `-all`, DMARC `p=reject`); `contact@` only receives, through OVH's redirect. Before anything sends as `contact@erpeldinger.fr` (a contact form, Gmail's "send as"), add that sender to SPF and set up DKIM.

## Foundations

- Add the licence file (MIT for the code, the illustrations excepted), and set `license` to MIT in composer.json and package.json (composer.json says `proprietary`).
- `composer audit` and `pnpm audit` in CI: `pnpm audit --prod` with an audit level, an ignore list whose entries expire, and an explicit Composer `audit.abandoned` policy, so one unfixable advisory can't block every deploy.
- A performance budget in CI: a first-load JavaScript size cap and a load-time target, with the numbers set from the first real build.
- End-to-end tests with Playwright (decided earlier: the official image, against the built assets), then accessibility checks in CI: axe-core on every page (zero violations), a keyboard-only test of every game action, and contrast checked for each time-of-day palette.
- In those Playwright tests, a layout check at 320 px: the name never wraps inside a word or overflows the page.
- Enforce "no user-facing literal in a template" with a twig-cs-fixer or TwigStan rule.
- On the next Pest upgrade, check whether `--no-tia` now reaches the parallel workers. If it does, the Makefile can pass it in worktrees again instead of the `.git` guard in tests/Pest.php.

## Content

- Launch blocker, with the allowlist removal: replace the photo and intro placeholders on the home page (`home.photo`, `home.intro` in both catalogues) with the real portrait and text, so the owner notes never ship publicly.
- Wire the board's counters to the live values (the live board item below); they render an em dash until then, which has no accessible value. When the board lands, give each counter a spoken value: the dash `aria-hidden` plus visually hidden text, with the `u-visually-hidden` utility.
- Make the physics-hook values a single source: the engine now reads them from `assets/game/physics/kinds.ts`, while `HomeControllerTest` and the table in docs repeat them.

## Game layer

- Every behaviour and reaction comes with its Vitest test, written as a sequence on the `FakeMotor` (`ports/fake_motor.ts`), and its lines in both catalogues; `make check` fails otherwise.
- Move to TypeScript 7 once typescript-eslint supports it (it needs the JavaScript API that 7 no longer ships): `tsc` is pinned to 6.0 until then.
- The first version ([interactions.md](interactions.md), Scope), in this order: the CSS foundation, the physics, the behaviour engine and the monkey's Motor, Look and Voice and his first behaviours (idle smoking, the line reactions, the flinch, fleeing a bomb) the rebuild (hurried, lazy, wrecked) and the dock are done; the `boardGrab` line waits for the board.
- Counters and the network must ignore events whose origin is `director` (the bus passes it to listeners), when the live board lands.
- Then port the prototype's other behaviours to the activity system described in [architecture.md](architecture.md): the cigarette arc, hanging and climbing.
- Device tiers: feature checks, the frame-rate probe, and the static fallback, its message rendered by Twig and hidden by the bundle once the checks pass.
- The live board: site-wide action counters in SQLite on a volume, pushed to the page through FrankenPHP's Mercure hub, which the trimmed template doesn't configure yet (the `mercure` directive in the Caddyfile, its JWT keys in deploy.env, a volume in compose.prod.yaml). Nothing personal is stored.
- Lifecycle: the bed after long inactivity (the loop already stops on a hidden tab and once the scene is still).
- Effects layer: draw the bomb and its fuse, the blast's flash and particles, and the tornado, which the physics only simulates. Needs a canvas or DOM layer that follows the scroll, off under reduced motion.
- WCAG 2.5.7: the dock already offers every tool and Rebuild as buttons, and Bomb and Tornado fire from the keyboard; what is missing is a way to move a piece without dragging it (the physics exposes `restore`, but nothing moves a piece elsewhere).
- The page's side of the physics (see [architecture.md](architecture.md), Decisions, "Hooks the page provides"): check on a real touch device that a long press on a piece neither selects text nor opens the callout.
- Measure the page again when a layout shift moves the pieces without changing the width (a late font, a loaded image): today only a new width does.

- Check the monkey in a real browser (the agent that built him could not open the page): his look at 72 px next to the content, a throw, a walk from the director panel, his bubble at the viewport's edges, a touch long press on him.
- The rebuild is missing what needs other work: the ghost outline of each piece's home (effects layer), his coming back when he is away (the tornado, hanging), and the proud mood at the end (a timed mood on the body would hold it and drop a second press).
- Jump and climb behaviours: measure whether a running hop that lands on a pinned piece exceeds the 9 px per step that frees it (and the 10 that counts as a hit).
- The tornado does not take the monkey yet, and he does not flee it: add both with the tornado's behaviour.
- A walk that fails when he is blocked leaves the behaviour to decide (go round, jump, give up): the first behaviours decide.

## Multiplayer

- Load-test Mercure on the VPS with simulated sessions before relying on capacity numbers.
