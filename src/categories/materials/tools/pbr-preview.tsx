import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RefreshCw, Upload } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  CheckBox,
  Field,
  Notice,
  Panel,
  Segmented,
  SliderField,
} from '../../../components/ui';
import { useAnimationFrame } from '../../../core/hooks';
import { formatBytes } from '../../../core/format';

type Shape = 'sphere' | 'box' | 'plane' | 'torus';
type Lighting = 'studio' | 'outdoor' | 'dark' | 'neutral' | 'game';
type MapKey = 'map' | 'normalMap' | 'roughnessMap' | 'metalnessMap' | 'aoMap' | 'emissiveMap';

const MAP_SLOTS: Array<{ key: MapKey; label: string }> = [
  { key: 'map', label: 'Base colour' },
  { key: 'normalMap', label: 'Normal' },
  { key: 'roughnessMap', label: 'Roughness' },
  { key: 'metalnessMap', label: 'Metallic' },
  { key: 'aoMap', label: 'Occlusion' },
  { key: 'emissiveMap', label: 'Emission' },
];

const LIGHTING_PRESETS: Array<{ value: Lighting; label: string }> = [
  { value: 'studio', label: 'Studio' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'dark', label: 'Dark' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'game', label: 'Game' },
];

interface Engine {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  lights: THREE.Group;
  textures: Record<MapKey, THREE.Texture | null>;
  rotation: { x: number; y: number };
  autoRotate: boolean;
  dragging: boolean;
  lastPointer: { x: number; y: number };
}

async function fileToTexture(file: File, srgb: boolean): Promise<THREE.Texture> {
  const bitmap = await createImageBitmap(file);
  const texture = new THREE.Texture(bitmap);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function setMap(material: THREE.MeshStandardMaterial, key: MapKey, texture: THREE.Texture | null): void {
  switch (key) {
    case 'map':
      material.map = texture;
      break;
    case 'normalMap':
      material.normalMap = texture;
      break;
    case 'roughnessMap':
      material.roughnessMap = texture;
      break;
    case 'metalnessMap':
      material.metalnessMap = texture;
      break;
    case 'aoMap':
      material.aoMap = texture;
      break;
    case 'emissiveMap':
      material.emissiveMap = texture;
      break;
  }
}

function makeGeometry(shape: Shape): THREE.BufferGeometry {
  let geometry: THREE.BufferGeometry;
  if (shape === 'box') geometry = new THREE.BoxGeometry(1.7, 1.7, 1.7, 8, 8, 8);
  else if (shape === 'plane') geometry = new THREE.PlaneGeometry(2.2, 2.2, 32, 32);
  else if (shape === 'torus') geometry = new THREE.TorusGeometry(1, 0.38, 48, 128);
  else geometry = new THREE.SphereGeometry(1.15, 96, 96);

  // aoMap samples the second UV channel.
  const uv = geometry.getAttribute('uv');
  if (uv) geometry.setAttribute('uv1', uv.clone());
  return geometry;
}

function buildLights(preset: Lighting): THREE.Group {
  const group = new THREE.Group();
  const add = (light: THREE.Light) => group.add(light);

  if (preset === 'outdoor') {
    add(new THREE.HemisphereLight(0xbcd8ff, 0x4a4030, 1.3));
    const sun = new THREE.DirectionalLight(0xffe7c4, 2.8);
    sun.position.set(4, 6, 2);
    add(sun);
  } else if (preset === 'dark') {
    add(new THREE.AmbientLight(0xffffff, 0.08));
    const cool = new THREE.PointLight(0x9db8ff, 40, 20);
    cool.position.set(2.5, 3, 3);
    add(cool);
    const warm = new THREE.PointLight(0xff8a4c, 12, 20);
    warm.position.set(-3, -1.5, 2);
    add(warm);
  } else if (preset === 'neutral') {
    add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(2, 4, 3);
    add(key);
  } else if (preset === 'game') {
    add(new THREE.HemisphereLight(0x88aaff, 0x332211, 0.7));
    const key = new THREE.DirectionalLight(0xffd9a0, 2.4);
    key.position.set(3, 5, 2);
    add(key);
    const fill = new THREE.DirectionalLight(0x6688ff, 0.7);
    fill.position.set(-2, 2, -3);
    add(fill);
  } else {
    add(new THREE.AmbientLight(0xffffff, 0.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 4, 3);
    add(key);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.8);
    fill.position.set(-3, 1, -2);
    add(fill);
    const rim = new THREE.PointLight(0x88bbff, 18, 20);
    rim.position.set(0, 2.5, -3.5);
    add(rim);
  }
  return group;
}

export default function PbrPreview() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const [shape, setShape] = useState<Shape>('sphere');
  const [lighting, setLighting] = useState<Lighting>('studio');
  const [metallic, setMetallic] = useState(0.1);
  const [roughness, setRoughness] = useState(0.5);
  const [normalScale, setNormalScale] = useState(1);
  const [emissive, setEmissive] = useState(0.2);
  const [autoRotate, setAutoRotate] = useState(true);
  const [maps, setMaps] = useState<Record<MapKey, File | null>>({
    map: null,
    normalMap: null,
    roughnessMap: null,
    metalnessMap: null,
    aoMap: null,
    emissiveMap: null,
  });
  const [webglError, setWebglError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const renderRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let engine: Engine;
    try {
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(container.clientWidth || 640, container.clientHeight || 420);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, (container.clientWidth || 640) / (container.clientHeight || 420), 0.1, 100);
      camera.position.set(0, 0, 3.6);

      const material = new THREE.MeshStandardMaterial({
        color: 0xb8b8c0,
        metalness: 0.1,
        roughness: 0.5,
        emissive: new THREE.Color(0x000000),
      });
      const mesh = new THREE.Mesh(makeGeometry('sphere'), material);
      scene.add(mesh);

      const lights = buildLights('studio');
      scene.add(lights);

      const engineValue: Engine = {
        renderer,
        scene,
        camera,
        mesh,
        material,
        lights,
        textures: { map: null, normalMap: null, roughnessMap: null, metalnessMap: null, aoMap: null, emissiveMap: null },
        rotation: { x: 0, y: 0 },
        autoRotate: true,
        dragging: false,
        lastPointer: { x: 0, y: 0 },
      };
      engine = engineValue;
      engineRef.current = engine;

      const render = () => {
        engine.mesh.rotation.set(engine.rotation.x, engine.rotation.y, 0);
        engine.renderer.render(engine.scene, engine.camera);
      };
      renderRef.current = render;

      container.appendChild(renderer.domElement);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.touchAction = 'none';
      renderer.domElement.style.cursor = 'grab';

      const onPointerDown = (event: PointerEvent) => {
        engine.dragging = true;
        engine.lastPointer = { x: event.clientX, y: event.clientY };
        renderer.domElement.style.cursor = 'grabbing';
        renderer.domElement.setPointerCapture(event.pointerId);
      };
      const onPointerMove = (event: PointerEvent) => {
        if (!engine.dragging) return;
        const dx = event.clientX - engine.lastPointer.x;
        const dy = event.clientY - engine.lastPointer.y;
        engine.lastPointer = { x: event.clientX, y: event.clientY };
        engine.rotation.y += dx * 0.01;
        engine.rotation.x = Math.max(-1.4, Math.min(1.4, engine.rotation.x + dy * 0.01));
        render();
      };
      const onPointerUp = () => {
        engine.dragging = false;
        renderer.domElement.style.cursor = 'grab';
      };
      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      renderer.domElement.addEventListener('pointermove', onPointerMove);
      renderer.domElement.addEventListener('pointerup', onPointerUp);
      renderer.domElement.addEventListener('pointerleave', onPointerUp);

      const observer = new ResizeObserver(() => {
        const width = container.clientWidth || 640;
        const height = container.clientHeight || 420;
        engine.camera.aspect = width / height;
        engine.camera.updateProjectionMatrix();
        engine.renderer.setSize(width, height);
        render();
      });
      observer.observe(container);
      render();

      return () => {
        observer.disconnect();
        renderer.domElement.removeEventListener('pointerdown', onPointerDown);
        renderer.domElement.removeEventListener('pointermove', onPointerMove);
        renderer.domElement.removeEventListener('pointerup', onPointerUp);
        renderer.domElement.removeEventListener('pointerleave', onPointerUp);
        Object.values(engine.textures).forEach((texture) => texture?.dispose());
        engine.mesh.geometry.dispose();
        engine.material.dispose();
        engine.lights.clear();
        engine.renderer.dispose();
        engine.renderer.domElement.remove();
        engineRef.current = null;
      };
    } catch (creationError) {
      setWebglError(
        creationError instanceof Error
          ? 'WebGL is not available in this browser: ' + creationError.message
          : 'WebGL is not available in this browser.',
      );
      return;
    }
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const oldGeometry = engine.mesh.geometry;
    engine.mesh.geometry = makeGeometry(shape);
    oldGeometry.dispose();
    renderRef.current();
  }, [shape]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.scene.remove(engine.lights);
    engine.lights.clear();
    engine.lights = buildLights(lighting);
    engine.scene.add(engine.lights);
    renderRef.current();
  }, [lighting]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.material.metalness = metallic;
    engine.material.roughness = roughness;
    engine.material.normalScale.set(normalScale, normalScale);
    engine.material.emissiveIntensity = emissive;
    engine.material.needsUpdate = true;
    renderRef.current();
  }, [metallic, roughness, normalScale, emissive]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.autoRotate = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    let cancelled = false;

    void (async () => {
      for (const slot of MAP_SLOTS) {
        const file = maps[slot.key];
        const previous = engine.textures[slot.key];
        if (!file) {
          if (previous) {
            previous.dispose();
            engine.textures[slot.key] = null;
            setMap(engine.material, slot.key, null);
          }
          continue;
        }
        try {
          const texture = await fileToTexture(file, slot.key === 'map' || slot.key === 'emissiveMap');
          if (cancelled) {
            texture.dispose();
            return;
          }
          previous?.dispose();
          engine.textures[slot.key] = texture;
          setMap(engine.material, slot.key, texture);
        } catch (loadError) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load a texture.');
        }
      }
      engine.material.needsUpdate = true;
      renderRef.current();
    })();

    return () => {
      cancelled = true;
    };
  }, [maps]);

  useAnimationFrame((delta) => {
    const engine = engineRef.current;
    if (!engine || !engine.autoRotate || engine.dragging) return;
    engine.rotation.y += delta * 0.45;
    renderRef.current();
  }, autoRotate);

  const chooseFile = (key: MapKey, file: File | null) => {
    setMaps((prev) => ({ ...prev, [key]: file }));
  };

  const reset = () => {
    setShape('sphere');
    setLighting('studio');
    setMetallic(0.1);
    setRoughness(0.5);
    setNormalScale(1);
    setEmissive(0.2);
    setAutoRotate(true);
    setMaps({ map: null, normalMap: null, roughnessMap: null, metalnessMap: null, aoMap: null, emissiveMap: null });
    setError(null);
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Shape">
            <Segmented
              options={[
                { value: 'sphere', label: 'Sphere' },
                { value: 'box', label: 'Box' },
                { value: 'plane', label: 'Plane' },
                { value: 'torus', label: 'Torus' },
              ]}
              value={shape}
              onChange={(v) => setShape(v)}
            />
          </Field>
          <Field label="Lighting">
            <Segmented
              options={LIGHTING_PRESETS}
              value={lighting}
              onChange={(v) => setLighting(v)}
            />
          </Field>
          <SliderField label="Metallic" value={metallic} min={0} max={1} step={0.01} onChange={setMetallic} format={(v) => v.toFixed(2)} />
          <SliderField label="Roughness" value={roughness} min={0} max={1} step={0.01} onChange={setRoughness} format={(v) => v.toFixed(2)} />
          <SliderField label="Normal scale" value={normalScale} min={0} max={3} step={0.05} onChange={setNormalScale} format={(v) => v.toFixed(2)} />
          <SliderField label="Emissive intensity" value={emissive} min={0} max={4} step={0.05} onChange={setEmissive} format={(v) => v.toFixed(2)} />
          <CheckBox checked={autoRotate} onChange={setAutoRotate} label="Auto-rotate" />
          <Field label="Texture maps" hint="Optional. Maps multiply the sliders above.">
            <div className="stack-sm">
              {MAP_SLOTS.map((slot) => (
                <div key={slot.key} className="row spread" style={{ gap: 8 }}>
                  <span className="tiny" style={{ minWidth: 84 }}>{slot.label}</span>
                  <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer', flex: 1 }}>
                    <Upload style={{ width: 13, height: 13 }} />
                    {maps[slot.key] ? maps[slot.key]!.name : 'Choose…'}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(event) => {
                        chooseFile(slot.key, event.target.files?.[0] ?? null);
                        event.target.value = '';
                      }}
                    />
                  </label>
                  {maps[slot.key] && (
                    <Button size="sm" variant="ghost" onClick={() => chooseFile(slot.key, null)}>
                      Clear
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Field>
        </>
      }
      actions={
        <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
          Reset
        </Button>
      }
      info={maps.map ? formatBytes(maps.map.size) : undefined}
    >
      {webglError ? (
        <Notice tone="error" title="WebGL unavailable">
          {webglError}
        </Notice>
      ) : (
        <Panel title="Material preview">
          <div
            ref={containerRef}
            className="stage"
            style={{ minHeight: 460, padding: 0, overflow: 'hidden', cursor: 'grab' }}
          />
          <div className="dim tiny" style={{ marginTop: 6 }}>
            Drag to rotate · wheel not required · lighting is simulated, not an environment map.
          </div>
        </Panel>
      )}
      {error && (
        <Notice tone="error" title="Texture problem">
          {error}
        </Notice>
      )}
      <Notice tone="info" title="What this preview is">
        A lit MeshStandardMaterial with up to six maps. It approximates PBR shading but has no
        environment map, so metals look darker than in-engine. Use it to check map assignment and
        rough/metallic balance, not final lighting.
      </Notice>
    </ToolShell>
  );
}
