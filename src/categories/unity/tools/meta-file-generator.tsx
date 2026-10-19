import { useMemo, useState } from 'react';
import { Copy, Download } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  CheckBox,
  CodeBlock,
  CopyButton,
  Field,
  Notice,
  NumberInput,
  Panel,
  Select,
  TextInput,
  useToast,
} from '../../../components/ui';
import { downloadText } from '../../../core/files';

type MetaKind = 'texture' | 'sprite' | 'normalMap' | 'folder' | 'script';

const KIND_OPTIONS = [
  { value: 'texture', label: 'Texture (Default)' },
  { value: 'sprite', label: 'Sprite (2D)' },
  { value: 'normalMap', label: 'Normal Map' },
  { value: 'folder', label: 'Folder' },
  { value: 'script', label: 'C# Script' },
];

const WRAP = [
  { value: '0', label: 'Repeat (0)' },
  { value: '1', label: 'Clamp (1)' },
  { value: '2', label: 'Mirror (2)' },
  { value: '3', label: 'Mirror Once (3)' },
];

const FILTER = [
  { value: '0', label: 'Point (0)' },
  { value: '1', label: 'Bilinear (1)' },
  { value: '2', label: 'Trilinear (2)' },
  { value: '4', label: 'Anisotropic (4)' },
];

const COMPRESSION = [
  { value: '1', label: 'Normal Quality (1)' },
  { value: '0', label: 'None / Lossless (0)' },
  { value: '2', label: 'High Quality (2)' },
  { value: '3', label: 'Low Quality (3)' },
];

function randomGuid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export default function MetaFileGenerator() {
  const toast = useToast();
  const [kind, setKind] = useState<MetaKind>('texture');
  const [guid, setGuid] = useState(() => randomGuid());
  const [mipmaps, setMipmaps] = useState(true);
  const [srgb, setSrgb] = useState(true);
  const [alphaIsTransparency, setAlphaIsTransparency] = useState(true);
  const [wrap, setWrap] = useState('0');
  const [filter, setFilter] = useState('1');
  const [maxSize, setMaxSize] = useState(2048);
  const [compression, setCompression] = useState('1');
  const [ppu, setPpu] = useState(100);
  const [spriteMultiple, setSpriteMultiple] = useState(false);

  const yaml = useMemo(() => {
    const g = guid.trim() || randomGuid();
    const head = `fileFormatVersion: 2\nguid: ${g}\n`;
    const tail = `  assetBundleName: \n  assetBundleVariant: \n`;

    if (kind === 'folder') {
      return `${head}folderAsset: yes\nDefaultImporter:\n  externalObjects: {}\n  userData: \n${tail}`;
    }
    if (kind === 'script') {
      return `${head}MonoImporter:\n  externalObjects: {}\n  serializedVersion: 2\n  defaultReferences: []\n  executionOrder: 0\n  icon: {instanceID: 0}\n  userData: \n${tail}`;
    }

    const textureType = kind === 'sprite' ? 8 : kind === 'normalMap' ? 1 : 0;
    const isSrgb = kind === 'normalMap' ? false : srgb;
    return (
      `${head}TextureImporter:\n` +
      `  internalIDToNameTable: []\n` +
      `  externalObjects: {}\n` +
      `  serializedVersion: 13\n` +
      `  mipmaps:\n    mipMapMode: 0\n    enableMipMap: ${mipmaps && kind !== 'sprite' ? 1 : 0}\n` +
      `    sRGBTexture: ${isSrgb ? 1 : 0}\n    linearTexture: ${isSrgb ? 0 : 1}\n` +
      `    fadeOut: 0\n    borderMipMap: 0\n    mipMapsPreserveCoverage: 0\n` +
      `    alphaTestReferenceValue: 0.5\n    mipMapFadeDistanceStart: 1\n    mipMapFadeDistanceEnd: 3\n` +
      `  bumpmap:\n    convertToNormalMap: ${kind === 'normalMap' ? 1 : 0}\n    externalNormalMap: ${kind === 'normalMap' ? 1 : 0}\n` +
      `    heightScale: 0.25\n    normalMapFilter: 0\n    flipGreenChannel: 0\n` +
      `  isReadable: 0\n  streamingMipmaps: 0\n  grayScaleToAlpha: 0\n  generateCubemap: 6\n` +
      `  textureFormat: 1\n  maxTextureSize: ${maxSize}\n` +
      `  textureSettings:\n    serializedVersion: 2\n    filterMode: ${filter}\n    anisoLevel: 1\n` +
      `    mipBias: 0\n    wrapU: ${wrap}\n    wrapV: ${wrap}\n    wrapW: ${wrap}\n` +
      `  nPOTScale: 0\n  lightmap: 0\n  compressionQuality: 50\n` +
      `  spriteMode: ${kind === 'sprite' ? (spriteMultiple ? 2 : 1) : 0}\n` +
      `  spriteExtrude: 1\n  spriteMeshType: 1\n  alignment: 0\n  spritePivot: {x: 0.5, y: 0.5}\n` +
      `  spritePixelsToUnits: ${ppu}\n  spriteBorder: {x: 0, y: 0, z: 0, w: 0}\n` +
      `  spriteGenerateFallbackPhysicsShape: 1\n` +
      `  alphaUsage: ${alphaIsTransparency ? 1 : 3}\n  alphaIsTransparency: ${alphaIsTransparency ? 1 : 0}\n` +
      `  spriteTessellationDetail: -1\n  textureType: ${textureType}\n  textureShape: 1\n` +
      `  singleChannelComponent: 0\n  maxTextureSizeSet: 0\n  compressionQualitySet: 0\n` +
      `  textureFormatSet: 0\n  ignorePngGamma: 0\n  applyGammaDecoding: 0\n` +
      `  platformSettings:\n  - serializedVersion: 3\n    buildTarget: DefaultTexturePlatform\n` +
      `    maxTextureSize: ${maxSize}\n    resizeAlgorithm: 0\n    textureFormat: -1\n` +
      `    textureCompression: ${compression}\n    compressionQuality: 50\n    crunchedCompression: 0\n` +
      `    allowsAlphaSplitting: 0\n    overridden: 0\n` +
      `  spriteSheet:\n    serializedVersion: 2\n    sprites: []\n    outline: []\n    physicsShape: []\n` +
      `    bones: []\n    spriteID: \n    internalID: 0\n    vertices: []\n    indices: \n    edges: []\n` +
      `    weights: []\n    secondaryTextures: []\n    nameFileIdTable: {}\n` +
      `  mipmapLimitGroupName: \n  pSDRemoveMatte: 0\n  userData: \n${tail}`
    );
  }, [kind, guid, mipmaps, srgb, alphaIsTransparency, wrap, filter, maxSize, compression, ppu, spriteMultiple]);

  const fileName = kind === 'folder' ? 'Folder' : kind === 'script' ? 'MyScript.cs' : 'MyTexture.png';

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Asset type">
            <Select value={kind} onChange={(e) => setKind(e.target.value as MetaKind)} options={KIND_OPTIONS} />
          </Field>
          <Field label="GUID" hint="32 hex characters. Leave as-is for a fresh random GUID.">
            <TextInput value={guid} onChange={(e) => setGuid(e.target.value)} maxLength={32} className="mono" />
          </Field>
          <Button size="sm" variant="outline" icon={<Copy />} onClick={() => setGuid(randomGuid())}>
            New GUID
          </Button>
          {(kind === 'texture' || kind === 'sprite' || kind === 'normalMap') && (
            <>
              <Field label="Max texture size">
                <Select
                  value={String(maxSize)}
                  onChange={(e) => setMaxSize(Number(e.target.value))}
                  options={[32, 64, 128, 256, 512, 1024, 2048, 4096, 8192].map((n) => ({ value: String(n), label: String(n) }))}
                />
              </Field>
              <Field label="Wrap mode">
                <Select value={wrap} onChange={(e) => setWrap(e.target.value)} options={WRAP} />
              </Field>
              <Field label="Filter mode">
                <Select value={filter} onChange={(e) => setFilter(e.target.value)} options={FILTER} />
              </Field>
              <Field label="Compression">
                <Select value={compression} onChange={(e) => setCompression(e.target.value)} options={COMPRESSION} />
              </Field>
              {kind !== 'normalMap' && (
                <CheckBox checked={srgb} onChange={setSrgb} label="sRGB (colour texture)" hint="Uncheck for linear data maps (mask, HDR)." />
              )}
              <CheckBox checked={alphaIsTransparency} onChange={setAlphaIsTransparency} label="Alpha is transparency" />
              <CheckBox checked={mipmaps} onChange={setMipmaps} label="Generate mipmaps" />
            </>
          )}
          {kind === 'sprite' && (
            <>
              <Field label="Pixels per unit">
                <NumberInput value={ppu} onChange={setPpu} min={1} max={16384} />
              </Field>
              <CheckBox checked={spriteMultiple} onChange={setSpriteMultiple} label="Multiple sprites" />
            </>
          )}
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<Copy />} onClick={() => { setGuid(randomGuid()); toast.info('New GUID assigned.'); }}>
            Reset
          </Button>
          <CopyButton value={yaml} label="Copy .meta" size="md" variant="outline" onCopied={() => toast.success('Copied.')} />
          <Button
            variant="success"
            icon={<Download />}
            onClick={() => {
              downloadText(yaml, `${fileName}.meta`, 'text/plain');
              toast.success('Saved .meta file.');
            }}
          >
            Download
          </Button>
        </>
      }
      info={`${fileName}.meta`}
    >
      <Notice tone="warning" title="Verify in your Unity version">
        This follows the common Unity 2021+ serialization layout. Numeric enum values differ between
        editor versions — Unity repairs incomplete importers on import, but open the importer
        settings once in your editor to confirm. The GUID must stay unique inside one project.
      </Notice>
      <Panel title="Generated .meta">
        <CodeBlock text={yaml} maxHeight={480} />
      </Panel>
    </ToolShell>
  );
}