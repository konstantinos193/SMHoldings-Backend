FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN DATABASE_URL=file:./dummy.db pnpm build

# ── Production image ──────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

# Copy compiled output and all node_modules (includes generated Prisma client)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
# Prisma generates client to prisma/generated/prisma/ — compiled imports
# resolve to dist/prisma/generated/prisma/ so copy it there
COPY --from=builder /app/prisma/generated ./dist/prisma/generated
COPY --from=builder /app/public ./public
COPY package.json ./

EXPOSE 3001
CMD ["node", "dist/src/main.js"]
