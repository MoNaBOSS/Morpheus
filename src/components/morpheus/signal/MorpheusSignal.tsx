import { useId } from 'react';

import { cn } from '@/lib/utils';
import type { MorpheusSignalState } from './signal-state';

type MorpheusSignalProps = {
  state: MorpheusSignalState;
  className?: string;
  label?: string;
  compact?: boolean;
};

const TRACE_X = [13, 22, 31, 40, 50, 60, 69, 78, 87] as const;
// Deterministic vector filaments: generated once, not per render or animation frame.
// These are identity artwork, never a waveform or a measure of model activity.
const FILAMENTS = Array.from({ length: 18 }, (_, strand) => {
  const phase = strand * Math.PI / 9;
  return Array.from({ length: 129 }, (_, point) => {
    const angle = point / 128 * Math.PI * 2;
    const radius = 30 + 5 * Math.sin(angle * 3 + phase);
    const x = 50 + radius * Math.cos(angle) * Math.cos(phase) - 9 * Math.sin(angle * 2 + phase);
    const y = 50 + radius * Math.sin(angle);
    return `${point ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ') + ' Z';
});
const PARTICLES = Array.from({ length: 42 }, (_, index) => {
  const angle = index * 2.399963;
  const radius = 19 + (index % 9) * 3.1;
  return { x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius };
});

export function MorpheusSignal({ state, className, label, compact = false }: MorpheusSignalProps) {
  const gradientId = useId().replaceAll(':', '');

  return (
    <div
      data-testid="morpheus-signal"
      data-signal-state={state}
      className={cn('morpheus-signal relative isolate', compact && 'morpheus-signal-compact', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.04" />
            <stop offset="0.5" stopColor="currentColor" stopOpacity="0.92" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0.04" />
          </linearGradient>
          <radialGradient id={`${gradientId}-core`} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="white" stopOpacity="0.98" />
            <stop offset="0.22" stopColor="currentColor" stopOpacity="0.92" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>
        {!compact ? <g className="morpheus-signal-filaments" fill="none" stroke={`url(#${gradientId})`} strokeWidth="0.16">
          {FILAMENTS.map((path, index) => <path key={index} d={path} opacity={0.24 + (index % 4) * 0.13} />)}
        </g> : null}
        {!compact ? <g className="morpheus-signal-particles" fill="currentColor">
          {PARTICLES.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={index % 5 ? 0.14 : 0.28} opacity={0.2 + index % 4 * 0.15} />)}
        </g> : null}
        <circle className="morpheus-signal-atmosphere" cx="50" cy="50" r="46" fill="none" stroke="currentColor" />
        <g className="morpheus-signal-orbits" fill="none" stroke={`url(#${gradientId})`}>
          <ellipse cx="50" cy="50" rx="42" ry="17" />
          <ellipse cx="50" cy="50" rx="42" ry="17" transform="rotate(60 50 50)" />
          <ellipse cx="50" cy="50" rx="42" ry="17" transform="rotate(120 50 50)" />
        </g>
        <g className="morpheus-signal-rings" fill="none" stroke="currentColor">
          <circle cx="50" cy="50" r="36" />
          <circle cx="50" cy="50" r="27" />
          <circle cx="50" cy="50" r="17" />
        </g>
        <g className="morpheus-signal-traces">
          {TRACE_X.map((x, index) => (
            <path
              key={x}
              d={`M ${x} 9 C ${x - 13 + index} 30, ${100 - x + index} 70, ${x} 91`}
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth={index === 4 ? 0.9 : 0.38}
              vectorEffect="non-scaling-stroke"
              style={{ animationDelay: `${index * 72}ms` }}
            />
          ))}
        </g>
        <g className="morpheus-signal-wave" fill="none" stroke="currentColor">
          <path d="M 4 50 C 13 50, 15 47, 20 50 S 28 54, 33 50 S 42 43, 47 50 S 55 59, 61 50 S 70 46, 75 50 S 86 51, 96 50" />
        </g>
        <path
          className="morpheus-signal-mark"
          d="M 41 57 L 41 42 L 50 52 L 59 42 L 59 57 M 44 57 L 44 49 L 50 55 L 56 49 L 56 57"
          fill="none"
          stroke="currentColor"
          strokeLinecap="square"
          strokeLinejoin="miter"
          vectorEffect="non-scaling-stroke"
        />
        <circle className="morpheus-signal-core" cx="50" cy="50" r="11" fill={`url(#${gradientId}-core)`} />
        <circle className="morpheus-signal-core-point" cx="50" cy="50" r="1.1" fill="white" />
        <path className="morpheus-signal-horizon" d="M 5 50 L 95 50" stroke="currentColor" fill="none" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="morpheus-signal-aperture" aria-hidden />
      <span className="morpheus-signal-halo" aria-hidden />
    </div>
  );
}
