/**
 * SimulationControls — Play/pause, speed, time-of-day display.
 */
import React from 'react';
import useCityStore from '../../store/cityStore';

const SPEEDS = [0.5, 1, 2, 4];

export default function SimulationControls() {
    const { isPlaying, simSpeed, timeOfDay, agentCounts, setIsPlaying, setSimSpeed } = useCityStore();

    return (
        <div className="sim-controls" id="simulation-controls">
            {/* Play / Pause */}
            <button
                className={`sim-controls__btn ${isPlaying ? 'playing' : ''}`}
                onClick={() => setIsPlaying(!isPlaying)}
                title={isPlaying ? 'Pause simulation' : 'Play simulation'}
            >
                {isPlaying ? '⏸' : '▶'}
            </button>

            {/* Speed selector */}
            <div className="sim-controls__speed">
                {SPEEDS.map((s) => (
                    <button
                        key={s}
                        className={`sim-controls__speed-btn ${simSpeed === s ? 'active' : ''}`}
                        onClick={() => setSimSpeed(s)}
                    >
                        {s}×
                    </button>
                ))}
            </div>

            {/* Divider */}
            <div className="hud__divider" />

            {/* Time of day */}
            <div className="sim-controls__time" title="Time of day">
                {timeOfDay.icon} {timeOfDay.time}
            </div>

            {/* Agent counts */}
            <div className="sim-controls__agents">
                <span title="Vehicles">🚗 {agentCounts.vehicles}</span>
                <span title="Pedestrians">🚶 {agentCounts.pedestrians}</span>
            </div>
        </div>
    );
}
