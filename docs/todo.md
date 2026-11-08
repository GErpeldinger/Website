# To do

Committed work only. Add what comes up, delete what is done. Undecided ideas live in [ideas.md](ideas.md).

## Going live

- Read the compose files from the pulled image instead of the SSH caller, so the deploy key stops being root-equivalent.
- Preserve IPv6 client addresses (`enable_ipv6` on the Compose network), then publish an AAAA record.
- Security headers in the Caddyfile (HSTS, `X-Content-Type-Options`, `Referrer-Policy`, framing) and hide the `server` header.
- Point the Docker `HEALTHCHECK` at the home route instead of Caddy's metrics.
- Make `main` the GitHub default branch, so Dependabot runs on it.
- Remove the `claude` user and its sudo rule from the VPS once the deploy user exists.
- The DNS zone says the domain sends no mail (SPF `-all`, DMARC `p=reject`); `contact@` only receives, through OVH's redirect. Before anything sends as `contact@erpeldinger.fr` (a contact form, Gmail's "send as"), add that sender to SPF and set up DKIM.

## Foundations

- Enforce FR/EN parity with a check that fails on a missing translation.
- On the next Pest upgrade, check whether `--no-tia` now reaches the parallel workers. If it does, the Makefile can pass it in worktrees again instead of the `.git` guard in tests/Pest.php.

## Game layer

- JavaScript checks in `make check`:
  - ESLint, including rules for the architecture: no raw `setTimeout` or `setInterval` in game code (everything goes through the game clock), and no DOM or physics access in Brain and activity modules
  - unit tests for the Brain and activities
- Port the prototype's behaviours to the activity system described in [architecture.md](architecture.md).
- Device tiers: feature checks, the frame-rate probe, and the static fallback with the monkey's message.
- Lifecycle: stop on a hidden tab, the bed after long inactivity, a full stop once the scene is still.

## Multiplayer

- Load-test Mercure on the VPS with simulated sessions before relying on capacity numbers.
