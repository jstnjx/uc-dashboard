FROM node:22-alpine AS frontend-build

WORKDIR /app
COPY package.json ./
COPY public ./public
RUN npm run build:frontend

FROM node:22-alpine

LABEL org.opencontainers.image.source="https://github.com/jstnjx/uc-dashboard" \
      org.opencontainers.image.description="Responsive UC Dashboard for Unfolded Circle Remote Two and Remote 3" \
      org.opencontainers.image.licenses="MIT"

RUN apk add --no-cache ffmpeg

WORKDIR /app
COPY package.json driver.json *.js ./
COPY --from=frontend-build /app/public ./public
RUN mkdir -p /data /config && chown -R node:node /app /data /config

USER node
ENV NODE_ENV=production \
    UC_INTEGRATION_INTERFACE=0.0.0.0 \
    UC_INTEGRATION_HTTP_PORT=9090 \
    DASHBOARD_HOST=0.0.0.0 \
    DASHBOARD_PORT=11080 \
    DATA_DIR=/data \
    CONFIG_DIR=/config \
    CHARGING_GATED=false
EXPOSE 9090 11080
VOLUME ["/data", "/config"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:11080/api/health >/dev/null || exit 1
CMD ["node", "driver.js"]
