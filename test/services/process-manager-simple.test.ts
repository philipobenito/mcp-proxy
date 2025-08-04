import { describe, it, expect } from 'vitest';
import { ProcessManager, ProcessState } from '../../src/services/process-manager.js';
import { ServerType, type DetectedServer } from '../../src/services/detection.js';

describe('ProcessManager - Basic Functionality', () => {
    const mockServer: DetectedServer = {
        name: 'test-server',
        command: 'echo',
        args: ['hello'],
        protocol: 'stdio',
        detectedType: ServerType.CUSTOM,
        capabilities: {
            requiresStdio: true,
            supportsHealthCheck: false,
            requiresEnvironment: false,
            canRestart: true,
        },
        restart: true,
    };

    describe('constructor', () => {
        it('should create ProcessManager with default config', () => {
            const manager = new ProcessManager();
            expect(manager).toBeDefined();
        });

        it('should create ProcessManager with custom config', () => {
            const config = {
                maxRestarts: 5,
                restartDelay: 2000,
                startupTimeout: 10000,
                shutdownTimeout: 5000,
            };
            const manager = new ProcessManager(config);
            expect(manager).toBeDefined();
        });
    });

    describe('server status management', () => {
        it('should return undefined for non-existent server', () => {
            const manager = new ProcessManager();
            const status = manager.getProcessInfo('non-existent');
            expect(status).toBeUndefined();
        });

        it('should return empty array when no servers', () => {
            const manager = new ProcessManager();
            const processes = manager.getAllProcesses();
            expect(processes).toHaveLength(0);
        });

        it('should return empty arrays for running and failed processes initially', () => {
            const manager = new ProcessManager();
            expect(manager.getRunningProcesses()).toHaveLength(0);
            expect(manager.getFailedProcesses()).toHaveLength(0);
        });

        it('should handle server not managed errors', async () => {
            const manager = new ProcessManager();

            await expect(manager.stopServer('non-existent')).rejects.toThrow(
                'Server non-existent is not managed'
            );

            await expect(manager.restartServer('non-existent')).rejects.toThrow(
                'Server non-existent is not managed'
            );
        });
    });

    describe('process state enum', () => {
        it('should have correct process states', () => {
            expect(ProcessState.IDLE).toBe('idle');
            expect(ProcessState.STARTING).toBe('starting');
            expect(ProcessState.RUNNING).toBe('running');
            expect(ProcessState.STOPPING).toBe('stopping');
            expect(ProcessState.STOPPED).toBe('stopped');
            expect(ProcessState.FAILED).toBe('failed');
        });
    });

    describe('event emitter functionality', () => {
        it('should extend EventEmitter', () => {
            const manager = new ProcessManager();
            expect(manager.on).toBeDefined();
            expect(manager.emit).toBeDefined();
            expect(manager.removeListener).toBeDefined();
        });

        it('should handle event listeners', () => {
            const manager = new ProcessManager();
            const mockHandler = () => {};

            manager.on('serverStarting', mockHandler);
            manager.removeListener('serverStarting', mockHandler);

            expect(manager.listenerCount('serverStarting')).toBe(0);
        });
    });

    describe('cleanup', () => {
        it('should have cleanup method', () => {
            const manager = new ProcessManager();
            expect(typeof manager.cleanup).toBe('function');
            expect(() => manager.cleanup()).not.toThrow();
        });
    });
});
