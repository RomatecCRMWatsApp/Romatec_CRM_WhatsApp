FROM node:22-slim
WORKDIR /app

# Force rebuild cache bust — changes on every build
ARG BUILD_DATE=unspecified

# Install pnpm
RUN npm install -g pnpm@10.4.1

# Install dependencies (cached layer) — must include patches before pnpm install
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
RUN pnpm install --frozen-lockfile

# Copy source and build (this layer invalidates when source changes)
COPY . .
RUN pnpm build

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
