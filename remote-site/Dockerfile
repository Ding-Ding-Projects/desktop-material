# syntax=docker/dockerfile:1.7

FROM node:22.13-alpine AS dependencies
WORKDIR /site
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM dependencies AS build
COPY . .
RUN npm run build

FROM node:22.13-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    WRANGLER_WRITE_LOGS=false \
    WRANGLER_LOG_PATH=/tmp/desktop-material-remote-wrangler.log \
    MINIFLARE_REGISTRY_PATH=/tmp/desktop-material-remote-registry
WORKDIR /site
COPY --from=build --chown=node:node /site /site
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1
CMD ["npm", "run", "start"]
