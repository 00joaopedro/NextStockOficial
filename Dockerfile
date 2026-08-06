FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY scripts/lib ./scripts/lib
RUN npm ci
COPY . .
RUN node scripts/ci/verify-dependency-tree.mjs
RUN npx prisma generate && npm run build && npm run build:frontend && npm run build:scripts

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8080 NEXTSTOCK_PROCESS_ROLE=api
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package*.json ./
USER node
EXPOSE 8080
CMD ["node", "dist/src/main.js"]
