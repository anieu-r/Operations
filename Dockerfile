# ---- AusWise Migration — production image ----
FROM node:22-alpine

# Small init so signals (SIGTERM) are handled cleanly on most platforms
RUN apk add --no-cache tini

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Install production dependencies first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App source
COPY server ./server
COPY public ./public

# Run as the non-root user that ships with the node image
RUN mkdir -p server/data && chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/index.js"]
