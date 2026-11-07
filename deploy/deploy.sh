#!/bin/sh
# Forced command of the CI deploy key (see README.md). Usage: deploy.sh APP_DIR
#
# The commit SHA arrives in SSH_ORIGINAL_COMMAND and a tar of compose.yaml and compose.prod.yaml on
# stdin. Nothing else from the caller is trusted: the SHA must be 40 hex digits, and the tar must hold
# those two regular files and nothing else. Host-specific settings come from APP_DIR/deploy.env.
set -eu

fail() {
	echo "deploy: $*" >&2
	exit 1
}

app_dir=${1:?usage: deploy.sh APP_DIR}
sha=${SSH_ORIGINAL_COMMAND-}

case $sha in
'' | *[!0-9a-f]*) fail 'the command must be a commit SHA' ;;
esac
[ ${#sha} -eq 40 ] || fail 'the command must be a 40-character commit SHA'

[ -d "$app_dir" ] || fail "$app_dir is not a directory"
cd "$app_dir"
[ -f deploy.env ] || fail "$app_dir/deploy.env is missing"

# In the app directory, so the final mv stays on one filesystem.
work=$(mktemp -d ./.incoming.XXXXXX)
trap 'rm -rf "$work"' EXIT

# Compose files are a few KiB: a larger stream is cut, and the truncated tar fails below.
head -c 65536 > "$work/bundle.tar"

members=$(tar -tf "$work/bundle.tar" | sort)
[ "$members" = "compose.prod.yaml
compose.yaml" ] || fail 'the bundle must hold exactly compose.yaml and compose.prod.yaml'
# Verbose listings start with the entry type: only regular files ('-') are accepted, no links.
if tar -tvf "$work/bundle.tar" | grep -qv '^-'; then
	fail 'the bundle must hold regular files only'
fi

mkdir "$work/files"
tar -xf "$work/bundle.tar" -C "$work/files"
for file in compose.yaml compose.prod.yaml; do
	{ [ -f "$work/files/$file" ] && [ ! -L "$work/files/$file" ]; } || fail "$file is not a regular file"
done
mv -f "$work/files/compose.yaml" "$work/files/compose.prod.yaml" .

set -a
# shellcheck disable=SC1091
. ./deploy.env
set +a
: "${IMAGE_REPOSITORY:?IMAGE_REPOSITORY is missing from deploy.env}"
IMAGE=$IMAGE_REPOSITORY:$sha
export IMAGE

compose="docker compose -p website -f compose.yaml -f compose.prod.yaml"
$compose pull
$compose up -d --wait --no-build

# Images are tagged by SHA, so none is ever dangling: prune every image no container uses.
docker image prune --all --force || echo 'deploy: image prune failed, the deploy itself succeeded' >&2
