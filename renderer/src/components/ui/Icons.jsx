/**
 * Icons — Inline SVG icon components for the UI.
 * Replaces all emoji icons with crisp, scalable SVGs.
 * Each icon is a React component accepting className and size props.
 */
import React from 'react';

const defaultSize = 16;

const Icon = ({ children, size = defaultSize, className = '', ...props }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`icon ${className}`}
        {...props}
    >
        {children}
    </svg>
);

// ─── Layer Toggles ──────────────────────────────────────

/** Buildings — stacked rectangles */
export const BuildingIcon = (props) => (
    <Icon {...props}>
        <rect x="3" y="10" width="7" height="11" rx="1" />
        <rect x="14" y="4" width="7" height="17" rx="1" />
        <line x1="6" y1="13" x2="6" y2="13.01" />
        <line x1="6" y1="16" x2="6" y2="16.01" />
        <line x1="17" y1="8" x2="17" y2="8.01" />
        <line x1="17" y1="11" x2="17" y2="11.01" />
        <line x1="17" y1="14" x2="17" y2="14.01" />
        <line x1="17" y1="17" x2="17" y2="17.01" />
    </Icon>
);

/** Roads — forking path */
export const RoadIcon = (props) => (
    <Icon {...props}>
        <path d="M12 2v20" />
        <path d="M5 10l-2 6h5" />
        <path d="M19 10l2 6h-5" />
        <path d="M9 2h6" />
        <path d="M7 22h10" />
    </Icon>
);

/** Amenities — map pin */
export const PinIcon = (props) => (
    <Icon {...props}>
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
        <circle cx="12" cy="9" r="2.5" />
    </Icon>
);

/** Heatmap — thermometer */
export const HeatmapIcon = (props) => (
    <Icon {...props}>
        <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
    </Icon>
);

/** Terrain — mountain peaks wireframe */
export const TerrainIcon = (props) => (
    <Icon {...props}>
        <path d="M2 20 L7 10 L10 14 L14 6 L18 12 L22 20 Z" />
        <path d="M2 20 L22 20" />
    </Icon>
);

/** Water — droplet */
export const WaterIcon = (props) => (
    <Icon {...props}>
        <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />
    </Icon>
);

/** Railways — train */
export const TrainIcon = (props) => (
    <Icon {...props}>
        <rect x="4" y="3" width="16" height="16" rx="2" ry="2" />
        <path d="M4 11h16" />
        <path d="M12 3v8" />
        <path d="M8 19l-2 3" />
        <path d="M16 19l2 3" />
        <path d="M8 15h.01" />
        <path d="M16 15h.01" />
    </Icon>
);

/** Zoning — Map patches */
export const ZoneIcon = (props) => (
    <Icon {...props}>
        <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
        <line x1="9" y1="3" x2="9" y2="18" />
        <line x1="15" y1="6" x2="15" y2="21" />
    </Icon>
);

// ─── Actions ────────────────────────────────────────────

/** Screenshot — camera */
export const CameraIcon = (props) => (
    <Icon {...props}>
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
    </Icon>
);

/** Camera shutter for resolution menu items */
export const ShutterIcon = (props) => (
    <Icon {...props}>
        <circle cx="12" cy="12" r="10" />
        <path d="M14.31 8l5.74 9.94M9.69 8h11.48M7.38 12l5.74-9.94M9.69 16L3.95 6.06M14.31 16H2.83M16.62 12l-5.74 9.94" />
    </Icon>
);

/** Bolt / quick action */
export const BoltIcon = (props) => (
    <Icon {...props}>
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </Icon>
);

/** Export / share — arrow up from box */
export const ExportIcon = (props) => (
    <Icon {...props}>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
    </Icon>
);

/** Save / disk */
export const SaveIcon = (props) => (
    <Icon {...props}>
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
        <polyline points="17 21 17 13 7 13 7 21" />
        <polyline points="7 3 7 8 15 8" />
    </Icon>
);

/** Search — magnifying glass */
export const SearchIcon = (props) => (
    <Icon {...props}>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </Icon>
);

/** Folder open */
export const FolderOpenIcon = (props) => (
    <Icon {...props}>
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </Icon>
);

/** Database / cache */
export const DatabaseIcon = (props) => (
    <Icon {...props}>
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </Icon>
);

// ─── Simulation ─────────────────────────────────────────

/** Play triangle */
export const PlayIcon = (props) => (
    <Icon {...props}>
        <polygon points="5 3 19 12 5 21 5 3" />
    </Icon>
);

/** Pause bars */
export const PauseIcon = (props) => (
    <Icon {...props}>
        <rect x="6" y="4" width="4" height="16" />
        <rect x="14" y="4" width="4" height="16" />
    </Icon>
);

/** Car — vehicle */
export const CarIcon = (props) => (
    <Icon {...props}>
        <path d="M5 17h14M5 17a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1l2-3h8l2 3h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2" />
        <circle cx="7.5" cy="17" r="2" />
        <circle cx="16.5" cy="17" r="2" />
    </Icon>
);

/** Person walking — pedestrian */
export const PedestrianIcon = (props) => (
    <Icon {...props}>
        <circle cx="12" cy="5" r="2" />
        <path d="M10 22l2-7 3 3v6" />
        <path d="M8 12l4-2 4 3" />
        <path d="M10 10l-2 8" />
    </Icon>
);

// ─── Camera Presets ─────────────────────────────────────

/** Perspective / 3D view — eye */
export const PerspectiveIcon = (props) => (
    <Icon {...props}>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
    </Icon>
);

/** Top-down view — arrow pointing down into box */
export const TopDownIcon = (props) => (
    <Icon {...props}>
        <polyline points="7 13 12 18 17 13" />
        <line x1="12" y1="5" x2="12" y2="18" />
        <rect x="3" y="2" width="18" height="20" rx="2" fill="none" />
    </Icon>
);

/** Street-level — city skyline */
export const StreetIcon = (props) => (
    <Icon {...props}>
        <rect x="1" y="12" width="5" height="9" />
        <rect x="7" y="6" width="5" height="15" />
        <rect x="13" y="9" width="5" height="12" />
        <rect x="19" y="14" width="4" height="7" />
        <line x1="1" y1="21" x2="23" y2="21" />
    </Icon>
);

// ─── Misc ───────────────────────────────────────────────

/** City skyline — empty state hero icon */
export const CityIcon = (props) => (
    <Icon size={48} {...props}>
        <rect x="1" y="11" width="6" height="10" rx="1" />
        <rect x="8" y="3" width="8" height="18" rx="1" />
        <rect x="17" y="7" width="6" height="14" rx="1" />
        <line x1="11" y1="6" x2="13" y2="6" />
        <line x1="11" y1="9" x2="13" y2="9" />
        <line x1="11" y1="12" x2="13" y2="12" />
        <line x1="11" y1="15" x2="13" y2="15" />
        <line x1="4" y1="14" x2="4" y2="14.01" />
        <line x1="4" y1="17" x2="4" y2="17.01" />
        <line x1="20" y1="10" x2="20" y2="10.01" />
        <line x1="20" y1="13" x2="20" y2="13.01" />
        <line x1="20" y1="16" x2="20" y2="16.01" />
    </Icon>
);
