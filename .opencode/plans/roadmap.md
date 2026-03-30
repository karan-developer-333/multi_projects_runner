# Project Runner Server - Improvement Roadmap

## Executive Summary

A comprehensive plan to fix the Project Runner Server by replacing unreliable ngrok CLI usage with the `@ngrok/ngrok` npm package, adding Cloudflare Tunnel as a free alternative, and resolving the restart loop and other critical issues.

---

## Current State Analysis

### Critical Issues
| Issue | Severity | Location | Impact |
|-------|----------|----------|--------|
| Wrong ngrok env var `NGROK_AUTHTOKEN` vs `NGROK_AUTH_TOKEN` | CRITICAL | projectManager.js:110 | ngrok tunnels always fail |
| Restart loop due to nodemon watching project dirs | CRITICAL | nodemon config | infinite restarts |
| Vite port regex may not match output | MEDIUM | detector.js:104-109 | delayed/failed port detection |
| Global `isStreamlit` state | MEDIUM | detector.js:127 | wrong project type detected |
| Process crash doesn't cleanup ngrok | MEDIUM | projectManager.js:303 | orphaned tunnels |
| No health checks for running projects | LOW | server.js | stale status data |

---

## Phase 1: Core Infrastructure Fixes

### 1.1 Fix ngrok Integration with @ngrok/ngrok Package

**Problem:** Current code uses ngrok CLI with wrong environment variable and unreliable parsing.

**Solution:**
- Replace CLI spawning with `@ngrok/ngrok` npm package
- Use programmatic API for tunnel creation
- Proper error handling and reconnection logic

**Files to modify:**
- `package.json` - Add/verify `@ngrok/ngrok` dependency
- `lib/tunnelManager.js` (NEW) - Abstract tunnel creation logic
- `lib/projectManager.js` - Replace `connectNgrok()` with tunnel manager

### 1.2 Add Cloudflare Tunnel (Argo Tunnel) Support

**Problem:** ngrok requires authentication token and has limitations on free tier.

**Solution:** Implement Cloudflare Tunnel as a free alternative using `cloudflared` CLI.

**Why Cloudflare Tunnel:**
- Free and unlimited
- No authentication required (just Cloudflare account)
- Faster and more reliable connections
- Can use random domains on trycloudflare.com (no account needed)

### 1.3 Tunnel Strategy (Priority Order)

1. **Try Cloudflare Tunnel first** (free, no auth needed)
2. **Fall back to ngrok** (if Cloudflare fails)
3. **Continue without public URL** (if both fail - app still works on localhost)

---

## Phase 2: Fix Restart Loop

### 2.1 Separate Nodemon Configuration

Create a separate `nodemon.json` that explicitly excludes projects:

```json
{
  "watch": ["server.js", "lib/", "routes/", ".env"],
  "ignore": ["projects/", "node_modules/", "*.log"],
  "ext": "js,json",
  "delay": "1000"
}
```

### 2.2 Process Lock Mechanism

Prevent multiple instances of the same project from starting using lock files.

### 2.3 Debounced Startup

Add delay between detection and startup to prevent rapid restarts.

---

## Phase 3: Improved Port Detection

### 3.1 Enhanced Vite Detection

Improve regex to match Vite's actual output format:
- "Local:   http://localhost:5173/"
- Alternative formats from other frameworks

### 3.2 Fallback Port Strategy

If port detection fails after 20 seconds, try common ports: 3000, 3001, 3002, 5173, 8000, 8080

---

## Phase 4: Stateless Architecture

### 4.1 Fix Global State Issue

Return detection metadata from `detectLanguage()` instead of mutating global config.

### 4.2 Project Metadata Storage

Store per-project config in `.project-meta/{projectId}.json`.

---

## Phase 5: Health Checks & Monitoring

- Periodic health check every 30 seconds
- Project crash recovery with auto-restart option
- Tunnel status monitoring

---

## Phase 6: API Enhancements

- `GET /health` - Server health status
- `GET /projects/:id/logs` - Stream project logs
- `POST /projects/:id/tunnel` - Switch tunnel provider

---

## Implementation Order

### Phase 1: Foundation
1. Fix ngrok integration with `@ngrok/ngrok` package
2. Create `lib/tunnelManager.js`
3. Update `package.json` with correct dependencies
4. Test ngrok tunnels work

### Phase 2: Alternatives & Stability
5. Add Cloudflare Tunnel support
6. Implement tunnel fallback strategy
7. Fix restart loop (nodemon config)
8. Add process lock mechanism

### Phase 3: Reliability
9. Improve port detection regex
10. Add fallback port strategy
11. Fix global state issue (stateless)
12. Add health checks

### Phase 4: Polish
13. API enhancements
14. Error handling improvements
15. Logging improvements

---

## File Changes Summary

| Action | File | Changes |
|--------|------|---------|
| MODIFY | `package.json` | Add `@ngrok/ngrok`, verify dependencies |
| CREATE | `lib/tunnelManager.js` | Tunnel abstraction (ngrok + cloudflare) |
| MODIFY | `lib/projectManager.js` | Use tunnel manager, fix env var |
| MODIFY | `lib/detector.js` | Stateless detection, improved regex |
| CREATE | `nodemon.json` | Explicit watch/ignore config |
| CREATE | `.project-meta/` | Per-project metadata storage |
| MODIFY | `server.js` | Health checks, new endpoints |
| MODIFY | `.env.example` | Document tunnel settings |

---

## Success Metrics

- [ ] ngrok tunnels work with `@ngrok/ngrok` package
- [ ] Cloudflare tunnels work without authentication
- [ ] No restart loops when projects are created/modified
- [ ] Port detection works for Vite, Express, Flask, FastAPI, Streamlit
- [ ] Multiple projects can run simultaneously
- [ ] Health checks detect and recover from crashes
- [ ] API returns accurate project status
