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
