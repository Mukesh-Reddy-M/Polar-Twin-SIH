/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Adapted from the provided PolarTwin Antarctic Station Operations 3D archive.
 * The geometry and interaction approach are reused; scenario telemetry and
 * station identity are supplied by the PolarTwin dashboard instead.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { applyZoneHighlightState, buildAntarcticStation } from './components/3d/stationBuilder';
import { StationTextureFactory } from './components/3d/textures';

function disposeScene(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root?.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture) textures.add(value);
      }
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}

export default function StationCanvas({ zones, selectedZoneId, onSelectZone, onWebglError, className = '' }) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const hierarchyRef = useRef(null);
  const zoneStatusRef = useRef(new Map());
  const onSelectRef = useRef(onSelectZone);
  const onErrorRef = useRef(onWebglError);
  const [hoveredZoneId, setHoveredZoneId] = useState(null);
  const [webglError, setWebglError] = useState('');

  onSelectRef.current = onSelectZone;
  onErrorRef.current = onWebglError;

  useEffect(() => {
    zoneStatusRef.current = new Map(zones.map((zone) => [zone.id, zone.status]));
    if (hierarchyRef.current) {
      applyZoneHighlightState(hierarchyRef.current, selectedZoneId, hoveredZoneId, zoneStatusRef.current);
    }
  }, [zones, selectedZoneId, hoveredZoneId]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return undefined;

    let renderer;
    let controls;
    let hierarchy;
    let animationFrame = 0;
    let resizeObserver;
    let environmentTexture;
    let disposed = false;
    let pointerStart = null;
    const cleanupListeners = [];
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      cleanupListeners.forEach((remove) => remove());
      resizeObserver?.disconnect();
      controls?.dispose();
      disposeScene(hierarchy?.root);
      StationTextureFactory.disposeAll();
      environmentTexture?.dispose();
      renderer?.dispose();
      if (renderer?.domElement.parentElement === container) container.removeChild(renderer.domElement);
      rendererRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      hierarchyRef.current = null;
    };

    try {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x07111f);
      scene.fog = new THREE.FogExp2(0x07111f, 0.009);

      const camera = new THREE.PerspectiveCamera(40, width / height, 0.5, 300);
      camera.position.set(26, 18, 30);
      cameraRef.current = camera;

      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      rendererRef.current = renderer;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.setSize(width, height);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.className = 'station-twin-canvas';
      renderer.domElement.setAttribute('aria-label', 'Interactive schematic station model. Drag to orbit; scroll or pinch to zoom; select a zone to inspect its demo data.');
      renderer.domElement.setAttribute('role', 'img');
      container.appendChild(renderer.domElement);

      try {
        const pmrem = new THREE.PMREMGenerator(renderer);
        environmentTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        scene.environment = environmentTexture;
        pmrem.dispose();
      } catch {
        // The model remains readable without the optional environment reflection.
      }

      scene.add(new THREE.HemisphereLight(0xbfdbfe, 0x1e293b, 1.25));
      const keyLight = new THREE.DirectionalLight(0xfff7ed, 2.1);
      keyLight.position.set(40, 28, 35);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.7);
      fillLight.position.set(-30, 16, -25);
      scene.add(fillLight);

      hierarchy = buildAntarcticStation(renderer.capabilities.getMaxAnisotropy(), false);
      hierarchyRef.current = hierarchy;
      scene.add(hierarchy.root);
      applyZoneHighlightState(hierarchy, null, null, zoneStatusRef.current);

      controls = new OrbitControls(camera, renderer.domElement);
      controlsRef.current = controls;
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.target.set(0, 3, 2);
      controls.minDistance = 6;
      controls.maxDistance = 110;
      controls.maxPolarAngle = Math.PI / 2 - 0.04;

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const intersectZone = (event) => {
        const rect = renderer.domElement.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(hierarchy.colliders, false)[0]?.object;
        return hit?.userData?.zoneId ?? null;
      };
      const onPointerDown = (event) => { pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId }; };
      const onPointerUp = (event) => {
        if (!pointerStart || pointerStart.id !== event.pointerId) return;
        const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
        pointerStart = null;
        if (moved <= 6) {
          const zoneId = intersectZone(event);
          if (zoneId) onSelectRef.current(zoneId);
        }
      };
      const onPointerMove = (event) => setHoveredZoneId(intersectZone(event));
      const onPointerLeave = () => setHoveredZoneId(null);
      const onContextMenu = (event) => event.preventDefault();
      const onContextLost = (event) => {
        event.preventDefault();
        const message = 'WebGL stopped responding. Use the selectable zone list instead.';
        cleanup();
        setWebglError(message);
        onErrorRef.current?.(message);
      };
      const canvas = renderer.domElement;
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerleave', onPointerLeave);
      canvas.addEventListener('contextmenu', onContextMenu);
      canvas.addEventListener('webglcontextlost', onContextLost, false);
      cleanupListeners.push(
        () => canvas.removeEventListener('pointerdown', onPointerDown),
        () => canvas.removeEventListener('pointerup', onPointerUp),
        () => canvas.removeEventListener('pointermove', onPointerMove),
        () => canvas.removeEventListener('pointerleave', onPointerLeave),
        () => canvas.removeEventListener('contextmenu', onContextMenu),
        () => canvas.removeEventListener('webglcontextlost', onContextLost, false),
      );

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          const w = container.clientWidth;
          const h = container.clientHeight;
          if (w < 1 || h < 1 || disposed) return;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        });
        resizeObserver.observe(container);
      } else {
        const resize = () => {
          const w = container.clientWidth;
          const h = container.clientHeight;
          if (w < 1 || h < 1) return;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        };
        window.addEventListener('resize', resize);
        cleanupListeners.push(() => window.removeEventListener('resize', resize));
      }

      let previousTime = 0;
      const animate = (time) => {
        if (disposed) return;
        const delta = Math.min((time - previousTime) / 1000, 0.05);
        previousTime = time;
        if (hierarchy.animatables.radarDish) hierarchy.animatables.radarDish.rotation.y = Math.sin(time * 0.0004) * 0.4;
        if (hierarchy.animatables.anemometer) hierarchy.animatables.anemometer.rotation.y += delta * 3;
        if (hierarchy.animatables.flagMesh) hierarchy.animatables.flagMesh.rotation.z = Math.sin(time * 0.004) * 0.12;
        controls.update();
        renderer.render(scene, camera);
        animationFrame = window.requestAnimationFrame(animate);
      };
      animationFrame = window.requestAnimationFrame(animate);

      return cleanup;
    } catch (error) {
      console.error('Could not initialize the schematic station model.', error);
      const message = 'Interactive 3D is unavailable in this browser. Use the selectable zone list instead.';
      setWebglError(message);
      onErrorRef.current?.(message);
      cleanup();
    }
    return undefined;
  }, []);

  function resetView() {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    camera.position.set(26, 18, 30);
    controls.target.set(0, 3, 2);
    controls.update();
  }

  function zoom(factor) {
    const controls = controlsRef.current;
    if (!controls) return;
    if (factor < 1) controls.dollyIn(1 / factor);
    else controls.dollyOut(factor);
    controls.update();
  }

  if (webglError) {
    return <div className={`station-canvas-fallback ${className}`} role="status">{webglError} The selectable zone list is available beside this model.</div>;
  }

  return (
    <div className={`station-canvas-shell ${className}`}>
      <div className="station-canvas-toolbar" aria-label="3D view controls">
        <button type="button" onClick={resetView} title="Reset camera view">Reset view</button>
        <span className="station-canvas-zoom"><button type="button" onClick={() => zoom(0.82)} aria-label="Zoom in">+</button><button type="button" onClick={() => zoom(1.22)} aria-label="Zoom out">−</button></span>
        <span className="station-canvas-hint">Drag to orbit · scroll or pinch to zoom</span>
      </div>
      <div ref={mountRef} className="station-canvas-mount" />
      {hoveredZoneId && <div className="station-canvas-hover">{zones.find((zone) => zone.id === hoveredZoneId)?.label ?? hoveredZoneId} · select to inspect</div>}
    </div>
  );
}
