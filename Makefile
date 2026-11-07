# Every tool runs in Docker, so the Mac, CI and agent worktrees use the same versions.
# `run --no-deps` publishes no ports, so it works next to a running dev stack. One project for
# every checkout, or each agent worktree would leave its own volumes and network behind.
TOOLS_RUN := docker compose -p website-tools run --rm --no-deps -T
PHP := $(TOOLS_RUN) php
TOOLS := config/tools

# Tracked root entries. A new one goes here on purpose; tool configs go in config/tools/.
ROOT := .dockerignore .editorconfig .env .env.dev .gitattributes .github .gitignore \
	Dockerfile Makefile bin compose.override.yaml compose.prod.yaml compose.yaml composer.json composer.lock \
	config frankenphp public src symfony.lock tests

.DEFAULT_GOAL := help
.PHONY: help up down check layout php phpstan rector ecs fmt prod-test

help: ## List the targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{ printf "  %-10s %s\n", $$1, $$2 }'

up: ## Start the dev stack on https://localhost
	docker compose up --wait

down: ## Stop the dev stack
	docker compose down

# `run` never rebuilds an existing image, so the tool images are rebuilt here, and only when
# what they are built from changes: an unconditional `--build` doubled the time of `make check`.
TOOL_SERVICES := php
IMAGES := var/tool-images.stamp
$(IMAGES): Dockerfile compose.yaml compose.override.yaml $(shell find frankenphp -type f)
	docker compose -p website-tools build $(TOOL_SERVICES)
	@mkdir -p $(@D) && touch $@

# The touch runs in the container: on Linux the directory belongs to the container's root.
vendor: composer.json composer.lock $(IMAGES)
	$(PHP) sh -c 'composer install --no-interaction --no-progress && touch vendor'

check: layout php ## Run every check CI runs

layout:
	@extra=$$(git ls-files | cut -d/ -f1 | sort -u | grep -vxF $(addprefix -e ,$(ROOT)) || :); \
	if [ -n "$$extra" ]; then \
		echo "Unexpected root entries: $$extra" >&2; \
		echo "Tool configs go in $(TOOLS)/; anything else must be added to ROOT in the Makefile." >&2; \
		exit 1; \
	fi

# PHPStan and Rector read the dev container, and each `run` starts with an empty var/.
WARM := bin/console cache:warmup -q

PHPSTAN := vendor/bin/phpstan analyse -c $(TOOLS)/phpstan.neon --no-progress
RECTOR := vendor/bin/rector process --config $(TOOLS)/rector.php --no-progress-bar
ECS := vendor/bin/ecs check --config $(TOOLS)/ecs.php --no-progress-bar

# One container and one warmup for the three PHP checks; the targets below run them alone.
php: vendor
	$(PHP) sh -c '$(WARM) && $(PHPSTAN) && $(RECTOR) --dry-run && $(ECS)'

phpstan: vendor
	$(PHP) sh -c '$(WARM) && $(PHPSTAN)'

rector: vendor
	$(PHP) sh -c '$(WARM) && $(RECTOR) --dry-run'

ecs: vendor
	$(PHP) $(ECS)

# Rector first: ECS then formats what Rector rewrote.
fmt: vendor ## Apply the automatic fixes
	$(PHP) sh -c '$(WARM) && $(RECTOR) && $(ECS) --fix'

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
