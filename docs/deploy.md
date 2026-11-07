# Deploy

On a push to `main`, CI (`.github/workflows/ci.yaml`) builds the production image once, probes that same image with `make prod-test`, and pushes it to GHCR as `ghcr.io/<owner>/<repo>:<sha>`. It moves `:latest` too when the commit is still the head of `main`. A second job, in the `production` environment, then runs `deploy/deploy.sh` on the VPS over SSH. The setup steps and secrets are in [deploy/README.md](../deploy/README.md).

## Flow

1. The `image` job builds `frankenphp_prod`, starts it with `make prod-test` and pushes it.
2. The `deploy` job skips itself when its commit is no longer the head of `main`: `concurrency: production` serialises runs but does not order them, so an older run could otherwise deploy after a newer one and roll back.
3. It sends the commit SHA as the SSH command and a tar of `compose.yaml` and `compose.prod.yaml` on stdin.
4. The key is restricted on the VPS to `deploy.sh`, which checks the SHA (40 hex digits) and the tar (exactly those two regular files), installs them, then runs `docker compose pull` and `up -d --wait --no-build` with `IMAGE` set to that SHA's tag, and prunes unused images.

Nothing host-specific is committed. The host, port, key and known hosts are secrets of the `production` environment, because ssh's own errors print the host into public logs. The user name is its variable `DEPLOY_USER`. The image name, `SERVER_NAME`, `APP_SECRET`, the allowlist and the apex redirect live in `deploy.env`, a file that only exists on the VPS.

## Trust model

- The key cannot get a shell or forward a port: `restrict,command=` runs `deploy.sh` and nothing else, and the script rejects anything but a SHA and the two files.
- It is nevertheless root-equivalent. The deploy user is in the `docker` group, and `deploy.sh` runs whatever the caller's `compose.prod.yaml` says, so a compose file mounting `/` gives root. The deploy user also owns `/srv/website` and `~/.ssh`.
- The protection is the `production` environment: its secrets are restricted to the `main` branch and exposed only to the `deploy` job. Whoever can push to `main` can deploy.

## Client-IP allowlist

`SITE_ALLOWLIST` (space-separated CIDRs) feeds a `client_ip` matcher in the Caddyfile. Clients outside it get a 403. Unset, the Caddyfile defaults it to everyone (`0.0.0.0/0 ::/0`), so a bare `docker run` is open. Caddy reads an empty value as "nobody", so `compose.yaml` repeats the default for an unset or empty variable: dev, CI and `make prod-test` are open.

It is in Caddy and not in the firewall because Let's Encrypt's validation must stay reachable, and Caddy answers it before any route.

Without `enable_ipv6` on the Compose network, Docker's proxy hands IPv6 clients to Caddy as the bridge gateway's IPv4 address. The allowlist therefore only sees real client addresses over IPv4, which is why the site has no AAAA record for now. Never allowlist the bridge range: it is every IPv6 visitor.

The apex redirects permanently to `www.erpeldinger.fr` through `CADDY_EXTRA_CONFIG`, which carries a second site block set in `deploy.env`. Host names stay in the environment, as `SERVER_NAME` does.

## Decisions

- **Forced command with the SHA as the command, compose files on stdin.** The job never chooses what runs, and the VPS needs no checkout. Rejected: a general SSH shell, and a webhook on the VPS, which needs another public endpoint.
- **Image tagged by SHA, `latest` only moved forward.** A deploy is reproducible and a rollback is one tag. `docker image prune --all` runs after each deploy, as SHA tags are never dangling; a prune failure only warns.
- **Skip a stale run instead of cancelling it.** Cancelling a deploy half-way is worse than skipping one that has not started.
- **Allowlist in Caddy.** See above. Rejected: a firewall rule, which blocks ACME validation.
- **IPv4 only for now.** Accepted until client addresses are preserved over IPv6.
- **Compose files from the caller.** Accepted for now, with the root-equivalent key above. The hardening is to read them from the image instead (see [todo.md](todo.md)).
