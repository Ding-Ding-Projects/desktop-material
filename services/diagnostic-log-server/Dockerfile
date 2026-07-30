FROM node:22.17.0-alpine3.22

RUN addgroup -S logserver && adduser -S -G logserver logserver
WORKDIR /app
COPY --chown=logserver:logserver package.json server.mjs ./
USER logserver

ENV HOST=0.0.0.0 \
    PORT=4318 \
    STORAGE_ROOT=/data \
    RETENTION_DAYS=14 \
    MAX_STORAGE_BYTES=5368709120

EXPOSE 4318
VOLUME ["/data", "/run/secrets"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4318/health >/dev/null || exit 1

CMD ["node", "server.mjs"]
