/**
 * LayerToggles — Controls visibility of building, road, and amenity layers.
 * Compact toggle buttons in the HUD area.
 */
import React from 'react';
import useCityStore from '../../store/cityStore';
import { BuildingIcon, RoadIcon, PinIcon, HeatmapIcon, WaterIcon, TrainIcon, ZoneIcon, TreeIcon, PipelineIcon, XRayIcon, CloudIcon, TerrainIcon } from './Icons';

export default function LayerToggles() {
    const { layers, isXRayMode, toggleLayer, toggleXRayMode } = useCityStore();

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
                className={`layer-toggle ${layers.terrain ? 'active' : ''}`}
                onClick={() => toggleLayer('terrain')}
                title="Toggle terrain elevation"
            >
                <TerrainIcon />
            </button>
            <button
                className={`layer-toggle ${layers.amenities ? 'active' : ''}`}
                onClick={() => toggleLayer('amenities')}
                title="Toggle amenities"
            >
                <PinIcon />
            </button>

            <button
                className={`layer-toggle ${layers.water ? 'active' : ''}`}
                onClick={() => toggleLayer('water')}
                title="Toggle hydrology"
            >
                <WaterIcon />
            </button>
            <button
                className={`layer-toggle ${layers.railways ? 'active' : ''}`}
                onClick={() => toggleLayer('railways')}
                title="Toggle transit & railways"
            >
                <TrainIcon />
            </button>
            <button
                className={`layer-toggle ${layers.zones ? 'active' : ''}`}
                onClick={() => toggleLayer('zones')}
                title="Toggle landuse zoning"
            >
                <ZoneIcon />
            </button>

            <button
                className={`layer-toggle ${layers.pipelines ? 'active' : ''}`}
                onClick={() => toggleLayer('pipelines')}
                title="Toggle pipelines & utilities"
            >
                <PipelineIcon />
            </button>

            <div className="layer-divider" style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.2)', margin: '0 4px' }} />

            <button
                className={`layer-toggle ${layers.heatmap ? 'active' : ''}`}
                onClick={() => toggleLayer('heatmap')}
                title="Toggle density heatmap"
            >
                <HeatmapIcon />
            </button>
            <button
                className={`layer-toggle ${layers.environment ? 'active' : ''}`}
                onClick={() => toggleLayer('environment')}
                title="Toggle environment (Wind & AQI)"
            >
                <CloudIcon />
            </button>
            <button
                className={`layer-toggle ${isXRayMode ? 'active' : ''}`}
                onClick={() => toggleXRayMode()}
                title="Toggle X-Ray Mode (Subsurface View)"
            >
                <XRayIcon />
            </button>
            <button
                className={`layer-toggle ${layers.vegetation ? 'active' : ''}`}
                onClick={() => toggleLayer('vegetation')}
                title="Toggle vegetation & trees"
            >
                <TreeIcon />
            </button>
        </div>
    );
}
