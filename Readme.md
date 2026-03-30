# Multi-Projects Runner

A server that runs multiple projects (Node.js, Python, Go, Rust, etc.) with public tunnel URLs.

## Features

- **Multi-language support**: Node.js, Python, Go, Rust, Deno, Static sites
- **Auto-setup**: Automatically installs dependencies for each project
- **Tunnel support**: Cloudflare (primary) + ngrok (fallback)
- **Port management**: Auto-detects available ports
- **API endpoints**: Start/stop projects via REST API

## Quick Start

### Local Development

```bash
npm install
npm run dev
```

### Docker

```bash
docker build -t project-runner .
docker run -p 10000:10000 \
  -v $(pwd)/projects:/opt/render/project/src/projects \
  project-runner
```

### Docker Compose

```bash
docker-compose up --build
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 10000 | Server port |
| `NODE_ENV` | production | Environment mode |
| `NGROK_AUTHTOKEN` | - | ngrok auth token (optional) |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List projects |
| GET | `/api/projects/:id` | Get project status |
| POST | `/api/projects/:id/start` | Start project |
| POST | `/api/projects/:id/stop` | Stop project |
| GET | `/api/status` | Server status |

## Project Structure

Projects should be in the `projects/` directory:

```
projects/
├── project1/          # Node.js (has package.json)
│   ├── package.json
│   ├── vite.config.js
│   └── src/
├── project2/          # Python (has main.py)
│   ├── main.py
│   └── requirements.txt
└── project3/          # Go (has go.mod)
    └── main.go
```

## Render Deployment

1. Connect GitHub repo to Render
2. Set build command: `npm install`
3. Set start command: `node server.js`
4. Add environment variables as needed

For full setup on Render, use `setup.sh` or deploy via Dockerfile.
