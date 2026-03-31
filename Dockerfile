FROM node:20-slim

LABEL maintainer="Project Runner"
LABEL description="Multi-project runner with tunnel support (v3.0.0)"

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV PORT=10000
ENV HOME=/app

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

RUN curl -fsSL https://bun.sh/install | bash \
    && ln -s /root/.bun/bin/bun /usr/local/bin/bun

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src/ ./src/
COPY lib/ ./lib/

RUN mkdir -p data && touch data/.gitkeep
RUN mkdir -p projects

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:10000/health || exit 1

CMD ["node", "src/server.js"]
