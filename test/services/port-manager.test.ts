import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PortManager } from '../../src/services/port-manager.js';
import { TEST_PORT_START, TEST_PORT_END } from '../helpers.js';

describe('PortManager', () => {
    let portManager: PortManager;

    beforeEach(() => {
        portManager = new PortManager({
            startPort: TEST_PORT_START,
            endPort: TEST_PORT_END,
            reservationTimeout: 100, // Short timeout for tests
        });
    });

    afterEach(() => {
        portManager.cleanup();
    });

    describe('allocatePort', () => {
        it('should allocate first available port', async () => {
            const port = await portManager.allocatePort('test-server');
            expect(port).toBe(TEST_PORT_START);
        });

        it('should return same port for same server name', async () => {
            const port1 = await portManager.allocatePort('test-server');
            const port2 = await portManager.allocatePort('test-server');

            expect(port1).toBe(port2);
        });

        it('should allocate different ports for different servers', async () => {
            const port1 = await portManager.allocatePort('server-1');
            const port2 = await portManager.allocatePort('server-2');

            expect(port1).not.toBe(port2);
            expect(port1).toBe(TEST_PORT_START);
            expect(port2).toBe(TEST_PORT_START + 1);
        });

        it('should use preferred port if available', async () => {
            const preferredPort = TEST_PORT_START + 10;
            const port = await portManager.allocatePort('test-server', preferredPort);

            expect(port).toBe(preferredPort);
        });

        it('should skip preferred port if outside range', async () => {
            const preferredPort = TEST_PORT_END + 100; // Outside range
            const port = await portManager.allocatePort('test-server', preferredPort);

            expect(port).toBe(TEST_PORT_START);
            expect(port).not.toBe(preferredPort);
        });

        it('should throw error when no ports available', async () => {
            // Allocate all available ports
            const totalPorts = TEST_PORT_END - TEST_PORT_START + 1;
            const promises = [];

            for (let i = 0; i < totalPorts; i++) {
                promises.push(portManager.allocatePort(`server-${i}`));
            }

            await Promise.all(promises);

            // Try to allocate one more
            await expect(portManager.allocatePort('overflow-server')).rejects.toThrow(
                'No available ports in range'
            );
        });
    });

    describe('reservePort', () => {
        it('should reserve an allocated port', async () => {
            const port = await portManager.allocatePort('test-server');
            const reservedPort = await portManager.reservePort('test-server');

            expect(reservedPort).toBe(port);
            expect(portManager.getReservedPorts()).toContain(port);
        });

        it('should throw error when reserving unallocated port', async () => {
            await expect(portManager.reservePort('non-existent-server')).rejects.toThrow(
                'has no allocated port'
            );
        });

        it('should throw error when reserving port for different server', async () => {
            const port = await portManager.allocatePort('server-1');

            await expect(portManager.reservePort('server-2', port)).rejects.toThrow(
                'is allocated to different server'
            );
        });

        it('should release reservation after timeout', async () => {
            const port = await portManager.allocatePort('test-server');
            await portManager.reservePort('test-server');

            expect(portManager.getReservedPorts()).toContain(port);

            // Wait for timeout
            await new Promise(resolve => setTimeout(resolve, 150));

            expect(portManager.getReservedPorts()).not.toContain(port);
        });
    });

    describe('releasePort', () => {
        it('should release allocated port', async () => {
            const port = await portManager.allocatePort('test-server');
            const released = portManager.releasePort('test-server');

            expect(released).toBe(true);
            expect(portManager.getPortForServer('test-server')).toBeUndefined();
        });

        it('should return false for non-existent server', () => {
            const released = portManager.releasePort('non-existent-server');
            expect(released).toBe(false);
        });

        it('should clear reservation when releasing port', async () => {
            const port = await portManager.allocatePort('test-server');
            await portManager.reservePort('test-server');

            expect(portManager.getReservedPorts()).toContain(port);

            portManager.releasePort('test-server');

            expect(portManager.getReservedPorts()).not.toContain(port);
        });
    });

    describe('getPortForServer', () => {
        it('should return allocated port for server', async () => {
            const port = await portManager.allocatePort('test-server');
            const foundPort = portManager.getPortForServer('test-server');

            expect(foundPort).toBe(port);
        });

        it('should return undefined for non-allocated server', () => {
            const foundPort = portManager.getPortForServer('non-existent-server');
            expect(foundPort).toBeUndefined();
        });
    });

    describe('getServerForPort', () => {
        it('should return server name for allocated port', async () => {
            const port = await portManager.allocatePort('test-server');
            const serverName = portManager.getServerForPort(port);

            expect(serverName).toBe('test-server');
        });

        it('should return undefined for non-allocated port', () => {
            const serverName = portManager.getServerForPort(TEST_PORT_START + 50);
            expect(serverName).toBeUndefined();
        });
    });

    describe('getAllocations', () => {
        it('should return all port allocations', async () => {
            await portManager.allocatePort('server-1');
            await portManager.allocatePort('server-2');

            const allocations = portManager.getAllocations();

            expect(allocations).toHaveLength(2);
            expect(allocations[0].serverName).toBe('server-1');
            expect(allocations[1].serverName).toBe('server-2');
            expect(allocations[0].allocatedAt).toBeInstanceOf(Date);
        });

        it('should return empty array when no allocations', () => {
            const allocations = portManager.getAllocations();
            expect(allocations).toHaveLength(0);
        });
    });

    describe('getAvailablePortCount', () => {
        it('should return total ports when none allocated', () => {
            const available = portManager.getAvailablePortCount();
            const total = TEST_PORT_END - TEST_PORT_START + 1;

            expect(available).toBe(total);
        });

        it('should decrease as ports are allocated', async () => {
            const initialCount = portManager.getAvailablePortCount();

            await portManager.allocatePort('server-1');
            expect(portManager.getAvailablePortCount()).toBe(initialCount - 1);

            await portManager.allocatePort('server-2');
            expect(portManager.getAvailablePortCount()).toBe(initialCount - 2);
        });
    });

    describe('getNextAvailablePorts', () => {
        it('should return requested number of available ports', async () => {
            const ports = await portManager.getNextAvailablePorts(3);

            expect(ports).toHaveLength(3);
            expect(ports[0]).toBe(TEST_PORT_START);
            expect(ports[1]).toBe(TEST_PORT_START + 1);
            expect(ports[2]).toBe(TEST_PORT_START + 2);
        });

        it('should skip allocated ports', async () => {
            await portManager.allocatePort('server-1'); // Allocates first port

            const ports = await portManager.getNextAvailablePorts(2);

            expect(ports).toHaveLength(2);
            expect(ports[0]).toBe(TEST_PORT_START + 1);
            expect(ports[1]).toBe(TEST_PORT_START + 2);
        });

        it('should return fewer ports if not enough available', async () => {
            // Allocate all but one ports
            const totalPorts = TEST_PORT_END - TEST_PORT_START + 1;
            for (let i = 0; i < totalPorts - 1; i++) {
                await portManager.allocatePort(`server-${i}`);
            }

            const ports = await portManager.getNextAvailablePorts(5);
            expect(ports).toHaveLength(1);
        });
    });

    describe('getPortRangeInfo', () => {
        it('should return correct port range information', async () => {
            await portManager.allocatePort('server-1');
            await portManager.allocatePort('server-2');

            const info = portManager.getPortRangeInfo();
            const expectedTotal = TEST_PORT_END - TEST_PORT_START + 1;

            expect(info).toEqual({
                start: TEST_PORT_START,
                end: TEST_PORT_END,
                total: expectedTotal,
                allocated: 2,
                available: expectedTotal - 2,
            });
        });
    });

    describe('cleanup', () => {
        it('should clear all allocations and reservations', async () => {
            await portManager.allocatePort('server-1');
            await portManager.allocatePort('server-2');
            await portManager.reservePort('server-1');

            expect(portManager.getAllocations()).toHaveLength(2);
            expect(portManager.getReservedPorts()).toHaveLength(1);

            portManager.cleanup();

            expect(portManager.getAllocations()).toHaveLength(0);
            expect(portManager.getReservedPorts()).toHaveLength(0);
        });
    });

    describe('constructor validation', () => {
        it('should throw error for invalid port range', () => {
            expect(
                () =>
                    new PortManager({
                        startPort: 3002,
                        endPort: 3001, // End before start
                    })
            ).toThrow('Start port must be less than end port');
        });

        it('should throw error for invalid start port', () => {
            expect(
                () =>
                    new PortManager({
                        startPort: 0,
                        endPort: 100,
                    })
            ).toThrow('Port range must be between 1 and 65535');
        });

        it('should throw error for invalid end port', () => {
            expect(
                () =>
                    new PortManager({
                        startPort: 3000,
                        endPort: 70000, // Above max port
                    })
            ).toThrow('Port range must be between 1 and 65535');
        });
    });
});
