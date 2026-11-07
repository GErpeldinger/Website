# Deploy runbook

The design and the trust model are in [docs/deploy.md](../docs/deploy.md). This page is the one-time setup.

`deploy.sh` is the forced command of the CI key: it receives a commit SHA and a tar of `compose.yaml` and `compose.prod.yaml`, installs the files, pulls that SHA's image and restarts the stack. `make deploy-test` tests it against a fake `docker`.

## VPS

Run as root, with your own names for the user and directories.

```sh
# The deploy user: no password, in the docker group (which is root-equivalent).
useradd --create-home --shell /bin/sh --groups docker deploy

# The script belongs to root, so the key's command cannot be rewritten by the deploy user.
install -m 755 -o root -g root deploy.sh /usr/local/sbin/website-deploy

# The app directory: the deploy user writes the compose files in it.
install -d -m 750 -o deploy -g deploy /srv/website
```

Write `/srv/website/deploy.env`, readable by the deploy user (`chown deploy:deploy`, `chmod 600`). The script sources it as shell and hands it to Compose, so single-quote every value (the shell expands `$` otherwise):

```sh
IMAGE_REPOSITORY='ghcr.io/<owner>/<repo>'
SERVER_NAME='www.erpeldinger.fr'
APP_SECRET='<a long random string>'
# Space-separated IPv4 CIDRs allowed to see the site. Leave it out to open the site to everyone.
# IPv4 only, and never the Docker bridge range: see docs/deploy.md.
SITE_ALLOWLIST='<your IPv4>/32'
# Redirects the apex to the canonical host. Caddy reads it as extra top-level configuration.
CADDY_EXTRA_CONFIG='erpeldinger.fr {
	redir https://www.erpeldinger.fr{uri} permanent
}'
```

Create a key pair on your machine (`ssh-keygen -t ed25519 -f deploy_key -N ''`) and add the public key to `~deploy/.ssh/authorized_keys` on one line:

```
restrict,command="/usr/local/sbin/website-deploy /srv/website" ssh-ed25519 AAAA... ci-deploy
```

`restrict` turns off port, agent and X11 forwarding and the pty. `command=` replaces whatever the client asks for: the client's command line reaches the script as `SSH_ORIGINAL_COMMAND`.

Make the package public in GitHub (Packages, the image, Package settings, visibility) once the first image is pushed, so the VPS pulls it without credentials. The image holds the code of a public repository and no secret.

## GitHub

Create the `production` environment, restrict its deployment branches to `main`, and add these secrets to it:

- `DEPLOY_HOST`: the bare host name or address.
- `DEPLOY_PORT`: optional, 22 when absent.
- `DEPLOY_SSH_KEY`: the private key (`deploy_key`).
- `DEPLOY_KNOWN_HOSTS`: the host's public key line, from `ssh-keyscan -t ed25519 <host>` (`[<host>]:<port>` when the port is not 22), checked against the key printed on the VPS.

Also add the environment variable `DEPLOY_USER` (the deploy user's name). A user name is not secret, and as a secret GitHub would mask every occurrence of the word in the logs.

The others are separate secrets because GitHub masks each value on its own, and ssh's error messages print the host and the user alone.
