import React, { useState, useEffect } from 'react';
import TitleBar from './TitleBar';
import CityScene from '../scene/CityScene';
import CitySearchBar from '../ui/CitySearchBar';
import ProgressModal from '../ui/ProgressModal';
import CacheManager from '../ui/CacheManager';
import EntityInfoPanel from '../ui/EntityInfoPanel';
import LayerToggles from '../ui/LayerToggles';
import SimulationControls from '../ui/SimulationControls';
import ScreenshotExport from '../ui/ScreenshotExport';
import CameraPresets from '../ui/CameraPresets';
import UpdateNotice from '../ui/UpdateNotice';
import { ExportIcon, SaveIcon, SearchIcon, FolderOpenIcon, DatabaseIcon, CityIcon } from '../ui/Icons';
import useCityStore from '../../store/cityStore';

const ipc = window.electronAPI;

/**
 * AppShell — Root layout component.
 * Renders: TitleBar → 3D Viewport / Empty State → Status Bar
 * Integrates: CitySearchBar, ProgressModal, CacheManager overlays
 */
export default function AppShell() {
    const [sidecarStatus, setSidecarStatus] = useState('starting');
    const [sidecarPort, setSidecarPort] = useState(null);
    const { cityData, showSearch, setShowSearch, setShowCacheManager, exportCity, openCityFile } = useCityStore();

    useEffect(() => {
        if (ipc?.onSidecarStatus) {
            ipc.onSidecarStatus((data) => setSidecarStatus(data.status));
        }

        async function checkSidecar() {
            try {
                if (ipc?.getSidecarInfo) {
                    const info = await ipc.getSidecarInfo();
                    if (info?.port) {
                        setSidecarPort(info.port);
                        setSidecarStatus('ready');
                    }
                }
            } catch {
                setSidecarStatus('error');
            }
        }

        const timer = setTimeout(checkSidecar, 2000);
        const retryTimer = setTimeout(checkSidecar, 5000);

        // Listen for .city file opened from OS file association
        if (ipc?.onFileOpened) {
            ipc.onFileOpened((data) => {
                if (data?.data) {
                    useCityStore.getState().setCityData(data.data);
                    if (data.cityName) {
                        useCityStore.setState({ cityName: data.cityName });
                    }
                }
            });
        }

        // Listen for menu-triggered export/open
        if (ipc?.onFileOpen) {
            ipc.onFileOpen(() => openCityFile());
        }

        return () => { clearTimeout(timer); clearTimeout(retryTimer); };
    }, [openCityFile]);

    const featureCount = cityData?.features?.length || 0;
    const metadata = cityData?.metadata || {};

    return (
        <div className="app-shell">
            <TitleBar sidecarStatus={sidecarStatus} />

            <div className="app-shell__content">
                {cityData ? (
                    <div className="viewport viewport--3d">
                        {/* 3D Scene fills the viewport */}
                        <CityScene />

                        {/* HUD overlay on top of 3D scene */}
                        <div className="hud">
                            <div className="hud__stats">
                                <div className="hud__stat">{metadata.buildings || 0} buildings</div>
                                <div className="hud__stat">{metadata.roads || 0} roads</div>
                                <div className="hud__stat">{metadata.amenities || 0} amenities</div>
                                <div className="hud__stat hud__stat--total">{featureCount} total</div>
                            </div>
                            <div className="hud__actions">
                                <LayerToggles />
                                <div className="hud__divider" />
                                <ScreenshotExport />
                                <button className="hud__btn" onClick={() => exportCity('geojson')} title="Export as GeoJSON (Ctrl+E)">
                                    <ExportIcon />
                                </button>
                                <button className="hud__btn" onClick={() => exportCity('city')} title="Save as .city file (Ctrl+Shift+E)">
                                    <SaveIcon />
                                </button>
                                <div className="hud__divider" />
                                <button className="hud__btn" onClick={() => setShowSearch(true)} title="Load another city (Ctrl+L)">
                                    <SearchIcon />
                                </button>
                                <button className="hud__btn" onClick={() => openCityFile()} title="Open file">
                                    <FolderOpenIcon />
                                </button>
                                <button className="hud__btn" onClick={() => setShowCacheManager(true)} title="Cache manager">
                                    <DatabaseIcon />
                                </button>
                            </div>
                        </div>

                        {/* Simulation controls — bottom-left */}
                        <SimulationControls />

                        {/* Camera presets — bottom-right */}
                        <CameraPresets />

                        {/* Entity info panel (right side) */}
                        <EntityInfoPanel />
                    </div>
                ) : (
                    <div className="viewport">
                        <div className="viewport__empty">
                            <div className="viewport__icon"><CityIcon /></div>
                            <h1 className="viewport__heading">City Simulator</h1>
                            <p className="viewport__subtext">
                                Load a city to begin. Enter coordinates or search for a city name
                                to generate a procedural 3D model from OpenStreetMap data.
                            </p>
                            <div className="viewport__actions">
                                <button className="viewport__action-btn" onClick={() => setShowSearch(true)}>
                                    Load a City
                                </button>
                                <button className="viewport__action-btn viewport__action-btn--secondary" onClick={() => openCityFile()}>
                                    Open File
                                </button>
                                <button className="viewport__action-btn viewport__action-btn--secondary" onClick={() => setShowCacheManager(true)}>
                                    View Cache
                                </button>
                            </div>
                            <div className="viewport__hint">
                                <span>Press</span>
                                <kbd>Ctrl+L</kbd>
                                <span>to search</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Overlays */}
            <CitySearchBar />
            <ProgressModal />
            <CacheManager />

            {/* Update notification banner */}
            <UpdateNotice />

            <div className="statusbar">
                <div className="statusbar__section">
                    <div className="statusbar__item">
                        <span>Engine: {sidecarStatus === 'ready' ? '✓ Ready' : sidecarStatus === 'starting' ? '⟳ Starting…' : '✗ Offline'}</span>
                    </div>
                    {sidecarPort && (
                        <div className="statusbar__item">
                            <span>Port: {sidecarPort}</span>
                        </div>
                    )}
                    {featureCount > 0 && (
                        <div className="statusbar__item">
                            <span>Features: {featureCount}</span>
                        </div>
                    )}
                </div>
                <div className="statusbar__section">
                    <div className="statusbar__item">
                        <span>v{__APP_VERSION__}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
