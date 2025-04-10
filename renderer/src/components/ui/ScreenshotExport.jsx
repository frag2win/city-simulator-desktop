/**
 * ScreenshotExport — Capture the current 3D viewport as a PNG.
 * Uses native save dialog via IPC for proper file saving.
 * Supports 1×, 2×, and 4× resolution capture.
 */
import React, { useState } from 'react';
import useCityStore from '../../store/cityStore';

// Global renderer reference (set by CityScene)
let _renderer = null;
let _scene = null;
let _camera = null;

export function setRendererRef(renderer, scene, camera) {
    _renderer = renderer;
    _scene = scene;
    _camera = camera;
}

const RESOLUTIONS = [
    { label: '1×', scale: 1, title: 'Standard resolution' },
    { label: '2×', scale: 2, title: 'High resolution (2×)' },
    { label: '4K', scale: 4, title: 'Ultra resolution (4×)' },
];

export default function ScreenshotExport() {
    const [flash, setFlash] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [capturing, setCapturing] = useState(false);
    const { saveScreenshot } = useCityStore();

    const captureScreenshot = async (scale = 1) => {
        if (!_renderer || !_scene || !_camera || capturing) return;

        setCapturing(true);
        setShowMenu(false);

        try {
            const canvas = _renderer.domElement;
            const origW = canvas.width;
            const origH = canvas.height;
            const origPixelRatio = _renderer.getPixelRatio();

            // Scale up for hi-res capture
            if (scale > 1) {
                _renderer.setSize(canvas.clientWidth * scale, canvas.clientHeight * scale, false);
                _renderer.setPixelRatio(1);
            }

            // Render one frame for capture
            _renderer.render(_scene, _camera);

            // Get data URL
            const dataUrl = _renderer.domElement.toDataURL('image/png');

            // Restore original size immediately
            if (scale > 1) {
                _renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
                _renderer.setPixelRatio(origPixelRatio);
            }

            // Flash effect
            setFlash(true);
            setTimeout(() => setFlash(false), 600);

            // Save via native dialog (IPC) if available, else fallback to download
            if (saveScreenshot) {
                await saveScreenshot(dataUrl);
            } else {
                const link = document.createElement('a');
                link.download = `city-sim-screenshot-${Date.now()}.png`;
                link.href = dataUrl;
                link.click();
            }
        } catch {
            // Restore renderer on error
            if (scale > 1 && _renderer) {
                _renderer.setSize(_renderer.domElement.clientWidth, _renderer.domElement.clientHeight, false);
            }
        } finally {
            setCapturing(false);
        }
    };

    return (
        <div className="screenshot-export" style={{ position: 'relative' }}>
            <button
                className={`hud__btn ${flash ? 'hud__btn--flash' : ''}`}
                onClick={() => setShowMenu(!showMenu)}
                title="Screenshot (PNG)"
                id="screenshot-btn"
            >
                📸
            </button>

            {showMenu && (
                <div className="screenshot-menu">
                    {RESOLUTIONS.map((res) => (
                        <button
                            key={res.scale}
                            className="screenshot-menu__item"
                            onClick={() => captureScreenshot(res.scale)}
                            title={res.title}
                            disabled={capturing}
                        >
                            📷 {res.label}
                        </button>
                    ))}
                    <button
                        className="screenshot-menu__item screenshot-menu__item--quick"
                        onClick={() => { setShowMenu(false); captureScreenshot(1); }}
                        disabled={capturing}
                    >
                        ⚡ Quick Save
                    </button>
                </div>
            )}
        </div>
    );
}
