/**
 * City data store — manages city GeoJSON, loading state, progress, and cache.
 * Uses Zustand for lightweight reactive state management.
 */
import { create } from 'zustand';

const useCityStore = create((set, get) => ({
    // ─── City Data ───────────────────────────
    cityData: null,        // GeoJSON FeatureCollection (projected)
    cityName: '',
    isLoading: false,
    error: null,

    // ─── Ingestion Progress ──────────────────
    progress: {
        stage: '',     // querying, processing, building_geometry, caching, complete
        percent: 0,
        message: '',
    },
    showProgress: false,

    // ─── Cache ───────────────────────────────
    cachedCities: [],
    showCacheManager: false,

    // ─── Search ──────────────────────────────
    showSearch: false,

    // ─── Entity Selection ────────────────────
    selectedEntity: null,

    // ─── Layer Visibility ────────────────────
    layers: {
        buildings: true,
        roads: true,
        amenities: true,
        heatmap: false,
    },

    // ─── Simulation ──────────────────────────
    isPlaying: true,
    simSpeed: 1,
    timeOfDay: { time: '06:00', icon: '☀️' },
    agentCounts: { vehicles: 0, pedestrians: 0 },

    // ─── Actions ─────────────────────────────
    setShowSearch: (show) => set({ showSearch: show }),
    setShowCacheManager: (show) => set({ showCacheManager: show }),
    setSelectedEntity: (entity) => set({ selectedEntity: entity }),
    toggleLayer: (layer) => set((state) => ({
        layers: { ...state.layers, [layer]: !state.layers[layer] },
    })),
    setIsPlaying: (playing) => set({ isPlaying: playing }),
    setSimSpeed: (speed) => set({ simSpeed: speed }),
    setTimeOfDay: (tod) => set({ timeOfDay: tod }),
    setAgentCounts: (counts) => set({ agentCounts: counts }),

    setCityData: (data) => set({
        cityData: data,
        isLoading: false,
        showProgress: false,
        error: null,
    }),

    setTerrainData: (data) => set({ terrainData: data }),

    setError: (error) => set({
        error,
        isLoading: false,
        showProgress: false,
    }),

    setProgress: (progress) => set({
        progress,
        showProgress: true,
    }),

    startLoading: () => set({
        isLoading: true,
        error: null,
        showProgress: true,
        progress: { stage: 'querying', percent: 0, message: 'Connecting…' },
    }),

    clearCity: () => set({
        cityData: null,
        cityName: '',
        terrainData: null,
        error: null,
    }),

    setCachedCities: (cities) => set({ cachedCities: cities }),

    /**
     * Load a city via the IPC bridge → Python sidecar.
     */
    loadCity: async (bbox) => {
        const { startLoading, setCityData, setError, setProgress } = get();
        startLoading();

        try {
            const api = window.electronAPI;
            if (!api) {
                setError('Electron API not available (running outside desktop app?)');
                return;
            }

            const result = await api.loadCity(bbox);

            if (result.error) {
                setError(result.message || 'Failed to load city');
                return;
            }

            setCityData(result.data || result);

            // Kick off terrain loading in the background
            get().loadTerrain(bbox);
        } catch (err) {
            setError(err.message || 'Unknown error loading city');
        }
    },

    /**
     * Load cached cities list via IPC → main process → sidecar.
     */
    fetchCachedCities: async () => {
        try {
            const api = window.electronAPI;
            if (!api?.listCachedCities) return;

            const result = await api.listCachedCities();
            if (result && !result.error) {
                set({ cachedCities: result.data || result });
            }
        } catch {
            // silently ignore cache list errors
        }
    },

    /**
     * Delete a cached city via IPC.
     */
    deleteCachedCity: async (cacheId) => {
        try {
            const api = window.electronAPI;
            if (!api?.deleteCachedCity) return;

            const result = await api.deleteCachedCity(cacheId);
            if (result && !result.error) {
                // Refresh the list
                get().fetchCachedCities();
            }
        } catch {
            // silently ignore cache delete errors
        }
    },



    /**
     * Export current city data as GeoJSON or .city file.
     */
    exportCity: async (format = 'geojson') => {
        try {
            const api = window.electronAPI;
            if (!api?.exportFile) return;

            const { cityData, cityName } = get();
            if (!cityData) return;

            const result = await api.exportFile({
                format,
                data: cityData,
                cityName: cityName || 'city-export',
            });
            return result;
        } catch {
            // export failure handled silently
        }
    },

    /**
     * Open a .city / .geojson file from disk.
     */
    openCityFile: async () => {
        try {
            const api = window.electronAPI;
            if (!api?.openFile) return;

            const result = await api.openFile();
            if (result?.error) {
                set({ error: result.message });
                return;
            }
            if (result?.canceled) return;

            if (result?.data) {
                set({
                    cityData: result.data,
                    cityName: result.cityName || 'Imported',
                    isLoading: false,
                    showProgress: false,
                    error: null,
                });
            }
        } catch (err) {
            set({ error: err.message || 'Failed to open city file' });
        }
    },

    /**
     * Save screenshot of current viewport via native dialog.
     */
    saveScreenshot: async (dataUrl) => {
        try {
            const api = window.electronAPI;
            if (!api?.saveScreenshot) return;

            const { cityName } = get();
            const result = await api.saveScreenshot({
                dataUrl,
                cityName: cityName || 'screenshot',
            });
            return result;
        } catch {
            // screenshot save failure handled silently
        }
    },
}));

export default useCityStore;
