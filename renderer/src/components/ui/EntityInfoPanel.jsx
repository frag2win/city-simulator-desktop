/**
 * EntityInfoPanel — Displays details about a selected building, road, or amenity.
 * Slides in from the right when an entity is clicked in the 3D scene.
 */
import React from 'react';
import useCityStore from '../../store/cityStore';

// Friendly labels for raw highway type values
const HIGHWAY_LABELS = {
    motorway: 'Motorway',
    trunk: 'Trunk Road',
    primary: 'Primary Road',
    secondary: 'Secondary Road',
    tertiary: 'Tertiary Road',
    residential: 'Residential Street',
    service: 'Service Road',
    footway: 'Footpath',
    cycleway: 'Cycle Path',
    path: 'Path',
    unclassified: 'Road',
    living_street: 'Living Street',
    pedestrian: 'Pedestrian Way',
    track: 'Track',
};

function friendlyHighway(raw) {
    if (!raw) return 'Road';
    return HIGHWAY_LABELS[raw] || raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function EntityInfoPanel() {
    const { selectedEntity, setSelectedEntity } = useCityStore();

    if (!selectedEntity) return null;

    const {
        type, osm_id, name, display_name,
        height, levels, building_type, address,
        highway_type, amenity, surface, lanes,
    } = selectedEntity;

    // Title: use display_name (generated server-side), fallback to name, then type label
    const title = display_name || name || `${type.charAt(0).toUpperCase() + type.slice(1)} #${osm_id}`;

    return (
        <div className="entity-panel" id="entity-info-panel">
            <div className="entity-panel__header">
                <span className="entity-panel__icon">
                    {type === 'building' ? '🏢' : type === 'road' ? '🛣️' : '📍'}
                </span>
                <h3 className="entity-panel__title">
                    {title}
                </h3>
                <button
                    className="entity-panel__close"
                    onClick={() => setSelectedEntity(null)}
                    title="Close"
                >
                    ✕
                </button>
            </div>

            <div className="entity-panel__body">
                <div className="entity-panel__row">
                    <span className="entity-panel__label">Type</span>
                    <span className="entity-panel__value">{type}</span>
                </div>
                <div className="entity-panel__row">
                    <span className="entity-panel__label">OSM ID</span>
                    <span className="entity-panel__value">{osm_id}</span>
                </div>

                {type === 'building' && (
                    <>
                        {building_type && building_type !== 'yes' && (
                            <div className="entity-panel__row">
                                <span className="entity-panel__label">Building</span>
                                <span className="entity-panel__value">
                                    {building_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                </span>
                            </div>
                        )}
                        {address && (
                            <div className="entity-panel__row">
                                <span className="entity-panel__label">Address</span>
                                <span className="entity-panel__value">{address}</span>
                            </div>
                        )}
                        <div className="entity-panel__row">
                            <span className="entity-panel__label">Height</span>
                            <span className="entity-panel__value">{height?.toFixed(1)}m</span>
                        </div>
                        <div className="entity-panel__row">
                            <span className="entity-panel__label">Floors</span>
                            <span className="entity-panel__value">{levels}</span>
                        </div>
                    </>
                )}

                {type === 'road' && (
                    <>
                        <div className="entity-panel__row">
                            <span className="entity-panel__label">Road Type</span>
                            <span className="entity-panel__value">{friendlyHighway(highway_type)}</span>
                        </div>
                        {surface && (
                            <div className="entity-panel__row">
                                <span className="entity-panel__label">Surface</span>
                                <span className="entity-panel__value">
                                    {surface.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                </span>
                            </div>
                        )}
                        {lanes && (
                            <div className="entity-panel__row">
                                <span className="entity-panel__label">Lanes</span>
                                <span className="entity-panel__value">{lanes}</span>
                            </div>
                        )}
                    </>
                )}

                {type === 'amenity' && (
                    <div className="entity-panel__row">
                        <span className="entity-panel__label">Amenity</span>
                        <span className="entity-panel__value">
                            {(amenity || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </span>
                    </div>
                )}

                {name && name !== display_name && (
                    <div className="entity-panel__row">
                        <span className="entity-panel__label">Name</span>
                        <span className="entity-panel__value">{name}</span>
                    </div>
                )}
            </div>

            <div className="entity-panel__footer">
                <a
                    className="entity-panel__link"
                    href={`https://www.openstreetmap.org/${type === 'building' ? 'way' : type === 'road' ? 'way' : 'node'}/${osm_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    View on OpenStreetMap ↗
                </a>
            </div>
        </div>
    );
}
