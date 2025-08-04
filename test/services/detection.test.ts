import { describe, it, expect, beforeEach } from 'vitest';
import { ServerTypeDetector, ServerType } from '../../src/services/detection.js';
import {
    createMockServerConfig,
    createMockDockerServerConfig,
    createMockNpxServerConfig,
    createMockHttpServerConfig,
} from '../helpers.js';

describe('ServerTypeDetector', () => {
    let detector: ServerTypeDetector;

    beforeEach(() => {
        detector = new ServerTypeDetector();
    });

    describe('detectServerType', () => {
        it('should detect HTTP servers', () => {
            const httpServer = createMockHttpServerConfig();
            const detected = detector.detectServerType(httpServer);

            expect(detected.detectedType).toBe(ServerType.HTTP);
            expect(detected.capabilities.requiresStdio).toBe(false);
            expect(detected.capabilities.supportsHealthCheck).toBe(true);
        });

        it('should detect Docker servers', () => {
            const dockerServer = createMockDockerServerConfig();
            const detected = detector.detectServerType(dockerServer);

            expect(detected.detectedType).toBe(ServerType.DOCKER);
            expect(detected.capabilities.requiresStdio).toBe(true);
            expect(detected.capabilities.canRestart).toBe(true);
        });

        it('should detect NPX servers', () => {
            const npxServer = createMockNpxServerConfig();
            const detected = detector.detectServerType(npxServer);

            expect(detected.detectedType).toBe(ServerType.NPX);
            expect(detected.capabilities.requiresStdio).toBe(true);
            expect(detected.capabilities.canRestart).toBe(true);
        });

        it('should detect docker-compose commands as Docker', () => {
            const composeServer = createMockServerConfig({
                command: 'docker-compose',
                args: ['up', 'mcp-server'],
            });
            const detected = detector.detectServerType(composeServer);

            expect(detected.detectedType).toBe(ServerType.DOCKER);
        });

        it('should detect npm run commands as NPX', () => {
            const npmServer = createMockServerConfig({
                command: 'npm',
                args: ['run', 'start:mcp'],
            });
            const detected = detector.detectServerType(npmServer);

            expect(detected.detectedType).toBe(ServerType.NPX);
        });

        it('should detect yarn commands as NPX', () => {
            const yarnServer = createMockServerConfig({
                command: 'yarn',
                args: ['start'],
            });
            const detected = detector.detectServerType(yarnServer);

            expect(detected.detectedType).toBe(ServerType.NPX);
        });

        it('should detect pnpm commands as NPX', () => {
            const pnpmServer = createMockServerConfig({
                command: 'pnpm',
                args: ['run', 'dev'],
            });
            const detected = detector.detectServerType(pnpmServer);

            expect(detected.detectedType).toBe(ServerType.NPX);
        });

        it('should detect MCP packages in args as NPX', () => {
            const mcpServer = createMockServerConfig({
                command: 'node',
                args: ['@modelcontextprotocol/server-filesystem'],
            });
            const detected = detector.detectServerType(mcpServer);

            expect(detected.detectedType).toBe(ServerType.NPX);
        });

        it('should default to CUSTOM for unknown commands', () => {
            const customServer = createMockServerConfig({
                command: 'custom-binary',
                args: ['--port', '3001'],
            });
            const detected = detector.detectServerType(customServer);

            expect(detected.detectedType).toBe(ServerType.CUSTOM);
        });

        it('should handle servers without commands as CUSTOM', () => {
            const serverWithoutCommand = createMockServerConfig({
                command: undefined,
            });
            const detected = detector.detectServerType(serverWithoutCommand as any);

            expect(detected.detectedType).toBe(ServerType.CUSTOM);
        });
    });

    describe('validateServerConfiguration', () => {
        it('should validate HTTP servers require URL', () => {
            const httpServerWithoutUrl = createMockHttpServerConfig({
                url: undefined,
            });
            const detected = detector.detectServerType(httpServerWithoutUrl as any);
            const validation = detector.validateServerConfiguration(detected);

            expect(validation.isValid).toBe(false);
            expect(validation.issues).toContain('HTTP servers must have a URL configured');
        });

        it('should warn about unnecessary command/args for HTTP servers', () => {
            const httpServerWithCommand = createMockHttpServerConfig({
                command: 'echo',
                args: ['hello'],
            });
            const detected = detector.detectServerType(httpServerWithCommand as any);
            const validation = detector.validateServerConfiguration(detected);

            expect(validation.warnings).toContain(
                'HTTP servers should not have command or args - they will be ignored'
            );
        });

        it('should validate stdio servers require command', () => {
            const stdioServerWithoutCommand = createMockServerConfig({
                command: undefined,
            });
            const detected = detector.detectServerType(stdioServerWithoutCommand as any);
            const validation = detector.validateServerConfiguration(detected);

            expect(validation.isValid).toBe(false);
            expect(validation.issues).toContain('Stdio servers must have a command configured');
        });

        it('should warn about Docker servers without run argument', () => {
            const dockerServerWithoutRun = createMockDockerServerConfig({
                args: ['exec', '-it', 'container', 'bash'],
            });
            const detected = detector.detectServerType(dockerServerWithoutRun);
            const validation = detector.validateServerConfiguration(detected);

            expect(validation.warnings).toContain(
                'Docker servers typically require "run" argument'
            );
        });

        it('should warn about NPX servers without package arguments', () => {
            const npxServerWithoutArgs = createMockNpxServerConfig({
                args: [],
            });
            const detected = detector.detectServerType(npxServerWithoutArgs);
            const validation = detector.validateServerConfiguration(detected);

            expect(validation.warnings).toContain(
                'NPX servers typically require package arguments'
            );
        });

        it('should warn about Docker environment variables without -e flags', () => {
            const dockerServerWithEnvButNoFlags = createMockDockerServerConfig({
                env: {
                    DATABASE_URL: 'postgresql://localhost/test',
                },
                args: ['run', '--rm', '-i', 'test-image'], // No -e flags
            });
            const detected = detector.detectServerType(dockerServerWithEnvButNoFlags);
            const validation = detector.validateServerConfiguration(detected);

            expect(validation.warnings).toContain(
                'Docker servers with environment variables should include -e flags in args'
            );
        });

        it('should pass validation for properly configured servers', () => {
            const validHttpServer = createMockHttpServerConfig();
            const validDockerServer = createMockDockerServerConfig();
            const validNpxServer = createMockNpxServerConfig();

            const httpDetected = detector.detectServerType(validHttpServer);
            const dockerDetected = detector.detectServerType(validDockerServer);
            const npxDetected = detector.detectServerType(validNpxServer);

            expect(detector.validateServerConfiguration(httpDetected).isValid).toBe(true);
            expect(detector.validateServerConfiguration(dockerDetected).isValid).toBe(true);
            expect(detector.validateServerConfiguration(npxDetected).isValid).toBe(true);
        });
    });

    describe('capabilities determination', () => {
        it('should set correct capabilities for HTTP servers', () => {
            const httpServer = createMockHttpServerConfig();
            const detected = detector.detectServerType(httpServer);

            expect(detected.capabilities).toEqual({
                requiresStdio: false,
                supportsHealthCheck: true,
                requiresEnvironment: false,
                canRestart: true,
            });
        });

        it('should set correct capabilities for Docker servers', () => {
            const dockerServer = createMockDockerServerConfig({
                env: { TEST: 'value' },
            });
            const detected = detector.detectServerType(dockerServer);

            expect(detected.capabilities).toEqual({
                requiresStdio: true,
                supportsHealthCheck: false,
                requiresEnvironment: true,
                canRestart: true,
            });
        });

        it('should handle servers with health check configuration', () => {
            const serverWithHealthCheck = createMockServerConfig({
                healthCheck: {
                    interval: 30,
                    timeout: 10,
                    retries: 3,
                },
            });
            const detected = detector.detectServerType(serverWithHealthCheck);

            expect(detected.capabilities.supportsHealthCheck).toBe(true);
        });

        it('should handle servers with restart disabled', () => {
            const noRestartServer = createMockServerConfig({
                restart: false,
            });
            const detected = detector.detectServerType(noRestartServer);

            expect(detected.capabilities.canRestart).toBe(false);
        });
    });
});
