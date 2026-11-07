# Guillaume Erpeldinger's website

Personal website at https://www.erpeldinger.fr: a real, readable web page that doubles as a playable 2D scene. Every element can be grabbed, thrown, bombed or blown away, and a sunglasses-wearing, cigarette-smoking monkey comments, flees, hangs on elements and rebuilds the page. The page has to impress non-developers within seconds and show developers real engineering underneath.

## Branches

- `main`: the rebuild, an orphan branch with no shared history with `dev`.
- `dev`: the old site (Symfony 5.1, API Platform, EasyAdmin, React 17), kept as a reference. Never merge it into `main`.
- The GitHub default branch is still `dev`, so Dependabot only runs on `main` once it becomes the default.

## Stack

- PHP 8.5 and Symfony 8.1 on FrankenPHP in worker mode, based on a trimmed `dunglas/symfony-docker` (no Mercure, Vulcain, database or Xdebug for now).
- Docker Compose: `compose.yaml` for the base, `compose.override.yaml` for dev and `compose.prod.yaml` for production.
- Twig for the pages.
- Planned and not installed yet: Symfony UX (Stimulus, Turbo), AssetMapper, Matter.js and Mercure.

## Commands

`make` lists the targets. Every tool runs in Docker, so nothing is installed on the Mac:

- `make up` and `make down`: the dev stack on https://localhost.
- `make check`: `composer bump --dry-run` (constraints at the installed versions), PHPStan, Rector (dry run), ECS, the Twig checks (`lint:twig` in prod, twig-cs-fixer, TwigStan), the Pest tests, mutation testing of the PHP classes changed since `origin/main`, Prettier, and the deploy script's tests (`make deploy-test`). CI runs the same, plus `make mutate-all` on every class.
- `make test` and `make mutate`: the tests alone, and mutation testing alone. Locally, test impact analysis only runs the tests a change affects, except in agent worktrees, where git can't run inside the container.
- `make fmt`: applies the Rector, ECS, twig-cs-fixer and Prettier fixes.
- `make hooks`: run once per clone. Commits then run `make check`, and their messages are checked.
- `make prod-test`: builds and probes the production image on https://localhost:8443, next to the dev stack.

## Quality gates

`make check` (via the pre-commit hook and CI) enforces the code conventions. The tool configs live in `config/tools/`: read them rather than restating them here. Editors don't find them on their own: point PhpStorm's PHPStan, Rector and ECS settings at them once. Two non-obvious points:

- `exit()`, `die()`, `dump()` and `dd()` are banned in `src/`: exit and die kill the FrankenPHP worker. The tools leave the Symfony skeleton (`public/index.php`, `config/preload.php`, the generated bundle and reference lists) as its recipes write it.
- Code is written test-first, with Pest. Every class in `src/` has its test at the mirrored path in `tests/`, and every mutation of its code must be caught: a surviving mutation means a missing test.

## Conventions

- Claude manages commits here, without asking. They must be atomic. A fix to an unpushed commit is folded into it: commit it with `--fixup`, then run `make fold`. Push only once a review cycle comes back clean.
- Every user-facing text exists in French and English.

### Where words go

- **A code comment** answers "why this line": a reason the code can't show, a constraint, a source. At most 3 lines, with no history or design essay.
- **`docs/`** holds the design, one page per topic, written as the current state and ending with a **Decisions** section. [docs/todo.md](../docs/todo.md) holds committed work and [docs/ideas.md](../docs/ideas.md) undecided ideas: keep both current.
- **A commit body** holds the history: why, what was measured, the trade-offs, for a reader in two years. It is not a list of review findings or a file-by-file recap.

## Architecture

The design and its decisions are in [docs/architecture.md](../docs/architecture.md). Read it before touching the game layer.

## Prototype

The playable single-file prototype is the private artifact https://claude.ai/artifact/2Pod5PTi4ZiAVZbSWj2a5y. Use it as a reference for the feel and the behaviors (timings, lines, physics settings), not for its structure: it is the flag-based code that docs/architecture.md replaces.

## Deployment

OVH VPS (1 vCore, 2 GB RAM, 20 GB) running Debian 13. The firewall only allows ports 22, 80 and 443, and SSH accepts keys only. FrankenPHP is exposed directly and handles HTTPS. A push to `main` builds the production image, pushes it to GHCR and deploys it over SSH: see [docs/deploy.md](../docs/deploy.md). Until launch, a Caddy client-IP allowlist (`SITE_ALLOWLIST`) keeps the site to its owner.
