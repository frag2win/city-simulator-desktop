import React, { useRef, useEffect, useCallback } from 'react';
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
    const raycasterRef = useRef(new THREE.Raycaster());
    const mouseRef = useRef(new THREE.Vector2());

    const { cityData } = useCityStore();

    // Initialize Three.js scene
    const initScene = useCallback(() => {
        if (!containerRef.current) return;

        const container = containerRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight;

        // Scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0a0f);
        scene.fog = new THREE.FogExp2(0x0a0a0f, 0.00015);
        sceneRef.current = scene;

        // Camera
        const camera = new THREE.PerspectiveCamera(45, width / height, 1, 50000);
        camera.position.set(0, 800, 800);
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
        renderer.toneMappingExposure = 1.2;
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // Controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.maxPolarAngle = Math.PI / 2.2; // Prevent going underground
        controls.minDistance = 50;
        controls.maxDistance = 5000;
        controls.target.set(0, 0, 0);
        controls.update();
        controlsRef.current = controls;

        // Lights
        setupLights(scene);

        // Ground plane
        setupGround(scene);

        // Grid helper (subtle)
        const grid = new THREE.GridHelper(4000, 100, 0x1a1a26, 0x12121a);
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
        // Ambient light — soft base illumination
        const ambient = new THREE.AmbientLight(0x4466aa, 0.4);
        scene.add(ambient);

        // Hemisphere light — sky/ground color bleed
        const hemi = new THREE.HemisphereLight(0x87ceeb, 0x362f2d, 0.5);
        scene.add(hemi);

        // Directional light — main sun (casting shadows)
        const sun = new THREE.DirectionalLight(0xffeedd, 1.5);
        sun.position.set(500, 1000, 500);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        sun.shadow.camera.near = 10;
        sun.shadow.camera.far = 3000;
        sun.shadow.camera.left = -1500;
        sun.shadow.camera.right = 1500;
        sun.shadow.camera.top = 1500;
        sun.shadow.camera.bottom = -1500;
        sun.shadow.bias = -0.0005;
        scene.add(sun);

        // Fill light from opposite side
        const fill = new THREE.DirectionalLight(0x8899bb, 0.3);
        fill.position.set(-400, 600, -400);
        scene.add(fill);
    }

    // Setup ground plane
    function setupGround(scene) {
        const groundGeom = new THREE.PlaneGeometry(10000, 10000);
        const groundMat = new THREE.MeshPhongMaterial({
            color: 0x0f0f18,
            depthWrite: true,
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

        // Auto-fit camera to city bounds
        fitCameraToCity(cityGroup);

    }, [cityData]);

    // Fit camera to view the entire city
    function fitCameraToCity(group) {
        const box = new THREE.Box3().setFromObject(group);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.z);
        const dist = maxDim * 1.2;

        if (cameraRef.current && controlsRef.current) {
            cameraRef.current.position.set(
                center.x + dist * 0.5,
                dist * 0.7,
                center.z + dist * 0.5
            );
            controlsRef.current.target.copy(center);
            controlsRef.current.update();
        }
    }

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
    );
}
