import { readdir, access, constants, readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { spawn } from 'node:child_process';

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

async function getPackageJson(projectPath) {
    try {
        const pkgPath = join(projectPath, 'package.json');
        const content = await readFile(pkgPath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return null;
    }
}

async function checkBunAvailable() {
    try {
        return new Promise((resolve) => {
            const child = spawn('bun', ['--version'], { shell: '/bin/bash' });
            child.on('close', (code) => resolve(code === 0));
            child.on('error', () => resolve(false));
        });
    } catch {
        return false;
    }
}

async function patchViteConfig(projectPath, tunnelHost) {
    const configPath = join(projectPath, 'vite.config.js');
    const configMjsPath = join(projectPath, 'vite.config.mjs');
    
    const hasConfig = await checkFileExists(configPath);
    const hasMjsConfig = await checkFileExists(configMjsPath);
    const configFile = hasConfig ? configPath : hasMjsConfig ? configMjsPath : null;
    
    if (!configFile) return false;
    
    try {
        let content = await readFile(configFile, 'utf-8');
        
        if (content.includes('allowedHosts: true')) {
            return true; // already allows all
        }
        
        // Replace any allowedHosts array or value with true
        content = content.replace(/allowedHosts:\s*[^,\}]+/, 'allowedHosts: true');
        
        // If no allowedHosts in server, add it
        if (content.includes('server:') && !content.includes('allowedHosts')) {
            content = content.replace(/server:\s*\{/, 'server: {\n    allowedHosts: true,');
        } else if (!content.includes('server:')) {
            content = content.replace(/export default defineConfig\(\s*\{/, `export default defineConfig({\n  server: { allowedHosts: true },`);
        }
        
        await writeFile(configFile, content, 'utf-8');
        return true;
    } catch (error) {
        console.error('Failed to patch vite config:', error.message);
        return false;
    }
}

async function ensureAllowedHostsTrue(projectPath) {
    const configPath = join(projectPath, 'vite.config.js');
    const configMjsPath = join(projectPath, 'vite.config.mjs');
    
    const hasConfig = await checkFileExists(configPath);
    const hasMjsConfig = await checkFileExists(configMjsPath);
    const configFile = hasConfig ? configPath : hasMjsConfig ? configMjsPath : null;
    
    if (!configFile) return false;
    
    try {
        let content = await readFile(configFile, 'utf-8');
        
        if (content.includes('allowedHosts: true')) {
            return true; // already has it
        }
        
        // If has server config, add allowedHosts: true to it
        if (content.includes('server:')) {
            content = content.replace(/server:\s*\{([^{}]*)\}/, (match, inside) => {
                if (inside.trim()) {
                    return `server: {\n    ${inside.trim()},\n    allowedHosts: true\n  }`;
                } else {
                    return `server: {\n    allowedHosts: true\n  }`;
                }
            });
        } else {
            // Add server config
            content = content.replace(/export default defineConfig\(\s*\{/, `export default defineConfig({\n  server: { allowedHosts: true },`);
        }
        console.log('Patching Vite config to ensure allowedHosts: true', configFile);
        await writeFile(configFile, content, 'utf-8');
        return true;
    } catch (error) {
        console.error('Failed to ensure allowedHosts: true:', error.message);
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
        /server.*(?:port|addr|address).*?(\d{4,5})/i,
        /ready on.*?:(\d{4,5})/i,
        /started server on.*?:(\d{4,5})/i
    ];
    
    for (const pattern of patterns) {
        const match = output.match(pattern);
        if (match) {
            return match[1] || match[2] || match[3];
        }
    }
    
    return null;
}

async function getNodeStartCommand(projectPath, port) {
    const pkg = await getPackageJson(projectPath);
    const isNext = pkg?.dependencies?.next || pkg?.devDependencies?.next;
    const isVite = pkg?.dependencies?.vite || pkg?.devDependencies?.vite;
    
    let args = ['run', 'dev'];
    
    if (isNext) {
        args.push('--', '--port', port, '--hostname', '0.0.0.0');
    } else if (isVite) {
        args.push('--', '--port', port, '--host', '0.0.0.0');
    } else {
        args.push('--', '--port', port);
    }
    
    return {
        command: 'npm',
        args,
        cwd: projectPath,
        env: { ...process.env, PORT: port, HOST: '0.0.0.0' }
    };
}

function createProgressLogger(emitProgress, projectId) {
    return {
        log: (message, source = 'stdout') => {
            emitProgress?.({ type: 'log', message, source, timestamp: Date.now() });
        },
        progress: (stage, message, percent, details = {}) => {
            emitProgress?.({ type: 'progress', stage, message, percent, timestamp: Date.now(), ...details });
        },
        error: (message, details = {}) => {
            emitProgress?.({ type: 'error', message, timestamp: Date.now(), ...details });
        }
    };
}

const LANGUAGE_CONFIGS = {
    nodejs: {
        files: ['package.json'],
        setup: async (projectPath, execAsync, isStreamlit, emitProgress) => {
            const logger = createProgressLogger(emitProgress);
            const nodeModulesPath = join(projectPath, 'node_modules');
            const hasNodeModules = await checkFileExists(nodeModulesPath);
            
            if (!hasNodeModules) {
                const hasBun = await checkBunAvailable();
                
                logger.progress('installing', 'Checking dependencies...', 20);
                logger.log('Detecting package manager...');
                
                if (hasBun) {
                    logger.progress('installing', 'Installing with Bun (fast mode)...', 25);
                    logger.log('Using Bun for faster installation');
                    
                    const bunLockPath = join(projectPath, 'bun.lockb');
                    const hasBunLock = await checkFileExists(bunLockPath);
                    
                    try {
                        logger.log('Running bun install...');
                        await execAsync('bun install --frozen-lockfile', { cwd: projectPath }, (data) => {
                            logger.log(data, 'stdout');
                        });
                        logger.progress('installing', 'Bun installation complete', 60);
                    } catch (err) {
                        logger.log('Bun install failed, falling back to npm...', 'stderr');
                        logger.progress('installing', 'Installing with npm...', 30);
                        
                        try {
                            await execAsync('npm install --include=dev --prefer-offline', { cwd: projectPath }, (data) => {
                                logger.log(data, 'stdout');
                            });
                            logger.progress('installing', 'npm installation complete', 60);
                        } catch (npmErr) {
                            logger.log('npm install failed, trying npm ci...', 'stderr');
                            await execAsync('npm ci --include=dev', { cwd: projectPath }, (data) => {
                                logger.log(data, 'stdout');
                            });
                            logger.progress('installing', 'npm ci complete', 60);
                        }
                    }
                } else {
                    logger.log('Bun not available, using npm');
                    logger.progress('installing', 'Installing with npm...', 30);
                    
                    const npmLockPath = join(projectPath, 'package-lock.json');
                    const hasNpmLock = await checkFileExists(npmLockPath);
                    
                    if (hasNpmLock) {
                        logger.log('Using package-lock.json for deterministic install');
                        await execAsync('npm ci --include=dev --prefer-offline', { cwd: projectPath }, (data) => {
                            logger.log(data, 'stdout');
                        });
                    } else {
                        logger.log('No lock file, running npm install');
                        await execAsync('npm install --include=dev --prefer-offline', { cwd: projectPath }, (data) => {
                            logger.log(data, 'stdout');
                        });
                    }
                    logger.progress('installing', 'Dependencies installed', 60);
                }
                
                await setInstallLock(projectPath, 'npm');
                
                // Ensure Vite config has allowedHosts: true
                const pkg = JSON.parse(await readFile(join(projectPath, 'package.json'), 'utf-8'));
                const isVite = pkg?.dependencies?.vite || pkg?.devDependencies?.vite;
                if (isVite) {
                    logger.log('Ensuring Vite config has allowedHosts: true');
                    await ensureAllowedHostsTrue(projectPath);
                }
            } else {
                logger.log('Dependencies already installed (node_modules exists)');
                logger.progress('installing', 'Using cached dependencies', 50);
            }
        },
        start: async (projectPath, port) => getNodeStartCommand(projectPath, port),
        detectPort
    },
    nextjs: {
        files: ['next.config.js', 'next.config.mjs'],
        setup: async (projectPath, execAsync, isStreamlit, emitProgress) => {
            const logger = createProgressLogger(emitProgress);
            const nodeModulesPath = join(projectPath, 'node_modules');
            const hasNodeModules = await checkFileExists(nodeModulesPath);
            
            if (!hasNodeModules) {
                const hasBun = await checkBunAvailable();
                logger.progress('installing', 'Installing Next.js dependencies...', 30);
                
                if (hasBun) {
                    logger.log('Using Bun for Next.js installation');
                    try {
                        await execAsync('bun install --frozen-lockfile', { cwd: projectPath }, (data) => {
                            logger.log(data, 'stdout');
                        });
                    } catch {
                        logger.log('Bun failed, trying npm...');
                        await execAsync('npm install --include=dev --prefer-offline', { cwd: projectPath }, (data) => {
                            logger.log(data, 'stdout');
                        });
                    }
                } else {
                    const hasNpmLock = await checkFileExists(join(projectPath, 'package-lock.json'));
                    if (hasNpmLock) {
                        await execAsync('npm ci --include=dev --prefer-offline', { cwd: projectPath }, (data) => {
                            logger.log(data, 'stdout');
                        });
                    } else {
                        await execAsync('npm install --include=dev --prefer-offline', { cwd: projectPath }, (data) => {
                            logger.log(data, 'stdout');
                        });
                    }
                }
                await setInstallLock(projectPath, 'npm');
                logger.progress('installing', 'Dependencies ready', 60);
            } else {
                logger.log('Dependencies cached');
                logger.progress('installing', 'Using cached dependencies', 50);
            }
        },
        start: async (projectPath, port) => getNodeStartCommand(projectPath, port),
        detectPort
    },
    python: {
        files: ['main.py', 'app.py', 'server.py', 'requirements.txt'],
        setup: async (projectPath, execAsync, isStreamlit, emitProgress) => {
            const logger = createProgressLogger(emitProgress);
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
                    logger.progress('installing', 'Creating Python virtual environment...', 20);
                    logger.log('Running python3 -m venv venv');
                    await execAsync('python3 -m venv venv', { cwd: projectPath }, (data) => {
                        logger.log(data, 'stdout');
                    });
                    logger.progress('installing', 'Virtual environment created', 35);
                } else {
                    logger.log('Using existing virtual environment');
                    logger.progress('installing', 'Using cached virtual environment', 35);
                }
                
                if (hasReq) {
                    logger.progress('installing', 'Installing Python dependencies...', 40);
                    logger.log('Reading requirements.txt...');
                    
                    const reqContent = await readFile(reqPath, 'utf-8');
                    const packageCount = reqContent.split('\n').filter(l => l.trim() && !l.startsWith('#')).length;
                    logger.log(`Found ${packageCount} packages to install`);
                    
                    await execAsync('source venv/bin/activate && pip install --break-system-packages -r requirements.txt', { 
                        cwd: projectPath,
                        shell: '/bin/bash'
                    }, (data) => {
                        logger.log(data, 'stdout');
                    });
                    logger.progress('installing', 'Python dependencies installed', 60);
                } else if (shouldDetectStreamlit && !hasVenvStreamlit) {
                    logger.progress('installing', 'Installing Streamlit and web frameworks...', 40);
                    logger.log('Installing streamlit, flask, fastapi...');
                    await execAsync('source venv/bin/activate && pip install --break-system-packages streamlit flask fastapi uvicorn', { 
                        cwd: projectPath,
                        shell: '/bin/bash'
                    }, (data) => {
                        logger.log(data, 'stdout');
                    });
                    logger.progress('installing', 'Web frameworks installed', 60);
                }
                
                await setInstallLock(projectPath, 'pip');
                logger.progress('installing', 'Python environment ready', 65);
            } else {
                logger.log('Python environment already configured');
                logger.progress('installing', 'Using cached Python environment', 50);
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
        setup: async (projectPath, execAsync, isStreamlit, emitProgress) => {
            const logger = createProgressLogger(emitProgress);
            logger.progress('installing', 'Downloading Go dependencies...', 30);
            logger.log('Running go mod download');
            
            await execAsync('go mod download', { cwd: projectPath }, (data) => {
                logger.log(data, 'stdout');
            });
            
            logger.progress('installing', 'Go dependencies ready', 60);
            await setInstallLock(projectPath, 'go');
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
        setup: async (projectPath, execAsync, isStreamlit, emitProgress) => {
            const logger = createProgressLogger(emitProgress);
            logger.progress('installing', 'Building Rust dependencies...', 30);
            logger.log('Running cargo build (this may take a while for first build)');
            
            const cargoLockPath = join(projectPath, 'Cargo.lock');
            const hasCargoLock = await checkFileExists(cargoLockPath);
            
            if (hasCargoLock) {
                logger.log('Using Cargo.lock for reproducible builds');
            }
            
            await execAsync('cargo build 2>&1', { cwd: projectPath }, (data) => {
                logger.log(data, 'stdout');
            });
            
            logger.progress('installing', 'Rust build complete', 60);
            await setInstallLock(projectPath, 'rust');
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
        setup: async (projectPath, execAsync, isStreamlit, emitProgress) => {
            const logger = createProgressLogger(emitProgress);
            logger.progress('installing', 'Deno - no installation needed', 50);
            logger.log('Deno caches dependencies automatically');
            await setInstallLock(projectPath, 'deno');
        },
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
        setup: async (projectPath, execAsync, isStreamlit, emitProgress) => {
            const logger = createProgressLogger(emitProgress);
            logger.progress('installing', 'Static site - no dependencies needed', 50);
            logger.log('Ready to serve static files');
            await setInstallLock(projectPath, 'static');
        },
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
    
    if (files.includes('next.config.js') || files.includes('next.config.mjs') || files.includes('next.config.ts')) {
        return {
            language: 'nextjs',
            config: LANGUAGE_CONFIGS.nextjs,
            detectedFile: 'next.config.js'
        };
    }
    
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
                if (lang === 'nodejs') {
                    const pkg = await getPackageJson(projectPath);
                    if (pkg?.dependencies?.next || pkg?.devDependencies?.next) {
                        return {
                            language: 'nextjs',
                            config: LANGUAGE_CONFIGS.nextjs,
                            detectedFile: 'package.json (next.js detected)'
                        };
                    }
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

export { checkFileExists, LANGUAGE_CONFIGS, patchViteConfig, ensureAllowedHostsTrue, checkBunAvailable };
