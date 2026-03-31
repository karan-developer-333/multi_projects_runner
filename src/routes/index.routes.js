import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/responseFormatter.js';
import { detectLanguage } from '../../lib/detector.js';
import { startProject, stopProject, getProjectStatus, listRunningProjects, stopAllProjects } from '../../lib/projectManager.js';
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
                            id: folderId,
                            folder: folderId,
                            name: storeData?.name || folderId,
                            isDeployed: !!storeData,
                            status: status.status,
                            language: langInfo?.language || storeData?.language || 'unknown',
                            isStreamlit: langInfo?.isStreamlit || storeData?.metadata?.isStreamlit || false,
                            tunnelUrl: status.tunnelUrl || null,
                            localUrl: status.localUrl || null,
                            tunnelProvider: status.tunnelProvider || null,
                            createdAt: storeData?.createdAt || null,
                            updatedAt: storeData?.updatedAt || null
                        });
                    } catch {
                        projects.push({
                            id: folderId,
                            folder: folderId,
                            name: storeData?.name || folderId,
                            isDeployed: !!storeData,
                            status: status.status,
                            language: storeData?.language || 'unknown',
                            isStreamlit: storeData?.metadata?.isStreamlit || false,
                            tunnelUrl: null,
                            localUrl: null,
                            tunnelProvider: null,
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

    app.get('/projects', asyncHandler(async (req, res) => {
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
                            id: folderId,
                            folder: folderId,
                            name: storeData?.name || folderId,
                            isDeployed: !!storeData,
                            status: status.status,
                            language: langInfo?.language || storeData?.language || 'unknown',
                            isStreamlit: langInfo?.isStreamlit || storeData?.metadata?.isStreamlit || false,
                            tunnelUrl: status.tunnelUrl || null,
                            localUrl: status.localUrl || null,
                            tunnelProvider: status.tunnelProvider || null
                        });
                    } catch {
                        projects.push({
                            id: folderId,
                            folder: folderId,
                            name: storeData?.name || folderId,
                            isDeployed: !!storeData,
                            status: status.status,
                            language: storeData?.language || 'unknown',
                            isStreamlit: storeData?.metadata?.isStreamlit || false,
                            tunnelUrl: null,
                            localUrl: null,
                            tunnelProvider: null
                        });
                    }
                }
            }
            
            return ApiResponse.success(res, { projects });
        } catch {
            return ApiResponse.notFound(res, 'Projects directory not found');
        }
    }));

    app.get('/projects/:id', asyncHandler(async (req, res) => {
        const { id } = req.params;
        const projectPath = `${projectsPath}/${id}`;
        
        const existingStatus = getProjectStatus(id);
        if (existingStatus.running) {
            return ApiResponse.success(res, {
                projectId: id,
                status: 'running',
                port: existingStatus.port,
                tunnelUrl: existingStatus.tunnelUrl,
                localUrl: existingStatus.localUrl,
                iframeUrl: existingStatus.tunnelUrl || existingStatus.localUrl
            }, 'Project already running');
        }
        
        const storeData = getAllProjects().find(p => p.folder === id);
        let langInfo = null;
        
        try {
            langInfo = await detectLanguage(projectPath);
        } catch (err) {
            console.log(`[${id}] Language detection from filesystem failed:`, err.message);
        }
        
        if (!langInfo && storeData) {
            const language = storeData.language || 'nodejs';
            const isStreamlit = storeData.metadata?.isStreamlit || false;
            const { LANGUAGE_CONFIGS } = await import('../../lib/detector.js');
            const config = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.nodejs;
            
            langInfo = {
                language,
                config,
                isStreamlit,
                detectedFile: 'store metadata'
            };
            console.log(`[${id}] Using language from store: ${language}`);
        }
        
        if (!langInfo) {
            return ApiResponse.badRequest(res, 'Could not detect project language');
        }
        
        console.log(`[${id}] Detected ${langInfo.language} project`);
        const result = await startProject(id, projectPath, langInfo.config, langInfo.isStreamlit);
        
        if (result.success) {
            return ApiResponse.success(res, {
                projectId: id,
                language: langInfo.language,
                isStreamlit: langInfo.isStreamlit || false,
                status: result.status,
                port: result.port,
                tunnelUrl: result.tunnelUrl,
                localUrl: result.localUrl,
                iframeUrl: result.tunnelUrl || result.localUrl
            }, result.message);
        } else {
            return ApiResponse.error(res, result.message, 'START_FAILED', 500);
        }
    }));

    app.get('/projects/:id/status', (req, res) => {
        const status = getProjectStatus(req.params.id);
        return ApiResponse.success(res, { projectId: req.params.id, ...status });
    });

    app.get('/projects/:id/progress', (req, res) => {
        const { id } = req.params;
        
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.flushHeaders();
        
        res.write(`data: ${JSON.stringify({ type: 'connected', projectId: id, timestamp: Date.now() })}\n\n`);
        progressEmitter.subscribe(id, res);
        
        const keepAlive = setInterval(() => {
            res.write(`: keepalive\n\n`);
        }, 30000);
        
        req.on('close', () => {
            clearInterval(keepAlive);
            progressEmitter.unsubscribe(id, res);
        });
    });

    app.post('/projects/:id/stop', asyncHandler(async (req, res) => {
        const result = await stopProject(req.params.id);
        return ApiResponse.success(res, { projectId: req.params.id, ...result });
    }));

    app.post('/projects/:id/restart', asyncHandler(async (req, res) => {
        const { id } = req.params;
        const projectPath = `${projectsPath}/${id}`;
        
        await stopProject(id);
        await new Promise(r => setTimeout(r, 1000));
        
        const storeData = getAllProjects().find(p => p.folder === id);
        let langInfo = null;
        
        try {
            langInfo = await detectLanguage(projectPath);
        } catch (err) {
            console.log(`[${id}] Language detection from filesystem failed:`, err.message);
        }
        
        if (!langInfo && storeData) {
            const language = storeData.language || 'nodejs';
            const isStreamlit = storeData.metadata?.isStreamlit || false;
            const { LANGUAGE_CONFIGS } = await import('../../lib/detector.js');
            const config = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.nodejs;
            
            langInfo = {
                language,
                config,
                isStreamlit,
                detectedFile: 'store metadata'
            };
            console.log(`[${id}] Using language from store: ${language}`);
        }
        
        if (!langInfo) {
            return ApiResponse.badRequest(res, 'Could not detect project language');
        }
        
        const result = await startProject(id, projectPath, langInfo.config, langInfo.isStreamlit);
        return ApiResponse.success(res, { projectId: id, ...result }, result.message);
    }));

    app.post('/projects/stop-all', asyncHandler(async (req, res) => {
        await stopAllProjects();
        return ApiResponse.success(res, {}, 'All projects stopped');
    }));

    app.post('/api/deploy', asyncHandler(async (req, res) => {
        const { name, files, language, config: cfg } = req.body;
        
        if (!files || typeof files !== 'object') {
            return ApiResponse.badRequest(res, 'files object is required');
        }
        
        const projectId = generateId();
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
            name: name || `project-${projectId}`,
            language: lang,
            folder: projectId,
            files: processedFiles,
            config: cfg || {},
            metadata: { detectedLanguage: detected.language, isStreamlit: detected.isStreamlit }
        });
        
        await writeProjectFiles(projectId, processedFiles, projectsPath);
        
        return ApiResponse.created(res, {
            projectId: project.id,
            name: project.name,
            folder: project.folder,
            language: project.language
        }, 'Project deployed successfully');
    }));

    app.get('/api/deployed', (req, res) => {
        const projects = getAllProjects();
        const result = projects.map(p => ({
            id: p.id,
            name: p.name,
            folder: p.folder,
            language: p.language,
            isStreamlit: p.metadata?.isStreamlit || false,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt
        }));
        return ApiResponse.success(res, { projects: result });
    });

    app.get('/api/deployed/:folder', (req, res) => {
        const folder = req.params.folder;
        const project = getAllProjects().find(p => p.folder === folder);
        if (!project) {
            return ApiResponse.notFound(res, 'Project not found');
        }
        
        const status = getProjectStatus(folder);
        
        return ApiResponse.success(res, {
            project: {
                id: project.id,
                name: project.name,
                language: project.language,
                isStreamlit: project.metadata?.isStreamlit || false,
                folder: project.folder,
                files: Object.keys(project.files),
                createdAt: project.createdAt,
                updatedAt: project.updatedAt,
                status: status.status,
                tunnelUrl: status.tunnelUrl || null,
                localUrl: status.localUrl || null
            }
        });
    });

    app.post('/api/deployed/:folder/start', asyncHandler(async (req, res) => {
        const folder = req.params.folder;
        const project = getAllProjects().find(p => p.folder === folder);
        if (!project) {
            return ApiResponse.notFound(res, 'Project not found');
        }
        
        const projectPath = `${projectsPath}/${folder}`;
        const langInfo = await detectLanguage(projectPath);
        
        if (!langInfo) {
            return ApiResponse.badRequest(res, 'Could not detect project language');
        }
        
        const result = await startProject(folder, projectPath, langInfo.config, langInfo.isStreamlit);
        return ApiResponse.success(res, result);
    }));

    app.put('/api/deployed/:folder', asyncHandler(async (req, res) => {
        const folder = req.params.folder;
        const project = getAllProjects().find(p => p.folder === folder);
        if (!project) {
            return ApiResponse.notFound(res, 'Project not found');
        }
        
        const { files, name, config: cfg } = req.body;
        
        if (files) {
            let processedFiles = { ...files };
            const lang = req.body.language || project.language;
            if (lang === 'nodejs') processedFiles = scaffoldNodeJS(processedFiles);
            if (lang === 'python' || lang === 'streamlit') processedFiles = scaffoldPython(processedFiles);
            
            await writeProjectFiles(folder, processedFiles, projectsPath);
            project.files = processedFiles;
        }
        
        if (name) project.name = name;
        if (cfg) project.config = { ...project.config, ...cfg };
        
        updateProject(project.id, project);
        
        return ApiResponse.success(res, { projectId: project.id, folder: project.folder }, 'Project updated successfully');
    }));

    app.delete('/api/deployed/:folder', asyncHandler(async (req, res) => {
        const folder = req.params.folder;
        const project = getAllProjects().find(p => p.folder === folder);
        if (!project) {
            return ApiResponse.notFound(res, 'Project not found');
        }
        
        await stopProject(folder);
        await deleteProjectFiles(folder);
        deleteProject(project.id);
        
        return ApiResponse.success(res, { projectId: project.id, folder }, 'Project deleted successfully');
    }));
}
