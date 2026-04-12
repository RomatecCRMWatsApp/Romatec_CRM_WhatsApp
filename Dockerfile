FROM node:22-slim
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10.4.1

# Install dependencies (cached layer) — must include patches before pnpm install
COPY package.json pnpm-lock.yaml patches ./
RUN pnpm install --frozen-lockfile

# Copy source and build (this layer invalidates when source changes)
COPY . .
RUN pnpm build

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
