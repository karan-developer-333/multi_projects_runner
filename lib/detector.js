import { readdir, access, constants, readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

async function checkFileExists(filepath) {
    try {
        await access(filepath, constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

async function hasInstallLock(projectPath, type) {
    try {
        const lockPath = join(projectPath, '.project-lock');
        const content = await readFile(lockPath, 'utf-8');
        const locks = JSON.parse(content);
        return locks[type] === true;
    } catch {
        return false;
    }
}

async function setInstallLock(projectPath, type) {
    const lockPath = join(projectPath, '.project-lock');
    let locks = {};
    try {
        const content = await readFile(lockPath, 'utf-8');
        locks = JSON.parse(content);
    } catch {}
    locks[type] = true;
    await writeFile(lockPath, JSON.stringify(locks, null, 2));
}

async function clearInstallLock(projectPath, type) {
    const lockPath = join(projectPath, '.project-lock');
    let locks = {};
    try {
        const content = await readFile(lockPath, 'utf-8');
        locks = JSON.parse(content);
    } catch {}
    if (locks[type]) {
        delete locks[type];
        await writeFile(lockPath, JSON.stringify(locks, null, 2));
    }
}

async function hasStreamlit(projectPath) {
    try {
        const reqPath = join(projectPath, 'requirements.txt');
        const content = await readFile(reqPath, 'utf-8');
        return content.includes('streamlit');
    } catch {
        return false;
    }
}

function detectPort(output) {
    const patterns = [
        /Local:\s+(?:https?:\/\/)?(?:[^:\s]+):(\d{4,5})/i,
        /Local:\s+.*?(https?:\/\/)?[^:\s]+:(\d{4,5})/i,
        /(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{4,5})/i,
        /(?:port|listening on|running on)\s*[:=]?\s*(?:https?:\/\/)?(?:[^:\s]+:)?(\d{4,5})/i,
        /\*\s+Running on.*:(\d{4,5})/i,
        /You can now view your.*at.*:(\d{4,5})/i,
        /Local URL:.*:(\d{4,5})/i,
        /port\s*(\d{4,5})/i,
        /PORT\s*(\d{4,5})/i,
        /server.*(?:port|addr|address).*?(\d{4,5})/i
    ];
    
    for (const pattern of patterns) {
        const match = output.match(pattern);
        if (match) {
            return match[1] || match[2] || match[3];
        }
    }
    
    return null;
}

const LANGUAGE_CONFIGS = {
    nodejs: {
        files: ['package.json'],
        setup: async (projectPath, execAsync) => {
            const nodeModulesPath = join(projectPath, 'node_modules');
            const viteBin = join(projectPath, 'node_modules', '.bin', 'vite');
            const hasNodeModules = await checkFileExists(nodeModulesPath);
            const hasViteBin = await checkFileExists(viteBin);
            
            if (!hasNodeModules || !hasViteBin) {
                console.log(`[nodejs] Installing dependencies in ${projectPath}...`);
                try {
                    await execAsync('npm install --include=dev', { cwd: projectPath });
                    console.log(`[nodejs] Dependencies installed successfully`);
                } catch (error) {
                    console.error(`[nodejs] npm install failed:`, error.message);
                    throw error;
                }
            }
        },
        start: (projectPath, port) => {
            const viteBin = join(projectPath, 'node_modules', '.bin', 'vite');
            return {
                command: 'node',
                args: [viteBin, '--port', port, '--host', '0.0.0.0'],
                cwd: projectPath,
                env: { ...process.env, PORT: port, HOST: '0.0.0.0' }
            };
        },
        detectPort
    },
    python: {
        files: ['main.py', 'app.py', 'server.py', 'requirements.txt'],
        setup: async (projectPath, execAsync, isStreamlit = false) => {
            const venvPath = join(projectPath, 'venv');
            const venvActivate = join(projectPath, 'venv', 'bin', 'activate');
            const venvPython = join(projectPath, 'venv', 'bin', 'python');
            const venvStreamlit = join(projectPath, 'venv', 'bin', 'streamlit');
            const hasVenv = await checkFileExists(venvPath);
            const hasVenvPython = await checkFileExists(venvPython);
            const hasVenvStreamlit = await checkFileExists(venvStreamlit);
            const reqPath = join(projectPath, 'requirements.txt');
            const hasReq = await checkFileExists(reqPath);
            const hasLock = await hasInstallLock(projectPath, 'pip');
            
            const shouldDetectStreamlit = isStreamlit || await hasStreamlit(projectPath);
            const needsSetup = !hasVenv || !hasVenvPython || (shouldDetectStreamlit && !hasVenvStreamlit) || !hasLock;
            
            if (needsSetup) {
                if (!hasVenv || !hasVenvPython) {
                    console.log(`[python] Creating virtual environment...`);
                    await execAsync('python3 -m venv venv', { cwd: projectPath });
                }
                
                if (hasReq) {
                    console.log(`[python] Installing requirements...`);
                    await execAsync('source venv/bin/activate && pip install --break-system-packages -r requirements.txt', { 
                        cwd: projectPath,
                        shell: '/bin/bash'
                    });
                } else if (shouldDetectStreamlit && !hasVenvStreamlit) {
                    console.log(`[python] Installing streamlit...`);
                    await execAsync('source venv/bin/activate && pip install --break-system-packages streamlit flask fastapi', { 
                        cwd: projectPath,
                        shell: '/bin/bash'
                    });
                }
                
                await setInstallLock(projectPath, 'pip');
                console.log(`[python] Python environment ready`);
            }
        },
        start: (projectPath, port, isStreamlit = false) => {
            const shouldDetectStreamlit = isStreamlit;
            let cmd;
            
            if (shouldDetectStreamlit) {
                cmd = `source venv/bin/activate && streamlit run main.py --server.port ${port} --server.address 0.0.0.0 --server.headless true`;
            } else {
                cmd = `source venv/bin/activate && python main.py`;
            }
            
            return {
                command: 'bash',
                args: ['-c', cmd],
                cwd: projectPath,
                env: { ...process.env, PORT: port }
            };
        },
        detectPort
    },
    go: {
        files: ['go.mod'],
        setup: async (projectPath, execAsync) => {
            console.log(`[go] Downloading dependencies...`);
            await execAsync('go mod download', { cwd: projectPath });
        },
        start: (projectPath, port) => ({
            command: 'go',
            args: ['run', 'main.go'],
            cwd: projectPath,
            env: { ...process.env, PORT: port }
        }),
        detectPort
    },
    rust: {
        files: ['Cargo.toml'],
        setup: async (projectPath, execAsync) => {
            console.log(`[rust] Building dependencies...`);
            await execAsync('cargo build', { cwd: projectPath });
        },
        start: (projectPath, port) => ({
            command: 'cargo',
            args: ['run'],
            cwd: projectPath,
            env: { ...process.env, PORT: port }
        }),
        detectPort
    },
    deno: {
        files: ['deno.json', 'deno.jsonc'],
        setup: async () => {},
        start: (projectPath, port) => ({
            command: 'deno',
            args: ['run', '--allow-net', 'main.ts'],
            cwd: projectPath,
            env: { ...process.env, PORT: port }
        }),
        detectPort
    },
    static: {
        files: ['index.html'],
        setup: async () => {},
        start: (projectPath, port) => ({
            command: 'npx',
            args: ['serve', '-p', port, '-s', projectPath],
            cwd: projectPath
        }),
        detectPort
    }
};

export async function detectLanguage(projectPath) {
    const entries = await readdir(projectPath, { withFileTypes: true });
    const files = entries.map(e => e.name);
    
    for (const [lang, config] of Object.entries(LANGUAGE_CONFIGS)) {
        for (const file of config.files) {
            if (files.includes(file)) {
                if (lang === 'python') {
                    const isStreamlit = await hasStreamlit(projectPath);
                    return {
                        language: lang,
                        config: config,
                        detectedFile: file,
                        isStreamlit
                    };
                }
                return {
                    language: lang,
                    config: config,
                    detectedFile: file
                };
            }
        }
    }
    
    const extMap = {
        '.js': 'nodejs',
        '.ts': 'nodejs',
        '.py': 'python',
        '.go': 'go',
        '.rs': 'rust',
        '.html': 'static',
        '.htm': 'static'
    };
    
    for (const file of files) {
        const ext = extname(file).toLowerCase();
        if (extMap[ext]) {
            return {
                language: extMap[ext],
                config: LANGUAGE_CONFIGS[extMap[ext]],
                detectedFile: file
            };
        }
    }
    
    return null;
}

export { checkFileExists, LANGUAGE_CONFIGS };
