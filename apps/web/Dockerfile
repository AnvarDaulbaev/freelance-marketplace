# Build context: repository root (see docker-compose.yml)
FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @fm/web --workspace @fm/shared --include-workspace-root

COPY packages/shared packages/shared
COPY apps/web apps/web
# The /api rewrite target is baked in at build time.
ARG API_URL=http://api:4000
ENV API_URL=$API_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @fm/shared && npm run build -w @fm/web \
 && chown -R node:node /app/apps/web/.next

WORKDIR /app/apps/web
USER node
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
