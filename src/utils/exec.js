import { spawn } from 'node:child_process';

export async function execAsync(command, options = {}, onData = null) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, {
            shell: options.shell || '/bin/bash',
            cwd: options.cwd || process.cwd(),
            env: { ...process.env, ...options.env },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        if (onData) {
            child.stdout.on('data', (data) => {
                const text = data.toString();
                stdout += text;
                onData(text, 'stdout');
            });

            child.stderr.on('data', (data) => {
                const text = data.toString();
                stderr += text;
                onData(text, 'stderr');
            });
        } else {
            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });
        }

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

export async function execWithOutput(command, options = {}, onData = null) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, {
            shell: options.shell || '/bin/bash',
            cwd: options.cwd || process.cwd(),
            env: { ...process.env, ...options.env },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        const lines = [];

        child.stdout.on('data', (data) => {
            const text = data.toString();
            lines.push({ type: 'stdout', text });
            if (onData) onData(text, 'stdout');
        });

        child.stderr.on('data', (data) => {
            const text = data.toString();
            lines.push({ type: 'stderr', text });
            if (onData) onData(text, 'stderr');
        });

        child.on('close', (code) => {
            resolve({ code, lines });
        });

        child.on('error', (error) => {
            reject(error);
        });
    });
}
