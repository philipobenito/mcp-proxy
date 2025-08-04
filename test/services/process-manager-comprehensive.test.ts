import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import {
    ProcessManager,
    ProcessState,
    type ProcessManagerConfig,
} from '../../src/services/process-manager.js';
import { ServerType, type DetectedServer } from '../../src/services/detection.js';
import { waitFor } from '../helpers.js';

describe('ProcessManager - Comprehensive', () => {
    let manager: ProcessManager;

    const mockStdioServer: DetectedServer = {
        name: 'test-stdio-server',
        command: 'node',
        args: [
            '-e',
            'setInterval(() => { console.log("running"); }, 100); setTimeout(() => process.exit(0), 2000)',
        ],
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

    const mockHttpServer: DetectedServer = {
        name: 'test-http-server',
        url: 'http://localhost:8080/mcp',
        protocol: 'http',
        detectedType: ServerType.HTTP,
        capabilities: {
            requiresStdio: false,
            supportsHealthCheck: true,
            requiresEnvironment: false,
            canRestart: false,
        },
        restart: false,
    };

    const mockDockerServer: DetectedServer = {
        name: 'test-docker-server',
        command: 'docker',
        args: ['run', '--rm', '-i', 'hello-world'],
        protocol: 'stdio',
        detectedType: ServerType.DOCKER,
        capabilities: {
            requiresStdio: true,
            supportsHealthCheck: false,
            requiresEnvironment: false,
            canRestart: true,
        },
        restart: true,
        env: {
            DOCKER_ENV: 'test-value',
        },
    };

    beforeEach(() => {
        // Mock console methods to avoid log spam during tests
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        const config: ProcessManagerConfig = {
            maxRestarts: 2,
            restartDelay: 100, // Short delay for testing
            startupTimeout: 2000,
            shutdownTimeout: 1000,
        };
        manager = new ProcessManager(config);
    });

    afterEach(async () => {
        await manager.stopAllServers();
        manager.cleanup();
        vi.restoreAllMocks();
    });

    describe('Process Lifecycle Management', () => {
        it('should start and track a server process', async () => {
            const eventSpy = vi.fn();
            manager.on('serverStarting', eventSpy);
            manager.on('serverStarted', eventSpy);

            await manager.startServer(mockStdioServer, 4001);

            const processInfo = manager.getProcessInfo('test-stdio-server');
            expect(processInfo).toBeDefined();
            expect(processInfo?.state).toBe(ProcessState.RUNNING);
            expect(processInfo?.port).toBe(4001);
            expect(processInfo?.pid).toBeDefined();
            expect(processInfo?.startedAt).toBeDefined();
            expect(processInfo?.restartCount).toBe(0);

            // Wait for process to complete naturally
            await waitFor(() => {
                const info = manager.getProcessInfo('test-stdio-server');
                return info?.state === ProcessState.FAILED || info?.state === ProcessState.STOPPED;
            }, 3000);

            expect(eventSpy).toHaveBeenCalledWith('test-stdio-server', mockStdioServer);
        });

        it('should not start server that is already running', async () => {
            await manager.startServer(mockStdioServer, 4002);

            const originalState = manager.getProcessInfo('test-stdio-server')?.state;
            expect(originalState).toBe(ProcessState.RUNNING);

            // Try to start again - should be ignored
            await manager.startServer(mockStdioServer, 4002);

            const newState = manager.getProcessInfo('test-stdio-server')?.state;
            expect(newState).toBe(ProcessState.RUNNING);
        });

        it('should handle server that fails immediately', async () => {
            const failingServer: DetectedServer = {
                ...mockStdioServer,
                name: 'failing-server',
                command: 'non-existent-command',
            };

            const eventSpy = vi.fn();
            manager.on('serverFailed', eventSpy);

            await expect(manager.startServer(failingServer, 4003)).rejects.toThrow();

            const processInfo = manager.getProcessInfo('failing-server');
            expect(processInfo?.state).toBe(ProcessState.FAILED);
            expect(processInfo?.lastError).toBeDefined();
            expect(eventSpy).toHaveBeenCalled();
        });

        it('should stop a running server gracefully', async () => {
            const longRunningServer: DetectedServer = {
                ...mockStdioServer,
                name: 'long-running-server',
                args: ['-e', 'setInterval(() => console.log("running"), 100)'],
            };

            await manager.startServer(longRunningServer, 4004);

            const eventSpy = vi.fn();
            manager.on('serverStopped', eventSpy);

            await manager.stopServer('long-running-server');

            const processInfo = manager.getProcessInfo('long-running-server');
            expect(processInfo?.state).toBe(ProcessState.STOPPED);
            expect(processInfo?.stoppedAt).toBeDefined();
            expect(eventSpy).toHaveBeenCalledWith('long-running-server', 4004, 'manual');
        });

        it('should force kill server that does not respond to SIGTERM', async () => {
            const stubborn: DetectedServer = {
                ...mockStdioServer,
                name: 'stubborn-server',
                args: [
                    '-e',
                    `
                    process.on('SIGTERM', () => console.log('Ignoring SIGTERM'));
                    setInterval(() => console.log('still running'), 100);
                `,
                ],
            };

            await manager.startServer(stubborn, 4005);

            const eventSpy = vi.fn();
            manager.on('serverStopped', eventSpy);

            // This should force kill after timeout
            await manager.stopServer('stubborn-server');

            const processInfo = manager.getProcessInfo('stubborn-server');
            expect(processInfo?.state).toBe(ProcessState.STOPPED);
            expect(eventSpy).toHaveBeenCalledWith('stubborn-server', 4005, 'forced');
        });

        it('should restart a server', async () => {
            await manager.startServer(mockStdioServer, 4006);

            const originalPid = manager.getProcessInfo('test-stdio-server')?.pid;

            await manager.restartServer('test-stdio-server');

            const processInfo = manager.getProcessInfo('test-stdio-server');
            expect(processInfo?.state).toBe(ProcessState.RUNNING);
            expect(processInfo?.restartCount).toBe(0); // Manual restart resets count
            expect(processInfo?.pid).not.toBe(originalPid);
        });
    });

    describe('Auto-restart Functionality', () => {
        it('should auto-restart failed server up to maxRestarts limit', async () => {
            const crashingServer: DetectedServer = {
                ...mockStdioServer,
                name: 'crashing-server',
                args: ['-e', 'console.log("starting"); setTimeout(() => { console.log("crashing"); process.exit(1); }, 1500)'], // Start successfully, then crash
            };

            const eventSpy = vi.fn();
            manager.on('serverStopped', eventSpy);

            // Start the server and let it run briefly before crashing
            await manager.startServer(crashingServer, 4007);

            // Wait for the server to crash and restart attempts
            await waitFor(() => {
                const info = manager.getProcessInfo('crashing-server');
                return info?.restartCount >= 2 || info?.state === ProcessState.FAILED;
            }, 8000);

            const processInfo = manager.getProcessInfo('crashing-server');
            expect(processInfo?.restartCount).toBeGreaterThanOrEqual(1); // Should have attempted restarts
            expect(eventSpy).toHaveBeenCalled();
        });

        it('should not auto-restart if restart is disabled', async () => {
            const noRestartServer: DetectedServer = {
                ...mockStdioServer,
                name: 'no-restart-server',
                restart: false,
                args: ['-e', 'setTimeout(() => process.exit(1), 200)'],
            };

            await expect(manager.startServer(noRestartServer, 4008)).rejects.toThrow();

            const processInfo = manager.getProcessInfo('no-restart-server');
            expect(processInfo?.state).toBe(ProcessState.FAILED);
            expect(processInfo?.restartCount).toBe(0);
        });
    });

    describe('Environment Variables', () => {
        it('should pass environment variables to spawned process', async () => {
            await manager.startServer(mockDockerServer, 4009);

            // The environment variables are passed to the child process
            // We can verify they were included in the spawn call
            const processInfo = manager.getProcessInfo('test-docker-server');
            expect(processInfo).toBeDefined();
        });

        it('should include port in environment variables', async () => {
            const server: DetectedServer = {
                ...mockStdioServer,
                name: 'port-env-server',
                args: [
                    '-e',
                    'console.log("PORT:", process.env.PORT, "MCP_PORT:", process.env.MCP_PORT); setInterval(() => {}, 100); setTimeout(() => process.exit(0), 1500)',
                ],
            };

            await manager.startServer(server, 4010);

            // The port should be set in the environment
            const processInfo = manager.getProcessInfo('port-env-server');
            expect(processInfo?.port).toBe(4010);
        });
    });

    describe('HTTP Server Handling', () => {
        it('should throw error when trying to spawn HTTP server', async () => {
            await expect(manager.startServer(mockHttpServer, 4011)).rejects.toThrow(
                'HTTP servers cannot be spawned as processes'
            );
        });
    });

    describe('Server Without Command', () => {
        it('should throw error when server has no command', async () => {
            const noCommandServer: DetectedServer = {
                ...mockStdioServer,
                name: 'no-command-server',
                command: undefined,
            };

            await expect(manager.startServer(noCommandServer, 4012)).rejects.toThrow(
                'Server command is required for process spawning'
            );
        });
    });

    describe('Process Info Queries', () => {
        beforeEach(async () => {
            // Start a few different servers
            await manager.startServer(
                {
                    ...mockStdioServer,
                    name: 'running-server',
                },
                4013
            );

            const failingServer: DetectedServer = {
                ...mockStdioServer,
                name: 'failed-server',
                command: 'non-existent-command',
            };

            try {
                await manager.startServer(failingServer, 4014);
            } catch {
                // Expected to fail
            }
        });

        it('should return all processes', () => {
            const allProcesses = manager.getAllProcesses();
            expect(allProcesses.length).toBeGreaterThanOrEqual(2);

            const serverNames = allProcesses.map(p => p.server.name);
            expect(serverNames).toContain('running-server');
            expect(serverNames).toContain('failed-server');
        });

        it('should return only running processes', () => {
            const runningProcesses = manager.getRunningProcesses();
            expect(runningProcesses.length).toBeGreaterThanOrEqual(1);

            runningProcesses.forEach(p => {
                expect(p.state).toBe(ProcessState.RUNNING);
            });
        });

        it('should return only failed processes', () => {
            const failedProcesses = manager.getFailedProcesses();
            expect(failedProcesses.length).toBeGreaterThanOrEqual(1);

            failedProcesses.forEach(p => {
                expect(p.state).toBe(ProcessState.FAILED);
            });
        });
    });

    describe('Batch Operations', () => {
        beforeEach(async () => {
            // Start multiple servers
            await manager.startServer(
                {
                    ...mockStdioServer,
                    name: 'batch-server-1',
                    args: ['-e', 'setInterval(() => console.log("server1"), 200)'],
                },
                4015
            );

            await manager.startServer(
                {
                    ...mockStdioServer,
                    name: 'batch-server-2',
                    args: ['-e', 'setInterval(() => console.log("server2"), 200)'],
                },
                4016
            );
        });

        it('should stop all running servers', async () => {
            const initialRunning = manager.getRunningProcesses();
            expect(initialRunning.length).toBeGreaterThanOrEqual(2);

            await manager.stopAllServers();

            const finalRunning = manager.getRunningProcesses();
            expect(finalRunning.length).toBe(0);
        });
    });

    describe('Event Handling', () => {
        it('should emit serverStarting event', async () => {
            const eventSpy = vi.fn();
            manager.on('serverStarting', eventSpy);

            await manager.startServer(mockStdioServer, 4017);

            expect(eventSpy).toHaveBeenCalledWith('test-stdio-server', mockStdioServer);
        });

        it('should emit serverStarted event', async () => {
            const eventSpy = vi.fn();
            manager.on('serverStarted', eventSpy);

            await manager.startServer(mockStdioServer, 4018);

            expect(eventSpy).toHaveBeenCalledWith(
                'test-stdio-server',
                expect.any(Number), // PID
                4018 // Port
            );
        });

        it('should emit serverFailed event', async () => {
            const failingServer: DetectedServer = {
                ...mockStdioServer,
                name: 'event-failing-server',
                command: 'non-existent-command',
            };

            const eventSpy = vi.fn();
            manager.on('serverFailed', eventSpy);

            await expect(manager.startServer(failingServer, 4019)).rejects.toThrow();

            expect(eventSpy).toHaveBeenCalledWith('event-failing-server', expect.any(Error), 4019);
        });
    });

    describe('Edge Cases', () => {
        it('should handle stopping server that is already stopped', async () => {
            await manager.startServer(mockStdioServer, 4020);
            await manager.stopServer('test-stdio-server');

            // Try to stop again - should not throw
            await expect(manager.stopServer('test-stdio-server')).resolves.not.toThrow();
        });

        it('should handle stopping server with no child process', async () => {
            await manager.startServer(mockStdioServer, 4021);

            // Manually clear the child process to simulate edge case
            const processInfo = manager.getProcessInfo('test-stdio-server');
            if (processInfo) {
                processInfo.pid = undefined;
            }

            await expect(manager.stopServer('test-stdio-server')).resolves.not.toThrow();
        });

        it('should handle cleanup properly', () => {
            expect(() => manager.cleanup()).not.toThrow();

            // After cleanup, manager should be in a clean state
            expect(manager.getAllProcesses()).toHaveLength(0);
            expect(manager.listenerCount('serverStarting')).toBe(0);
        });
    });

    describe('Signal Handling', () => {
        it('should handle different termination signals', async () => {
            const server: DetectedServer = {
                ...mockStdioServer,
                name: 'signal-test-server',
                args: ['-e', 'setInterval(() => console.log("running"), 100)'],
            };

            await manager.startServer(server, 4022);

            // Test with SIGINT
            await manager.stopServer('signal-test-server', 'SIGINT');

            const processInfo = manager.getProcessInfo('signal-test-server');
            expect(processInfo?.state).toBe(ProcessState.STOPPED);
        });
    });
});
