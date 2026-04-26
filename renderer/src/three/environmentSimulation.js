import * as THREE from 'three';

const MAX_WIND_PARTICLES = 2000;

export class EnvironmentSimulation {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.name = 'environment';
        
        this.windParticles = null;
        this.aqiFog = null;
        
        this.windSpeed = 0; // m/s
        this.windDir = new THREE.Vector3(1, 0, 0);
        
        this.citySize = 2000;
        this.cityCenter = new THREE.Vector3();
        
        this.active = false;
        this.visible = false;
        
        // Per-particle state
        this.particleData = [];
        this.dummy = new THREE.Object3D();
    }

    async init(cityData, box) {
        if (!cityData.bbox) {
            console.warn('[Environment] No bbox in cityData, skipping weather fetch');
            return;
        }

        const [west, south, east, north] = cityData.bbox;
        const lat = (south + north) / 2;
        const lon = (west + east) / 2;

        this.cityCenter.copy(box.getCenter(new THREE.Vector3()));
        const sizeVec = box.getSize(new THREE.Vector3());
        this.citySize = Math.max(sizeVec.x, sizeVec.z, 1000);

        try {
            await Promise.all([
                this.fetchWind(lat, lon),
                this.fetchAQI(lat, lon)
            ]);
            
            this.buildWindParticles();
            this.buildAQIFog();
            
            this.scene.add(this.group);
            this.active = true;
            this.setVisible(this.visible); // apply initial visibility
            
            console.log('[Environment] initialized with wind speed:', this.windSpeed, 'm/s');
        } catch (e) {
            console.error('[Environment] Failed to initialize weather:', e);
        }
    }

    async fetchWind(lat, lon) {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_speed_10m,wind_direction_10m`;
        const res = await fetch(url);
        const data = await res.json();
        
        // Convert km/h to m/s
        this.windSpeed = (data.current?.wind_speed_10m || 10) / 3.6;
        
        // Meteorological wind direction is the direction the wind comes FROM.
        // We want the vector the wind is blowing TO.
        // Also 0 is North (which corresponds to -Z in our coords).
        const angleDeg = data.current?.wind_direction_10m || 0;
        // Direction wind is blowing TO
        const blowToDeg = (angleDeg + 180) % 360;
        const angleRad = (90 - blowToDeg) * Math.PI / 180; // convert to standard math angles where 0 is East
        
        this.windDir.set(Math.cos(angleRad), 0, -Math.sin(angleRad)).normalize();
    }

    async fetchAQI(lat, lon) {
        const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi`;
        const res = await fetch(url);
        const data = await res.json();
        
        const aqi = data.current?.us_aqi || 50;
        this.aqiValue = aqi;
    }

    buildWindParticles() {
        const geom = new THREE.CylinderGeometry(0.5, 0.5, 15, 4);
        geom.rotateZ(Math.PI / 2); // align with X axis
        
        const mat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.windParticles = new THREE.InstancedMesh(geom, mat, MAX_WIND_PARTICLES);
        this.windParticles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        
        const halfSize = this.citySize / 2;
        
        for (let i = 0; i < MAX_WIND_PARTICLES; i++) {
            const x = this.cityCenter.x + (Math.random() - 0.5) * this.citySize;
            const y = 20 + Math.random() * 200; // Heights from 20 to 220
            const z = this.cityCenter.z + (Math.random() - 0.5) * this.citySize;
            
            const speedVar = 0.5 + Math.random() * 1.0; // individual particle speed multiplier
            this.particleData.push({
                pos: new THREE.Vector3(x, y, z),
                speedMulti: speedVar
            });
            
            this.updateParticle(i, x, y, z);
        }
        this.windParticles.instanceMatrix.needsUpdate = true;
        this.group.add(this.windParticles);
    }
    
    buildAQIFog() {
        const size = this.citySize;
        const geom = new THREE.BoxGeometry(size, 300, size);
        
        // Color based on AQI (0-50 Green, 51-100 Yellow, 101-150 Orange, 151-200 Red, 201+ Purple)
        let color = 0x00ff00;
        let opacity = 0.05;
        const aqi = this.aqiValue;
        
        if (aqi > 300) { color = 0x800080; opacity = 0.4; }
        else if (aqi > 200) { color = 0x800080; opacity = 0.3; }
        else if (aqi > 150) { color = 0xff0000; opacity = 0.25; }
        else if (aqi > 100) { color = 0xffa500; opacity = 0.15; }
        else if (aqi > 50) { color = 0xffff00; opacity = 0.1; }
        else { color = 0x00ff00; opacity = 0.05; }
        
        const mat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: opacity,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        
        this.aqiFog = new THREE.Mesh(geom, mat);
        this.aqiFog.position.copy(this.cityCenter);
        this.aqiFog.position.y = 150; // Center at y=150 since height is 300
        this.group.add(this.aqiFog);
    }

    updateParticle(index, x, y, z) {
        this.dummy.position.set(x, y, z);
        // orient along windDir
        const target = new THREE.Vector3(x + this.windDir.x, y + this.windDir.y, z + this.windDir.z);
        this.dummy.lookAt(target);
        
        this.dummy.updateMatrix();
        this.windParticles.setMatrixAt(index, this.dummy.matrix);
    }

    update(dt, simSpeed = 1) {
        if (!this.active || !this.visible || !this.windParticles) return;

        const delta = dt * simSpeed * this.windSpeed;
        const halfSize = this.citySize / 2;

        for (let i = 0; i < MAX_WIND_PARTICLES; i++) {
            const data = this.particleData[i];
            
            // Move particle
            data.pos.addScaledVector(this.windDir, delta * data.speedMulti);
            
            // Wrap around logic
            let wrapped = false;
            if (data.pos.x > this.cityCenter.x + halfSize) { data.pos.x -= this.citySize; wrapped = true; }
            if (data.pos.x < this.cityCenter.x - halfSize) { data.pos.x += this.citySize; wrapped = true; }
            if (data.pos.z > this.cityCenter.z + halfSize) { data.pos.z -= this.citySize; wrapped = true; }
            if (data.pos.z < this.cityCenter.z - halfSize) { data.pos.z += this.citySize; wrapped = true; }
            
            this.updateParticle(i, data.pos.x, data.pos.y, data.pos.z);
        }
        
        this.windParticles.instanceMatrix.needsUpdate = true;
    }

    setVisible(visible) {
        this.visible = visible;
        this.group.visible = visible;
    }
    
    dispose() {
        if (this.windParticles) {
            this.windParticles.geometry.dispose();
            this.windParticles.material.dispose();
        }
        if (this.aqiFog) {
            this.aqiFog.geometry.dispose();
            this.aqiFog.material.dispose();
        }
        this.scene.remove(this.group);
        this.active = false;
    }
}
