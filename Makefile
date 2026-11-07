# Every tool runs in Docker, so the Mac, CI and agent worktrees use the same versions.
# `run --no-deps` publishes no ports, so it works next to a running dev stack. One project for
# every checkout, or each agent worktree would leave its own volumes and network behind.
TOOLS_RUN := docker compose -p website-tools run --rm --no-deps -T
PHP := $(TOOLS_RUN) php
NODE := $(TOOLS_RUN) node
TOOLS := config/tools
WORKTREES := .claude/worktrees
BASE ?= origin/main

# Tracked root entries. A new one goes here on purpose; tool configs go in config/tools/.
ROOT := .claude .dockerignore .editorconfig .env .env.dev .env.test .gitattributes .githooks .github .gitignore \
	Dockerfile Makefile bin compose.override.yaml compose.prod.yaml compose.yaml composer.json composer.lock \
	config docs frankenphp package.json pnpm-lock.yaml public src symfony.lock tests

.DEFAULT_GOAL := help
.PHONY: help up down check layout php phpstan rector ecs test mutate mutate-all prettier fmt hooks clean-tree fold prod-test

help: ## List the targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{ printf "  %-10s %s\n", $$1, $$2 }'

up: | $(WORKTREES) ## Start the dev stack on https://localhost
	docker compose up --wait

down: ## Stop the dev stack
	docker compose down

# The php container masks this folder with a volume. Created here first, or Docker creates it
# owned by root on Linux, and agents can no longer make worktrees in it.
$(WORKTREES):
	mkdir -p $@

# `run` never rebuilds an existing image, so the tool images are rebuilt here, and only when
# what they are built from changes: an unconditional `--build` doubled the time of `make check`.
TOOL_SERVICES := php node
# Not under var/: on Linux the dev container creates var/ owned by root, and the host can't write it.
IMAGES := .make/tool-images.stamp
$(IMAGES): Dockerfile compose.yaml compose.override.yaml $(shell find frankenphp -type f)
	docker compose -p website-tools build $(TOOL_SERVICES)
	@mkdir -p $(@D) && touch $@

# The touch runs in the container: on Linux the directory belongs to the container's root.
vendor: composer.json composer.lock $(IMAGES) | $(WORKTREES)
	$(PHP) sh -c 'composer install --no-interaction --no-progress && touch vendor'

node_modules: package.json pnpm-lock.yaml $(IMAGES)
	$(NODE) sh -c 'pnpm install --frozen-lockfile && touch node_modules'

check: layout php prettier ## Run every check CI runs, tests and mutation testing included

layout:
	@extra=$$(git ls-files | cut -d/ -f1 | sort -u | grep -vxF $(addprefix -e ,$(ROOT)) || :); \
	if [ -n "$$extra" ]; then \
		echo "Unexpected root entries: $$extra" >&2; \
		echo "Tool configs go in $(TOOLS)/; anything else must be added to ROOT in the Makefile." >&2; \
		exit 1; \
	fi
	@missing=$$(git ls-files 'src/*.php' | sed -e 's#^src/#tests/#' -e 's#\.php$$#Test.php#' \
		| while read -r test; do [ -f "$$test" ] || echo "$$test"; done); \
	if [ -n "$$missing" ]; then \
		echo "Every class in src/ has its test at the mirrored path. Missing: $$missing" >&2; \
		exit 1; \
	fi

# PHPStan and Rector read the dev container, and each `run` starts with an empty var/.
WARM := bin/console cache:warmup -q

PHPSTAN := vendor/bin/phpstan analyse -c $(TOOLS)/phpstan.neon --no-progress
RECTOR := vendor/bin/rector process --config $(TOOLS)/rector.php --no-progress-bar
ECS := vendor/bin/ecs check --config $(TOOLS)/ecs.php --no-progress-bar
# Pest only knows it runs on CI from --ci, which turns test impact analysis off there. In an
# agent worktree, .git is a file pointing outside the container, so impact analysis is off too.
PEST := vendor/bin/pest --configuration $(TOOLS)/phpunit.xml --parallel $(if $(CI),--ci) $(if $(wildcard .git/HEAD),,--no-tia)

# Every mutation must be caught: a surviving one is a missing test. A class with nothing to
# mutate (an enum, an interface) passes.
MUTATION_MIN := 100
MUTATE := --mutate --min=$(MUTATION_MIN) --ignore-min-score-on-zero-mutations
# The classes this branch added, changed or renamed, untracked ones included, as Pest's --class
# list; --merge-base leaves out what BASE gained meanwhile. Double-quote it: unquoted, the shell
# drops the backslashes, no class matches, and the zero-mutation flag passes the run.
CHANGED_CLASSES = $(shell git rev-parse --verify --quiet $(BASE) >/dev/null \
	&& { git diff --name-only --diff-filter=ACMR --merge-base $(BASE) -- 'src/*.php'; \
		git ls-files --others --exclude-standard -- 'src/*.php'; } \
	| sed -e 's|^src/||' -e 's|\.php$$||' -e 's|/|\\|g' -e 's|^|App\\|' | paste -sd, -)

# One container, one warmup and one test run for the PHP checks: the run also mutation-tests
# the changed classes. The targets below run each step alone.
php: vendor
	$(PHP) sh -c '$(WARM) && $(PHPSTAN) && $(RECTOR) --dry-run && $(ECS) \
		&& $(PEST) $(if $(CHANGED_CLASSES),$(MUTATE) --class="$(CHANGED_CLASSES)")'

phpstan: vendor
	$(PHP) sh -c '$(WARM) && $(PHPSTAN)'

rector: vendor
	$(PHP) sh -c '$(WARM) && $(RECTOR) --dry-run'

ecs: vendor
	$(PHP) $(ECS)

# Locally, tests/Pest.php turns on test impact analysis: only the tests a change affects run.
test: vendor ## Run the tests
	$(PHP) $(PEST)

mutate: vendor ## Mutation-test the PHP classes changed since BASE (origin/main)
	@$(if $(CHANGED_CLASSES),$(PHP) $(PEST) $(MUTATE) --class="$(CHANGED_CLASSES)",echo "Mutation testing: no PHP class changed since $(BASE).")

# On CI, every class, including any that no test declares with covers().
mutate-all: vendor
	$(PHP) $(PEST) $(MUTATE) --everything

# package.json points Prettier (and editors) to $(TOOLS)/prettier.json.
PRETTIER := node_modules/.bin/prettier --ignore-path .gitignore --ignore-path $(TOOLS)/prettierignore

prettier: node_modules
	$(NODE) $(PRETTIER) --check .

# Rector first: ECS then formats what Rector rewrote.
fmt: vendor node_modules ## Apply the automatic fixes
	$(PHP) sh -c '$(WARM) && $(RECTOR) && $(ECS) --fix'
	$(NODE) $(PRETTIER) --write .

hooks: ## Use the repo's git hooks
	git config core.hooksPath .githooks

# The checks read the working tree, so before a commit or a fold it must hold exactly the commits.
clean-tree:
	@if ! git diff --quiet || [ -n "$$(git ls-files --others --exclude-standard)" ]; then \
		echo "The checks read the working tree, which has unstaged or untracked changes:" >&2; \
		git status --short >&2; \
		echo "Stage them, or commit them separately first." >&2; \
		exit 1; \
	fi

# Git runs no pre-commit hook during a rebase, so each rewritten commit is checked here.
fold: clean-tree ## Fold the fixup! commits since BASE (origin/main), checking every rewritten commit
	GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash --exec 'make check' $(BASE)

# Its own project, one per checkout (dev's root-owned caddy volumes break the non-root image,
# and two worktrees must not share a stack), on its own ports so it runs next to the dev stack.
PROD_PROJECT := prodtest-$(shell basename "$(CURDIR)" | tr 'A-Z' 'a-z' | tr -c 'a-z0-9\n' '-')

# A signal exits explicitly, so the EXIT cleanup also runs on Ctrl-C (dash skips it otherwise).
prod-test: ## Build and probe the production image on https://localhost:8443
	@set -e; \
	export SERVER_NAME=localhost APP_SECRET=local-prod-test HTTP_PORT=8080 HTTPS_PORT=8443 HTTP3_PORT=8443; \
	compose='docker compose -p $(PROD_PROJECT) -f compose.yaml -f compose.prod.yaml'; \
	trap "$$compose down -v >/dev/null 2>&1" EXIT; \
	trap 'exit 130' INT TERM; \
	$$compose up --build --wait; \
	status=$$(curl --insecure --silent --show-error --output /dev/null --write-out '%{http_code}' https://localhost:8443) || status=000; \
	echo "production image answered HTTP $$status"; \
	case $$status in [1-4][0-9][0-9]) ;; *) exit 1 ;; esac
