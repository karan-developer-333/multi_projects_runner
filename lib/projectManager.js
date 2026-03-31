import { spawn } from 'node:child_process';
import portfinder from 'portfinder';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile, readFile } from 'node:fs/promises';
import { createTunnel, destroyTunnel, getTunnelInfo } from './tunnelManager.js';
import { patchViteConfig } from './detector.js';
import { progressEmitter } from './progressEmitter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const runningProjects = new Map();

async function execAsync(command, options = {}, onData = null) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, {
            shell: options.shell || '/bin/bash',
            cwd: options.cwd || process.cwd(),
            env: { ...process.env, ...options.env },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', (data) => {
            const text = data.toString();
            stdout += text;
            if (onData) onData(text);
        });
        
        child.stderr.on('data', (data) => {
            const text = data.toString();
            stderr += text;
            if (onData) onData(text, 'stderr');
        });
        
        child.on('close', (code) => {
            if (code === 0) {
                resolve(stdout);
            } else {
                reject(new Error(stderr || `Command failed with code ${code}`));
            }
        });
        
        child.on('error', (error) => {
            reject(new Error(stderr || error.message));
        });
    });
}

async function getAvailablePort(startPort = 3001) {
    return new Promise((resolve, reject) => {
        portfinder.getPort({ port: startPort, maxPort: 9999 }, (err, port) => {
            if (err) reject(err);
            else resolve(port);
        });
    });
}

async function getLockPath(projectPath) {
    return join(projectPath, '.project-lock');
}

async function hasInstallLock(projectPath, type = 'npm') {
    const lockPath = await getLockPath(projectPath);
    try {
        const content = await readFile(lockPath, 'utf-8');
        const locks = JSON.parse(content);
        return locks[type] === true;
    } catch {
        return false;
    }
}

async function setInstallLock(projectPath, type = 'npm') {
    const lockPath = await getLockPath(projectPath);
    let locks = {};
    try {
        const content = await readFile(lockPath, 'utf-8');
        locks = JSON.parse(content);
    } catch {}
    locks[type] = true;
    await writeFile(lockPath, JSON.stringify(locks, null, 2));
}

function emitProgress(projectId, stage, message, percent, details = {}) {
    progressEmitter.progress(projectId, stage, message, percent, details);
}

function emitLog(projectId, message, source = 'stdout') {
    progressEmitter.log(projectId, message, source);
}

function emitError(projectId, message, details = {}) {
    progressEmitter.error(projectId, message, details);
}

function emitComplete(projectId, data) {
    progressEmitter.complete(projectId, data);
}

export async function startProject(projectId, projectPath, languageConfig, isStreamlit = false) {
    if (runningProjects.has(projectId)) {
        const existing = runningProjects.get(projectId);
        emitLog(projectId, 'Project already running');
        return {
            success: true,
            projectId,
            port: existing.port,
            tunnelUrl: existing.tunnelUrl,
            status: 'running',
            pid: existing.pid,
            localUrl: `http://localhost:${existing.port}`,
            message: 'Project already running'
        };
    }
    
    const port = await getAvailablePort();
    
    emitProgress(projectId, 'detecting', 'Detecting project configuration...', 5);
    emitLog(projectId, `Starting project on port ${port}`);
    
    try {
        emitProgress(projectId, 'installing', 'Setting up project environment...', 10);
        
        const emitProgressCallback = (event) => {
            if (event.type === 'progress') {
                progressEmitter.emitToProject(projectId, event);
            } else if (event.type === 'log') {
                progressEmitter.emitToProject(projectId, event);
            } else if (event.type === 'error') {
                progressEmitter.emitToProject(projectId, event);
            }
        };
        
        await languageConfig.setup(projectPath, execAsync, isStreamlit, emitProgressCallback);
        
        emitProgress(projectId, 'installing', 'Dependencies ready', 70);
        emitLog(projectId, 'Setup complete, starting server...');
    } catch (error) {
        console.error(`[${projectId}] Setup failed:`, error.message);
        emitError(projectId, `Setup failed: ${error.message}`);
        return {
            success: false,
            projectId,
            error: `Setup failed: ${error.message}`,
            status: 'error',
            message: 'Failed to setup project dependencies'
        };
    }
    
    emitProgress(projectId, 'starting', 'Starting development server...', 75);
    emitLog(projectId, 'Starting development server...');
    
    const startConfig = await languageConfig.start(projectPath, port, isStreamlit);
    
    emitProgress(projectId, 'tunnel', 'Creating public URL...', 85);
    emitLog(projectId, 'Setting up tunnel...');
    
    const tunnelUrl = await createTunnel(port, projectId);
    
    if (tunnelUrl) {
        const tunnelHost = tunnelUrl.replace('https://', '').replace('http://', '');
        emitLog(projectId, `Tunnel URL: ${tunnelUrl}`);
        await patchViteConfig(projectPath, tunnelHost);
    } else {
        emitLog(projectId, 'Tunnel creation failed, using local URL only', 'stderr');
    }
    
    emitProgress(projectId, 'starting', 'Launching server process...', 90);
    
    return new Promise((resolve) => {
        let resolved = false;
        let portDetected = false;
        let startupOutput = '';
        let detectedPort = null;
        
        const child = spawn(startConfig.command, startConfig.args, {
            cwd: startConfig.cwd,
            env: startConfig.env,
            shell: startConfig.shell || false
        });
        
        const cleanup = async () => {
            if (!resolved) return;
            await destroyTunnel(projectId);
        };
        
        child.stdout.on('data', async (data) => {
            const output = data.toString();
            startupOutput += output;
            emitLog(projectId, output.trim());
            console.log(`[${projectId}] ${output.trim()}`);
            
            if (!portDetected) {
                const detected = languageConfig.detectPort(output);
                if (detected) {
                    detectedPort = parseInt(detected);
                    portDetected = true;
                    handlePortDetected(detectedPort);
                }
            }
        });
        
        child.stderr.on('data', async (data) => {
            const output = data.toString();
            startupOutput += output;
            emitLog(projectId, output.trim(), 'stderr');
            console.error(`[${projectId}] ${output.trim()}`);
            
            if (!portDetected && !resolved) {
                const detected = languageConfig.detectPort(output);
                if (detected) {
                    detectedPort = parseInt(detected);
                    portDetected = true;
                    handlePortDetected(detectedPort);
                }
            }
        });
        
        const handlePortDetected = (finalPort) => {
            if (resolved) return;
            
            runningProjects.set(projectId, {
                pid: child.pid,
                port: finalPort,
                tunnelUrl: tunnelUrl,
                child: child,
                projectPath: projectPath,
                startupOutput: startupOutput
            });
            
            resolved = true;
            emitProgress(projectId, 'ready', 'Project is live!', 100);
            emitLog(projectId, `Server running on port ${finalPort}`);
            
            emitComplete(projectId, {
                port: finalPort,
                tunnelUrl: tunnelUrl,
                localUrl: `http://localhost:${finalPort}`,
                status: 'running',
                pid: child.pid
            });
            
            resolve({
                success: true,
                projectId,
                port: finalPort,
                tunnelUrl: tunnelUrl,
                localUrl: `http://localhost:${finalPort}`,
                status: 'running',
                pid: child.pid,
                message: tunnelUrl ? `Project started with public URL: ${tunnelUrl}` : 'Project started (tunnel unavailable)'
            });
        };
        
        child.on('error', (error) => {
            console.error(`[${projectId}] Process error:`, error.message);
            emitError(projectId, `Server error: ${error.message}`);
            if (!resolved) {
                resolved = true;
                resolve({
                    success: false,
                    projectId,
                    error: error.message,
                    status: 'error',
                    message: 'Failed to start project'
                });
            }
        });
        
        child.on('close', async (code) => {
            console.log(`[${projectId}] Process exited with code ${code}`);
            emitLog(projectId, `Server stopped (exit code: ${code})`, code === 0 ? 'stdout' : 'stderr');
            
            await destroyTunnel(projectId);
            runningProjects.delete(projectId);
            
            if (!resolved) {
                resolved = true;
                resolve({
                    success: false,
                    projectId,
                    error: `Process exited with code ${code}`,
                    status: 'stopped',
                    message: 'Project stopped (user can restart anytime)'
                });
            }
        });
        
        setTimeout(() => {
            if (!resolved) {
                const finalPort = detectedPort || port;
                console.log(`[${projectId}] Port detection timeout, using port ${finalPort}`);
                emitLog(projectId, `Using default port ${finalPort}`);
                
                runningProjects.set(projectId, {
                    pid: child.pid,
                    port: finalPort,
                    tunnelUrl: tunnelUrl,
                    child: child,
                    projectPath: projectPath,
                    startupOutput: startupOutput
                });
                
                resolved = true;
                emitProgress(projectId, 'ready', 'Project is live!', 100);
                
                emitComplete(projectId, {
                    port: finalPort,
                    tunnelUrl: tunnelUrl,
                    localUrl: `http://localhost:${finalPort}`,
                    status: 'running',
                    pid: child.pid
                });
                
                resolve({
                    success: true,
                    projectId,
                    port: finalPort,
                    tunnelUrl: tunnelUrl,
                    localUrl: `http://localhost:${finalPort}`,
                    status: 'running',
                    pid: child.pid,
                    message: tunnelUrl ? `Project started with public URL: ${tunnelUrl}` : 'Project started (tunnel unavailable)',
                    note: 'Port detected from default config'
                });
            }
        }, 20000);
    });
}

export async function stopProject(projectId) {
    const project = runningProjects.get(projectId);
    if (!project) {
        return { success: true, message: 'Project not running' };
    }
    
    try {
        emitLog(projectId, 'Stopping project...');
        await destroyTunnel(projectId);
        
        if (project.child) {
            project.child.kill('SIGTERM');
            setTimeout(() => {
                if (project.child && !project.child.killed) {
                    project.child.kill('SIGKILL');
                }
            }, 5000);
        }
        
        runningProjects.delete(projectId);
        emitLog(projectId, 'Project stopped');
        return { success: true, message: 'Project stopped (you can restart anytime)' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export function getProjectStatus(projectId) {
    const project = runningProjects.get(projectId);
    if (!project) {
        return { status: 'stopped', running: false };
    }
    
    const tunnelInfo = getTunnelInfo(projectId);
    
    return {
        status: 'running',
        running: true,
        port: project.port,
        tunnelUrl: tunnelInfo?.url || project.tunnelUrl,
        localUrl: `http://localhost:${project.port}`,
        pid: project.pid,
        tunnelProvider: tunnelInfo?.provider || null
    };
}

export function listRunningProjects() {
    const projects = [];
    for (const [id, project] of runningProjects) {
        const tunnelInfo = getTunnelInfo(id);
        projects.push({
            id,
            port: project.port,
            tunnelUrl: tunnelInfo?.url || project.tunnelUrl,
            tunnelProvider: tunnelInfo?.provider || null,
            pid: project.pid
        });
    }
    return projects;
}

export async function stopAllProjects() {
    const promises = [];
    for (const projectId of runningProjects.keys()) {
        promises.push(stopProject(projectId));
    }
    await Promise.all(promises);
}

export { execAsync, getAvailablePort, runningProjects };
