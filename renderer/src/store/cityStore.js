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

    // ─── Actions ─────────────────────────────
    setShowSearch: (show) => set({ showSearch: show }),
    setShowCacheManager: (show) => set({ showCacheManager: show }),

    setCityData: (data) => set({
        cityData: data,
        isLoading: false,
        showProgress: false,
        error: null,
    }),

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
        } catch (err) {
            setError(err.message || 'Unknown error loading city');
        }
    },

    /**
     * Load cached cities list from sidecar.
     */
    fetchCachedCities: async () => {
        try {
            const api = window.electronAPI;
            if (!api?.getSidecarInfo) return;

            const info = await api.getSidecarInfo();
            if (!info?.port) return;

            const response = await fetch(`http://127.0.0.1:${info.port}/city/cache`, {
                headers: { 'Authorization': `Bearer ${info.token}` },
            });
            if (response.ok) {
                const cities = await response.json();
                set({ cachedCities: cities });
            }
        } catch (err) {
            console.error('Failed to fetch cached cities:', err);
        }
    },

    /**
     * Delete a cached city.
     */
    deleteCachedCity: async (cacheId) => {
        try {
            const api = window.electronAPI;
            if (!api?.getSidecarInfo) return;

            const info = await api.getSidecarInfo();
            if (!info?.port) return;

            const response = await fetch(`http://127.0.0.1:${info.port}/city/cache/${cacheId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${info.token}` },
            });
            if (response.ok) {
                // Refresh the list
                get().fetchCachedCities();
            }
        } catch (err) {
            console.error('Failed to delete cached city:', err);
        }
    },
}));

export default useCityStore;
