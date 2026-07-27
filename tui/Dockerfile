# syntax=docker/dockerfile:1.7

ARG PYTHON_VERSION=3.12
ARG UV_VERSION=0.11.26

FROM ghcr.io/astral-sh/uv:${UV_VERSION} AS uv

FROM python:${PYTHON_VERSION}-slim-bookworm AS builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /build

COPY --from=uv /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock README.md ./
COPY src ./src

# Build the checkout itself into a wheel, install its locked runtime
# dependencies, and finally install only that local artifact.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv build --wheel --out-dir /dist \
    && uv export --locked --no-dev --no-emit-project \
      --output-file /tmp/runtime-requirements.txt \
    && uv venv /opt/desktop-material-tui \
    && uv pip install \
      --python /opt/desktop-material-tui/bin/python \
      --require-hashes \
      --requirements /tmp/runtime-requirements.txt \
    && uv pip install \
      --python /opt/desktop-material-tui/bin/python \
      --no-deps \
      /dist/*.whl \
    && /opt/desktop-material-tui/bin/desktop-material-tui --version

FROM python:${PYTHON_VERSION}-slim-bookworm AS runtime

ARG APP_UID=1000
ARG APP_GID=1000

LABEL org.opencontainers.image.title="Desktop Material TUI" \
      org.opencontainers.image.description="Linux-first, mouse-capable terminal Git and GitHub client" \
      org.opencontainers.image.source="https://github.com/Ding-Ding-Projects/desktop-material" \
      org.opencontainers.image.licenses="MIT"

ENV COLORTERM=truecolor \
    GH_PAGER=cat \
    GIT_PAGER=cat \
    GIT_TERMINAL_PROMPT=0 \
    HOME=/home/dmt \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    PATH=/opt/desktop-material-tui/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TERM=xterm-256color \
    XDG_CACHE_HOME=/home/dmt/.cache \
    XDG_CONFIG_HOME=/home/dmt/.config \
    XDG_DATA_HOME=/home/dmt/.local/share \
    XDG_RUNTIME_DIR=/home/dmt/.local/state/runtime \
    XDG_STATE_HOME=/home/dmt/.local/state

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
      ca-certificates \
      gh \
      git \
      libstdc++6 \
      openssh-client \
    && rm -rf /var/lib/apt/lists/* \
    && if ! getent group "${APP_GID}" >/dev/null; then \
      groupadd --gid "${APP_GID}" dmt; \
    fi \
    && useradd \
      --uid "${APP_UID}" \
      --gid "${APP_GID}" \
      --create-home \
      --shell /bin/bash \
      dmt \
    && install -d \
      -o dmt \
      -g "${APP_GID}" \
      -m 0700 \
      /home/dmt/.cache \
      /home/dmt/.config \
      /home/dmt/.local/share \
      /home/dmt/.local/state \
      /home/dmt/.local/state/runtime \
    && install -d \
      -o dmt \
      -g "${APP_GID}" \
      /workspace

COPY --from=builder /opt/desktop-material-tui /opt/desktop-material-tui

USER dmt
WORKDIR /workspace

ENTRYPOINT ["desktop-material-tui"]
