import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { formatTime } from './editor';
import {
  cloneLayers,
  timelineEnd,
  type AudioClip,
  type AudioLayer,
} from './timeline';

const GUTTER = 118;
const RULER = 26;
const ROW_HEIGHT = 64;
const ROW_GAP = 6;
const EDGE = 7;

interface LayerTimelineProps {
  layers: AudioLayer[];
  selectedLayerId: string | null;
  selectedClipId: string | null;
  /** Playhead in rendered-preview seconds. */
  playhead: number;
  playheadRef: RefObject<number>;
  speed: number;
  playing: boolean;
  onSelect: (layerId: string, clipId: string | null) => void;
  onSeek: (timelineSeconds: number) => void;
  onLayersChange: (layers: AudioLayer[]) => void;
  onDragStart: () => void;
  onTogglePlay: () => void;
  onDeleteClip: () => void;
}

interface DragState {
  pointerId: number;
  mode: 'move' | 'trim-left' | 'trim-right';
  base: AudioLayer[];
  clipId: string;
  layerId: string;
  origin: AudioClip;
  startTime: number;
  duration: number;
  moved: boolean;
}

export function LayerTimeline({
  layers,
  selectedLayerId,
  selectedClipId,
  playhead,
  playheadRef,
  speed,
  playing,
  onSelect,
  onSeek,
  onLayersChange,
  onDragStart,
  onTogglePlay,
  onDeleteClip,
}: LayerTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const selectedLayerRef = useRef(selectedLayerId);
  selectedLayerRef.current = selectedLayerId;

  const timelineDuration = Math.max(0.1, timelineEnd(layers));
  const canvasHeight = Math.max(150, RULER + layers.length * ROW_HEIGHT + 10);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(320, Math.round(canvas.clientWidth || 900));
    const height = canvasHeight;
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const laneWidth = Math.max(10, width - GUTTER - 6);
    const viewDuration = dragRef.current?.duration ?? timelineDuration;
    const xFor = (seconds: number) => GUTTER + (seconds / viewDuration) * laneWidth;

    // Ruler
    context.fillStyle = 'rgba(148, 163, 184, 0.08)';
    context.fillRect(0, 0, width, RULER);
    context.font = '10px ui-sans-serif, system-ui, sans-serif';
    context.textBaseline = 'alphabetic';
    for (let step = 0; step <= 4; step += 1) {
      const seconds = (viewDuration * step) / 4;
      const x = xFor(seconds);
      context.strokeStyle = 'rgba(148, 163, 184, 0.18)';
      context.beginPath();
      context.moveTo(x, RULER - 5);
      context.lineTo(x, height);
      context.stroke();
      context.fillStyle = 'rgba(203, 213, 225, 0.65)';
      context.fillText(formatTime(seconds, false), Math.min(x + 4, width - 38), 13);
    }

    layers.forEach((layer, index) => {
      const rowY = RULER + index * ROW_HEIGHT;
      const clipY = rowY + 8;
      const clipH = ROW_HEIGHT - ROW_GAP - 10;
      const laneX = GUTTER;
      const selectedLayer = layer.id === selectedLayerRef.current;

      context.fillStyle = selectedLayer
        ? 'rgba(59, 130, 246, 0.10)'
        : 'rgba(148, 163, 184, 0.045)';
      context.beginPath();
      context.roundRect(laneX, rowY + 2, laneWidth + 2, ROW_HEIGHT - ROW_GAP, 5);
      context.fill();

      context.fillStyle = 'rgba(226, 232, 240, 0.88)';
      context.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      const name = layer.name.length > 14 ? `${layer.name.slice(0, 13)}…` : layer.name;
      context.fillText(name, 10, rowY + 26);
      context.font = '10px ui-sans-serif, system-ui, sans-serif';
      context.fillStyle = 'rgba(148, 163, 184, 0.75)';
      context.fillText(`${layer.clips.length} clip${layer.clips.length === 1 ? '' : 's'}`, 10, rowY + 41);
      if (layer.muted) {
        context.fillStyle = 'rgba(248, 113, 113, 0.95)';
        context.fillText('M', 10, rowY + 56);
      }
      if (layer.solo) {
        context.fillStyle = 'rgba(250, 204, 21, 0.95)';
        context.fillText('S', layer.muted ? 22 : 10, rowY + 56);
      }

      for (const clip of layer.clips) {
        const x1 = xFor(Math.max(0, clip.start));
        const x2 = xFor(Math.max(0, clip.start + clip.duration));
        const clipWidth = Math.max(2, x2 - x1);
        const selected = clip.id === selectedClipId;

        context.save();
        context.beginPath();
        context.roundRect(x1, clipY, clipWidth, clipH, 4);
        context.fillStyle = selected
          ? 'rgba(59, 130, 246, 0.32)'
          : 'rgba(56, 189, 248, 0.15)';
        context.fill();
        context.strokeStyle = selected
          ? 'rgba(96, 165, 250, 0.95)'
          : 'rgba(56, 189, 248, 0.35)';
        context.lineWidth = selected ? 1.6 : 1;
        context.stroke();

        context.clip();
        if (clipWidth > 6) {
          const duration = Math.max(0.001, clip.duration);
          const source = clip.buffer;
          const channels = Array.from({ length: source.numberOfChannels }, (_, channel) =>
            source.getChannelData(channel),
          );
          context.fillStyle = selected
            ? 'rgba(147, 197, 253, 0.95)'
            : 'rgba(125, 211, 252, 0.82)';
          const center = clipY + clipH / 2 + 5;
          const amplitude = clipH / 2 - 10;
          for (let x = Math.ceil(x1); x < Math.min(x2, width); x += 1) {
            const t0 = ((x - x1) / clipWidth) * duration;
            const t1 = ((x + 1 - x1) / clipWidth) * duration;
            let min = 1;
            let max = -1;
            for (const data of channels) {
              const start = Math.floor((clip.offset + t0) * source.sampleRate);
              const end = Math.min(
                data.length,
                Math.ceil((clip.offset + t1) * source.sampleRate),
              );
              const stride = Math.max(1, Math.floor((end - start) / 160));
              for (let i = start; i < end; i += stride) {
                const value = data[i];
                if (value < min) min = value;
                if (value > max) max = value;
              }
            }
            if (max < min) continue;
            const top = center - max * amplitude;
            const bottom = center - min * amplitude;
            context.fillRect(x, top, 1, Math.max(1, bottom - top));
          }
        }

        if (clipWidth > 34) {
          context.fillStyle = 'rgba(241, 245, 249, 0.92)';
          context.font = '10px ui-sans-serif, system-ui, sans-serif';
          const label =
            clipWidth > 90 && clip.name.length > 16 ? `${clip.name.slice(0, 15)}…` : clip.name;
          context.fillText(label, x1 + 5, clipY + 12);
        }

        if (selected) {
          context.fillStyle = 'rgba(191, 219, 254, 0.9)';
          context.fillRect(x1, clipY + 4, 2, clipH - 8);
          context.fillRect(x2 - 2, clipY + 4, 2, clipH - 8);
        }
        context.restore();
      }
    });

    const timelinePlayhead = Math.max(0, Math.min(viewDuration, playheadRef.current * speed));
    const x = xFor(timelinePlayhead);
    context.strokeStyle = 'rgba(59, 130, 246, 0.98)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
    context.fillStyle = 'rgba(59, 130, 246, 0.98)';
    context.beginPath();
    context.moveTo(x - 5, 0);
    context.lineTo(x + 5, 0);
    context.lineTo(x, 8);
    context.closePath();
    context.fill();
  }, [canvasHeight, layers, playheadRef, selectedClipId, speed, timelineDuration]);

  useEffect(() => {
    draw();
  }, [draw, playhead]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      draw();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, draw]);

  const timeAt = (clientX: number): number | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    if (x < GUTTER) return null;
    const laneWidth = Math.max(10, rect.width - GUTTER - 6);
    const duration = dragRef.current?.duration ?? timelineDuration;
    return Math.max(0, Math.min(duration, ((x - GUTTER) / laneWidth) * duration));
  };

  const rowAt = (clientY: number): number | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const y = clientY - rect.top;
    if (y < RULER) return null;
    const index = Math.floor((y - RULER) / ROW_HEIGHT);
    return index >= 0 && index < layers.length ? index : null;
  };

  const hitAt = (clientX: number, clientY: number) => {
    const time = timeAt(clientX);
    const row = rowAt(clientY);
    if (time === null || row === null) return null;
    const layer = layers[row];
    if (!layer) return null;
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const laneWidth = Math.max(10, rect.width - GUTTER - 6);
    const toX = (seconds: number) => GUTTER + (seconds / timelineDuration) * laneWidth;
    for (const clip of [...layer.clips].reverse()) {
      const x1 = toX(clip.start);
      const x2 = toX(clip.start + clip.duration);
      if (clientX - rect.left < x1 - EDGE || clientX - rect.left > x2 + EDGE) continue;
      const left = Math.abs(clientX - rect.left - x1) <= EDGE;
      const right = Math.abs(clientX - rect.left - x2) <= EDGE;
      return {
        layer,
        clip,
        time,
        mode: left ? ('trim-left' as const) : right ? ('trim-right' as const) : ('move' as const),
      };
    }
    return { layer, clip: null, time, mode: 'move' as const };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    const hit = hitAt(event.clientX, event.clientY);
    if (!hit) return;
    const target = timeAt(event.clientX);
    if (target !== null) onSeek(target);
    onSelect(hit.layer.id, hit.clip?.id ?? null);
    if (!hit.clip) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      mode: hit.mode,
      base: cloneLayers(layers),
      clipId: hit.clip.id,
      layerId: hit.layer.id,
      origin: { ...hit.clip },
      startTime: hit.time ?? 0,
      duration: timelineDuration,
      moved: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      const hit = hitAt(event.clientX, event.clientY);
      const canvas = event.currentTarget;
      canvas.style.cursor = !hit
        ? 'default'
        : hit.clip
          ? hit.mode === 'move'
            ? 'grab'
            : 'ew-resize'
          : 'crosshair';
      return;
    }
    if (event.pointerId !== drag.pointerId) return;
    const time = timeAt(event.clientX);
    if (time === null) return;
    let delta = time - drag.startTime;
    if (drag.mode === 'move') {
      delta = Math.max(delta, -drag.origin.start);
      delta = Math.min(
        delta,
        Math.max(0, drag.duration - drag.origin.start - 0.05),
      );
    }
    if (!drag.moved && Math.abs(delta) < 0.005) return;
    if (!drag.moved) {
      drag.moved = true;
      onDragStart();
    }

    const next = cloneLayers(drag.base);
    let sourceLayer = next.find((layer) => layer.id === drag.layerId);
    if (!sourceLayer) return;
    let clip = sourceLayer.clips.find((item) => item.id === drag.clipId);
    if (!clip) return;

    if (drag.mode === 'move') {
      const row = rowAt(event.clientY);
      if (row !== null) {
        const targetLayer = next[row];
        if (targetLayer && targetLayer.id !== sourceLayer.id) {
          sourceLayer.clips = sourceLayer.clips.filter((item) => item.id !== drag.clipId);
          targetLayer.clips.push(clip);
          sourceLayer = targetLayer;
          drag.layerId = targetLayer.id;
          onSelect(targetLayer.id, clip.id);
        }
      }
      clip = sourceLayer.clips.find((item) => item.id === drag.clipId);
      if (!clip) return;
      clip.start = Math.max(0, drag.origin.start + delta);
    } else if (drag.mode === 'trim-left') {
      const maxDelta = drag.origin.duration - 0.05;
      const minDelta = Math.max(-drag.origin.start, -drag.origin.offset);
      const change = Math.max(minDelta, Math.min(delta, maxDelta));
      clip.start = Math.max(0, drag.origin.start + change);
      clip.offset = Math.max(0, drag.origin.offset + change);
      clip.duration = Math.max(0.05, drag.origin.duration - change);
    } else {
      const maxDuration = Math.max(
        0.05,
        Math.min(
          clip.buffer.duration - clip.offset,
          drag.duration - drag.origin.start,
        ),
      );
      clip.duration = Math.max(0.05, Math.min(drag.origin.duration + delta, maxDuration));
    }

    onLayersChange(next);
  };

  const endDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* pointer already released */
      }
    }
  };

  return (
    <canvas
      ref={canvasRef}
      className="layer-timeline"
      style={{ display: 'block', width: '100%', height: canvasHeight, touchAction: 'none' }}
      tabIndex={0}
      role="application"
      aria-label="Multi-layer timeline. Click a clip to select it, drag to move, drag an edge to trim, and use arrow keys to move the playhead."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 1 : 0.1;
        const current = playheadRef.current * speed;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          onSeek(
            Math.max(
              0,
              Math.min(
                timelineDuration,
                current + (event.key === 'ArrowRight' ? step : -step),
              ),
            ),
          );
        } else if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          onSeek(event.key === 'Home' ? 0 : timelineDuration);
        } else if (event.key === ' ') {
          event.preventDefault();
          onTogglePlay();
        } else if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault();
          onDeleteClip();
        }
      }}
    />
  );
}
