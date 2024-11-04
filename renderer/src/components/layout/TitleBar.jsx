import React, { useState, useEffect } from 'react';

const ipc = window.electronAPI;

/**
 * TitleBar — Custom frameless window title bar.
 * Features: drag region, app title, sidecar status LED, window controls.
 */
export default function TitleBar({ sidecarStatus = 'starting' }) {
    const [isMaximized, setIsMaximized] = useState(false);

    useEffect(() => {
        async function checkMaximized() {
            if (ipc?.windowIsMaximized) {
                const maximized = await ipc.windowIsMaximized();
                setIsMaximized(maximized);
            }
        }
        checkMaximized();
    }, []);

    const statusLabels = {
        starting: 'Starting Engine…',
        ready: 'Engine Ready',
        crashed: 'Engine Crashed',
        restarting: 'Restarting Engine…',
        error: 'Engine Offline',
    };

    const handleMinimize = () => ipc?.windowMinimize();
    const handleMaximize = () => {
        ipc?.windowMaximize();
        setIsMaximized(!isMaximized);
    };
    const handleClose = () => ipc?.windowClose();

    return (
        <div className="titlebar">
            <div className="titlebar__info">
                <span className="titlebar__title">City Simulator</span>
                <div className="titlebar__status">
                    <span className={`titlebar__status-dot titlebar__status-dot--${sidecarStatus}`} />
                    <span>{statusLabels[sidecarStatus] || sidecarStatus}</span>
                </div>
            </div>

            <div className="titlebar__controls">
                <button className="titlebar__btn" onClick={handleMinimize} title="Minimize">
                    <svg width="10" height="1" viewBox="0 0 10 1">
                        <line x1="0" y1="0.5" x2="10" y2="0.5" stroke="currentColor" strokeWidth="1" />
                    </svg>
                </button>
                <button className="titlebar__btn" onClick={handleMaximize} title={isMaximized ? 'Restore' : 'Maximize'}>
                    {isMaximized ? (
                        <svg width="10" height="10" viewBox="0 0 10 10">
                            <rect x="2" y="0" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1" />
                            <rect x="0" y="2" width="8" height="8" fill="var(--bg-secondary)" stroke="currentColor" strokeWidth="1" />
                        </svg>
                    ) : (
                        <svg width="10" height="10" viewBox="0 0 10 10">
                            <rect width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1" />
                        </svg>
                    )}
                </button>
                <button className="titlebar__btn titlebar__btn--close" onClick={handleClose} title="Close">
                    <svg width="10" height="10" viewBox="0 0 10 10">
                        <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" />
                        <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
