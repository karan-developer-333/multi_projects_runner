import 'dotenv/config';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { initStore } from '../lib/projectsStore.js';
import { setupRoutes } from './routes/index.routes.js';

initStore();

const app = createApp({
    projectsPath: process.cwd() + '/projects',
    setupRoutes
});

const server = app.listen(config.port, () => {
    console.log(`Project Runner Server v3.0.0 running on port ${config.port}`);
    console.log(`Environment: ${config.nodeEnv}`);
    console.log(`Access at: http://localhost:${config.port}`);
});

process.on('SIGTERM', async () => {
    console.log('Shutting down...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', async () => {
    console.log('Shutting down...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

export default server;
