import React, { useState, useRef, useEffect } from 'react';
import useCityStore from '../../store/cityStore';

/**
 * CitySearchBar — Search/input for loading cities.
 * Supports:
 * - City name search (geocoded via Nominatim → bbox)
 * - Direct bbox input (N,S,E,W)
 * Opens with Ctrl+L keyboard shortcut.
 */
export default function CitySearchBar() {
    const [query, setQuery] = useState('');
    const [isGeocoding, setIsGeocoding] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const inputRef = useRef(null);
    const { showSearch, setShowSearch, loadCity, startLoading } = useCityStore();

    // Focus input when opened
    useEffect(() => {
        if (showSearch && inputRef.current) {
            inputRef.current.focus();
        }
    }, [showSearch]);

    // Global keyboard shortcut: Ctrl+L
    useEffect(() => {
        const handler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
                e.preventDefault();
                setShowSearch(!showSearch);
            }
            if (e.key === 'Escape' && showSearch) {
                setShowSearch(false);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [showSearch, setShowSearch]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!query.trim()) return;

        // Check if input looks like a bbox (4 comma-separated numbers)
        const parts = query.split(',').map(s => s.trim());
        if (parts.length === 4 && parts.every(p => !isNaN(parseFloat(p)))) {
            // Direct bbox input: N,S,E,W
            setShowSearch(false);
            loadCity(query.trim());
            return;
        }

        // Otherwise, geocode the city name
        setIsGeocoding(true);
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`,
                { headers: { 'User-Agent': 'CitySimulatorDesktop/1.0' } }
            );
            const results = await response.json();

            if (results.length === 0) {
                setSuggestions([{ error: 'No results found. Try a different search or enter coordinates directly.' }]);
            } else {
                setSuggestions(results.map(r => ({
                    name: r.display_name,
                    bbox: r.boundingbox, // [south, north, west, east] from Nominatim
                    lat: r.lat,
                    lon: r.lon,
                })));
            }
        } catch (err) {
            setSuggestions([{ error: 'Geocoding failed. Check your internet connection.' }]);
        } finally {
            setIsGeocoding(false);
        }
    };

    const handleSelectCity = (suggestion) => {
        if (suggestion.error) return;

        // Nominatim bbox = [south, north, west, east]
        // Our format = N,S,E,W
        const [south, north, west, east] = suggestion.bbox;
        const bboxStr = `${north},${south},${east},${west}`;

        setShowSearch(false);
        setSuggestions([]);
        setQuery('');
        loadCity(bboxStr);
    };

    if (!showSearch) return null;

    return (
        <div className="search-overlay" onClick={() => setShowSearch(false)}>
            <div className="search-container" onClick={(e) => e.stopPropagation()}>
                <form onSubmit={handleSubmit} className="search-form">
                    <div className="search-icon">🔍</div>
                    <input
                        ref={inputRef}
                        type="text"
                        className="search-input"
                        placeholder="Search city name or enter bbox (N,S,E,W)…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        autoFocus
                    />
                    {isGeocoding && <div className="search-spinner">⟳</div>}
                    <button type="submit" className="search-btn" disabled={isGeocoding}>
                        Load
                    </button>
                </form>

                {suggestions.length > 0 && (
                    <div className="search-suggestions">
                        {suggestions.map((s, i) => (
                            s.error ? (
                                <div key={i} className="search-suggestion search-suggestion--error">
                                    {s.error}
                                </div>
                            ) : (
                                <div
                                    key={i}
                                    className="search-suggestion"
                                    onClick={() => handleSelectCity(s)}
                                >
                                    <div className="search-suggestion__name">{s.name}</div>
                                    <div className="search-suggestion__coords">
                                        {parseFloat(s.lat).toFixed(4)}°N, {parseFloat(s.lon).toFixed(4)}°E
                                    </div>
                                </div>
                            )
                        ))}
                    </div>
                )}

                <div className="search-hint">
                    Enter a city name (e.g., "Mumbai") or coordinates — N,S,E,W (e.g., "19.08,19.06,72.89,72.87")
                </div>
            </div>
        </div>
    );
}
