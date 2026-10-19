# Build context: repository root (see docker-compose.yml)
FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @fm/api --workspace @fm/shared --include-workspace-root

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @fm/shared \
 && cd apps/api && npx prisma generate && npx nest build

WORKDIR /app/apps/api
USER node
EXPOSE 4000
# Apply migrations, make sure categories + admin exist, then start.
CMD ["sh", "-c", "npx prisma migrate deploy && npx ts-node prisma/seed.ts && node dist/main.js"]
