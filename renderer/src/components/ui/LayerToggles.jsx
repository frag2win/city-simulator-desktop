/**
 * LayerToggles — Controls visibility of building, road, and amenity layers.
 * Compact toggle buttons in the HUD area.
 */
import React from 'react';
import useCityStore from '../../store/cityStore';
import { BuildingIcon, RoadIcon, PinIcon, HeatmapIcon } from './Icons';

export default function LayerToggles() {
    const { layers, toggleLayer } = useCityStore();

    return (
        <div className="layer-toggles" id="layer-toggles">
            <button
                className={`layer-toggle ${layers.buildings ? 'active' : ''}`}
                onClick={() => toggleLayer('buildings')}
                title="Toggle buildings"
            >
                <BuildingIcon />
            </button>
            <button
                className={`layer-toggle ${layers.roads ? 'active' : ''}`}
                onClick={() => toggleLayer('roads')}
                title="Toggle roads"
            >
                <RoadIcon />
            </button>
            <button
                className={`layer-toggle ${layers.amenities ? 'active' : ''}`}
                onClick={() => toggleLayer('amenities')}
                title="Toggle amenities"
            >
                <PinIcon />
            </button>

            <button
                className={`layer-toggle ${layers.heatmap ? 'active' : ''}`}
                onClick={() => toggleLayer('heatmap')}
                title="Toggle density heatmap"
            >
                <HeatmapIcon />
            </button>
        </div>
    );
}
