/**
 * Matrix-style glyph rain.
 *
 * Constraints that matter more than the effect:
 *  - frame rate is capped, so this never competes with renderer startup work;
 *  - `cancelAnimationFrame` runs on unmount, so nothing survives the overlay;
 *  - `prefers-reduced-motion` renders a single static frame and stops.
 */
import { useEffect, useRef } from 'react';
import { isMorpheusPresentationVisible, observeMorpheusPresentationVisibility } from '@/lib/morpheus-presentation-visibility';

const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎ0123456789';
const FONT_SIZE = 15;
const TARGET_FPS = 24;
const FRAME_MS = 1000 / TARGET_FPS;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const viewport = canvas.parentElement;
    if (!viewport) return undefined;
    const context = canvas.getContext('2d');
    if (!context) return undefined;

    let frameId = 0;
    let lastFrame = 0;
    let columns: number[] = [];
    let width = 0;
    let height = 0;

    const resize = () => {
      width = viewport.clientWidth;
      height = viewport.clientHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      columns = new Array(Math.ceil(width / FONT_SIZE))
        .fill(0)
        .map(() => Math.random() * height / FONT_SIZE);
    };

    const drawFrame = () => {
      // Low-alpha wash produces the trailing tail without keeping history.
      context.fillStyle = 'rgba(0, 0, 0, 0.08)';
      context.fillRect(0, 0, width, height);
      context.font = `${FONT_SIZE}px ui-monospace, SFMono-Regular, Menlo, monospace`;

      for (let index = 0; index < columns.length; index += 1) {
        const glyph = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        const x = index * FONT_SIZE;
        const y = columns[index] * FONT_SIZE;

        context.fillStyle = 'rgba(180, 255, 200, 0.95)';
        context.fillText(glyph, x, y);
        context.fillStyle = 'rgba(52, 211, 153, 0.55)';
        context.fillText(glyph, x, y - FONT_SIZE);

        if (y > height && Math.random() > 0.975) columns[index] = 0;
        else columns[index] += 1;
      }
    };

    resize();
    // ResizeObserver is unavailable in some embedded and test renderers.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    if (observer) observer.observe(viewport);
    else window.addEventListener('resize', resize);
    const stopObserving = () => {
      observer?.disconnect();
      if (!observer) window.removeEventListener('resize', resize);
    };

    if (prefersReducedMotion()) {
      // One static frame, no loop.
      context.fillStyle = 'rgba(0, 0, 0, 1)';
      context.fillRect(0, 0, width, height);
      drawFrame();
      return stopObserving;
    }

    const loop = (timestamp: number) => {
      if (!isMorpheusPresentationVisible()) { frameId = 0; return; }
      frameId = window.requestAnimationFrame(loop);
      if (timestamp - lastFrame < FRAME_MS) return;
      lastFrame = timestamp;
      drawFrame();
    };
    const onVisibility = () => {
      if (!isMorpheusPresentationVisible()) {
        window.cancelAnimationFrame(frameId);
        frameId = 0;
      } else if (!frameId) {
        lastFrame = 0;
        frameId = window.requestAnimationFrame(loop);
      }
    };
    const stopVisibility = observeMorpheusPresentationVisibility(onVisibility);
    onVisibility();

    return () => {
      window.cancelAnimationFrame(frameId);
      stopVisibility();
      stopObserving();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-testid="morpheus-boot-canvas"
      aria-hidden
      className="absolute inset-0 h-full w-full"
    />
  );
}
