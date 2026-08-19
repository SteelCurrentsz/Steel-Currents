# Steel Currents battle service. Serves the client and the WebSocket lobby from
# a single process, so one container is the whole deployment.
FROM node:20-alpine

WORKDIR /app

# Install dependencies first so a code-only change reuses the cached layer.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

CMD ["node", "server/index.js"]
