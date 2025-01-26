/**
 * dayNightCycle.js — Animated sun rotation + sky color transitions.
 * Cycle: dawn → day → dusk → night → dawn (~60s at 1× speed)
 */
import * as THREE from 'three';

// Sky colors for each phase (interpolated smoothly)
const SKY_COLORS = {
    night: new THREE.Color(0x141428),
    dawn: new THREE.Color(0x2a1838),
    sunrise: new THREE.Color(0x2a1520),
    day: new THREE.Color(0x080810),
    sunset: new THREE.Color(0x201018),
    dusk: new THREE.Color(0x181025),
};

// Sun colors
const SUN_COLORS = {
    night: new THREE.Color(0x8899bb),   // Bright moonlight blue
    dawn: new THREE.Color(0xff8844),
    day: new THREE.Color(0xffeedd),
    sunset: new THREE.Color(0xff6633),
};

export class DayNightCycle {
    constructor(scene) {
        this.scene = scene;
        this.timeOfDay = 0.42; // 0-1 (0=midnight, 0.25=dawn, 0.5=noon, 0.75=dusk) — start at ~10 AM
        this.cycleDuration = 60; // seconds for a full day at 1× speed

        // Find existing lights
        this.sunLight = null;
        this.ambientLight = null;
        scene.traverse((obj) => {
            if (obj.isDirectionalLight && obj.castShadow) this.sunLight = obj;
            if (obj.isAmbientLight) this.ambientLight = obj;
        });

        this.sunRadius = 1200;
    }

    /** Update cycle. dt = delta time in seconds, speed = simulation speed multiplier */
    update(dt, speed = 1) {
        this.timeOfDay = (this.timeOfDay + (dt * speed) / this.cycleDuration) % 1;

        const t = this.timeOfDay;

        // Sun position — circular orbit
        const angle = t * Math.PI * 2 - Math.PI / 2; // start at horizon at t=0
        const sunY = Math.sin(angle) * this.sunRadius;
        const sunX = Math.cos(angle) * this.sunRadius * 0.6;
        const sunZ = Math.cos(angle) * this.sunRadius * 0.4;

        if (this.sunLight) {
            this.sunLight.position.set(sunX, Math.max(sunY, 50), sunZ);

            // Sun color and intensity based on elevation
            const elevation = Math.max(0, Math.sin(angle)); // 0 at horizon, 1 at zenith
            const sunColor = new THREE.Color();

            if (elevation < 0.1) {
                sunColor.lerpColors(SUN_COLORS.night, SUN_COLORS.dawn, elevation * 10);
                this.sunLight.intensity = 0.7 + elevation * 3;
            } else if (elevation < 0.5) {
                sunColor.lerpColors(SUN_COLORS.dawn, SUN_COLORS.day, (elevation - 0.1) / 0.4);
                this.sunLight.intensity = 0.9 + elevation * 0.8;
            } else {
                sunColor.copy(SUN_COLORS.day);
                this.sunLight.intensity = 1.2;
            }
            this.sunLight.color.copy(sunColor);
        }

        // Ambient light — keep bright enough at night for city visibility
        if (this.ambientLight) {
            const isNight = sunY < 0;
            this.ambientLight.intensity = isNight ? 0.9 : 0.6 + Math.sin(angle) * 0.3;
            this.ambientLight.color.setHSL(
                isNight ? 0.62 : 0.58,
                isNight ? 0.12 : 0.15,
                isNight ? 0.7 : 0.65
            );
        }

        // Background/fog color
        const bgColor = this._getSkyColor(t);
        this.scene.background.copy(bgColor);
        if (this.scene.fog) {
            this.scene.fog.color.copy(bgColor);
        }
    }

    _getSkyColor(t) {
        const c = new THREE.Color();
        if (t < 0.2) c.lerpColors(SKY_COLORS.night, SKY_COLORS.dawn, t / 0.2);
        else if (t < 0.3) c.lerpColors(SKY_COLORS.dawn, SKY_COLORS.day, (t - 0.2) / 0.1);
        else if (t < 0.7) c.copy(SKY_COLORS.day);
        else if (t < 0.8) c.lerpColors(SKY_COLORS.day, SKY_COLORS.sunset, (t - 0.7) / 0.1);
        else if (t < 0.9) c.lerpColors(SKY_COLORS.sunset, SKY_COLORS.dusk, (t - 0.8) / 0.1);
        else c.lerpColors(SKY_COLORS.dusk, SKY_COLORS.night, (t - 0.9) / 0.1);
        return c;
    }

    getTimeString() {
        const hours = Math.floor(this.timeOfDay * 24);
        const mins = Math.floor((this.timeOfDay * 24 - hours) * 60);
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }

    getIcon() {
        const h = this.timeOfDay * 24;
        if (h >= 6 && h < 18) return '☀️';
        if (h >= 18 && h < 20) return '🌅';
        return '🌙';
    }
}
