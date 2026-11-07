#!/bin/sh
# Tests deploy.sh against a fake `docker`. Run with `make deploy-test`.
set -u

here=$(cd "$(dirname "$0")" && pwd)
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT

sha=0123456789abcdef0123456789abcdef01234567
failures=0

pass() { echo "ok   $1"; }
fail() {
	echo "FAIL $1"
	failures=$((failures + 1))
}

mkdir "$root/bin"
cat > "$root/bin/docker" <<'DOCKER'
#!/bin/sh
echo "$* | IMAGE=${IMAGE-} SERVER_NAME=${SERVER_NAME-} SITE_ALLOWLIST=${SITE_ALLOWLIST-}" >> "$FAKE_DOCKER_LOG"
[ -z "${FAKE_DOCKER_FAIL-}" ] || exit 1
DOCKER
chmod +x "$root/bin/docker"
export PATH="$root/bin:$PATH" FAKE_DOCKER_LOG="$root/docker.log"

# A fresh app directory with the host-only env file, and sources to bundle.
setup() {
	app="$root/app"
	rm -rf "$app" "$root/src" "$FAKE_DOCKER_LOG"
	mkdir "$app" "$root/src"
	cat > "$app/deploy.env" <<'ENV'
IMAGE_REPOSITORY=ghcr.io/example/site
SERVER_NAME=www.example.test
SITE_ALLOWLIST="192.0.2.0/24 2001:db8::/32"
ENV
	: > "$FAKE_DOCKER_LOG"
	echo 'services: {}' > "$root/src/compose.yaml"
	echo 'services: {}' > "$root/src/compose.prod.yaml"
	echo evil > "$root/src/other.txt"
}

deploy() { # deploy <command>: sends $root/bundle.tar on stdin
	SSH_ORIGINAL_COMMAND=$1 sh "$here/deploy.sh" "$app" < "$root/bundle.tar" > "$root/out" 2>&1
}

run() { # run <command> [tar member...]: bundles the members from $root/src
	command=$1
	shift
	tar -cf "$root/bundle.tar" -C "$root/src" "$@"
	deploy "$command"
}

# Failed, ran no docker, wrote no compose file.
expect_rejected() {
	status=$1
	label=$2
	if [ "$status" -ne 0 ] && [ ! -s "$FAKE_DOCKER_LOG" ] && [ ! -e "$app/compose.yaml" ]; then
		pass "$label"
	else
		fail "$label (status $status)"
	fi
}

setup
run "$sha" compose.yaml compose.prod.yaml
status=$?
if [ $status -eq 0 ] && cmp -s "$root/src/compose.yaml" "$app/compose.yaml" && cmp -s "$root/src/compose.prod.yaml" "$app/compose.prod.yaml"; then
	pass 'installs the two compose files'
else
	fail "installs the two compose files (status $status)"
fi

env="IMAGE=ghcr.io/example/site:$sha SERVER_NAME=www.example.test SITE_ALLOWLIST=192.0.2.0/24 2001:db8::/32"
expected="compose -p website -f compose.yaml -f compose.prod.yaml pull | $env
compose -p website -f compose.yaml -f compose.prod.yaml up -d --wait --no-build | $env
image prune --all --force | $env"
if [ "$(cat "$FAKE_DOCKER_LOG")" = "$expected" ]; then
	pass 'pulls, starts the SHA image from the env file, then prunes'
else
	fail 'docker calls differ'
	cat "$FAKE_DOCKER_LOG"
fi

if [ -z "$(ls -A "$app" | grep -v -e '^compose' -e '^deploy.env$')" ]; then
	pass 'leaves no temporary file behind'
else
	fail 'leaves a temporary file behind'
fi

upper=$(echo "$sha" | tr a-f A-F)
for command in '' abc "${sha}0" "$upper" "$sha; touch $root/pwned" sh "../$sha"; do
	setup
	run "$command" compose.yaml compose.prod.yaml
	expect_rejected $? "rejects the command '$command'"
done
if [ ! -e "$root/pwned" ]; then pass 'never runs the command'; else fail 'ran the command'; fi

setup
run "$sha" compose.yaml compose.prod.yaml other.txt
expect_rejected $? 'rejects an extra member'

setup
run "$sha" compose.yaml
expect_rejected $? 'rejects a missing member'

setup
run "$sha" compose.yaml compose.prod.yaml compose.yaml
expect_rejected $? 'rejects a duplicated member'

setup
tar -cf "$root/bundle.tar" -C "$root/src" -P --transform 's,^compose.prod.yaml$,../compose.prod.yaml,' compose.yaml compose.prod.yaml
deploy "$sha"
expect_rejected $? 'rejects a path traversal'
if [ ! -e "$root/compose.prod.yaml" ]; then pass 'writes nothing outside the app directory'; else fail 'wrote outside the app directory'; fi

setup
rm "$root/src/compose.prod.yaml"
ln -s /etc/passwd "$root/src/compose.prod.yaml"
run "$sha" compose.yaml compose.prod.yaml
expect_rejected $? 'rejects a symbolic link'

setup
rm "$root/src/compose.prod.yaml"
ln "$root/src/compose.yaml" "$root/src/compose.prod.yaml"
run "$sha" compose.yaml compose.prod.yaml
expect_rejected $? 'rejects a hard link'

setup
rm "$app/deploy.env"
run "$sha" compose.yaml compose.prod.yaml
expect_rejected $? 'rejects a missing env file'

setup
FAKE_DOCKER_FAIL=1 run "$sha" compose.yaml compose.prod.yaml
if [ $? -ne 0 ]; then pass 'fails when docker fails'; else fail 'does not fail when docker fails'; fi

if [ "$failures" -ne 0 ]; then
	echo "$failures failure(s)"
	exit 1
fi
echo 'all passed'
