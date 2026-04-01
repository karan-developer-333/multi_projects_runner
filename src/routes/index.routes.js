import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/responseFormatter.js';
import { detectLanguage } from '../../lib/detector.js';
import { startProject, stopProject, getProjectStatus, listRunningProjects, stopAllProjects, getProjectLogs } from '../../lib/projectManager.js';
import { initStore, createProject, getProject, getAllProjects, updateProject, deleteProject, deleteProjectFiles, generateId } from '../../lib/projectsStore.js';
import { writeProjectFiles, detectLanguageFromFiles, scaffoldNodeJS, scaffoldPython } from '../../lib/projectScaffolder.js';
import { progressEmitter } from '../../lib/progressEmitter.js';

initStore();

export function setupRoutes(app, projectsPath) {

    app.get('/api/projects', asyncHandler(async (req, res) => {
        const { readdir } = await import('node:fs/promises');
        
        try {
            const entries = await readdir(projectsPath, { withFileTypes: true });
            const storeProjects = getAllProjects();
            const storeMap = new Map(storeProjects.map(p => [p.folder, p]));
            
            const projects = [];
            
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const folderId = entry.name;
                    const status = getProjectStatus(folderId);
                    const storeData = storeMap.get(folderId);
                    
                    try {
                        const langInfo = await detectLanguage(`${projectsPath}/${entry.name}`);
                        projects.push({
                            key: folderId,
                            name: storeData?.name || folderId,
                            status: status.status,
                            language: langInfo?.language || storeData?.language || 'unknown',
                            isStreamlit: langInfo?.isStreamlit || storeData?.metadata?.isStreamlit || false,
                            tunnelUrl: status.tunnelUrl || null,
                            localUrl: status.localUrl || null,
                            isDeployed: !!storeData,
                            createdAt: storeData?.createdAt || null,
                            updatedAt: storeData?.updatedAt || null
                        });
                    } catch {
                        projects.push({
                            key: folderId,
                            name: storeData?.name || folderId,
                            status: status.status,
                            language: storeData?.language || 'unknown',
                            isStreamlit: storeData?.metadata?.isStreamlit || false,
                            tunnelUrl: null,
                            localUrl: null,
                            isDeployed: !!storeData,
                            createdAt: storeData?.createdAt || null,
                            updatedAt: storeData?.updatedAt || null
                        });
                    }
                }
            }
            
            return ApiResponse.success(res, { projects });
        } catch {
            return ApiResponse.notFound(res, 'Projects directory not found');
        }
    }));

    app.post('/api/projects', asyncHandler(async (req, res) => {
        const { name, files, language, config: cfg } = req.body;
        
        if (!files || typeof files !== 'object') {
            return ApiResponse.badRequest(res, 'files object is required');
        }
        
        const key = name?.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') || generateId();
        
        const detected = detectLanguageFromFiles(files);
        const lang = language || detected.language;
        
        const rootFolder = Object.keys(files)[0]?.split('/')[0] || '';
        
        const strippedFiles = {};
        for (const [filepath, content] of Object.entries(files)) {
            let strippedPath = filepath;
            if (rootFolder && filepath.startsWith(rootFolder + '/')) {
                strippedPath = filepath.substring(rootFolder.length + 1);
            }
            if (strippedPath) {
                strippedFiles[strippedPath] = content;
            }
        }
        
        let processedFiles = { ...strippedFiles };
        if (lang === 'nodejs') processedFiles = scaffoldNodeJS(processedFiles);
        if (lang === 'python' || lang === 'streamlit') processedFiles = scaffoldPython(processedFiles);
        
        const project = createProject({
            name: name || `project-${key}`,
            language: lang,
            folder: key,
            files: processedFiles,
            config: cfg || {},
            metadata: { detectedLanguage: detected.language, isStreamlit: detected.isStreamlit }
        });
        
        await writeProjectFiles(key, processedFiles, projectsPath);
        
        return ApiResponse.created(res, {
            key: project.folder,
            name: project.name,
            language: project.language
        }, 'Project deployed successfully');
    }));

    app.get('/api/projects/:key', asyncHandler(async (req, res) => {
        const { key } = req.params;
        const projectPath = `${projectsPath}/${key}`;
        
        const storeData = getAllProjects().find(p => p.folder === key);
        const status = getProjectStatus(key);
        
        if (storeData) {
            return ApiResponse.success(res, {
                key: storeData.folder,
                name: storeData.name,
                language: storeData.language,
                isStreamlit: storeData.metadata?.isStreamlit || false,
                files: Object.keys(storeData.files),
                status: status.status,
                tunnelUrl: status.tunnelUrl || null,
                localUrl: status.localUrl || null,
                createdAt: storeData.createdAt,
                updatedAt: storeData.updatedAt
            });
        }
        
        let langInfo = null;
        try {
            langInfo = await detectLanguage(projectPath);
        } catch {}
        
        if (!langInfo) {
            return ApiResponse.notFound(res, 'Project not found');
        }
        
        return ApiResponse.success(res, {
            key,
            name: key,
            language: langInfo.language,
            isStreamlit: langInfo.isStreamlit || false,
            files: [],
            status: status.status,
            tunnelUrl: status.tunnelUrl || null,
            localUrl: status.localUrl || null,
            isDeployed: false
        });
    }));

    app.put('/api/projects/:key', asyncHandler(async (req, res) => {
        const { key } = req.params;
        const project = getAllProjects().find(p => p.folder === key);
        if (!project) {
            return ApiResponse.notFound(res, 'Project not found');
        }
        
        const { files, name, config: cfg } = req.body;
        
        if (files) {
            let processedFiles = { ...files };
            const lang = req.body.language || project.language;
            if (lang === 'nodejs') processedFiles = scaffoldNodeJS(processedFiles);
            if (lang === 'python' || lang === 'streamlit') processedFiles = scaffoldPython(processedFiles);
            
            await writeProjectFiles(key, processedFiles, projectsPath);
            project.files = processedFiles;
        }
        
        if (name) project.name = name;
        if (cfg) project.config = { ...project.config, ...cfg };
        
        updateProject(project.id, project);
        
        return ApiResponse.success(res, { key: project.folder }, 'Project updated successfully');
    }));

    app.delete('/api/projects/:key', asyncHandler(async (req, res) => {
        const { key } = req.params;
        
        let project = getAllProjects().find(p => p.folder === key);
        if (!project) {
            const { existsSync } = await import('node:fs');
            if (existsSync(`${projectsPath}/${key}`)) {
                const { rm } = await import('node:fs/promises');
                await rm(`${projectsPath}/${key}`, { recursive: true, force: true });
                return ApiResponse.success(res, { key }, 'Project files deleted');
            }
            return ApiResponse.notFound(res, 'Project not found');
        }
        
        await stopProject(key);
        await deleteProjectFiles(key);
        deleteProject(project.id);
        
        return ApiResponse.success(res, { key }, 'Project deleted successfully');
    }));

    app.get('/api/projects/:key/status', (req, res) => {
        const status = getProjectStatus(req.params.key);
        return ApiResponse.success(res, { key: req.params.key, ...status });
    });

    app.post('/api/projects/:key/start', asyncHandler(async (req, res) => {
        const { key } = req.params;
        const projectPath = `${projectsPath}/${key}`;
        
        const existingStatus = getProjectStatus(key);
        if (existingStatus.running) {
            return ApiResponse.success(res, {
                key,
                status: 'running',
                port: existingStatus.port,
                tunnelUrl: existingStatus.tunnelUrl,
                localUrl: existingStatus.localUrl
            }, 'Project already running');
        }
        
        const storeData = getAllProjects().find(p => p.folder === key);
        let langInfo = null;
        
        try {
            langInfo = await detectLanguage(projectPath);
        } catch (err) {
            console.log(`[${key}] Language detection failed:`, err.message);
        }
        
        if (!langInfo && storeData) {
            const language = storeData.language || 'nodejs';
            const isStreamlit = storeData.metadata?.isStreamlit || false;
            const { LANGUAGE_CONFIGS } = await import('../../lib/detector.js');
            const config = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.nodejs;
            
            langInfo = { language, config, isStreamlit, detectedFile: 'store metadata' };
            console.log(`[${key}] Using language from store: ${language}`);
        }
        
        if (!langInfo) {
            return ApiResponse.badRequest(res, 'Could not detect project language');
        }
        
        console.log(`[${key}] Detected ${langInfo.language} project`);
        const result = await startProject(key, projectPath, langInfo.config, langInfo.isStreamlit);
        
        if (result.success) {
            return ApiResponse.success(res, {
                key,
                language: langInfo.language,
                status: result.status,
                port: result.port,
                tunnelUrl: result.tunnelUrl,
                localUrl: result.localUrl
            }, result.message);
        } else {
            return ApiResponse.error(res, result.message, 'START_FAILED', 500);
        }
    }));

    app.post('/api/projects/:key/stop', asyncHandler(async (req, res) => {
        const result = await stopProject(req.params.key);
        return ApiResponse.success(res, { key: req.params.key, ...result });
    }));

    app.get('/api/projects/:key/logs', (req, res) => {
        const { key } = req.params;
        const lines = parseInt(req.query.lines) || 100;
        const result = getProjectLogs(key, lines);
        
        if (!result.success) {
            return ApiResponse.notFound(res, result.error);
        }
        
        return ApiResponse.success(res, {
            key,
            logs: result.logs,
            lineCount: result.lineCount
        });
    });

    app.get('/api/projects/:key/progress', (req, res) => {
        const { key } = req.params;
        
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.flushHeaders();
        
        res.write(`data: ${JSON.stringify({ type: 'connected', key, timestamp: Date.now() })}\n\n`);
        progressEmitter.subscribe(key, res);
        
        const keepAlive = setInterval(() => {
            res.write(`: keepalive\n\n`);
        }, 30000);
        
        req.on('close', () => {
            clearInterval(keepAlive);
            progressEmitter.unsubscribe(key, res);
        });
    });

    app.post('/api/projects/:key/restart', asyncHandler(async (req, res) => {
        const { key } = req.params;
        const projectPath = `${projectsPath}/${key}`;
        
        await stopProject(key);
        await new Promise(r => setTimeout(r, 1000));
        
        const storeData = getAllProjects().find(p => p.folder === key);
        let langInfo = null;
        
        try {
            langInfo = await detectLanguage(projectPath);
        } catch (err) {
            console.log(`[${key}] Language detection failed:`, err.message);
        }
        
        if (!langInfo && storeData) {
            const language = storeData.language || 'nodejs';
            const isStreamlit = storeData.metadata?.isStreamlit || false;
            const { LANGUAGE_CONFIGS } = await import('../../lib/detector.js');
            const config = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.nodejs;
            
            langInfo = { language, config, isStreamlit, detectedFile: 'store metadata' };
        }
        
        if (!langInfo) {
            return ApiResponse.badRequest(res, 'Could not detect project language');
        }
        
        const result = await startProject(key, projectPath, langInfo.config, langInfo.isStreamlit);
        return ApiResponse.success(res, { key, ...result }, result.message);
    }));

    app.post('/api/projects/stop-all', asyncHandler(async (req, res) => {
        await stopAllProjects();
        return ApiResponse.success(res, {}, 'All projects stopped');
    }));
}