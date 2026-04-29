import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createRoadGroup } from '../../three/roadGeometry';
import { createWaterGroup } from '../../three/waterGeometry';
import { createAmenityGroup } from '../../three/amenityGeometry';
import { createZoneGroup } from '../../three/zoneGeometry';
import { createRailGroup } from '../../three/railGeometry';
import { createTerrainGroup } from '../../three/terrainGeometry';
import { createVegetationGroup } from '../../three/vegetationGeometry';
import { createPipelineGroup } from '../../three/pipelineGeometry';
import { EnvironmentSimulation } from '../../three/environmentSimulation';
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
    const terrainGroupRef = useRef(null);
    const lastTimeRef = useRef(performance.now());

    // Simulation refs
    const dayNightRef = useRef(null);
    const vehiclesRef = useRef(null);
    const pedsRef = useRef(null);
    const heatmapRef = useRef(null);
    const lodRef = useRef(null);
    const envSimRef = useRef(null);

    const raycasterRef = useRef(new THREE.Raycaster());
    const mouseRef = useRef(new THREE.Vector2());
    const highlightRef = useRef(null);
    const originalColorRef = useRef(null);

    // State flag to signal that the Three.js scene is ready.
    // Used as a dependency in the cityData effect so it re-fires
    // if data arrived before the scene was initialized.
    const [sceneReady, setSceneReady] = useState(false);

    const storeRef = useRef(useCityStore.getState());

    // Subscribe to store changes (non-reactive, for animation loop)
    useEffect(() => {
        const unsub = useCityStore.subscribe((state) => {
            storeRef.current = state;
        });
        return unsub;
    }, []);

    const { cityData, terrainData, layers, isXRayMode, setSelectedEntity, setTimeOfDay, setAgentCounts } = useCityStore();

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
        // PCFSoftShadowMap is deprecated in r183, using PCFShadowMap
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

        // ─── Enhanced mouse & keyboard navigation ───
        controls.enablePan = true;          // right-click / middle-click drag to pan
        controls.screenSpacePanning = true; // pan parallel to screen (not ground plane)
        controls.panSpeed = 1.2;            // faster pan for large cities
        controls.enableZoom = true;         // scroll wheel zoom
        controls.zoomSpeed = 1.5;           // slightly faster zoom
        controls.enableRotate = true;       // left-click drag to orbit
        controls.rotateSpeed = 0.8;
        controls.mouseButtons = {
            LEFT: THREE.MOUSE.ROTATE,       // left-drag → orbit
            MIDDLE: THREE.MOUSE.PAN,        // middle-drag → pan
            RIGHT: THREE.MOUSE.PAN,         // right-drag → pan
        };
        controls.touches = {
            ONE: THREE.TOUCH.ROTATE,        // one-finger → orbit
            TWO: THREE.TOUCH.DOLLY_PAN,     // two-finger → zoom + pan
        };
        controls.keys = {
            LEFT: 'ArrowLeft',
            UP: 'ArrowUp',
            RIGHT: 'ArrowRight',
            BOTTOM: 'ArrowDown',
        };
        controls.keyPanSpeed = 15;          // arrow key pan speed
        controls.listenToKeyEvents(window); // enable keyboard panning

        controls.update();
        controlsRef.current = controls;

        setupLights(scene);
        setupGround(scene);

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
                const hMesh = highlightRef.current.mesh;
                if (hMesh.isBatchedMesh && highlightRef.current.batchId !== undefined) {
                    hMesh.setColorAt(highlightRef.current.batchId, originalColorRef.current);
                } else if (hMesh.userData?.buildingRanges && highlightRef.current.affectedVerts) {
                    // Restore vertex colors for building batch
                    const colorAttr = hMesh.geometry.attributes.color;
                    highlightRef.current.affectedVerts.forEach((vi, i) => {
                        const original = originalColorRef.current[i];
                        colorAttr.setXYZ(vi, original.r, original.g, original.b);
                    });
                    colorAttr.needsUpdate = true;
                } else if (hMesh.material) {
                    hMesh.material.color.copy(originalColorRef.current);
                    hMesh.material.emissive?.setHex(0x000000);
                }
                highlightRef.current = null;
                originalColorRef.current = null;
            }

            const hit = intersects.find(i => i.object?.userData?.type);
            if (hit) {
                const mesh = hit.object;

                if (mesh.name === 'buildings-solid' && mesh.userData?.buildingRanges) {
                    // BUG 1: Find which building owns this triangle
                    const triangleIndex = hit.faceIndex;
                    const indexPosition = triangleIndex * 3;
                    
                    const ranges = mesh.userData.buildingRanges;
                    const building = ranges.find(r => 
                        indexPosition >= r.start && indexPosition < r.start + r.count
                    );
                    
                    if (building) {
                        setSelectedEntity({
                            type: 'building', // explicitly say building
                            osm_id: building.osmId,
                            name: building.name || `Building #${building.osmId}`,
                            height: building.height,
                            levels: building.levels,
                            building_type: building.building,
                        });
                        
                        // Highlight: save original colors, then set to blue
                        const colorAttr = mesh.geometry.attributes.color;
                        const highlightColor = new THREE.Color(0x44aaff);
                        const idxArray = mesh.geometry.index.array;
                        
                        const affectedVertsSet = new Set();
                        for (let i = building.start; i < building.start + building.count; i++) {
                            affectedVertsSet.add(idxArray[i]);
                        }
                        const affectedVerts = Array.from(affectedVertsSet);
                        
                        originalColorRef.current = affectedVerts.map(vi => ({
                            r: colorAttr.getX(vi),
                            g: colorAttr.getY(vi),
                            b: colorAttr.getZ(vi),
                        }));
                        highlightRef.current = { mesh, affectedVerts };
                        
                        affectedVerts.forEach(vi => {
                            colorAttr.setXYZ(vi, highlightColor.r, highlightColor.g, highlightColor.b);
                        });
                        colorAttr.needsUpdate = true;
                    }
                } else if (mesh.isBatchedMesh && hit.batchId !== undefined) {
                    const originalColor = new THREE.Color();
                    mesh.getColorAt(hit.batchId, originalColor);
                    originalColorRef.current = originalColor;
                    highlightRef.current = { mesh, batchId: hit.batchId };

                    mesh.setColorAt(hit.batchId, new THREE.Color(0x44aaff));

                    const entityData = mesh.userData.instances[hit.batchId];
                    setSelectedEntity(entityData);
                } else {
                    originalColorRef.current = mesh.material.color.clone();
                    highlightRef.current = { mesh };
                    mesh.material.color.setHex(0x44aaff);
                    if (mesh.material.emissive) mesh.material.emissive.setHex(0x112244);
                    setSelectedEntity(mesh.userData);
                }
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
            const now = performance.now();
            const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1); // cap at 100ms
            lastTimeRef.current = now;
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
            if (envSimRef.current && speed > 0) {
                envSimRef.current.update(dt, speed);
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
        lastTimeRef.current = performance.now();
        animate();

        // Signal that the Three.js scene is ready for city data
        setSceneReady(true);

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
            new THREE.MeshPhongMaterial({ color: 0x0c0c16, transparent: true })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -1;            // just below terrain peaks (0) so wireframe sits above
        ground.receiveShadow = true;
        ground.name = 'ground';
        scene.add(ground);
    }

    // FIX 0b: Build buildings in a Web Worker — non-blocking, zero-copy buffer transfer
    function buildBuildingsAsync(features, terrainInfo) {
        return new Promise((resolve) => {
            const worker = new Worker(
                new URL('../../three/workers/buildingWorker.js', import.meta.url),
                { type: 'module' }
            );
            worker.onmessage = (e) => {
                const { posArr, nrmArr, colArr, idxArr, buildingRanges, validCount, skipped } = e.data;
                console.log(`[buildings-worker] ${validCount} built, ${skipped} skipped`);

                const geom = new THREE.BufferGeometry();
                geom.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
                geom.setAttribute('normal',   new THREE.BufferAttribute(nrmArr, 3)); // BUG 3: use worker hard normals
                geom.setAttribute('color',    new THREE.BufferAttribute(colArr, 3));
                geom.setIndex(new THREE.BufferAttribute(idxArr, 1));
                // DO NOT computeVertexNormals() — using hard normals from worker

                // Material matching original buildingGeometry.js (baseline f58ced99)
                const mat = new THREE.MeshPhongMaterial({
                    vertexColors: true,
                    flatShading: true,              // crisp per-face shading on polygons
                    emissive: new THREE.Color(0x223344),
                    emissiveIntensity: 0.4,
                    shininess: 30,
                    side: THREE.DoubleSide,          // handles any wall winding issues
                });
                const mesh = new THREE.Mesh(geom, mat);
                mesh.name = 'buildings-solid';
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                mesh.matrixAutoUpdate = false;
                mesh.updateMatrix();
                // BUG 1: store lookup table on mesh
                mesh.userData = { type: 'buildings_batch', buildingRanges };

                const group = new THREE.Group();
                group.name = 'buildings';
                group.add(mesh);
                worker.terminate();
                resolve(group);
            };
            worker.onerror = (err) => {
                console.error('[buildings-worker] Error:', err);
                // Fallback: return empty group so city still loads
                const group = new THREE.Group();
                group.name = 'buildings';
                worker.terminate();
                resolve(group);
            };
            worker.postMessage({ features, terrainInfo });
        });
    }

    // Load city data + spawn agents (async chunked to avoid freezing UI)
    useEffect(() => {
        if (!sceneReady || !sceneRef.current || !cityData?.features) return;

        const scene = sceneRef.current;
        let cancelled = false;

        // Dispose previous
        if (cityGroupRef.current) {
            scene.remove(cityGroupRef.current);
            disposeGroup(cityGroupRef.current);
        }
        if (vehiclesRef.current) vehiclesRef.current.dispose();
        if (pedsRef.current) pedsRef.current.dispose();
        if (heatmapRef.current) heatmapRef.current.dispose();
        if (lodRef.current) lodRef.current.dispose();
        if (envSimRef.current) envSimRef.current.dispose();

        const features = cityData.features;
        if (features.length === 0) return;

        const yieldFrame = () => new Promise(resolve => setTimeout(resolve, 0));

        const buildCity = async () => {
            const cityGroup = new THREE.Group();
            cityGroup.name = 'city';

            // FIX 0d: Add cityGroup to scene IMMEDIATELY so user sees it populate
            scene.add(cityGroup);
            cityGroupRef.current = cityGroup;

            console.log(`[CityScene] Progressive build for ${features.length} features…`);

            // ── Stage 0: Terrain elevation mesh ──────────────────────
            // Uses SRTM tiles via IPC→sidecar (no rate limits, cached locally)
            let terrainInfo = null;  // shared with building worker for Y-offset
            try {
                const bbox = cityData.bbox;     // [west, south, east, north]
                const origin = cityData.metadata?.origin;
                if (bbox && origin && window.electronAPI?.loadTerrain) {
                    // Convert bbox array to "N,S,E,W" string for IPC
                    const bboxStr = `${bbox[3]},${bbox[1]},${bbox[2]},${bbox[0]}`;
                    console.log('[terrain] Fetching SRTM elevation data…', bboxStr);
                    
                    const result = await window.electronAPI.loadTerrain(bboxStr, 48);
                    const terrainData = result?.data || result;
                    
                    if (terrainData && !terrainData.error && terrainData.grid) {
                        console.log('[terrain] Data received, building mesh…', 
                            'range:', terrainData.min_elevation, '–', terrainData.max_elevation);
                        const terrainGroup = createTerrainGroup(terrainData, bbox, origin);
                        terrainGroup.name = 'terrain';
                        cityGroup.add(terrainGroup);
                        terrainGroupRef.current = terrainGroup;

                        // Remove the flat ground plane — terrain replaces it
                        const ground = scene.getObjectByName('ground');
                        if (ground) {
                            scene.remove(ground);
                            if (ground.geometry) ground.geometry.dispose();
                            if (ground.material) ground.material.dispose();
                        }

                        // Store terrain info for building/road Y-offset calculations
                        const elevRange = terrainData.max_elevation - terrainData.min_elevation;
                        const exaggeration =
                            elevRange < 5   ? 50.0 :
                            elevRange < 20  ? 25.0 :
                            elevRange < 50  ? 15.0 :
                            elevRange < 150 ? 8.0  :
                            elevRange < 500 ? 4.0  : 2.0;
                        terrainInfo = {
                            grid: terrainData.grid,
                            resolution: terrainData.resolution,
                            minElev: terrainData.min_elevation,
                            maxElev: terrainData.max_elevation,
                            bbox: bbox,           // [west, south, east, north]
                            origin: origin,       // { lon, lat } — same as terrain mesh
                            exaggeration,
                            terrainYOffset: -0.5,  // must match TERRAIN_Y_OFFSET
                        };
                        console.log('[terrain] ✓ Terrain mesh added, terrainInfo stored for buildings');
                        await yieldFrame();
                        if (cancelled) return;
                    } else {
                        console.warn('[terrain] IPC returned error:', terrainData?.message);
                    }
                } else {
                    console.warn('[terrain] Skipping — missing bbox/origin/IPC');
                }
            } catch (err) {
                console.warn('[terrain] Failed to load elevation:', err.message || err);
            }

            // Stage 1 (~100ms): Roads visible first
            const roads = createRoadGroup(features);
            roads.name = 'roads';
            cityGroup.add(roads);
            await yieldFrame(); // paint roads before continuing
            if (cancelled) return;

            // Stage 1b: Water + Zones (fast, polygon-based)
            const water = createWaterGroup(features);
            water.name = 'water';
            cityGroup.add(water);
            await yieldFrame();
            if (cancelled) return;

            const zones = createZoneGroup(features);
            zones.name = 'zones';
            cityGroup.add(zones);
            await yieldFrame();
            if (cancelled) return;

            // Stage 2: Buildings via worker (started concurrently — resolves in ~1-2s)
            const buildingsPromise = buildBuildingsAsync(features, terrainInfo);

            // Stage 3: Secondary layers while worker builds buildings
            const railways = createRailGroup(features);
            railways.name = 'railways';
            cityGroup.add(railways);
            await yieldFrame();
            if (cancelled) return;

            const amenities = createAmenityGroup(features);
            amenities.name = 'amenities';
            cityGroup.add(amenities);
            await yieldFrame();
            if (cancelled) return;

            const vegetation = createVegetationGroup(features);
            vegetation.name = 'vegetation';
            cityGroup.add(vegetation);
            await yieldFrame();
            if (cancelled) return;

            const pipelines = createPipelineGroup(features);
            pipelines.name = 'pipelines';
            cityGroup.add(pipelines);
            await yieldFrame();
            if (cancelled) return;

            // Stage 4: Await buildings from worker — add last so city is already visible
            const buildings = await buildingsPromise;
            if (cancelled) return;
            cityGroup.add(buildings);

            const isBoxValid = (b) =>
                !b.isEmpty() &&
                isFinite(b.min.x) && isFinite(b.min.y) && isFinite(b.min.z) &&
                isFinite(b.max.x) && isFinite(b.max.y) && isFinite(b.max.z);

            // Auto-fit camera
            let box = new THREE.Box3();
            box.setFromObject(buildings);

            const roadBox = new THREE.Box3().setFromObject(roads);
            if (isBoxValid(roadBox)) {
                box.union(roadBox);
            }

            if (!isBoxValid(box)) {
                box.setFromObject(cityGroup);
            }

            if (!isBoxValid(box)) {
                console.warn('[CityScene] Bounding box invalid, falling back to roads-only bbox');
                box = new THREE.Box3().setFromObject(roads);
            }

            if (!isBoxValid(box)) {
                console.warn('[CityScene] Roads bbox also invalid, computing from raw feature coords');
                let mnX = Infinity, mxX = -Infinity, mnZ = Infinity, mxZ = -Infinity;
                for (const f of features) {
                    const coords = f.geometry?.coordinates;
                    if (!coords) continue;
                    const flat = f.geometry.type === 'Point' ? [coords]
                        : f.geometry.type === 'LineString' ? coords
                            : f.geometry.type === 'Polygon' ? coords[0] : [];
                    for (const pt of flat) {
                        if (Array.isArray(pt) && isFinite(pt[0]) && isFinite(pt[1])) {
                            if (pt[0] < mnX) mnX = pt[0];
                            if (pt[0] > mxX) mxX = pt[0];
                            if (-pt[1] < mnZ) mnZ = -pt[1];
                            if (-pt[1] > mxZ) mxZ = -pt[1];
                        }
                    }
                }
                if (isFinite(mnX) && isFinite(mxX)) {
                    box.min.set(mnX, 0, mnZ);
                    box.max.set(mxX, 50, mxZ);
                }
            }

            if (isBoxValid(box)) {
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

                    setCameraRefs(cameraRef.current, controlsRef.current);
                    setCityBounds(center, dist);
                }

                const oldGrid = scene.getObjectByName('dynamic-grid');
                if (oldGrid) scene.remove(oldGrid);

                const gridDim = Math.ceil(maxDim / 100) * 100;
                const divisions = Math.floor(gridDim / 50);
                const grid = new THREE.GridHelper(gridDim, divisions, 0x161625, 0x101018);
                grid.name = 'dynamic-grid';
                grid.position.set(center.x, 0.05, center.z);
                scene.add(grid);

            } else {
                console.error('[CityScene] Could not compute valid bounding box — camera not repositioned');
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
            heatmap.setVisible(false);
            scene.add(heatmap.group);
            heatmapRef.current = heatmap;

            // LOD manager
            // FIX 2c: force world matrix update before registering — meshes have
            // matrixAutoUpdate=false so their matrixWorld must be manually refreshed
            // once after cityGroup is positioned (camera fit sets controls.target above).
            cityGroupRef.current.updateMatrixWorld(true);
            const lod = new LODManager();
            lod.register(buildings);
            lodRef.current = lod;

            // Environment simulation (AQI/Wind)
            const envSim = new EnvironmentSimulation(scene);
            envSim.init(cityData, box);
            envSimRef.current = envSim;

            console.log('[CityScene] City construction complete');
        };

        buildCity().catch(err => console.error('[CityScene] Build failed:', err));

        return () => { cancelled = true; };

    }, [cityData, sceneReady, setAgentCounts]);



    // Layer visibility
    useEffect(() => {
        if (!cityGroupRef.current) return;
        const g = cityGroupRef.current;
        const b = g.getObjectByName('buildings');
        const r = g.getObjectByName('roads');
        const w = g.getObjectByName('water');
        const a = g.getObjectByName('amenities');
        const z = g.getObjectByName('zones');
        const rw = g.getObjectByName('railways');

        if (b) b.visible = layers.buildings;
        if (r) r.visible = layers.roads;
        if (w) w.visible = layers.water;
        if (a) a.visible = layers.amenities;
        if (z) z.visible = layers.zones;
        if (rw) rw.visible = layers.railways;
        const v = g.getObjectByName('vegetation');
        if (v) v.visible = layers.vegetation;
        const p = g.getObjectByName('pipelines');
        if (p) p.visible = layers.pipelines;

        if (terrainGroupRef.current) terrainGroupRef.current.visible = !!layers.terrain;

        if (heatmapRef.current) heatmapRef.current.setVisible(!!layers.heatmap);
        if (envSimRef.current) envSimRef.current.setVisible(!!layers.environment);
    }, [layers]);

    // X-Ray Mode
    useEffect(() => {
        if (!sceneRef.current) return;
        const ground = sceneRef.current.getObjectByName('ground');
        if (ground) {
            ground.material.opacity = isXRayMode ? 0.2 : 1.0;
            ground.material.depthWrite = !isXRayMode;
        }
        
        // Also make zones, water, and vegetation transparent if X-Ray is on
        if (cityGroupRef.current) {
            const makeTransparent = (groupName, opacityMultiplier) => {
                const grp = cityGroupRef.current.getObjectByName(groupName);
                if (grp) {
                    grp.traverse(child => {
                        if (child.material) {
                            if (Array.isArray(child.material)) {
                                child.material.forEach(m => {
                                    if (m.transparent !== undefined) {
                                        m.opacity = isXRayMode ? 0.1 * opacityMultiplier : (m.userData.originalOpacity || m.opacity);
                                    }
                                });
                            } else {
                                if (child.material.userData.originalOpacity === undefined) {
                                    child.material.userData.originalOpacity = child.material.opacity;
                                }
                                child.material.opacity = isXRayMode ? 0.1 * opacityMultiplier : child.material.userData.originalOpacity;
                            }
                        }
                    });
                }
            };
            
            makeTransparent('zones', 1);
            makeTransparent('water', 2);
            makeTransparent('vegetation-ground', 1);
        }
        
    }, [isXRayMode]);

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
