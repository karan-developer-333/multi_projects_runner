#!/bin/bash
set -e

echo "==================================="
echo "Project Runner - Environment Setup"
echo "==================================="

echo "[1/5] Installing system dependencies..."
apt-get update
apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    wget \
    git \
    unzip \
    xz-utils \
    golang-go \
    build-essential \
    pkg-config \
    libssl-dev

echo "[2/5] Installing Cloudflare Tunnel..."
curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared
cloudflared --version

echo "[3/5] Installing Node.js dependencies..."
npm install

echo "[4/5] Verifying Python..."
python3 --version

echo "[5/5] Creating projects directory..."
mkdir -p /opt/render/project/src/projects

echo "==================================="
echo "Setup complete!"
echo "==================================="
echo "Run: npm start"
