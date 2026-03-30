import { spawn } from 'node:child_process';
import ngrok from '@ngrok/ngrok';

const tunnels = new Map();

async function checkCommandExists(command) {
    return new Promise((resolve) => {
        const searchPaths = [
            ...process.env.PATH?.split(':') || [],
            `${process.env.HOME}/.local/bin`
        ];
        
        for (const dir of searchPaths) {
            const child = spawn('test', ['-x', `${dir}/${command}`]);
            child.on('close', (code) => {
                if (code === 0) {
                    resolve(true);
                }
            });
            child.on('error', () => {});
        }
        
        const child = spawn('which', [command], { shell: true });
        child.on('close', (code) => resolve(code === 0));
        child.on('error', () => resolve(false));
    });
}

async function createCloudflareTunnel(port, projectId) {
    console.log(`[${projectId}] Starting Cloudflare Tunnel...`);
    
    const cloudflaredExists = await checkCommandExists('cloudflared');
    if (!cloudflaredExists) {
        console.log(`[${projectId}] cloudflared not installed, skipping`);
        return null;
    }
    
    return new Promise((resolve) => {
        let resolved = false;
        let tunnelUrl = null;
        
        const cloudflared = spawn('cloudflared', [
            'tunnel',
            '--url', `http://localhost:${port}`,
            '--logfile', '/dev/null',
            '--metrics', 'localhost:0',
            '--no-autoupdate'
        ], {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                cloudflared.kill('SIGTERM');
                console.log(`[${projectId}] Cloudflare Tunnel timeout`);
                resolve(null);
            }
        }, 30000);
        
        const parseOutput = (data) => {
            if (resolved) return;
            
            const output = data.toString();
            
            const match = output.match(/https?:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
            if (match) {
                tunnelUrl = match[0];
                resolved = true;
                clearTimeout(timeout);
                
                console.log(`[${projectId}] Cloudflare Tunnel established at ${tunnelUrl}`);
                
                tunnels.set(projectId, {
                    provider: 'cloudflare',
                    url: tunnelUrl,
                    process: cloudflared
                });
                
                resolve(tunnelUrl);
            }
            
            if (output.includes('ERR_')) {
                console.error(`[${projectId}] Cloudflare error: ${output.trim()}`);
            }
        };
        
        cloudflared.stdout.on('data', parseOutput);
        cloudflared.stderr.on('data', parseOutput);
        
        cloudflared.on('error', (error) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                console.error(`[${projectId}] Cloudflare process error: ${error.message}`);
                resolve(null);
            }
        });
        
        cloudflared.on('close', (code) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                console.log(`[${projectId}] Cloudflare process closed with code ${code}`);
                resolve(tunnelUrl);
            }
        });
    });
}

async function createNgrokTunnel(port, projectId) {
    const authtoken = process.env.NGROK_AUTH_TOKEN;
    
    if (!authtoken) {
        console.log(`[${projectId}] No NGROK_AUTH_TOKEN found, skipping ngrok`);
        return null;
    }
    
    console.log(`[${projectId}] Starting ngrok tunnel...`);
    
    try {
        await ngrok.authtoken(authtoken);
        
        const tunnel = await ngrok.connect({
            addr: port,
            authtoken: authtoken,
            onStatusChange: (status) => {
                console.log(`[${projectId}] Ngrok status: ${status}`);
            },
            onLogEvent: (event) => {
                console.log(`[${projectId}] Ngrok: ${event}`);
            }
        });
        
        const tunnelUrl = tunnel.url();
        console.log(`[${projectId}] Ngrok Tunnel established at ${tunnelUrl}`);
        
        tunnels.set(projectId, {
            provider: 'ngrok',
            url: tunnelUrl,
            tunnel: tunnel
        });
        
        return tunnelUrl;
    } catch (error) {
        console.error(`[${projectId}] Ngrok error: ${error.message}`);
        return null;
    }
}

export async function createTunnel(port, projectId) {
    const existingTunnel = tunnels.get(projectId);
    if (existingTunnel) {
        console.log(`[${projectId}] Tunnel already exists: ${existingTunnel.url}`);
        return existingTunnel.url;
    }
    
    const provider = process.env.TUNNEL_PROVIDER || 'cloudflare,ngrok';
    const providers = provider.split(',').map(p => p.trim());
    
    for (const p of providers) {
        let tunnelUrl = null;
        
        if (p === 'cloudflare') {
            tunnelUrl = await createCloudflareTunnel(port, projectId);
        } else if (p === 'ngrok') {
            tunnelUrl = await createNgrokTunnel(port, projectId);
        }
        
        if (tunnelUrl) {
            return tunnelUrl;
        }
        
        console.log(`[${projectId}] ${p} failed, trying next provider...`);
    }
    
    console.log(`[${projectId}] All tunnel providers failed, continuing without public URL`);
    return null;
}

export async function destroyTunnel(projectId) {
    const tunnelInfo = tunnels.get(projectId);
    
    if (!tunnelInfo) {
        return;
    }
    
    try {
        if (tunnelInfo.provider === 'ngrok' && tunnelInfo.tunnel) {
            await tunnelInfo.tunnel.close();
        } else if (tunnelInfo.provider === 'cloudflare' && tunnelInfo.process) {
            tunnelInfo.process.kill('SIGTERM');
        }
        
        tunnels.delete(projectId);
        console.log(`[${projectId}] Tunnel destroyed`);
    } catch (error) {
        console.error(`[${projectId}] Error destroying tunnel: ${error.message}`);
    }
}

export function getTunnelInfo(projectId) {
    return tunnels.get(projectId) || null;
}

export async function destroyAllTunnels() {
    for (const projectId of tunnels.keys()) {
        await destroyTunnel(projectId);
    }
}

export { checkCommandExists };
