import React, { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createBuildingGroup } from '../../three/buildingGeometry';
import { createRoadGroup } from '../../three/roadGeometry';
import { createAmenityGroup } from '../../three/amenityGeometry';
import { DayNightCycle } from '../../three/dayNightCycle';
import { VehicleAgents } from '../../three/vehicleAgents';
import { PedestrianAgents } from '../../three/pedestrianAgents';
import { HeatmapLayer } from '../../three/heatmapLayer';
import { LODManager } from '../../three/lodManager';
import { setRendererRef } from '../ui/ScreenshotExport';
import { setCameraRefs, setCityBounds } from '../ui/CameraPresets';
import useCityStore from '../../store/cityStore';

/**
 * CityScene — Three.js 3D viewport with agent simulation.
 */
export default function CityScene() {
    const containerRef = useRef(null);
    const sceneRef = useRef(null);
    const rendererRef = useRef(null);
    const cameraRef = useRef(null);
    const controlsRef = useRef(null);
    const animationRef = useRef(null);
    const cityGroupRef = useRef(null);
    const clockRef = useRef(new THREE.Clock());

    // Simulation refs
    const dayNightRef = useRef(null);
    const vehiclesRef = useRef(null);
    const pedsRef = useRef(null);
    const heatmapRef = useRef(null);
    const lodRef = useRef(null);

    const raycasterRef = useRef(new THREE.Raycaster());
    const mouseRef = useRef(new THREE.Vector2());
    const highlightRef = useRef(null);
    const originalColorRef = useRef(null);

    const storeRef = useRef(useCityStore.getState());

    // Subscribe to store changes (non-reactive, for animation loop)
    useEffect(() => {
        const unsub = useCityStore.subscribe((state) => {
            storeRef.current = state;
        });
        return unsub;
    }, []);

    const { cityData, layers, setSelectedEntity, setTimeOfDay, setAgentCounts } = useCityStore();

    const initScene = useCallback(() => {
        if (!containerRef.current) return;

        const container = containerRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x080810);
        scene.fog = new THREE.FogExp2(0x080810, 0.00003);
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(50, width / height, 0.5, 100000);
        camera.position.set(500, 600, 500);
        camera.lookAt(0, 0, 0);
        cameraRef.current = camera;

        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
            preserveDrawingBuffer: true, // required for screenshots
        });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.3;
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // Expose for screenshot capture
        setRendererRef(renderer, scene, camera);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.maxPolarAngle = Math.PI / 2.1;
        controls.minDistance = 10;
        controls.maxDistance = 20000;
        controls.target.set(0, 0, 0);
        controls.update();
        controlsRef.current = controls;

        setupLights(scene);
        setupGround(scene);

        const grid = new THREE.GridHelper(8000, 160, 0x161625, 0x101018);
        grid.position.y = 0.05;
        scene.add(grid);

        // Click handler
        const handleClick = (event) => {
            const rect = container.getBoundingClientRect();
            mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            raycasterRef.current.setFromCamera(mouseRef.current, camera);
            if (!cityGroupRef.current) return;

            const intersects = raycasterRef.current.intersectObjects(
                cityGroupRef.current.children.flatMap(g => g.children || []),
                false
            );

            if (highlightRef.current && originalColorRef.current) {
                highlightRef.current.material.color.copy(originalColorRef.current);
                highlightRef.current.material.emissive?.setHex(0x000000);
                highlightRef.current = null;
                originalColorRef.current = null;
            }

            const hit = intersects.find(i => i.object?.userData?.type);
            if (hit) {
                const mesh = hit.object;
                originalColorRef.current = mesh.material.color.clone();
                highlightRef.current = mesh;
                mesh.material.color.setHex(0x44aaff);
                if (mesh.material.emissive) mesh.material.emissive.setHex(0x112244);
                setSelectedEntity(mesh.userData);
            } else {
                setSelectedEntity(null);
            }
        };
        container.addEventListener('click', handleClick);

        const handleResize = () => {
            if (!container) return;
            const w = container.clientWidth;
            const h = container.clientHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        };
        window.addEventListener('resize', handleResize);

        // Animation loop with simulation updates
        let frameCount = 0;
        const animate = () => {
            animationRef.current = requestAnimationFrame(animate);
            const dt = clockRef.current.getDelta();
            const store = storeRef.current;
            const speed = store.isPlaying ? store.simSpeed : 0;

            controls.update();

            // Update simulation systems
            if (dayNightRef.current && speed > 0) {
                dayNightRef.current.update(dt, speed);
            }
            if (vehiclesRef.current && speed > 0) {
                vehiclesRef.current.update(dt, speed);
            }
            if (pedsRef.current && speed > 0) {
                pedsRef.current.update(dt, speed);
            }

            // LOD update (throttled internally)
            if (lodRef.current) {
                lodRef.current.update(camera, dt);
            }

            // Push time-of-day to store every 30 frames
            frameCount++;
            if (frameCount % 30 === 0 && dayNightRef.current) {
                setTimeOfDay({
                    time: dayNightRef.current.getTimeString(),
                    icon: dayNightRef.current.getIcon(),
                });
            }

            renderer.render(scene, camera);
        };
        clockRef.current.start();
        animate();

        return () => {
            container.removeEventListener('click', handleClick);
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationRef.current);
            controls.dispose();
            renderer.dispose();
            if (container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }
        };
    }, [setSelectedEntity, setTimeOfDay]);

    function setupLights(scene) {
        scene.add(new THREE.AmbientLight(0xccccff, 0.7));
        scene.add(new THREE.HemisphereLight(0x7799cc, 0x222233, 0.5));

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

        const fill = new THREE.DirectionalLight(0x6688aa, 0.4);
        fill.position.set(-500, 600, -500);
        scene.add(fill);

        const rim = new THREE.DirectionalLight(0x4455aa, 0.2);
        rim.position.set(0, 400, -800);
        scene.add(rim);
    }

    function setupGround(scene) {
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(20000, 20000),
            new THREE.MeshPhongMaterial({ color: 0x0c0c16 })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        ground.name = 'ground';
        scene.add(ground);
    }

    // Load city data + spawn agents
    useEffect(() => {
        if (!sceneRef.current || !cityData?.features) return;

        const scene = sceneRef.current;

        // Dispose previous
        if (cityGroupRef.current) {
            scene.remove(cityGroupRef.current);
            disposeGroup(cityGroupRef.current);
        }
        if (vehiclesRef.current) vehiclesRef.current.dispose();
        if (pedsRef.current) pedsRef.current.dispose();
        if (heatmapRef.current) heatmapRef.current.dispose();
        if (lodRef.current) lodRef.current.dispose();

        const features = cityData.features;
        if (features.length === 0) return;

        const cityGroup = new THREE.Group();
        cityGroup.name = 'city';

        const buildings = createBuildingGroup(features);
        buildings.name = 'buildings';
        cityGroup.add(buildings);

        const roads = createRoadGroup(features);
        roads.name = 'roads';
        cityGroup.add(roads);

        const amenities = createAmenityGroup(features);
        amenities.name = 'amenities';
        cityGroup.add(amenities);

        scene.add(cityGroup);
        cityGroupRef.current = cityGroup;

        // Auto-fit camera
        const box = new THREE.Box3().setFromObject(cityGroup);
        if (!box.isEmpty() && isFinite(box.min.x)) {
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.z, 200);
            const dist = maxDim * 0.7;

            if (scene.fog) {
                scene.fog.density = Math.min(0.00008, 2.0 / maxDim);
            }

            if (cameraRef.current && controlsRef.current) {
                cameraRef.current.position.set(
                    center.x + dist * 0.4,
                    dist * 0.35,
                    center.z + dist * 0.4
                );
                controlsRef.current.target.set(center.x, 0, center.z);
                controlsRef.current.update();

                // Set camera presets refs
                setCameraRefs(cameraRef.current, controlsRef.current);
                setCityBounds(center, dist);
            }
        }

        // Initialize simulation systems
        dayNightRef.current = new DayNightCycle(scene);

        const vehicles = new VehicleAgents(scene);
        vehicles.init(features);
        vehiclesRef.current = vehicles;

        const peds = new PedestrianAgents(scene);
        peds.init(features);
        pedsRef.current = peds;

        setAgentCounts({
            vehicles: vehicles.getCount(),
            pedestrians: peds.getCount(),
        });

        // Heatmap layer
        const heatmap = new HeatmapLayer();
        heatmap.build(features, box);
        heatmap.setVisible(false); // hidden by default, toggled via LayerToggles
        scene.add(heatmap.group);
        heatmapRef.current = heatmap;

        // LOD manager for building performance
        const lod = new LODManager();
        lod.register(buildings);
        lodRef.current = lod;

    }, [cityData, setAgentCounts]);

    // Layer visibility
    useEffect(() => {
        if (!cityGroupRef.current) return;
        const g = cityGroupRef.current;
        const b = g.getObjectByName('buildings');
        const r = g.getObjectByName('roads');
        const a = g.getObjectByName('amenities');
        if (b) b.visible = layers.buildings;
        if (r) r.visible = layers.roads;
        if (a) a.visible = layers.amenities;
        if (heatmapRef.current) heatmapRef.current.setVisible(!!layers.heatmap);
    }, [layers]);

    function disposeGroup(group) {
        group.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
                else obj.material.dispose();
            }
        });
    }

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
                cursor: 'grab',
            }}
        />
    );
}
