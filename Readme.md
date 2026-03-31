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

## Hugging Face Projects

You can deploy Hugging Face models and apps in your projects. For Python projects, add `transformers`, `torch`, etc. to your `requirements.txt`.

Example project structure for a Hugging Face app:

```
projects/hf-project/
├── main.py          # Your Hugging Face app code
├── requirements.txt # Include transformers, torch, etc.
└── model/           # Optional: local model files
```

To use Hugging Face models, ensure your `requirements.txt` includes:

```
transformers
torch
huggingface_hub
```

Then, in your `main.py`, you can load and use models like:

```python
from transformers import pipeline

# Example: text generation
generator = pipeline('text-generation', model='gpt2')
result = generator("Hello, I'm a language model")
print(result)
```

For Streamlit apps with Hugging Face, use the streamlit option.

1. Connect GitHub repo to Render
2. Set build command: `npm install`
3. Set start command: `node server.js`
4. Add environment variables as needed

For full setup on Render, use `setup.sh` or deploy via Dockerfile.
