FROM node:24.15.0-alpine@sha256:8e2c930fda481a6ec141fe5a88e8c249c69f8102fe98af505f38c081649ea749

WORKDIR /srv/desktop-material

COPY --chown=node:node package.json server.mjs oauth.mjs cloud-patch-store.mjs ./

ENV NODE_ENV=production \
    DESKTOP_MATERIAL_SERVER_CONFIG=/data/config.json \
    DESKTOP_MATERIAL_SERVER_STATE=/data/state.json \
    DESKTOP_MATERIAL_SERVER_HOST=0.0.0.0 \
    DESKTOP_MATERIAL_SERVER_PORT=8787

USER node
EXPOSE 8787

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=4 \
  CMD wget -q -O /dev/null http://127.0.0.1:8787/healthz || exit 1

CMD ["node", "server.mjs"]
