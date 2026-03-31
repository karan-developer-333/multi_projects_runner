FROM node:20-slim AS builder

WORKDIR /build

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY lib/ ./lib/

FROM node:20-slim

LABEL maintainer="Project Runner"
LABEL description="Project Runner Server v3.0.0 - Production Build"

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV PORT=10000
ENV ENABLE_LOGGING=false

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    wget \
    git \
    unzip \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared \
    && chmod +x /usr/local/bin/cloudflared \
    && cloudflared --version

COPY --from=builder /build/node_modules /app/node_modules
COPY --from=builder /build/src /app/src
COPY --from=builder /build/lib /app/lib

WORKDIR /app

RUN mkdir -p projects data && chmod 755 projects data

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:10000/health || exit 1

USER node

CMD ["node", "src/server.js"]
