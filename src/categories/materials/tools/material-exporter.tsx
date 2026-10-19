import { useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  CheckBox,
  CopyButton,
  Field,
  Notice,
  Panel,
  SliderField,
  TextInput,
  useToast,
} from '../../../components/ui';
import { downloadText } from '../../../core/files';
import { hexToRgb, rgbToHex } from '../../../core/color';
import { stripExt } from '../../../core/format';

type Target = 'json' | 'unity' | 'gltf' | 'three';

const TARGETS: Array<{ value: Target; label: string }> = [
  { value: 'json', label: 'JSON' },
  { value: 'unity', label: 'Unity YAML' },
  { value: 'gltf', label: 'glTF fragment' },
  { value: 'three', label: 'three.js' },
];

export default function MaterialExporter() {
  const toast = useToast();
  const [name, setName] = useState('NewMaterial');
  const [base, setBase] = useState('#B8B8C0');
  const [metallic, setMetallic] = useState(0.1);
  const [roughness, setRoughness] = useState(0.55);
  const [emissive, setEmissive] = useState('#000000');
  const [emissiveIntensity, setEmissiveIntensity] = useState(1);
  const [alpha, setAlpha] = useState(1);
  const [normalScale, setNormalScale] = useState(1);
  const [occlusion, setOcclusion] = useState(1);
  const [doubleSided, setDoubleSided] = useState(false);
  const [target, setTarget] = useState<Target>('json');

  const baseRgb = hexToRgb(base) ?? { r: 184, g: 184, b: 192 };
  const emissiveRgb = hexToRgb(emissive) ?? { r: 0, g: 0, b: 0 };

  const output = useMemo(() => {
    const json = {
      name,
      pbrMetallicRoughness: {
        baseColorFactor: [baseRgb.r / 255, baseRgb.g / 255, baseRgb.b / 255, alpha].map((n) => Number(n.toFixed(4))),
        metallicFactor: Number(metallic.toFixed(3)),
        roughnessFactor: Number(roughness.toFixed(3)),
      },
      emissiveFactor: [
        Number(((emissiveRgb.r / 255) * emissiveIntensity).toFixed(4)),
        Number(((emissiveRgb.g / 255) * emissiveIntensity).toFixed(4)),
        Number(((emissiveRgb.b / 255) * emissiveIntensity).toFixed(4)),
      ],
      normalTexture: { scale: Number(normalScale.toFixed(3)) },
      occlusionTexture: { strength: Number(occlusion.toFixed(3)) },
      alphaMode: alpha < 1 ? 'BLEND' : 'OPAQUE',
      doubleSided,
    };

    if (target === 'json') return JSON.stringify(json, null, 2);
    if (target === 'gltf') {
      return JSON.stringify(
        {
          pbrMetallicRoughness: {
            baseColorFactor: json.pbrMetallicRoughness.baseColorFactor,
            metallicFactor: json.pbrMetallicRoughness.metallicFactor,
            roughnessFactor: json.pbrMetallicRoughness.roughnessFactor,
            baseColorTexture: { index: 0 },
            metallicRoughnessTexture: { index: 1 },
          },
          normalTexture: { index: 2, scale: json.normalTexture.scale },
          occlusionTexture: { index: 3, strength: json.occlusionTexture.strength },
          emissiveTexture: { index: 4 },
          emissiveFactor: json.emissiveFactor,
          alphaMode: json.alphaMode,
          doubleSided: json.doubleSided,
        },
        null,
        2,
      );
    }
    if (target === 'unity') {
      return [
        '%YAML 1.1',
        '%TAG !u! tag:unity3d.com,2011:',
        '--- !u!21 &2100000',
        'Material:',
        '  serializedVersion: 8',
        '  m_Name: ' + name,
        '  m_Shader: {fileID: 46, guid: 0000000000000000f000000000000000, type: 0}',
        '  m_ShaderKeywords: _METALLICGLOSSMAP _NORMALMAP',
        '  m_SavedProperties:',
        '    serializedVersion: 3',
        '    m_TexEnvs:',
        '    - _BumpMap:',
        '        m_Texture: {fileID: 0}',
        '        m_Scale: {x: 1, y: 1}',
        '        m_Offset: {x: 0, y: 0}',
        '    - _MainTex:',
        '        m_Texture: {fileID: 0}',
        '        m_Scale: {x: 1, y: 1}',
        '        m_Offset: {x: 0, y: 0}',
        '    - _MetallicGlossMap:',
        '        m_Texture: {fileID: 0}',
        '        m_Scale: {x: 1, y: 1}',
        '        m_Offset: {x: 0, y: 0}',
        '    - _OcclusionMap:',
        '        m_Texture: {fileID: 0}',
        '        m_Scale: {x: 1, y: 1}',
        '        m_Offset: {x: 0, y: 0}',
        '    m_Floats:',
        '    - _BumpScale: ' + normalScale.toFixed(3),
        '    - _Glossiness: ' + (1 - roughness).toFixed(3),
        '    - _Metallic: ' + metallic.toFixed(3),
        '    - _OcclusionStrength: ' + occlusion.toFixed(3),
        '    m_Colors:',
        '    - _Color: {r: ' + (baseRgb.r / 255).toFixed(4) + ', g: ' + (baseRgb.g / 255).toFixed(4) + ', b: ' + (baseRgb.b / 255).toFixed(4) + ', a: ' + alpha.toFixed(3) + '}',
        '    - _EmissionColor: {r: ' + ((emissiveRgb.r / 255) * emissiveIntensity).toFixed(4) + ', g: ' + ((emissiveRgb.g / 255) * emissiveIntensity).toFixed(4) + ', b: ' + ((emissiveRgb.b / 255) * emissiveIntensity).toFixed(4) + ', a: 1}',
        '  m_CustomRenderQueue: -1',
        '  stringTagMap: {}',
        '  disabledShaderPasses: []',
        '  m_LockedProperties:',
        '  m_SavedPropertiesVersion: 1',
        '  m_ValidKeywords: []',
        '  m_InvalidKeywords: []',
        '  m_LightmapFlags: 4',
        '  m_EnableInstancingVariants: 0',
        '  m_DoubleSidedGI: 0',
        '  m_CustomRenderQueue: -1',
        '  stringTagMap: {}',
        '  disabledShaderPasses: []',
        '  m_SavedProperties:',
        '    serializedVersion: 3',
        '    m_TexEnvs:',
        '    m_Floats:',
        '    m_Colors:',
      ].join('\n');
    }
    return [
      `const material = new THREE.MeshStandardMaterial({`,
      `  color: 0x${rgbToHex(baseRgb).slice(1)},`,
      `  metalness: ${metallic.toFixed(3)},`,
      `  roughness: ${roughness.toFixed(3)},`,
      `  emissive: 0x${rgbToHex(emissiveRgb).slice(1)},`,
      `  emissiveIntensity: ${emissiveIntensity.toFixed(3)},`,
      `  transparent: ${alpha < 1},`,
      `  opacity: ${alpha.toFixed(3)},`,
      `  side: ${doubleSided ? 'THREE.DoubleSide' : 'THREE.FrontSide'},`,
      `});`,
      `// normalScale.set(${normalScale.toFixed(3)}, ${normalScale.toFixed(3)});`,
      `// aoMapIntensity = ${occlusion.toFixed(3)};`,
    ].join('\n');
  }, [baseRgb, metallic, roughness, emissiveRgb, emissiveIntensity, alpha, normalScale, occlusion, doubleSided, name, target]);

  const reset = () => {
    setName('NewMaterial');
    setBase('#B8B8C0');
    setMetallic(0.1);
    setRoughness(0.55);
    setEmissive('#000000');
    setEmissiveIntensity(1);
    setAlpha(1);
    setNormalScale(1);
    setOcclusion(1);
    setDoubleSided(false);
    setTarget('json');
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Material name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Base colour">
            <div className="row">
              <input type="color" className="input" value={base} onChange={(e) => setBase(e.target.value)} style={{ width: 56, padding: 2 }} />
              <TextInput value={base} onChange={(e) => setBase(e.target.value)} className="mono" />
            </div>
          </Field>
          <SliderField label="Metallic" value={metallic} min={0} max={1} step={0.01} onChange={setMetallic} format={(v) => v.toFixed(2)} />
          <SliderField label="Roughness" value={roughness} min={0} max={1} step={0.01} onChange={setRoughness} format={(v) => v.toFixed(2)} />
          <Field label="Emissive colour">
            <div className="row">
              <input type="color" className="input" value={emissive} onChange={(e) => setEmissive(e.target.value)} style={{ width: 56, padding: 2 }} />
              <TextInput value={emissive} onChange={(e) => setEmissive(e.target.value)} className="mono" />
            </div>
          </Field>
          <SliderField label="Emissive intensity" value={emissiveIntensity} min={0} max={8} step={0.1} onChange={setEmissiveIntensity} format={(v) => `${v.toFixed(1)}×`} />
          <SliderField label="Opacity" value={alpha} min={0} max={1} step={0.01} onChange={setAlpha} format={(v) => v.toFixed(2)} />
          <SliderField label="Normal scale" value={normalScale} min={0} max={3} step={0.05} onChange={setNormalScale} format={(v) => v.toFixed(2)} />
          <SliderField label="Occlusion strength" value={occlusion} min={0} max={1} step={0.01} onChange={setOcclusion} format={(v) => v.toFixed(2)} />
          <CheckBox checked={doubleSided} onChange={setDoubleSided} label="Double-sided" />
          <Field label="Export target">
            <div className="row-wrap">
              {TARGETS.map((t) => (
                <Button key={t.value} size="sm" variant={target === t.value ? 'primary' : 'outline'} onClick={() => setTarget(t.value)}>
                  {t.label}
                </Button>
              ))}
            </div>
          </Field>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <CopyButton value={output} label="Copy" />
          <Button
            variant="success"
            icon={<Download />}
            onClick={() => {
              const ext = target === 'unity' ? 'mat' : target === 'json' || target === 'gltf' ? 'json' : 'js';
              downloadText(output, `${stripExt(name || 'material')}.${ext}`);
              toast.success('Downloaded.');
            }}
          >
            Download
          </Button>
        </>
      }
      info={TARGETS.find((t) => t.value === target)?.label}
    >
      <div className="grid-2">
        <Panel title="Preview">
          <div
            className="stage"
            style={{
              background: '#171b23',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              minHeight: 220,
            }}
          >
            <div
              style={{
                width: 120,
                height: 120,
                borderRadius: '50%',
                background: `radial-gradient(circle at 35% 30%, ${rgbToHex(baseRgb)}, ${rgbToHex({ r: baseRgb.r * 0.35, g: baseRgb.g * 0.35, b: baseRgb.b * 0.35 })})`,
                border: '1px solid rgba(255,255,255,.12)',
                boxShadow: `0 0 26px ${emissiveRgb.r || emissiveRgb.g || emissiveRgb.b ? rgbToHex(emissiveRgb) : 'transparent'}`,
                opacity: 0.35 + alpha * 0.65,
              }}
            />
            <div className="dim tiny">Approximate swatch — the numeric values are what get exported.</div>
          </div>
        </Panel>
        <Panel title="Notes">
          <Notice tone="info" title="What each target contains">
            JSON is the canonical description. The glTF fragment lists texture indices for a material
            that already has maps. Unity YAML uses the Standard shader property names (_MainTex,
            _MetallicGlossMap, _BumpMap). The three.js snippet is a starting MeshStandardMaterial.
          </Notice>
          <div className="dim tiny" style={{ marginTop: 10 }}>
            Textures are not embedded; assign your own map files in the engine. Metallic/roughness in
            glTF are packed into one texture (B = metallic, G = roughness).
          </div>
        </Panel>
      </div>
      <Panel title="Output">
        <pre className="code" style={{ maxHeight: 420 }}>{output}</pre>
      </Panel>
    </ToolShell>
  );
}
