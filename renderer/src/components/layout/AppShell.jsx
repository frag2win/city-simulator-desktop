import React, { useState, useEffect } from 'react';
import TitleBar from './TitleBar';

const ipc = window.electronAPI;

/**
 * AppShell — Root layout component.
 * Renders: TitleBar → Main Content Area → Status Bar
 */
export default function AppShell() {
    const [sidecarStatus, setSidecarStatus] = useState('starting'); // starting | ready | error
    const [sidecarPort, setSidecarPort] = useState(null);

    useEffect(() => {
        // Listen for sidecar status updates from main process
        if (ipc?.onSidecarStatus) {
            ipc.onSidecarStatus((data) => {
                setSidecarStatus(data.status);
            });
        }

        // Check sidecar info on mount
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

        // Poll briefly for sidecar readiness
        const timer = setTimeout(checkSidecar, 2000);
        const retryTimer = setTimeout(checkSidecar, 5000);

        return () => {
            clearTimeout(timer);
            clearTimeout(retryTimer);
        };
    }, []);

    return (
        <div className="app-shell">
            <TitleBar sidecarStatus={sidecarStatus} />

            <div className="app-shell__content">
                <div className="viewport">
                    <div className="viewport__empty">
                        <div className="viewport__icon">🏙️</div>
                        <h1 className="viewport__heading">City Simulator</h1>
                        <p className="viewport__subtext">
                            Load a city to begin. Enter coordinates or search for a city name
                            to generate a procedural 3D model from OpenStreetMap data.
                        </p>
                        <div className="viewport__hint">
                            <span>Press</span>
                            <kbd>Ctrl+L</kbd>
                            <span>to load a city</span>
                        </div>
                    </div>
                </div>
            </div>

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
                </div>
                <div className="statusbar__section">
                    <div className="statusbar__item">
                        <span>v1.0.0</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
