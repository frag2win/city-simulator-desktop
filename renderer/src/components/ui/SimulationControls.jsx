/**
 * SimulationControls — Play/pause, speed, time-of-day display.
 */
import React from 'react';
import useCityStore from '../../store/cityStore';
import { PlayIcon, PauseIcon, CarIcon, PedestrianIcon } from './Icons';

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
                {isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
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
                <span title="Vehicles"><CarIcon size={13} /> {agentCounts.vehicles}</span>
                <span title="Pedestrians"><PedestrianIcon size={13} /> {agentCounts.pedestrians}</span>
            </div>
        </div>
    );
}
