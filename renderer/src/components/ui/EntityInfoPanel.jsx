/**
 * EntityInfoPanel — Displays details about a selected building, road, or amenity.
 * Slides in from the right when an entity is clicked in the 3D scene.
 */
import React from 'react';
import useCityStore from '../../store/cityStore';

export default function EntityInfoPanel() {
    const { selectedEntity, setSelectedEntity } = useCityStore();

    if (!selectedEntity) return null;

    const { type, osm_id, name, height, levels, highway_type, amenity } = selectedEntity;

    return (
        <div className="entity-panel" id="entity-info-panel">
            <div className="entity-panel__header">
                <span className="entity-panel__icon">
                    {type === 'building' ? '🏢' : type === 'road' ? '🛣️' : '📍'}
                </span>
                <h3 className="entity-panel__title">
                    {name || `${type.charAt(0).toUpperCase() + type.slice(1)} #${osm_id}`}
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
                    <div className="entity-panel__row">
                        <span className="entity-panel__label">Road Type</span>
                        <span className="entity-panel__value">{highway_type}</span>
                    </div>
                )}

                {type === 'amenity' && (
                    <div className="entity-panel__row">
                        <span className="entity-panel__label">Amenity</span>
                        <span className="entity-panel__value">{amenity}</span>
                    </div>
                )}

                {name && (
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
