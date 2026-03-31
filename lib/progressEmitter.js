import { EventEmitter } from 'node:events';

class ProgressEmitter extends EventEmitter {
    constructor() {
        super();
        this.clients = new Map();
        this.setMaxListeners(1000);
    }

    subscribe(projectId, res) {
        if (!this.clients.has(projectId)) {
            this.clients.set(projectId, new Set());
        }
        this.clients.get(projectId).add(res);

        res.on('close', () => {
            this.unsubscribe(projectId, res);
        });
    }

    unsubscribe(projectId, res) {
        const projectClients = this.clients.get(projectId);
        if (projectClients) {
            projectClients.delete(res);
            if (projectClients.size === 0) {
                this.clients.delete(projectId);
            }
        }
    }

    emitToProject(projectId, event) {
        const clients = this.clients.get(projectId);
        if (!clients || clients.size === 0) return;

        const data = JSON.stringify(event);
        const message = `data: ${data}\n\n`;

        for (const res of clients) {
            try {
                res.write(message);
            } catch (err) {
                this.unsubscribe(projectId, res);
            }
        }
    }

    progress(projectId, stage, message, percent, details = {}) {
        this.emitToProject(projectId, {
            type: 'progress',
            stage,
            message,
            percent,
            timestamp: Date.now(),
            ...details
        });
    }

    log(projectId, message, source = 'stdout') {
        this.emitToProject(projectId, {
            type: 'log',
            message: message.trim(),
            source,
            timestamp: Date.now()
        });
    }

    error(projectId, message, details = {}) {
        this.emitToProject(projectId, {
            type: 'error',
            message,
            timestamp: Date.now(),
            ...details
        });
    }

    complete(projectId, data) {
        this.emitToProject(projectId, {
            type: 'complete',
            timestamp: Date.now(),
            ...data
        });
    }

    getClientCount(projectId) {
        return this.clients.get(projectId)?.size || 0;
    }

    getTotalClients() {
        let total = 0;
        for (const clients of this.clients.values()) {
            total += clients.size;
        }
        return total;
    }
}

export const progressEmitter = new ProgressEmitter();
