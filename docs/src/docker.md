# Docker

Germinator has a docker image, `ghcr.io/launchcodedev/germinator`. It runs the CLI by
default as the entrypoint.

You should mount your seeds folder into the container, so it can read the YAML
files within in.

See the [CLI](./cli.md) page for more options available.

### Accessing Databases

Of course, Docker is isolated from your local environment. You'll likely need to
forward network ports or sockets as necessary. `--net=host` might be the easiest way.

It's common to run germinator alongside your database in a docker-compose workspace.
That way, hostnames are available to germinator.
