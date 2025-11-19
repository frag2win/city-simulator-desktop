/**
 * ScreenshotExport — Capture the current 3D viewport as a PNG.
 * Uses a global ref to the Three.js renderer set by CityScene.
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

export default function ScreenshotExport() {
    const [flash, setFlash] = useState(false);
    const { cityName } = useCityStore();

    const captureScreenshot = () => {
        if (!_renderer || !_scene || !_camera) return;

        // Render one frame for capture
        _renderer.render(_scene, _camera);

        // Capture the canvas
        const canvas = _renderer.domElement;
        canvas.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = `city-sim-${cityName || 'screenshot'}-${Date.now()}.png`;
            link.href = url;
            link.click();
            URL.revokeObjectURL(url);
        }, 'image/png');

        // Flash effect
        setFlash(true);
        setTimeout(() => setFlash(false), 600);
    };

    return (
        <button
            className={`hud__btn ${flash ? 'hud__btn--flash' : ''}`}
            onClick={captureScreenshot}
            title="Screenshot (PNG)"
            id="screenshot-btn"
        >
            📸
        </button>
    );
}
