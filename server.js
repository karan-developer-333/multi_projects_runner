import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectLanguage } from './lib/detector.js';
import { startProject, stopProject, getProjectStatus, listRunningProjects, stopAllProjects } from './lib/projectManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    const projects = listRunningProjects();
    res.json({
        message: 'Project Runner Server',
        runningProjects: projects,
        endpoints: {
            'GET /': 'Server info',
            'GET /projects/:id': 'Start/access project by ID',
            'GET /projects/:id/status': 'Get project status',
            'POST /projects/:id/stop': 'Stop a running project',
            'GET /projects': 'List all projects in ./projects folder'
        }
    });
});

app.get('/projects', async (req, res) => {
    try {
        const { readdir } = await import('node:fs/promises');
        const projectsDir = join(__dirname, 'projects');
        
        try {
            const entries = await readdir(projectsDir, { withFileTypes: true });
            const projects = [];
            
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const status = getProjectStatus(entry.name);
                    try {
                        const langInfo = await detectLanguage(join(projectsDir, entry.name));
                        projects.push({
                            id: entry.name,
                            isDirectory: true,
                            status: status.status,
                            language: langInfo ? langInfo.language : 'unknown',
                            ngrokUrl: status.ngrokUrl || null
                        });
                    } catch {
                        projects.push({
                            id: entry.name,
                            isDirectory: true,
                            status: status.status,
                            language: 'unknown',
                            ngrokUrl: null
                        });
                    }
                }
            }
            
            res.json({ projects });
        } catch {
            res.status(404).json({ error: 'Projects directory not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/projects/:id', async (req, res) => {
    const projectId = req.params.id;
    const projectsDir = join(__dirname, 'projects');
    const projectPath = join(projectsDir, projectId);
    
    const existingStatus = getProjectStatus(projectId);
    if (existingStatus.running) {
        return res.json({
            success: true,
            projectId,
            status: 'running',
            port: existingStatus.port,
            ngrokUrl: existingStatus.ngrokUrl,
            localUrl: `http://localhost:${existingStatus.port}`,
            message: 'Project already running',
            iframeUrl: existingStatus.ngrokUrl || `http://localhost:${existingStatus.port}`
        });
    }
    
    try {
        const langInfo = await detectLanguage(projectPath);
        
        if (!langInfo) {
            return res.status(400).json({
                success: false,
                error: 'Could not detect project language',
                message: 'Make sure your project has a valid entry file (package.json, main.py, index.html, etc.)'
            });
        }
        
        console.log(`[${projectId}] Detected ${langInfo.language} project (via ${langInfo.detectedFile})`);
        
        if (langInfo.isStreamlit) {
            langInfo.config.isStreamlit = true;
        }
        
        const result = await startProject(projectId, projectPath, langInfo.config);
        
        if (result.success) {
            res.json({
                success: true,
                projectId,
                language: langInfo.language,
                status: result.status,
                port: result.port,
                ngrokUrl: result.ngrokUrl,
                localUrl: result.localUrl,
                pid: result.pid,
                message: result.message,
                iframeUrl: result.ngrokUrl || result.localUrl
            });
        } else {
            res.status(500).json({
                success: false,
                projectId,
                error: result.error,
                status: result.status,
                message: result.message
            });
        }
    } catch (error) {
        console.error(`[${projectId}] Error:`, error);
        res.status(500).json({
            success: false,
            projectId,
            error: error.message,
            status: 'error'
        });
    }
});

app.get('/projects/:id/status', (req, res) => {
    const projectId = req.params.id;
    const status = getProjectStatus(projectId);
    
    res.json({
        projectId,
        ...status
    });
});

app.post('/projects/:id/stop', async (req, res) => {
    const projectId = req.params.id;
    
    try {
        const result = await stopProject(projectId);
        res.json({
            projectId,
            ...result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            projectId,
            error: error.message
        });
    }
});

app.post('/projects/stop-all', async (req, res) => {
    try {
        await stopAllProjects();
        res.json({
            success: true,
            message: 'All projects stopped'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
    console.log(`Project Runner Server running on port ${PORT}`);
    console.log(`Access at: http://localhost:${PORT}`);
    console.log(`Projects directory: ${join(__dirname, 'projects')}`);
});

process.on('SIGTERM', async () => {
    console.log('Shutting down... Stopping all projects...');
    await stopAllProjects();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', async () => {
    console.log('Shutting down... Stopping all projects...');
    await stopAllProjects();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

export default app;
