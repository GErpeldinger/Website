# To do

Committed work only. Add what comes up, delete what is done. Undecided ideas live in [ideas.md](ideas.md).

## Going live

- Point the apex and `www` DNS records to the VPS, and remove OVH's web redirect. Keep the MX records.
- Deploy workflow: build the production image in CI, push it to GHCR, then pull and restart it on the VPS through a dedicated `deploy` user restricted to that command. Pin Actions to commit SHAs.
- Build and start the production image in CI (`make prod-test`), so a base image update that breaks it fails before deploying.
- Security headers in the Caddyfile (HSTS, `X-Content-Type-Options`, `Referrer-Policy`, framing) and hide the `server` header.
- A first app route, then point the Docker `HEALTHCHECK` at it instead of Caddy's metrics.
- Make `main` the GitHub default branch, so Dependabot runs on it.
- Remove the `claude` user and its sudo rule from the VPS once the deploy user exists.

## Foundations

- Install Twig, with `twig-cs-fixer`, TwigStan and `lint:twig` in `make check`.
- Install AssetMapper and Stimulus.
- Enforce FR/EN parity with a check that fails on a missing translation.

## Game layer

- JavaScript checks in `make check`:
  - `tsc --checkJs`
  - ESLint, including rules for the architecture: no raw `setTimeout` or `setInterval` in game code (everything goes through the game clock), and no DOM or physics access in Brain and activity modules
  - unit tests for the Brain and activities
- Port the prototype's behaviours to the activity system described in [architecture.md](architecture.md).
- Device tiers: feature checks, the frame-rate probe, and the static fallback with the monkey's message.
- Lifecycle: stop on a hidden tab, the bed after long inactivity, a full stop once the scene is still.

## Multiplayer

- Load-test Mercure on the VPS with simulated sessions before relying on capacity numbers.
