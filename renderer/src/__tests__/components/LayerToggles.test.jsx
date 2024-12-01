/**
 * Tests for LayerToggles component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock zustand store
const mockToggleLayer = vi.fn();
let mockLayers = { buildings: true, roads: true, amenities: true, heatmap: false };

vi.mock('../../store/cityStore', () => ({
    default: () => ({
        layers: mockLayers,
        toggleLayer: mockToggleLayer,
    }),
}));

// Mock SVG icons to simple spans
vi.mock('../../components/ui/Icons', () => ({
    BuildingIcon: () => <span data-testid="icon-building" />,
    RoadIcon: () => <span data-testid="icon-road" />,
    PinIcon: () => <span data-testid="icon-pin" />,
    HeatmapIcon: () => <span data-testid="icon-heatmap" />,
}));

import LayerToggles from '../../components/ui/LayerToggles';

describe('LayerToggles', () => {
    beforeEach(() => {
        mockToggleLayer.mockClear();
        mockLayers = { buildings: true, roads: true, amenities: true, heatmap: false };
    });

    it('renders four toggle buttons', () => {
        render(<LayerToggles />);
        const buttons = screen.getAllByRole('button');
        expect(buttons.length).toBe(4);
    });

    it('marks active layers', () => {
        render(<LayerToggles />);
        const buildingBtn = screen.getByTitle('Toggle buildings');
        expect(buildingBtn.className).toContain('active');
        const heatmapBtn = screen.getByTitle('Toggle density heatmap');
        expect(heatmapBtn.className).not.toContain('active');
    });

    it('calls toggleLayer on click', () => {
        render(<LayerToggles />);
        fireEvent.click(screen.getByTitle('Toggle roads'));
        expect(mockToggleLayer).toHaveBeenCalledWith('roads');
    });

    it('renders all four icons', () => {
        render(<LayerToggles />);
        expect(screen.getByTestId('icon-building')).toBeTruthy();
        expect(screen.getByTestId('icon-road')).toBeTruthy();
        expect(screen.getByTestId('icon-pin')).toBeTruthy();
        expect(screen.getByTestId('icon-heatmap')).toBeTruthy();
    });

    it('toggles heatmap layer on click', () => {
        render(<LayerToggles />);
        fireEvent.click(screen.getByTitle('Toggle density heatmap'));
        expect(mockToggleLayer).toHaveBeenCalledWith('heatmap');
    });
});
