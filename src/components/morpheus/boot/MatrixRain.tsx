/**
 * Matrix-style glyph rain.
 *
 * Constraints that matter more than the effect:
 *  - frame rate is capped, so this never competes with renderer startup work;
 *  - `cancelAnimationFrame` runs on unmount, so nothing survives the overlay;
 *  - `prefers-reduced-motion` renders a single static frame and stops.
 */
import { useEffect, useRef } from 'react';

const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎ0123456789';
const FONT_SIZE = 15;
const TARGET_FPS = 30;
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
    const context = canvas.getContext('2d');
    if (!context) return undefined;

    let frameId = 0;
    let lastFrame = 0;
    let columns: number[] = [];

    const resize = () => {
      const { innerWidth, innerHeight } = window;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(innerWidth * ratio);
      canvas.height = Math.floor(innerHeight * ratio);
      canvas.style.width = `${innerWidth}px`;
      canvas.style.height = `${innerHeight}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      columns = new Array(Math.ceil(innerWidth / FONT_SIZE))
        .fill(0)
        .map(() => Math.random() * innerHeight / FONT_SIZE);
    };

    const drawFrame = () => {
      const { innerWidth, innerHeight } = window;
      // Low-alpha wash produces the trailing tail without keeping history.
      context.fillStyle = 'rgba(0, 0, 0, 0.08)';
      context.fillRect(0, 0, innerWidth, innerHeight);
      context.font = `${FONT_SIZE}px ui-monospace, SFMono-Regular, Menlo, monospace`;

      for (let index = 0; index < columns.length; index += 1) {
        const glyph = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        const x = index * FONT_SIZE;
        const y = columns[index] * FONT_SIZE;

        context.fillStyle = 'rgba(180, 255, 200, 0.95)';
        context.fillText(glyph, x, y);
        context.fillStyle = 'rgba(52, 211, 153, 0.55)';
        context.fillText(glyph, x, y - FONT_SIZE);

        if (y > innerHeight && Math.random() > 0.975) columns[index] = 0;
        else columns[index] += 1;
      }
    };

    resize();
    window.addEventListener('resize', resize);

    if (prefersReducedMotion()) {
      // One static frame, no loop.
      context.fillStyle = 'rgba(0, 0, 0, 1)';
      context.fillRect(0, 0, window.innerWidth, window.innerHeight);
      drawFrame();
      return () => window.removeEventListener('resize', resize);
    }

    const loop = (timestamp: number) => {
      frameId = window.requestAnimationFrame(loop);
      if (document.hidden) return;
      if (timestamp - lastFrame < FRAME_MS) return;
      lastFrame = timestamp;
      drawFrame();
    };
    frameId = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
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
