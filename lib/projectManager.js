import { spawn } from 'node:child_process';
import portfinder from 'portfinder';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile, readFile } from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const runningProjects = new Map();
const installLocks = new Map();

async function execAsync(command, options = {}) {
    return new Promise((resolve, reject) => {
        exec(command, options, (error, stdout, stderr) => {
            if (error) reject(new Error(stderr || error.message));
            else resolve(stdout);
        });
    });
}

function exec(command, options = {}, callback) {
    const child = spawn(command, {
        shell: options.shell || '/bin/bash',
        cwd: options.cwd || process.cwd(),
        env: { ...process.env, ...options.env },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
        stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
        stderr += data.toString();
    });
    
    child.on('close', (code) => {
        callback(null, stdout, stderr);
    });
    
    child.on('error', (error) => {
        callback(error, stdout, stderr);
    });
    
    return child;
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

async function connectNgrok(port, projectId) {
    const authtoken = process.env.NGROK_AUTH_TOKEN;
    
    if (!authtoken) {
        console.log(`[${projectId}] No NGROK_AUTH_TOKEN found, skipping tunnel`);
        return null;
    }
    
    const existingProject = runningProjects.get(projectId);
    if (existingProject?.ngrokUrl) {
        console.log(`[${projectId}] Tunnel already exists: ${existingProject.ngrokUrl}`);
        return existingProject.ngrokUrl;
    }
    
    console.log(`[${projectId}] Connecting ngrok tunnel on port ${port}...`);
    
    return new Promise((resolve) => {
        const ngrokProcess = spawn('ngrok', [
            'http',
            port.toString(),
            '--log=stdout'
        ], {
            cwd: process.cwd(),
            env: { ...process.env, NGROK_AUTHTOKEN: authtoken }
        });
        
        let tunnelUrl = null;
        let resolved = false;
        
        const parseOutput = (output) => {
            if (tunnelUrl) return;
            
            if (output.includes('started tunnel') || output.includes('url=')) {
                const match = output.match(/url=(https?:\/\/[^\s]+)/) || output.match(/"url"\s*:\s*"([^"]+)"/);
                if (match) {
                    tunnelUrl = match[1].replace('http://', 'https://');
                    console.log(`[${projectId}] Ngrok tunnel established at ${tunnelUrl}`);
                    if (!resolved) {
                        resolved = true;
                        resolve(tunnelUrl);
                    }
                }
            }
        };
        
        ngrokProcess.stdout.on('data', (data) => parseOutput(data.toString()));
        ngrokProcess.stderr.on('data', (data) => parseOutput(data.toString()));
        
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                ngrokProcess.kill();
                console.log(`[${projectId}] Ngrok tunnel timeout, continuing without public URL`);
                resolve(null);
            }
        }, 15000);
        
        ngrokProcess.on('error', (error) => {
            if (!resolved) {
                resolved = true;
                console.error(`[${projectId}] Ngrok process error:`, error.message);
                resolve(null);
            }
        });
        
        runningProjects.set(`${projectId}-ngrok`, {
            process: ngrokProcess,
            port: port
        });
    });
}

async function disconnectNgrok(projectId) {
    const key = `${projectId}-ngrok`;
    const ngrokInstance = runningProjects.get(key);
    if (ngrokInstance?.process) {
        try {
            ngrokInstance.process.kill('SIGTERM');
        } catch {}
        runningProjects.delete(key);
    }
}

export async function startProject(projectId, projectPath, languageConfig) {
    if (runningProjects.has(projectId)) {
        const existing = runningProjects.get(projectId);
        return {
            success: true,
            projectId,
            port: existing.port,
            ngrokUrl: existing.ngrokUrl,
            status: 'running',
            pid: existing.pid,
            message: 'Project already running'
        };
    }
    
    const port = await getAvailablePort();
    
    console.log(`[${projectId}] Setting up project environment...`);
    
    try {
        await languageConfig.setup(projectPath, execAsync);
        console.log(`[${projectId}] Setup complete, starting project...`);
    } catch (error) {
        console.error(`[${projectId}] Setup failed:`, error.message);
        return {
            success: false,
            projectId,
            error: `Setup failed: ${error.message}`,
            status: 'error',
            message: 'Failed to setup project dependencies'
        };
    }
    
    const startConfig = languageConfig.start(projectPath, port);
    
    return new Promise((resolve) => {
        let resolved = false;
        let portDetected = false;
        let startupOutput = '';
        
        const child = spawn(startConfig.command, startConfig.args, {
            cwd: startConfig.cwd,
            env: startConfig.env,
            shell: startConfig.shell || false
        });
        
        child.stdout.on('data', async (data) => {
            const output = data.toString();
            startupOutput += output;
            console.log(`[${projectId}] ${output.trim()}`);
            
            if (!portDetected) {
                const detected = languageConfig.detectPort(output);
                if (detected) {
                    portDetected = true;
                    const finalPort = parseInt(detected) || port;
                    
                    const ngrokUrl = await connectNgrok(finalPort, projectId);
                    
                    runningProjects.set(projectId, {
                        pid: child.pid,
                        port: finalPort,
                        ngrokUrl: ngrokUrl,
                        child: child,
                        projectPath: projectPath,
                        startupOutput: startupOutput
                    });
                    
                    resolved = true;
                    resolve({
                        success: true,
                        projectId,
                        port: finalPort,
                        ngrokUrl: ngrokUrl,
                        localUrl: `http://localhost:${finalPort}`,
                        status: 'running',
                        pid: child.pid,
                        message: ngrokUrl ? 'Project started with public URL' : 'Project started (ngrok unavailable)'
                    });
                }
            }
        });
        
        child.stderr.on('data', (data) => {
            const output = data.toString();
            startupOutput += output;
            console.error(`[${projectId}] ${output.trim()}`);
            
            if (!portDetected && !resolved) {
                const detected = languageConfig.detectPort(output);
                if (detected) {
                    portDetected = true;
                    const finalPort = parseInt(detected) || port;
                    
                    connectNgrok(finalPort, projectId).then((ngrokUrl) => {
                        runningProjects.set(projectId, {
                            pid: child.pid,
                            port: finalPort,
                            ngrokUrl: ngrokUrl,
                            child: child,
                            projectPath: projectPath,
                            startupOutput: startupOutput
                        });
                        
                        resolved = true;
                        resolve({
                            success: true,
                            projectId,
                            port: finalPort,
                            ngrokUrl: ngrokUrl,
                            localUrl: `http://localhost:${finalPort}`,
                            status: 'running',
                            pid: child.pid,
                            message: ngrokUrl ? 'Project started with public URL' : 'Project started (ngrok unavailable)'
                        });
                    });
                }
            }
        });
        
        child.on('error', (error) => {
            console.error(`[${projectId}] Process error:`, error.message);
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
        
        child.on('close', (code) => {
            if (!resolved) {
                resolved = true;
                runningProjects.delete(projectId);
                resolve({
                    success: false,
                    projectId,
                    error: `Process exited with code ${code}`,
                    status: 'stopped',
                    message: 'Project stopped'
                });
            }
        });
        
        setTimeout(async () => {
            if (!resolved) {
                resolved = true;
                const ngrokUrl = await connectNgrok(port, projectId);
                
                runningProjects.set(projectId, {
                    pid: child.pid,
                    port: port,
                    ngrokUrl: ngrokUrl,
                    child: child,
                    projectPath: projectPath,
                    startupOutput: startupOutput
                });
                
                resolve({
                    success: true,
                    projectId,
                    port: port,
                    ngrokUrl: ngrokUrl,
                    localUrl: `http://localhost:${port}`,
                    status: 'running',
                    pid: child.pid,
                    message: ngrokUrl ? 'Project started with public URL' : 'Project started (ngrok unavailable)',
                    note: 'Port auto-detected from default config'
                });
            }
        }, 15000);
    });
}

export async function stopProject(projectId) {
    const project = runningProjects.get(projectId);
    if (!project) {
        return { success: true, message: 'Project not running' };
    }
    
    try {
        await disconnectNgrok(projectId);
        
        if (project.child) {
            project.child.kill('SIGTERM');
            setTimeout(() => {
                if (project.child && !project.child.killed) {
                    project.child.kill('SIGKILL');
                }
            }, 5000);
        }
        
        runningProjects.delete(projectId);
        return { success: true, message: 'Project stopped' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export function getProjectStatus(projectId) {
    const project = runningProjects.get(projectId);
    if (!project) {
        return { status: 'stopped', running: false };
    }
    return {
        status: 'running',
        running: true,
        port: project.port,
        ngrokUrl: project.ngrokUrl,
        localUrl: `http://localhost:${project.port}`,
        pid: project.pid
    };
}

export function listRunningProjects() {
    const projects = [];
    for (const [id, project] of runningProjects) {
        projects.push({
            id,
            port: project.port,
            ngrokUrl: project.ngrokUrl,
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

export { execAsync, exec, getAvailablePort, runningProjects };
