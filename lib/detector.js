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
    const lockPath = join(projectPath, '.project-lock');
    try {
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

async function hasStreamlit(projectPath) {
    try {
        const reqPath = join(projectPath, 'requirements.txt');
        const content = await readFile(reqPath, 'utf-8');
        return content.includes('streamlit');
    } catch {
        return false;
    }
}

const LANGUAGE_CONFIGS = {
    nodejs: {
        files: ['package.json'],
        setup: async (projectPath, execAsync) => {
            if (await hasInstallLock(projectPath, 'npm')) return;
            
            await execAsync('npm install', { cwd: projectPath });
            
            await setInstallLock(projectPath, 'npm');
        },
        start: (projectPath, port) => {
            return {
                command: 'npm',
                args: ['run', 'dev', '--', '--port', port, '--host', '0.0.0.0'],
                cwd: projectPath,
                env: { ...process.env, PORT: port, HOST: '0.0.0.0' }
            };
        },
        detectPort: (output) => {
            const match = output.match(/(?:port|listening on|http.*:)\s*[:/]?\s*(\d{4,5})/i) ||
                         output.match(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{4,5})/i);
            return match ? match[1] : null;
        }
    },
    python: {
        files: ['main.py', 'app.py', 'server.py', 'requirements.txt'],
        isStreamlit: false,
        setup: async (projectPath, execAsync) => {
            const venvPath = join(projectPath, 'venv');
            if (!await checkFileExists(venvPath)) {
                await execAsync('python3 -m venv venv', { cwd: projectPath });
            }
            
            const reqPath = join(projectPath, 'requirements.txt');
            const hasReq = await checkFileExists(reqPath);
            const usingStreamlit = await hasStreamlit(projectPath);
            LANGUAGE_CONFIGS.python.isStreamlit = usingStreamlit;
            
            if (hasReq) {
                if (!(await hasInstallLock(projectPath, 'pip'))) {
                    await execAsync('source venv/bin/activate && pip install --break-system-packages -r requirements.txt', { 
                        cwd: projectPath,
                        shell: '/bin/bash'
                    });
                    await setInstallLock(projectPath, 'pip');
                }
            } else {
                await execAsync('source venv/bin/activate && pip install --break-system-packages flask fastapi streamlit', { 
                    cwd: projectPath,
                    shell: '/bin/bash'
                });
            }
        },
        start: (projectPath, port) => {
            const isStreamlit = LANGUAGE_CONFIGS.python.isStreamlit;
            const cmd = isStreamlit 
                ? `source venv/bin/activate && streamlit run main.py --server.port ${port} --server.address 0.0.0.0`
                : `source venv/bin/activate && python main.py`;
            
            return {
                command: 'bash',
                args: ['-c', cmd],
                cwd: projectPath,
                env: { ...process.env, PORT: port }
            };
        },
        detectPort: (output) => {
            const match = output.match(/(?:port|running on|http.*:)\s*[:/]?\s*(\d{4,5})/i) ||
                         output.match(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{4,5})/i) ||
                         output.match(/\* Serving on.*:(\d{4,5})/i) ||
                         output.match(/Local URL:.*:(\d{4,5})/i) ||
                         output.match(/You can now view your Streamlit app in the browser.*:(\d{4,5})/i);
            return match ? match[1] : null;
        }
    },
    go: {
        files: ['go.mod'],
        setup: async () => {},
        start: (projectPath, port) => ({
            command: 'go',
            args: ['run', 'main.go'],
            cwd: projectPath,
            env: { ...process.env, PORT: port }
        }),
        detectPort: (output) => {
            const match = output.match(/(?:port|listening|http).*?(\d{4,5})/i);
            return match ? match[1] : null;
        }
    },
    rust: {
        files: ['Cargo.toml'],
        setup: async () => {},
        start: (projectPath, port) => ({
            command: 'cargo',
            args: ['run'],
            cwd: projectPath,
            env: { ...process.env, PORT: port }
        }),
        detectPort: (output) => {
            const match = output.match(/(?:port|listening|http).*?(\d{4,5})/i);
            return match ? match[1] : null;
        }
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
        detectPort: (output) => {
            const match = output.match(/(?:port|listening|http).*?(\d{4,5})/i);
            return match ? match[1] : null;
        }
    },
    static: {
        files: ['index.html'],
        setup: async () => {},
        start: (projectPath, port) => ({
            command: 'npx',
            args: ['serve', '-p', port, '-s', projectPath],
            cwd: projectPath
        }),
        detectPort: (output) => {
            const match = output.match(/(?:port|http).*?(\d{4,5})/i);
            return match ? match[1] : null;
        }
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
