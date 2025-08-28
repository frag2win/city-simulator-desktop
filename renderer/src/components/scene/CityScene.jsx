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

    const { cityData } = useCityStore();

    // Initialize Three.js scene
    const initScene = useCallback(() => {
        if (!containerRef.current) return;

        const container = containerRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight;

        // Scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x080810);
        scene.fog = new THREE.FogExp2(0x080810, 0.00004);
        sceneRef.current = scene;

        // Camera
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
        renderer.shadowMap.type = THREE.PCFShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.3;
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

        // Grid
        const grid = new THREE.GridHelper(8000, 160, 0x161625, 0x101018);
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

    // Lights — cinematic blue-tinted cityscape lighting
    function setupLights(scene) {
        // Ambient — cool blue base
        const ambient = new THREE.AmbientLight(0x8899bb, 0.6);
        scene.add(ambient);

        // Hemisphere — sky/ground
        const hemi = new THREE.HemisphereLight(0x7799cc, 0x222233, 0.5);
        scene.add(hemi);

        // Main directional (warm sun from upper-right)
        const sun = new THREE.DirectionalLight(0xffeedd, 1.2);
        sun.position.set(600, 1200, 400);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        sun.shadow.camera.near = 10;
        sun.shadow.camera.far = 5000;
        sun.shadow.camera.left = -3000;
        sun.shadow.camera.right = 3000;
        sun.shadow.camera.top = 3000;
        sun.shadow.camera.bottom = -3000;
        sun.shadow.bias = -0.0005;
        scene.add(sun);

        // Cool fill from opposite side
        const fill = new THREE.DirectionalLight(0x6688aa, 0.4);
        fill.position.set(-500, 600, -500);
        scene.add(fill);

        // Subtle rim light from behind
        const rim = new THREE.DirectionalLight(0x4455aa, 0.2);
        rim.position.set(0, 400, -800);
        scene.add(rim);
    }

    // Ground
    function setupGround(scene) {
        const groundGeom = new THREE.PlaneGeometry(20000, 20000);
        const groundMat = new THREE.MeshPhongMaterial({
            color: 0x0c0c16,
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

        // Build geometry layers
        const buildings = createBuildingGroup(features);
        cityGroup.add(buildings);

        const roads = createRoadGroup(features);
        cityGroup.add(roads);

        const amenities = createAmenityGroup(features);
        cityGroup.add(amenities);

        scene.add(cityGroup);
        cityGroupRef.current = cityGroup;

        // Auto-fit camera to city bounds
        const box = new THREE.Box3().setFromObject(cityGroup);
        if (!box.isEmpty() && isFinite(box.min.x)) {
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.z, 200);
            const dist = maxDim * 0.9;

            if (cameraRef.current && controlsRef.current) {
                cameraRef.current.position.set(
                    center.x + dist * 0.5,
                    dist * 0.45,
                    center.z + dist * 0.5
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
