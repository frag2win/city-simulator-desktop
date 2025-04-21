import React, { useEffect } from 'react';
import useCityStore from '../../store/cityStore';

/**
 * CacheManager — Panel showing cached cities with size, date, and delete buttons.
 */
export default function CacheManager() {
    const { showCacheManager, setShowCacheManager, cachedCities, fetchCachedCities, deleteCachedCity, loadCity } = useCityStore();

    useEffect(() => {
        if (showCacheManager) {
            fetchCachedCities();
        }
    }, [showCacheManager, fetchCachedCities]);

    if (!showCacheManager) return null;

    function formatDate(timestamp) {
        return new Date(timestamp * 1000).toLocaleString();
    }

    return (
        <div className="cache-overlay" onClick={() => setShowCacheManager(false)}>
            <div className="cache-panel" onClick={(e) => e.stopPropagation()}>
                <div className="cache-panel__header">
                    <h2 className="cache-panel__title">Cached Cities</h2>
                    <button className="cache-panel__close" onClick={() => setShowCacheManager(false)}>✕</button>
                </div>

                {cachedCities.length === 0 ? (
                    <div className="cache-panel__empty">
                        No cached cities yet. Load a city to see it here.
                    </div>
                ) : (
                    <div className="cache-panel__list">
                        {cachedCities.map((city) => (
                            <div key={city.id} className="cache-item">
                                <div className="cache-item__info">
                                    <div className="cache-item__name">{city.name}</div>
                                    <div className="cache-item__meta">
                                        {city.feature_count} features · {city.size_mb} MB · {formatDate(city.cached_at)}
                                    </div>
                                </div>
                                <div className="cache-item__actions">
                                    <button
                                        className="cache-item__btn cache-item__btn--load"
                                        onClick={() => {
                                            loadCity(city.bbox);
                                            setShowCacheManager(false);
                                        }}
                                        title="Load this city"
                                    >
                                        ↻
                                    </button>
                                    <button
                                        className="cache-item__btn cache-item__btn--delete"
                                        onClick={() => deleteCachedCity(city.id)}
                                        title="Delete from cache"
                                    >
                                        🗑
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="cache-panel__footer">
                    Total: {cachedCities.length} cities ·{' '}
                    {cachedCities.reduce((sum, c) => sum + c.size_mb, 0).toFixed(2)} MB
                </div>
            </div>
        </div>
    );
}
