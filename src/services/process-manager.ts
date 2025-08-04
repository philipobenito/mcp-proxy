import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { type DetectedServer, ServerType } from './detection.js';
import { getLogger, createServerLogger } from '../utils/index.js';

export enum ProcessState {
    IDLE = 'idle',
    STARTING = 'starting',
    RUNNING = 'running',
    STOPPING = 'stopping',
    STOPPED = 'stopped',
    FAILED = 'failed',
}

export interface ProcessInfo {
    server: DetectedServer;
    state: ProcessState;
    pid?: number;
    port: number | undefined;
    startedAt?: Date;
    stoppedAt?: Date;
    restartCount: number;
    lastError: Error | undefined;
}

export interface ProcessManagerConfig {
    maxRestarts: number;
    restartDelay: number;
    startupTimeout: number;
    shutdownTimeout: number;
}

export class ProcessManager extends EventEmitter {
    private readonly config: ProcessManagerConfig;
    private readonly processes = new Map<string, ProcessInfo>();
    private readonly childProcesses = new Map<string, ChildProcess>();
    private readonly logger = getLogger({ component: 'process-manager' });

    constructor(config: Partial<ProcessManagerConfig> = {}) {
        super();

        this.config = {
            maxRestarts: config.maxRestarts || 3,
            restartDelay: config.restartDelay || 5000,
            startupTimeout: config.startupTimeout || 30000,
            shutdownTimeout: config.shutdownTimeout || 10000,
        };
    }

    async startServer(server: DetectedServer, port?: number): Promise<void> {
        const serverName = server.name;
        const logger = createServerLogger(serverName, port);

        // Check if server is already managed
        let processInfo = this.processes.get(serverName);
        if (!processInfo) {
            processInfo = {
                server,
                state: ProcessState.IDLE,
                restartCount: 0,
                port,
                lastError: undefined,
            };
            this.processes.set(serverName, processInfo);
        }

        // At this point processInfo is definitely defined
        const info = processInfo;

        // Don't start if already running or starting
        if (info.state === ProcessState.RUNNING || info.state === ProcessState.STARTING) {
            logger.warn('Server already running or starting', { state: info.state });
            return;
        }

        info.state = ProcessState.STARTING;
        info.startedAt = new Date();
        info.lastError = undefined;

        this.emit('serverStarting', serverName, server);
        logger.serverStarting(serverName, server.command || 'unknown', port);

        try {
            await this.spawnProcess(info);

            info.state = ProcessState.RUNNING;
            this.emit('serverStarted', serverName, info.pid, port);
            logger.serverStarted(serverName, port, info.pid);
        } catch (error) {
            info.state = ProcessState.FAILED;
            info.lastError = error as Error;

            this.emit('serverFailed', serverName, error, port);
            logger.serverFailed(serverName, error, port);

            // Auto-restart if enabled and under limit
            if (server.restart && info.restartCount < this.config.maxRestarts) {
                info.restartCount++;
                logger.info('Scheduling server restart', {
                    serverName,
                    restartCount: info.restartCount,
                    maxRestarts: this.config.maxRestarts,
                    delay: this.config.restartDelay,
                });

                setTimeout(() => {
                    this.startServer(server, port).catch(restartError => {
                        logger.error('Failed to restart server', restartError, { serverName });
                    });
                }, this.config.restartDelay);
            }

            throw error;
        }
    }

    async stopServer(serverName: string, signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
        const processInfo = this.processes.get(serverName);
        if (!processInfo) {
            throw new Error(`Server ${serverName} is not managed`);
        }

        const logger = createServerLogger(serverName, processInfo.port);
        const childProcess = this.childProcesses.get(serverName);

        if (
            processInfo.state === ProcessState.STOPPED ||
            processInfo.state === ProcessState.STOPPING
        ) {
            logger.warn('Server already stopped or stopping', { state: processInfo.state });
            return;
        }

        if (!childProcess || !processInfo.pid) {
            logger.warn('No child process found for server');
            processInfo.state = ProcessState.STOPPED;
            return;
        }

        processInfo.state = ProcessState.STOPPING;
        logger.info('Stopping server', { signal, pid: processInfo.pid });

        try {
            // Send signal to process
            childProcess.kill(signal);

            // Wait for graceful shutdown
            await this.waitForProcessExit(childProcess, this.config.shutdownTimeout);

            processInfo.state = ProcessState.STOPPED;
            processInfo.stoppedAt = new Date();

            this.emit('serverStopped', serverName, processInfo.port, 'manual');
            logger.serverStopped(serverName, processInfo.port, 'manual');
        } catch (error) {
            logger.warn('Graceful shutdown failed, forcing termination', { error });

            // Force kill if graceful shutdown failed
            try {
                childProcess.kill('SIGKILL');
                await this.waitForProcessExit(childProcess, 5000);
            } catch (forceError) {
                logger.error('Failed to force kill process', forceError);
                throw forceError;
            }

            processInfo.state = ProcessState.STOPPED;
            processInfo.stoppedAt = new Date();

            this.emit('serverStopped', serverName, processInfo.port, 'forced');
            logger.serverStopped(serverName, processInfo.port, 'forced');
        } finally {
            this.childProcesses.delete(serverName);
        }
    }

    async restartServer(serverName: string): Promise<void> {
        const processInfo = this.processes.get(serverName);
        if (!processInfo) {
            throw new Error(`Server ${serverName} is not managed`);
        }

        const logger = createServerLogger(serverName, processInfo.port);
        logger.info('Restarting server');

        // Stop if running
        if (
            processInfo.state === ProcessState.RUNNING ||
            processInfo.state === ProcessState.STARTING
        ) {
            await this.stopServer(serverName);
        }

        // Reset restart count for manual restarts
        processInfo.restartCount = 0;

        // Start again
        await this.startServer(processInfo.server, processInfo.port);
    }

    getProcessInfo(serverName: string): ProcessInfo | undefined {
        return this.processes.get(serverName);
    }

    getAllProcesses(): ProcessInfo[] {
        return Array.from(this.processes.values());
    }

    getRunningProcesses(): ProcessInfo[] {
        return this.getAllProcesses().filter(p => p.state === ProcessState.RUNNING);
    }

    getFailedProcesses(): ProcessInfo[] {
        return this.getAllProcesses().filter(p => p.state === ProcessState.FAILED);
    }

    async stopAllServers(): Promise<void> {
        const runningProcesses = this.getRunningProcesses();
        const stopPromises = runningProcesses.map(p =>
            this.stopServer(p.server.name).catch(error => {
                this.logger.error('Failed to stop server during shutdown', error, {
                    serverName: p.server.name,
                });
            })
        );

        await Promise.allSettled(stopPromises);
    }

    private async spawnProcess(processInfo: ProcessInfo): Promise<void> {
        const { server } = processInfo;
        const logger = createServerLogger(server.name, processInfo.port);

        if (server.detectedType === ServerType.HTTP) {
            throw new Error('HTTP servers cannot be spawned as processes');
        }

        if (!server.command) {
            throw new Error('Server command is required for process spawning');
        }

        return new Promise((resolve, reject) => {
            const env = {
                ...process.env,
                ...server.env,
            };

            // Add port to environment if allocated
            if (processInfo.port) {
                env.PORT = processInfo.port.toString();
                env.MCP_PORT = processInfo.port.toString();
            }

            logger.debug('Spawning process', {
                command: server.command,
                args: server.args,
                env: Object.keys(server.env || {}),
            });

            const childProcess = spawn(server.command || '', server.args || [], {
                env,
                stdio: 'pipe',
                detached: false,
            });

            if (childProcess.pid) {
                processInfo.pid = childProcess.pid;
            }
            this.childProcesses.set(server.name, childProcess);

            // Set up timeout for startup
            const startupTimeout = setTimeout(() => {
                logger.error('Server startup timeout');
                childProcess.kill('SIGTERM');
                reject(new Error(`Server startup timeout after ${this.config.startupTimeout}ms`));
            }, this.config.startupTimeout);

            // Handle process events
            childProcess.on('error', (error: Error) => {
                clearTimeout(startupTimeout);
                logger.error('Process spawn error', error);
                this.childProcesses.delete(server.name);
                reject(error);
            });

            childProcess.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
                clearTimeout(startupTimeout);
                this.childProcesses.delete(server.name);

                const exitReason = signal ? `signal ${signal}` : `code ${code}`;
                logger.info('Process exited', { code, signal, pid: processInfo.pid });

                if (processInfo.state === ProcessState.STARTING) {
                    // Process exited during startup
                    reject(new Error(`Process exited during startup with ${exitReason}`));
                } else if (processInfo.state === ProcessState.RUNNING) {
                    // Unexpected exit
                    processInfo.state = ProcessState.FAILED;
                    processInfo.stoppedAt = new Date();

                    this.emit('serverStopped', server.name, processInfo.port, 'crashed');

                    // Auto-restart if enabled
                    if (server.restart && processInfo.restartCount < this.config.maxRestarts) {
                        processInfo.restartCount++;
                        logger.info('Auto-restarting crashed server', {
                            restartCount: processInfo.restartCount,
                            delay: this.config.restartDelay,
                        });

                        setTimeout(() => {
                            this.startServer(server, processInfo.port).catch(restartError => {
                                logger.error('Failed to auto-restart server', restartError);
                            });
                        }, this.config.restartDelay);
                    }
                }
            });

            // Handle stdout/stderr
            if (childProcess.stdout) {
                childProcess.stdout.on('data', (data: Buffer) => {
                    logger.debug('Process stdout', { output: data.toString().trim() });
                });
            }

            if (childProcess.stderr) {
                childProcess.stderr.on('data', (data: Buffer) => {
                    logger.debug('Process stderr', { output: data.toString().trim() });
                });
            }

            // Consider the process started if it doesn't exit immediately
            setTimeout(() => {
                if (!childProcess.killed && childProcess.pid) {
                    clearTimeout(startupTimeout);
                    resolve();
                }
            }, 1000); // Give it 1 second to ensure it's stable
        });
    }

    private async waitForProcessExit(childProcess: ChildProcess, timeoutMs: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Process did not exit within ${timeoutMs}ms`));
            }, timeoutMs);

            childProcess.once('exit', () => {
                clearTimeout(timeout);
                resolve();
            });
        });
    }

    // Clean up resources
    cleanup(): void {
        this.removeAllListeners();
        this.processes.clear();
        this.childProcesses.clear();
    }
}
