FROM node:20-slim

LABEL maintainer="Project Runner"
LABEL description="Multi-project runner with tunnel support"

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV PORT=10000

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    golang-go \
    cargo \
    curl \
    wget \
    git \
    unzip \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.dl.cloudflare.com/cloudflare-main.gpg | tee /usr/share/keyrings/cloudflare-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/cloudflare-archive-keyring.gpg] https://deb.dl.cloudflare.com/cloudflared ${CLOUDFLARE_DISTRO:-$(. /etc/os-release; echo $VERSION_ID)} main" | tee /etc/apt/sources.list.d/cloudflared.list \
    && apt-get update \
    && apt-get install -y cloudflared \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/render/project/src

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY . .

RUN mkdir -p /opt/render/project/src/projects

EXPOSE 10000

CMD ["node", "server.js"]
