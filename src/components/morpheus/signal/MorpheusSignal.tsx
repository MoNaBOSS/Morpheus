import { useId } from 'react';

import { cn } from '@/lib/utils';
import type { MorpheusSignalState } from './signal-state';

type MorpheusSignalProps = {
  state: MorpheusSignalState;
  className?: string;
  label?: string;
  compact?: boolean;
};

const TRACE_X = [10, 18, 27, 38, 50, 62, 73, 82, 90] as const;

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
      <svg viewBox="0 0 100 100" className="h-full w-full" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.18" />
            <stop offset="0.52" stopColor="currentColor" stopOpacity="0.95" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0.22" />
          </linearGradient>
        </defs>
        <g className="morpheus-signal-traces">
          {TRACE_X.map((x, index) => (
            <path
              key={x}
              d={`M ${x} 12 C ${x - 8 + index} 31, ${100 - x + index} 66, ${x} 88`}
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth={index === 4 ? 1.2 : 0.55}
              vectorEffect="non-scaling-stroke"
              style={{ animationDelay: `${index * 72}ms` }}
            />
          ))}
        </g>
        <path
          className="morpheus-signal-mark"
          d="M 21 73 L 21 28 L 50 58 L 79 28 L 79 73 M 29 73 L 29 47 L 50 68 L 71 47 L 71 73"
          fill="none"
          stroke="currentColor"
          strokeLinecap="square"
          strokeLinejoin="miter"
          vectorEffect="non-scaling-stroke"
        />
        <path className="morpheus-signal-horizon" d="M 5 79 L 95 79" stroke="currentColor" fill="none" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="morpheus-signal-aperture" aria-hidden />
    </div>
  );
}
