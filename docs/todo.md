# To do

Committed work only. Add what comes up, delete what is done. Undecided ideas live in [ideas.md](ideas.md).

## Going live

- Read the compose files from the pulled image instead of the SSH caller, so the deploy key stops being root-equivalent.
- Preserve IPv6 client addresses (`enable_ipv6` on the Compose network), then publish an AAAA record.
- Content-Security-Policy: it must account for the Vite dev client (HMR, inline preamble) and any future inline script or style, so it is its own item. The other security headers are in place; they are deferred, so they overwrite a CSP the app sets.
- Make `main` the GitHub default branch, so Dependabot runs on it.
- Remove the `claude` user and its sudo rule from the VPS once the deploy user exists.
- The DNS zone says the domain sends no mail (SPF `-all`, DMARC `p=reject`); `contact@` only receives, through OVH's redirect. Before anything sends as `contact@erpeldinger.fr` (a contact form, Gmail's "send as"), add that sender to SPF and set up DKIM.

## Foundations

- Add the licence file (MIT for the code, the illustrations excepted), and set `license` to MIT in composer.json and package.json (composer.json says `proprietary`).
- `composer audit` and `pnpm audit` in CI: `pnpm audit --prod` with an audit level, an ignore list whose entries expire, and an explicit Composer `audit.abandoned` policy, so one unfixable advisory can't block every deploy.
- A performance budget in CI: a first-load JavaScript size cap and a load-time target, with the numbers set from the first real build.
- End-to-end tests with Playwright (decided earlier: the official image, against the built assets), then accessibility checks in CI: axe-core on every page (zero violations), a keyboard-only test of every game action, and contrast checked for each time-of-day palette.
- Enforce "no user-facing literal in a template" with a twig-cs-fixer or TwigStan rule.
- On the next Pest upgrade, check whether `--no-tia` now reaches the parallel workers. If it does, the Makefile can pass it in worktrees again instead of the `.git` guard in tests/Pest.php.

## Content

- Launch blocker, with the allowlist removal: replace the photo and intro placeholders on the home page (`home.photo`, `home.intro` in both catalogues) with the real portrait and text, so the owner notes never ship publicly.
- Wire the board's counters to the live values (the live board item below); they render an em dash until then, which has no accessible value. When the board lands, give each counter a spoken value: the dash `aria-hidden` plus visually hidden text, with the `u-visually-hidden` utility.
- Make the physics-hook values a single source for the engine and the test once the engine reads them, instead of the table in docs and the lists in `HomeControllerTest`.

## Game layer

- Unit tests for the Brain and activities, with a fake Motor, as they are written (Vitest and Stryker are in `make check`).
- Known gap in the architecture rules: nothing yet enforces listeners attached through an `AbortController` (see [architecture.md](architecture.md), Lifecycle and memory). Write the ESLint rule with the first listener.
- Move to TypeScript 7 once typescript-eslint supports it (it needs the JavaScript API that 7 no longer ships): `tsc` is pinned to 6.0 until then.
- The first version ([interactions.md](interactions.md), Scope), in this order: the CSS foundation and the physics in parallel, then the behaviour engine (Brain, one file per behaviour, lines as data, the director panel), the monkey's Motor, Look and Voice, then his behaviours and the dock.
- Then port the prototype's other behaviours to the activity system described in [architecture.md](architecture.md): the cigarette arc, hanging and climbing.
- Device tiers: feature checks, the frame-rate probe, and the static fallback, its message rendered by Twig and hidden by the bundle once the checks pass.
- The live board: site-wide action counters in SQLite on a volume, pushed to the page through FrankenPHP's Mercure hub, which the trimmed template doesn't configure yet (the `mercure` directive in the Caddyfile, its JWT keys in deploy.env, a volume in compose.prod.yaml). Nothing personal is stored.
- Lifecycle: stop on a hidden tab, the bed after long inactivity, a full stop once the scene is still.

## Multiplayer

- Load-test Mercure on the VPS with simulated sessions before relying on capacity numbers.
