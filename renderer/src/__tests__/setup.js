/**
 * Vitest setup — runs before all tests.
 * Mocks browser APIs not available in jsdom.
 */
import '@testing-library/jest-dom';

// Mock window.electronAPI (IPC bridge)
window.electronAPI = {
    loadCity: vi.fn(),
    getCacheList: vi.fn().mockResolvedValue([]),
    deleteCache: vi.fn().mockResolvedValue(true),
    exportCity: vi.fn().mockResolvedValue(true),
    openCityFile: vi.fn().mockResolvedValue(null),
    onSidecarStatus: vi.fn(),
    getSidecarInfo: vi.fn().mockResolvedValue({ port: 12345 }),
    onUpdateProgress: vi.fn(),
    onUpdateReady: vi.fn(),
    downloadUpdate: vi.fn(),
    installUpdate: vi.fn(),
    windowMinimize: vi.fn(),
    windowMaximize: vi.fn(),
    windowClose: vi.fn(),
    isMaximized: vi.fn().mockResolvedValue(false),
};

// Mock __APP_VERSION__
globalThis.__APP_VERSION__ = '1.0.0-test';

// Mock ResizeObserver
globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
}));

// Mock requestAnimationFrame
globalThis.requestAnimationFrame = vi.fn((cb) => setTimeout(cb, 0));
globalThis.cancelAnimationFrame = vi.fn((id) => clearTimeout(id));
