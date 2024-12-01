/**
 * Tests for Zustand city store — state management & actions.
 */
import { describe, it, expect, beforeEach } from 'vitest';

// Reset store between tests
let useCityStore;

beforeEach(async () => {
    // Dynamic import to get a fresh store instance
    vi.resetModules();
    const mod = await import('../../store/cityStore');
    useCityStore = mod.default;
});

describe('cityStore', () => {
    it('has correct initial state', () => {
        const state = useCityStore.getState();
        expect(state.cityData).toBeNull();
        expect(state.cityName).toBe('');
        expect(state.isLoading).toBe(false);
        expect(state.error).toBeNull();
        expect(state.isPlaying).toBe(true);
        expect(state.simSpeed).toBe(1);
    });

    it('toggles layer visibility', () => {
        const { toggleLayer } = useCityStore.getState();
        toggleLayer('buildings');
        expect(useCityStore.getState().layers.buildings).toBe(false);
        toggleLayer('buildings');
        expect(useCityStore.getState().layers.buildings).toBe(true);
    });

    it('sets selected entity', () => {
        const { setSelectedEntity } = useCityStore.getState();
        const entity = { type: 'building', osm_id: 123, name: 'Test' };
        setSelectedEntity(entity);
        expect(useCityStore.getState().selectedEntity).toEqual(entity);
        setSelectedEntity(null);
        expect(useCityStore.getState().selectedEntity).toBeNull();
    });

    it('sets simulation speed', () => {
        const { setSimSpeed } = useCityStore.getState();
        setSimSpeed(4);
        expect(useCityStore.getState().simSpeed).toBe(4);
    });

    it('toggles play/pause', () => {
        const { setIsPlaying } = useCityStore.getState();
        setIsPlaying(false);
        expect(useCityStore.getState().isPlaying).toBe(false);
        setIsPlaying(true);
        expect(useCityStore.getState().isPlaying).toBe(true);
    });

    it('sets time of day', () => {
        const { setTimeOfDay } = useCityStore.getState();
        setTimeOfDay({ time: '14:30', icon: '☀️' });
        expect(useCityStore.getState().timeOfDay).toEqual({ time: '14:30', icon: '☀️' });
    });

    it('sets agent counts', () => {
        const { setAgentCounts } = useCityStore.getState();
        setAgentCounts({ vehicles: 42, pedestrians: 99 });
        expect(useCityStore.getState().agentCounts).toEqual({ vehicles: 42, pedestrians: 99 });
    });

    it('sets progress state', () => {
        const { setProgress } = useCityStore.getState();
        setProgress({ stage: 'querying', percent: 50, message: 'Fetching...' });
        const state = useCityStore.getState();
        expect(state.progress.stage).toBe('querying');
        expect(state.progress.percent).toBe(50);
        expect(state.showProgress).toBe(true);
    });

    it('manages search visibility', () => {
        const { setShowSearch } = useCityStore.getState();
        setShowSearch(true);
        expect(useCityStore.getState().showSearch).toBe(true);
        setShowSearch(false);
        expect(useCityStore.getState().showSearch).toBe(false);
    });

    it('manages cache manager visibility', () => {
        const { setShowCacheManager } = useCityStore.getState();
        setShowCacheManager(true);
        expect(useCityStore.getState().showCacheManager).toBe(true);
    });
});
