import { access, constants, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function checkFileExists(filepath) {
    try {
        await access(filepath, constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

export async function readJsonFile(filepath, defaultValue = null) {
    try {
        const content = await readFile(filepath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return defaultValue;
    }
}

export async function writeJsonFile(filepath, data, pretty = true) {
    const content = pretty
        ? JSON.stringify(data, null, 2)
        : JSON.stringify(data);
    await writeFile(filepath, content, 'utf-8');
}

export async function directoryExists(dirpath) {
    try {
        const entries = await readdir(dirpath, { withFileTypes: true });
        return entries !== null;
    } catch {
        return false;
    }
}

export async function isDirectory(filepath) {
    try {
        const entries = await readdir(filepath, { withFileTypes: true });
        return true;
    } catch {
        return false;
    }
}
