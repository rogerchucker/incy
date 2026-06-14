# syntax=docker/dockerfile:1
# Next.js standalone build. Build context = apps/web.
# NEXT_PUBLIC_API_URL is baked into the client bundle at build time.
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Docker Desktop's VM network resets on large parallel fetches. The cache mount
# persists downloaded tarballs across build attempts so retries resume instead of
# starting over; throttle sockets + retry hard to ride out resets.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --prefer-offline \
      --maxsockets 2 \
      --fetch-retries 8 \
      --fetch-retry-mintimeout 15000 \
      --fetch-retry-maxtimeout 180000

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
