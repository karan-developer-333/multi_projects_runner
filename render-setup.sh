#!/bin/bash
set -e

echo "==================================="
echo "Render Deployment Setup"
echo "==================================="

echo "[1/4] Installing Cloudflare Tunnel..."
curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

echo "[2/4] Installing Node.js dependencies..."
npm install --production

echo "[3/4] Creating projects directory..."
mkdir -p /opt/render/project/src/projects

echo "[4/4] Verifying setup..."
cloudflared --version
node --version
python3 --version

echo "==================================="
echo "Setup complete!"
echo "==================================="
