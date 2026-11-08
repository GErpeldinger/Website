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

- Self-host the fonts (subsetted woff2 through Vite) when the CSS foundation lands.
- Keep Vite's default `baseline-widely-available` build target, and give Stylelint and the CSS checks the matching browserslist.
- Add the licence file (MIT for the code, the illustrations excepted), and set `license` to MIT in composer.json and package.json (composer.json says `proprietary`).
- `composer audit` and `pnpm audit` in CI: `pnpm audit --prod` with an audit level, an ignore list whose entries expire, and an explicit Composer `audit.abandoned` policy, so one unfixable advisory can't block every deploy.
- A performance budget in CI: a first-load JavaScript size cap and a load-time target, with the numbers set from the first real build.
- End-to-end tests with Playwright (decided earlier: the official image, against the built assets), then accessibility checks in CI: axe-core on every page (zero violations), a keyboard-only test of every game action, and contrast checked for each time-of-day palette.
- The CSS foundation once the visual direction is chosen: the design tokens from it, the CUBE layers, and Stylelint in `make check` enforcing them (class names per layer, no IDs, state only through data attributes, colours and spacing only from the tokens).
- FR/EN: `/fr/` and `/en/` routes, `/` redirecting by `Accept-Language` (302, with `Vary: Accept-Language`), `hreflang` links including `x-default` to `/`, canonical links, and a check that fails on a missing translation.
- On the next Pest upgrade, check whether `--no-tia` now reaches the parallel workers. If it does, the Makefile can pass it in worktrees again instead of the `.git` guard in tests/Pest.php.

## Game layer

- Unit tests for the Brain and activities, with a fake Motor, as they are written (Vitest and Stryker are in `make check`).
- Known gap in the architecture rules: nothing yet enforces listeners attached through an `AbortController` (see [architecture.md](architecture.md), Lifecycle and memory). Write the ESLint rule with the first listener.
- Move to TypeScript 7 once typescript-eslint supports it (it needs the JavaScript API that 7 no longer ships): `tsc` is pinned to 6.0 until then.
- Port the prototype's behaviours to the activity system described in [architecture.md](architecture.md).
- Device tiers: feature checks, the frame-rate probe, and the static fallback, its message rendered by Twig and hidden by the bundle once the checks pass.
- The live board: site-wide action counters in SQLite on a volume, pushed to the page through FrankenPHP's Mercure hub, which the trimmed template doesn't configure yet (the `mercure` directive in the Caddyfile, its JWT keys in deploy.env, a volume in compose.prod.yaml). Nothing personal is stored.
- Lifecycle: stop on a hidden tab, the bed after long inactivity, a full stop once the scene is still.

## Multiplayer

- Load-test Mercure on the VPS with simulated sessions before relying on capacity numbers.
