/**
 * Tests for SimulationControls component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const mockSetIsPlaying = vi.fn();
const mockSetSimSpeed = vi.fn();

vi.mock('../../store/cityStore', () => ({
    default: () => ({
        isPlaying: true,
        simSpeed: 1,
        timeOfDay: { time: '14:30', icon: '☀️' },
        agentCounts: { vehicles: 42, pedestrians: 78 },
        setIsPlaying: mockSetIsPlaying,
        setSimSpeed: mockSetSimSpeed,
    }),
}));

vi.mock('../../components/ui/Icons', () => ({
    PlayIcon: ({ size }) => <span data-testid="icon-play" />,
    PauseIcon: ({ size }) => <span data-testid="icon-pause" />,
    CarIcon: ({ size }) => <span data-testid="icon-car" />,
    PedestrianIcon: ({ size }) => <span data-testid="icon-pedestrian" />,
}));

import SimulationControls from '../../components/ui/SimulationControls';

describe('SimulationControls', () => {
    beforeEach(() => {
        mockSetIsPlaying.mockClear();
        mockSetSimSpeed.mockClear();
    });

    it('renders play/pause button', () => {
        render(<SimulationControls />);
        // When isPlaying is true, should show Pause icon
        expect(screen.getByTestId('icon-pause')).toBeTruthy();
    });

    it('toggles play state on click', () => {
        render(<SimulationControls />);
        const btn = screen.getByTitle('Pause simulation');
        fireEvent.click(btn);
        expect(mockSetIsPlaying).toHaveBeenCalledWith(false);
    });

    it('renders speed buttons', () => {
        render(<SimulationControls />);
        expect(screen.getByText('0.5×')).toBeTruthy();
        expect(screen.getByText('1×')).toBeTruthy();
        expect(screen.getByText('2×')).toBeTruthy();
        expect(screen.getByText('4×')).toBeTruthy();
    });

    it('calls setSimSpeed on speed button click', () => {
        render(<SimulationControls />);
        fireEvent.click(screen.getByText('2×'));
        expect(mockSetSimSpeed).toHaveBeenCalledWith(2);
    });

    it('marks current speed as active', () => {
        render(<SimulationControls />);
        const btn1x = screen.getByText('1×');
        expect(btn1x.className).toContain('active');
        const btn2x = screen.getByText('2×');
        expect(btn2x.className).not.toContain('active');
    });

    it('displays time of day', () => {
        render(<SimulationControls />);
        expect(screen.getByText(/14:30/)).toBeTruthy();
    });

    it('displays agent counts', () => {
        render(<SimulationControls />);
        expect(screen.getByText('42')).toBeTruthy();
        expect(screen.getByText('78')).toBeTruthy();
    });
});
