/**
 * UpdateNotice — Shows a banner when a new app version is available.
 * Allows user to download and install the update.
 */
import React, { useState, useEffect } from 'react';

export default function UpdateNotice() {
    const [updateInfo, setUpdateInfo] = useState(null);
    const [downloading, setDownloading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [ready, setReady] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        const api = window.electronAPI;
        if (!api) return;

        api.onUpdateAvailable?.((data) => setUpdateInfo(data));
        api.onUpdateProgress?.((data) => setProgress(data?.percent || 0));
        api.onUpdateReady?.(() => {
            setReady(true);
            setDownloading(false);
        });
    }, []);

    if (dismissed || !updateInfo) return null;

    const handleDownload = async () => {
        setDownloading(true);
        try {
            await window.electronAPI?.downloadUpdate();
        } catch {
            setDownloading(false);
        }
    };

    const handleInstall = () => {
        window.electronAPI?.installUpdate();
    };

    return (
        <div className="update-notice">
            <div className="update-notice__content">
                <span className="update-notice__icon">🔄</span>
                <span className="update-notice__text">
                    {ready
                        ? `Update v${updateInfo.version} ready to install`
                        : downloading
                            ? `Downloading v${updateInfo.version}... ${Math.round(progress)}%`
                            : `Update v${updateInfo.version} available`
                    }
                </span>
                <div className="update-notice__actions">
                    {ready ? (
                        <button className="update-notice__btn update-notice__btn--install" onClick={handleInstall}>
                            Install & Restart
                        </button>
                    ) : !downloading ? (
                        <button className="update-notice__btn update-notice__btn--download" onClick={handleDownload}>
                            Download
                        </button>
                    ) : null}
                    <button className="update-notice__btn update-notice__btn--dismiss" onClick={() => setDismissed(true)}>
                        ✕
                    </button>
                </div>
            </div>
            {downloading && (
                <div className="update-notice__progress">
                    <div className="update-notice__progress-bar" style={{ width: `${progress}%` }} />
                </div>
            )}
        </div>
    );
}
