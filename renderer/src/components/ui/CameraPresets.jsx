/**
 * CameraPresets — Quick camera angle buttons.
 */
import React from 'react';
import { PerspectiveIcon, TopDownIcon, StreetIcon } from './Icons';

// Global camera/controls ref (set by CityScene)
let _camera = null;
let _controls = null;
let _cityCenter = { x: 0, y: 0, z: 0 };
let _cityDist = 500;

export function setCameraRefs(camera, controls) {
    _camera = camera;
    _controls = controls;
}

export function setCityBounds(center, maxDim) {
    _cityCenter = center;
    _cityDist = maxDim;
}

const PRESETS = [
    { icon: <PerspectiveIcon />, title: 'Perspective', angle: 'perspective' },
    { icon: <TopDownIcon />, title: 'Top-down', angle: 'topdown' },
    { icon: <StreetIcon />, title: 'Street level', angle: 'street' },
];

export default function CameraPresets() {
    const applyPreset = (angle) => {
        if (!_camera || !_controls) return;

        const c = _cityCenter;
        const d = _cityDist;

        switch (angle) {
            case 'perspective':
                _camera.position.set(c.x + d * 0.4, d * 0.35, c.z + d * 0.4);
                _controls.target.set(c.x, 0, c.z);
                break;
            case 'topdown':
                _camera.position.set(c.x, d * 0.8, c.z + 1);
                _controls.target.set(c.x, 0, c.z);
                break;
            case 'street':
                _camera.position.set(c.x, 15, c.z + d * 0.1);
                _controls.target.set(c.x, 10, c.z - 50);
                break;
        }
        _controls.update();
    };

    return (
        <div className="camera-presets" id="camera-presets">
            {PRESETS.map((p) => (
                <button
                    key={p.angle}
                    className="camera-preset__btn"
                    onClick={() => applyPreset(p.angle)}
                    title={p.title}
                >
                    {p.icon}
                </button>
            ))}
        </div>
    );
}
