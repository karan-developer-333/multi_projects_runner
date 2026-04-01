import { readFile, writeFile, readdir, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const STORE_FILE = join(process.cwd(), 'data', 'deployed-projects.json');

const deployedProjects = new Map();

async function ensureDataDir() {
    const dataDir = join(process.cwd(), 'data');
    try {
        await mkdir(dataDir, { recursive: true });
    } catch {}
}

async function loadStore() {
    try {
        await ensureDataDir();
        const data = await readFile(STORE_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        deployedProjects.clear();
        for (const [id, project] of Object.entries(parsed)) {
            deployedProjects.set(id, project);
        }
    } catch {
        deployedProjects.clear();
    }
}

async function saveStore() {
    try {
        await ensureDataDir();
        const data = JSON.stringify(Object.fromEntries(deployedProjects), null, 2);
        await writeFile(STORE_FILE, data, 'utf-8');
    } catch (error) {
        console.error('Failed to save projects store:', error.message);
    }
}

function generateId() {
    return randomBytes(8).toString('hex');
}

export async function initStore() {
    await loadStore();
}

export function createProject(data) {
    const id = generateId();
    const key = data.folder || id;
    const project = {
        id,
        key,
        name: data.name || key,
        language: data.language || 'unknown',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        folder: key,
        files: data.files || {},
        config: data.config || {},
        metadata: data.metadata || {}
    };
    deployedProjects.set(id, project);
    saveStore();
    return project;
}

export function getProject(id) {
    return deployedProjects.get(id) || null;
}

export function getAllProjects() {
    return Array.from(deployedProjects.values());
}

export function updateProject(id, data) {
    const project = deployedProjects.get(id);
    if (!project) return null;
    
    const updated = {
        ...project,
        ...data,
        updatedAt: new Date().toISOString()
    };
    deployedProjects.set(id, updated);
    saveStore();
    return updated;
}

export function deleteProject(id) {
    const deleted = deployedProjects.delete(id);
    if (deleted) {
        saveStore();
    }
    return deleted;
}

export async function deleteProjectFiles(id) {
    const project = deployedProjects.get(id);
    if (!project) return false;
    
    const projectPath = join(process.cwd(), 'projects', id);
    try {
        await rm(projectPath, { recursive: true, force: true });
        return true;
    } catch {
        return false;
    }
}

export { generateId, deployedProjects };
