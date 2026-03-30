FROM node:20-slim

LABEL maintainer="Project Runner"
LABEL description="Multi-project runner with tunnel support"

ENV DEBIAN_FRONTEND=noninteractive
ENV PORT=10000

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

WORKDIR /opt/render/project/src

COPY package*.json ./
RUN npm ci && npm cache clean --force

COPY . .

RUN mkdir -p /opt/render/project/src/projects

EXPOSE 10000

CMD ["node", "server.js"]
