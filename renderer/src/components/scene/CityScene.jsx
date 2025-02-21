import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createBuildingGroup } from '../../three/buildingGeometry';
import { createRoadGroup } from '../../three/roadGeometry';
import { createAmenityGroup } from '../../three/amenityGeometry';
import useCityStore from '../../store/cityStore';

/**
 * CityScene — Main Three.js 3D viewport.
 * Renders buildings, roads, and amenities from GeoJSON data.
 */
export default function CityScene() {
    const containerRef = useRef(null);
    const sceneRef = useRef(null);
    const rendererRef = useRef(null);
    const cameraRef = useRef(null);
    const controlsRef = useRef(null);
    const animationRef = useRef(null);
    const cityGroupRef = useRef(null);

    const { cityData } = useCityStore();
    const [debugInfo, setDebugInfo] = useState('');

    // Initialize Three.js scene
    const initScene = useCallback(() => {
        if (!containerRef.current) return;

        const container = containerRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight;

        // Scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0a0f);
        scene.fog = new THREE.FogExp2(0x0a0a0f, 0.00008);
        sceneRef.current = scene;

        // Camera — far clipping at 100k to handle large cities
        const camera = new THREE.PerspectiveCamera(50, width / height, 0.5, 100000);
        camera.position.set(500, 600, 500);
        camera.lookAt(0, 0, 0);
        cameraRef.current = camera;

        // Renderer
        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
        });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.4;
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // Controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.maxPolarAngle = Math.PI / 2.1;
        controls.minDistance = 10;
        controls.maxDistance = 20000;
        controls.target.set(0, 0, 0);
        controls.update();
        controlsRef.current = controls;

        // Lights
        setupLights(scene);

        // Ground plane
        setupGround(scene);

        // Grid helper
        const grid = new THREE.GridHelper(6000, 120, 0x1a1a2e, 0x14141e);
        grid.position.y = 0.05;
        scene.add(grid);

        // Handle resize
        const handleResize = () => {
            if (!container) return;
            const w = container.clientWidth;
            const h = container.clientHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        };
        window.addEventListener('resize', handleResize);

        // Animation loop
        const animate = () => {
            animationRef.current = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationRef.current);
            controls.dispose();
            renderer.dispose();
            if (container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }
        };
    }, []);

    // Setup lights
    function setupLights(scene) {
        // Strong ambient for visibility
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambient);

        // Hemisphere light
        const hemi = new THREE.HemisphereLight(0x87ceeb, 0x444444, 0.5);
        scene.add(hemi);

        // Main directional (sun)
        const sun = new THREE.DirectionalLight(0xffeedd, 1.5);
        sun.position.set(500, 1200, 500);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        sun.shadow.camera.near = 10;
        sun.shadow.camera.far = 4000;
        sun.shadow.camera.left = -2000;
        sun.shadow.camera.right = 2000;
        sun.shadow.camera.top = 2000;
        sun.shadow.camera.bottom = -2000;
        sun.shadow.bias = -0.0005;
        scene.add(sun);

        // Fill light
        const fill = new THREE.DirectionalLight(0x8899bb, 0.4);
        fill.position.set(-400, 600, -400);
        scene.add(fill);
    }

    // Ground plane
    function setupGround(scene) {
        const groundGeom = new THREE.PlaneGeometry(20000, 20000);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x111118,
            roughness: 1,
        });
        const ground = new THREE.Mesh(groundGeom, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0;
        ground.receiveShadow = true;
        ground.name = 'ground';
        scene.add(ground);
    }

    // Load city data into scene
    useEffect(() => {
        if (!sceneRef.current || !cityData?.features) return;

        const scene = sceneRef.current;

        // Remove previous city group
        if (cityGroupRef.current) {
            scene.remove(cityGroupRef.current);
            disposeGroup(cityGroupRef.current);
            cityGroupRef.current = null;
        }

        const features = cityData.features;
        if (features.length === 0) return;

        console.log(`[CityScene] Loading ${features.length} features...`);

        // Create city group
        const cityGroup = new THREE.Group();
        cityGroup.name = 'city';

        // Add buildings
        const buildings = createBuildingGroup(features);
        cityGroup.add(buildings);

        // Add roads
        const roads = createRoadGroup(features);
        cityGroup.add(roads);

        // Add amenities
        const amenities = createAmenityGroup(features);
        cityGroup.add(amenities);

        scene.add(cityGroup);
        cityGroupRef.current = cityGroup;

        // Compute bounds and fit camera
        const box = new THREE.Box3().setFromObject(cityGroup);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const info = `B:${buildings.children.length} R:${roads.children.length} A:${amenities.children.length}\n` +
            `Size: ${size.x.toFixed(0)}×${size.y.toFixed(0)}×${size.z.toFixed(0)}\n` +
            `Center: ${center.x.toFixed(0)},${center.y.toFixed(0)},${center.z.toFixed(0)}`;
        setDebugInfo(info);
        console.log('[CityScene]', info);

        if (!box.isEmpty() && isFinite(size.x)) {
            const maxDim = Math.max(size.x, size.z, 200);
            const dist = maxDim * 1.0;

            if (cameraRef.current && controlsRef.current) {
                cameraRef.current.position.set(
                    center.x + dist * 0.6,
                    dist * 0.5,
                    center.z + dist * 0.6
                );
                controlsRef.current.target.set(center.x, 0, center.z);
                controlsRef.current.update();
            }
        }

    }, [cityData]);

    // Dispose GPU resources
    function disposeGroup(group) {
        group.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach((m) => m.dispose());
                } else {
                    obj.material.dispose();
                }
            }
        });
    }

    // Initialize scene on mount
    useEffect(() => {
        const cleanup = initScene();
        return cleanup;
    }, [initScene]);

    return (
        <>
            <div
                ref={containerRef}
                className="city-scene"
                style={{
                    width: '100%',
                    height: '100%',
                    position: 'absolute',
                    inset: 0,
                }}
            />
            {debugInfo && (
                <pre style={{
                    position: 'absolute',
                    bottom: '40px',
                    left: '12px',
                    background: 'rgba(0,0,0,0.85)',
                    color: '#0f0',
                    padding: '8px 12px',
                    zIndex: 100,
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    pointerEvents: 'none',
                    borderRadius: '4px',
                    border: '1px solid #0f03',
                    whiteSpace: 'pre',
                }}>
                    {debugInfo}
                </pre>
            )}
        </>
    );
}
