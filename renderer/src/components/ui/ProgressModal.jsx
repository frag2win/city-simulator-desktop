import React from 'react';
import useCityStore from '../../store/cityStore';

/**
 * ProgressModal — Full-screen overlay during city ingestion.
 * Shows stage name, progress bar, message, and cancel button.
 */
export default function ProgressModal() {
    const { showProgress, isLoading, progress, error } = useCityStore();

    if (!showProgress && !error) return null;

    // Error state
    if (error) {
        return (
            <div className="progress-overlay">
                <div className="progress-modal">
                    <div className="progress-modal__icon progress-modal__icon--error">✗</div>
                    <h2 className="progress-modal__title">Load Failed</h2>
                    <p className="progress-modal__message">{error}</p>
                    <button
                        className="progress-modal__btn"
                        onClick={() => useCityStore.getState().setError(null)}
                    >
                        Dismiss
                    </button>
                </div>
            </div>
        );
    }

    if (!isLoading) return null;

    const stageLabels = {
        querying: 'Querying OpenStreetMap',
        processing: 'Processing Data',
        building_geometry: 'Building Geometry',
        caching: 'Caching Locally',
        complete: 'Complete',
    };

    return (
        <div className="progress-overlay">
            <div className="progress-modal">
                <div className="progress-modal__icon">🌐</div>
                <h2 className="progress-modal__title">Loading City</h2>

                <div className="progress-modal__stage">
                    {stageLabels[progress.stage] || progress.stage}
                </div>

                <div className="progress-bar">
                    <div
                        className="progress-bar__fill"
                        style={{ width: `${Math.max(progress.percent, 2)}%` }}
                    />
                </div>

                <p className="progress-modal__message">
                    {progress.message || 'Please wait…'}
                </p>

                <div className="progress-modal__percent">
                    {Math.round(progress.percent)}%
                </div>
            </div>
        </div>
    );
}
