# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
# prisma/ and prisma.config.ts are needed because the postinstall
# script runs "prisma generate" which requires the schema file
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
RUN npm ci

# Stage 2: Build the application
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client (again, with full source) and build Next.js
RUN npx prisma generate

# Dummy values so next build can compile server code that references
# these env vars at module-load time.  The real values are injected
# at runtime by Railway's environment variables.
ENV JWT_SECRET=build-placeholder
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder

RUN npm run build

# Stage 3: Production runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public assets first
COPY --from=builder /app/public ./public

# Copy the standalone server (this includes its own node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma files AFTER standalone (so they aren't overwritten)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/dotenv ./node_modules/dotenv

# Copy startup script
COPY start.sh ./start.sh
RUN chmod +x ./start.sh

USER nextjs

EXPOSE 3000

CMD ["./start.sh"]
