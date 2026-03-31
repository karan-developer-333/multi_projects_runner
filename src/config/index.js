import { PORT_RANGES } from '../constants/ports.js';

class Config {
    constructor() {
        this.port = this.validatePort(process.env.PORT);
        this.projectsPath = this.resolveProjectsPath(process.env.PROJECTS_PATH);
        this.tunnelProvider = this.resolveTunnelProvider(process.env.TUNNEL_PROVIDER);
        this.ngrokToken = process.env.NGROK_AUTH_TOKEN || null;
        this.nodeEnv = process.env.NODE_ENV || 'development';
        this.enableLogging = process.env.ENABLE_LOGGING !== 'false';
    }

    validatePort(port) {
        const num = parseInt(port, 10);
        if (isNaN(num) || num < 1024 || num > 65535) {
            return PORT_RANGES.DEFAULT_SERVER;
        }
        return num;
    }

    resolveProjectsPath(path) {
        if (!path) return null;
        return path.startsWith('/') ? path : null;
    }

    resolveTunnelProvider(provider) {
        if (!provider) return ['cloudflare', 'ngrok'];
        return provider.split(',').map(p => p.trim().toLowerCase());
    }

    isProduction() {
        return this.nodeEnv === 'production';
    }

    isDevelopment() {
        return this.nodeEnv === 'development';
    }
}

export const config = new Config();
export default config;
