# runner.Dockerfile
#
# Extends myoung34/github-runner:latest with the Docker CLI binary so
# self-hosted jobs that validate compose files (`docker compose config`)
# succeed.
#
# Scope: CLI binary only. NOT mounting /var/run/docker.sock — that would
# give CI jobs effective root on the host. Validation needs only the parser.

FROM myoung34/github-runner:latest

RUN apt-get update \
  && apt-get install -y --no-install-recommends docker.io \
  && rm -rf /var/lib/apt/lists/*
