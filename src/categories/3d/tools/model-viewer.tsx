import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Eye, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  CheckBox,
  Notice,
  Panel,
  Select,
  Stat,
} from '../../../components/ui';
import { DropZone } from '../../../components/files';
import { useAnimationFrame, useTask } from '../../../core/hooks';
import { formatBytes, formatNumber } from '../../../core/format';
import {
  collectStats,
  frameObject,
  loadModelFile,
  MODEL_ACCEPT,
  type LoadedModel,
  type ModelStats,
} from '../model';

interface ViewerEngine {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  pivot: THREE.Group;
  grid: THREE.GridHelper;
  model: LoadedModel | null;
  mixer: THREE.AnimationMixer | null;
  actions: THREE.AnimationAction[];
  currentAction: number;
  rotation: { x: number; y: number };
  autoRotate: boolean;
  dragging: boolean;
  pointer: { x: number; y: number };
}

export default function ModelViewer() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ViewerEngine | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [stats, setStats] = useState<ModelStats | null>(null);
  const [wireframe, setWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [animationIndex, setAnimationIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [webglError, setWebglError] = useState<string | null>(null);
  const task = useTask<{ stats: ModelStats; animations: string[] }>();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (error) {
      setWebglError(error instanceof Error ? error.message : 'WebGL is not available in this browser.');
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth || 640, container.clientHeight || 460);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, (container.clientWidth || 640) / (container.clientHeight || 460), 0.01, 1000);
    camera.position.set(0, 0, 3);

    scene.add(new THREE.HemisphereLight(0xbcd8ff, 0x2a2620, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 5, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.7);
    fill.position.set(-4, 1, -2);
    scene.add(fill);

    const pivot = new THREE.Group();
    scene.add(pivot);

    const grid = new THREE.GridHelper(10, 20, 0x3b82f6, 0x2a3140);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.55;
    scene.add(grid);

    const engine: ViewerEngine = {
      renderer,
      scene,
      camera,
      pivot,
      grid,
      model: null,
      mixer: null,
      actions: [],
      currentAction: 0,
      rotation: { x: 0, y: 0 },
      autoRotate: true,
      dragging: false,
      pointer: { x: 0, y: 0 },
    };
    engineRef.current = engine;

    container.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.cursor = 'grab';

    const onPointerDown = (event: PointerEvent) => {
      engine.dragging = true;
      engine.pointer = { x: event.clientX, y: event.clientY };
      renderer.domElement.style.cursor = 'grabbing';
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!engine.dragging) return;
      const dx = event.clientX - engine.pointer.x;
      const dy = event.clientY - engine.pointer.y;
      engine.pointer = { x: event.clientX, y: event.clientY };
      engine.rotation.y += dx * 0.01;
      engine.rotation.x = Math.max(-1.4, Math.min(1.4, engine.rotation.x + dy * 0.01));
    };
    const onPointerUp = () => {
      engine.dragging = false;
      renderer.domElement.style.cursor = 'grab';
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const next = engine.camera.position.z * (1 + Math.sign(event.deltaY) * 0.08);
      engine.camera.position.z = Math.max(0.4, Math.min(60, next));
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointerleave', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    const observer = new ResizeObserver(() => {
      const width = container.clientWidth || 640;
      const height = container.clientHeight || 460;
      engine.camera.aspect = width / height;
      engine.camera.updateProjectionMatrix();
      engine.renderer.setSize(width, height);
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointerleave', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      engine.model?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      engineRef.current = null;
    };
  }, []);

  useAnimationFrame((delta) => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.autoRotate && !engine.dragging) engine.rotation.y += delta * 0.4;
    engine.pivot.rotation.set(engine.rotation.x, engine.rotation.y, 0);
    engine.mixer?.update(delta);
    engine.renderer.render(engine.scene, engine.camera);
  }, true);

  const load = async (picked: File) => {
    const engine = engineRef.current;
    if (!engine) return;
    setFile(picked);
    setStats(null)
    await task.run(async () => {
      const model = await loadModelFile(picked);
      if (engine.model) {
        engine.pivot.remove(engine.model.root);
        engine.model.dispose();
      }
      if (engine.mixer) {
        engine.mixer.stopAllAction();
        engine.mixer = null;
      }
      engine.actions = [];
      engine.currentAction = 0;

      const { center } = frameObject(model.root, engine.camera);
      model.root.position.sub(center);
      engine.pivot.add(model.root);
      engine.model = model;
      engine.rotation = { x: 0, y: 0 };
      setAnimationIndex(0);
      setPlaying(true);

      if (model.animations.length) {
        engine.mixer = new THREE.AnimationMixer(model.root);
        engine.actions = model.animations.map((clip) => engine.mixer!.clipAction(clip));
        engine.actions[0]?.play();
      }

      const value = collectStats(model.root, model.animations);
      const clipNames = model.animations.map((clip) => clip.name || 'Unnamed clip');
      setStats(value);
      return { stats: value, animations: clipNames };
    });
  };

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !engine.model) return;
    engine.model.root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of list) {
        if (!material) continue;
        const standard = material as THREE.MeshStandardMaterial;
        if ('wireframe' in standard) standard.wireframe = wireframe;
      }
    });
  }, [wireframe]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.autoRotate = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.grid.visible = showGrid;
  }, [showGrid]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.mixer) engine.mixer.timeScale = playing ? 1 : 0;
  }, [playing]);

  const changeAnimation = (index: number) => {
    const engine = engineRef.current;
    if (!engine || !engine.mixer) return;
    engine.actions.forEach((action) => action.stop());
    const action = engine.actions[index];
    if (action) {
      action.reset().play();
      engine.mixer.timeScale = playing ? 1 : 0;
    }
    setAnimationIndex(index);
  };

  const reset = () => {
    const engine = engineRef.current;
    if (engine?.model) {
      engine.pivot.remove(engine.model.root);
      engine.model.dispose();
      engine.model = null;
    }
    if (engine?.mixer) {
      engine.mixer.stopAllAction();
      engine.mixer = null;
      engine.actions = [];
    }
    engine?.camera.position.set(0, 0, 3);
    setFile(null);
    setStats(null);
    setWireframe(false);
    setAutoRotate(true);
    setShowGrid(true);
    setAnimationIndex(0);
    setPlaying(true);
    task.reset();
  };

  const clipNames = task.result?.animations ?? [];

  return (
    <ToolShell
      sidebar={
        <>
          <CheckBox checked={wireframe} onChange={setWireframe} label="Wireframe" />
          <CheckBox checked={autoRotate} onChange={setAutoRotate} label="Auto-rotate" />
          <CheckBox checked={showGrid} onChange={setShowGrid} label="Show grid" />
          {clipNames.length > 0 && (
            <>
              <div className="field">
                <div className="field-label">Animation clip</div>
                <Select
                  value={String(animationIndex)}
                  onChange={(e) => changeAnimation(Number(e.target.value))}
                  options={clipNames.map((name, index) => ({ value: String(index), label: name }))}
                />
              </div>
              <CheckBox checked={playing} onChange={setPlaying} label="Play animation" />
            </>
          )}
          <Notice tone="info">
            Drag to rotate, scroll to zoom. Animations play from the first clip automatically. FBX
            and Collada animations depend on how the file was authored.
          </Notice>
        </>
      }
      actions={
        <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
          Reset
        </Button>
      }
      info={stats ? `${formatNumber(stats.triangles)} triangles` : undefined}
    >
      <Panel title={file ? file.name : 'Viewport'}>
        <div style={{ position: 'relative' }}>
          <div
            ref={containerRef}
            className="stage"
            style={{ minHeight: 480, padding: 0, overflow: 'hidden', cursor: 'grab' }}
          />
          {!file && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20,
                background: 'var(--bg-0)',
                borderRadius: 'var(--r-md)',
              }}
            >
              <div style={{ width: '100%', maxWidth: 720 }}>
                <DropZone
                  onFiles={(files) => files[0] && void load(files[0])}
                  accept={MODEL_ACCEPT}
                  formats={['GLB', 'GLTF', 'FBX', 'OBJ', 'STL', 'PLY', 'DAE', '3DS']}
                  size="md"
                  multiple={false}
                  icon={<Eye />}
                  title="Drop a 3D model"
                />
              </div>
            </div>
          )}
        </div>
      </Panel>

      {task.running && (
        <Panel title="Loading">
          <span className="dim tiny">Reading geometry and textures…</span>
        </Panel>
      )}
      {task.error && (
        <Notice tone="error" title="Could not load the model">
          {task.error}
        </Notice>
      )}
      {webglError && (
        <Notice tone="error" title="WebGL unavailable">
          {webglError}
        </Notice>
      )}

      {stats && (
        <>
          <div className="grid-4">
            <Stat label="Vertices" value={formatNumber(stats.vertices)} />
            <Stat label="Triangles" value={formatNumber(stats.triangles)} />
            <Stat label="Meshes" value={formatNumber(stats.meshes)} />
            <Stat label="Materials" value={formatNumber(stats.materials)} />
          </div>
          <div className="grid-4">
            <Stat label="Textures" value={formatNumber(stats.textures)} />
            <Stat label="Animations" value={formatNumber(stats.animations)} />
            <Stat label="Bones" value={formatNumber(stats.bones)} />
            <Stat
              label="Size"
              value={`${stats.size.x.toFixed(2)} × ${stats.size.y.toFixed(2)} × ${stats.size.z.toFixed(2)}`}
              sub="model units"
            />
          </div>
        </>
      )}
      {file && <div className="dim tiny">File size: {formatBytes(file.size)}</div>}
    </ToolShell>
  );
}
