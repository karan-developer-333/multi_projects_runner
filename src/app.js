import express from 'express';
import cors from 'cors';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config/index.js';
import { errorMiddleware, notFoundMiddleware } from './middlewares/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createApp(options = {}) {
    const app = express();

    app.use(cors());
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    if (config.enableLogging) {
        app.use((req, res, next) => {
            const start = Date.now();
            res.on('finish', () => {
                const duration = Date.now() - start;
                console.log(`[${req.method}] ${req.path} ${res.statusCode} ${duration}ms`);
            });
            next();
        });
    }

    const projectsPath = options.projectsPath || join(__dirname, '..', 'projects');

    app.get('/', (req, res) => {
        res.json({
            message: 'Project Runner Server',
            version: '3.0.0',
            environment: config.nodeEnv,
            features: {
                realTimeProgress: true,
                bunSupport: true,
                dependencyCaching: true
            },
            endpoints: {
                info: 'GET /',
                health: 'GET /health',
                projects: 'GET /projects',
                projectStart: 'GET /projects/:id',
                projectStatus: 'GET /projects/:id/status',
                projectLogs: 'GET /projects/:id/logs',
                projectProgress: 'GET /projects/:id/progress (SSE)',
                projectStop: 'POST /projects/:id/stop',
                projectRestart: 'POST /projects/:id/restart',
                stopAll: 'POST /projects/stop-all',
                deploy: 'POST /api/deploy',
                deployed: 'GET /api/deployed'
            }
        });
    });

    app.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            environment: config.nodeEnv
        });
    });

    if (options.setupRoutes) {
        options.setupRoutes(app, projectsPath);
    }

    app.use(notFoundMiddleware);
    app.use(errorMiddleware);

    return app;
}

export default createApp;
