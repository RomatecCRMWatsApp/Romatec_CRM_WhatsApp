FROM node:22-slim
WORKDIR /app

# Force rebuild cache bust — changes on every build
ARG BUILD_DATE=unspecified

# pdftoppm (poppler): converte o PDF das credenciais em PNG por página (server/credenciais.ts)
# LibreOffice Writer + fontes Liberation: DOCX → PDF dos contratos (server/contratos/render.ts)
# ffmpeg: materiais em vídeo no formato do corretor (server/materialFormatado.ts)
RUN apt-get -o Acquire::Retries=5 update && apt-get -o Acquire::Retries=5 install -y --no-install-recommends poppler-utils libreoffice-writer fonts-liberation ffmpeg && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm@10.4.1

# Install dependencies (cached layer) — must include patches before pnpm install
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
# Use --no-frozen-lockfile to allow regeneration if package.json changes
RUN pnpm config set fetch-retries 5 && pnpm install --no-frozen-lockfile

# Copy source and build (this layer invalidates when source changes)
COPY . .
RUN pnpm build

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
