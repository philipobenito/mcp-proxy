import { createServer } from 'net';

export interface PortAllocation {
    port: number;
    serverName: string;
    allocatedAt: Date;
    reserved: boolean;
}

export interface PortManagerConfig {
    startPort: number;
    endPort: number;
    reservationTimeout: number; // milliseconds
}

export class PortManager {
    private readonly config: PortManagerConfig;
    private readonly allocations = new Map<number, PortAllocation>();
    private readonly nameToPort = new Map<string, number>();
    private readonly reservations = new Map<number, NodeJS.Timeout>();

    constructor(config: Partial<PortManagerConfig> = {}) {
        this.config = {
            startPort: config.startPort ?? 3001,
            endPort: config.endPort ?? 3099,
            reservationTimeout: config.reservationTimeout ?? 60000, // 1 minute
        };

        // Validate individual port bounds first
        if (this.config.startPort < 1 || this.config.startPort > 65535) {
            throw new Error('Port range must be between 1 and 65535');
        }

        if (this.config.endPort < 1 || this.config.endPort > 65535) {
            throw new Error('Port range must be between 1 and 65535');
        }

        // Then validate port range relationship
        if (this.config.startPort >= this.config.endPort) {
            throw new Error('Start port must be less than end port');
        }
    }

    async allocatePort(serverName: string, preferredPort?: number): Promise<number> {
        // Check if server already has a port allocated
        const existingPort = this.nameToPort.get(serverName);
        if (existingPort) {
            return existingPort;
        }

        // Try preferred port first if specified
        if (preferredPort && (await this.isPortAvailable(preferredPort))) {
            if (preferredPort >= this.config.startPort && preferredPort <= this.config.endPort) {
                return this.doAllocatePort(serverName, preferredPort);
            }
        }

        // Find next available port in range
        for (let port = this.config.startPort; port <= this.config.endPort; port++) {
            if (!this.allocations.has(port) && (await this.isPortAvailable(port))) {
                return this.doAllocatePort(serverName, port);
            }
        }

        throw new Error(
            `No available ports in range ${this.config.startPort}-${this.config.endPort}. ` +
                `${this.allocations.size} ports currently allocated.`
        );
    }

    async reservePort(serverName: string, port?: number): Promise<number> {
        let allocatedPort: number;

        if (port) {
            // Check if the specific port is allocated to this server
            const allocation = this.allocations.get(port);
            if (!allocation) {
                throw new Error(`Port ${port} is not allocated`);
            }
            if (allocation.serverName !== serverName) {
                throw new Error(
                    `Port ${port} is allocated to different server: ${allocation.serverName}`
                );
            }
            allocatedPort = port;
        } else {
            // Check if server has an allocated port
            const existingPort = this.nameToPort.get(serverName);
            if (!existingPort) {
                throw new Error(`Server ${serverName} has no allocated port`);
            }
            allocatedPort = existingPort;
        }

        const allocation = this.allocations.get(allocatedPort);
        if (!allocation) {
            throw new Error(`Port ${allocatedPort} is not allocated`);
        }

        // Mark as reserved
        allocation.reserved = true;

        // Set reservation timeout
        const timeoutId = setTimeout(() => {
            this.releaseReservation(allocatedPort);
        }, this.config.reservationTimeout);

        this.reservations.set(allocatedPort, timeoutId);

        return allocatedPort;
    }

    releasePort(serverName: string): boolean {
        const port = this.nameToPort.get(serverName);
        if (!port) {
            return false;
        }

        const allocation = this.allocations.get(port);
        if (!allocation || allocation.serverName !== serverName) {
            return false;
        }

        // Clear reservation timeout if exists
        const timeoutId = this.reservations.get(port);
        if (timeoutId) {
            clearTimeout(timeoutId);
            this.reservations.delete(port);
        }

        // Remove allocation
        this.allocations.delete(port);
        this.nameToPort.delete(serverName);

        return true;
    }

    releaseReservation(port: number): boolean {
        const allocation = this.allocations.get(port);
        if (!allocation) {
            return false;
        }

        // Clear timeout
        const timeoutId = this.reservations.get(port);
        if (timeoutId) {
            clearTimeout(timeoutId);
            this.reservations.delete(port);
        }

        // Mark as not reserved
        allocation.reserved = false;

        return true;
    }

    getPortForServer(serverName: string): number | undefined {
        return this.nameToPort.get(serverName);
    }

    getServerForPort(port: number): string | undefined {
        return this.allocations.get(port)?.serverName;
    }

    getAllocations(): PortAllocation[] {
        return Array.from(this.allocations.values());
    }

    getAvailablePortCount(): number {
        const totalPorts = this.config.endPort - this.config.startPort + 1;
        return totalPorts - this.allocations.size;
    }

    async getNextAvailablePorts(count: number): Promise<number[]> {
        const availablePorts: number[] = [];

        for (
            let port = this.config.startPort;
            port <= this.config.endPort && availablePorts.length < count;
            port++
        ) {
            if (!this.allocations.has(port) && (await this.isPortAvailable(port))) {
                availablePorts.push(port);
            }
        }

        return availablePorts;
    }

    async isPortAvailable(port: number): Promise<boolean> {
        return new Promise(resolve => {
            const testServer = createServer();

            testServer.once('error', () => {
                resolve(false);
            });

            testServer.once('listening', () => {
                testServer.close(() => {
                    resolve(true);
                });
            });

            testServer.listen(port, '127.0.0.1');
        });
    }

    private doAllocatePort(serverName: string, port: number): number {
        const allocation: PortAllocation = {
            port,
            serverName,
            allocatedAt: new Date(),
            reserved: false,
        };

        this.allocations.set(port, allocation);
        this.nameToPort.set(serverName, port);

        return port;
    }

    // Utility methods for monitoring and diagnostics
    getPortRangeInfo(): {
        start: number;
        end: number;
        total: number;
        allocated: number;
        available: number;
        } {
        const total = this.config.endPort - this.config.startPort + 1;
        const allocated = this.allocations.size;

        return {
            start: this.config.startPort,
            end: this.config.endPort,
            total,
            allocated,
            available: total - allocated,
        };
    }

    getReservedPorts(): number[] {
        return Array.from(this.allocations.entries())
            .filter(([, allocation]) => allocation.reserved)
            .map(([port]) => port);
    }

    // Cleanup method for graceful shutdown
    cleanup(): void {
        // Clear all reservation timeouts
        for (const timeoutId of this.reservations.values()) {
            clearTimeout(timeoutId);
        }

        this.reservations.clear();
        this.allocations.clear();
        this.nameToPort.clear();
    }
}
