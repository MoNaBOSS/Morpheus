import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  EmptyState,
  KeyValue,
  MonoPath,
  Panel,
  PlanTimeline,
  RiskBadge,
  StatusDot,
  toneForStepStatus,
} from '@/components/morpheus/ui';
import type { MorpheusRiskTier } from '@shared/morpheus/actions/registry';
import type { ExecutionStepStatus } from '@shared/morpheus/execution-types';

const RISK_TIERS: MorpheusRiskTier[] = ['low', 'medium', 'high', 'critical'];

describe('accent discipline — green means live or verified, never risk', () => {
  it('no risk tier renders with the accent colour', () => {
    for (const tier of RISK_TIERS) {
      const { container, unmount } = render(<RiskBadge tier={tier} testId="badge" />);
      expect(container.innerHTML, `${tier} must not use the accent`).not.toContain('--morpheus-accent');
      unmount();
    }
  });

  it('escalates visually from low to critical', () => {
    const seen = RISK_TIERS.map((tier) => {
      const { container, unmount } = render(<RiskBadge tier={tier} />);
      const html = container.innerHTML;
      unmount();
      return html;
    });
    // low is neutral; medium warns; high and critical are danger.
    expect(seen[0]).toContain('text-muted-foreground');
    expect(seen[1]).toContain('--morpheus-warn');
    expect(seen[2]).toContain('--morpheus-danger');
    expect(seen[3]).toContain('--morpheus-danger');
  });

  it('exposes the tier as data so tests and E2E do not match on colour', () => {
    render(<RiskBadge tier="high" testId="badge" />);
    expect(screen.getByTestId('badge')).toHaveAttribute('data-risk', 'high');
  });
});

describe('status tone mapping', () => {
  it('treats skipped and cancelled as idle, not as errors', () => {
    // They never ran. Colouring them as failures would claim something broke.
    expect(toneForStepStatus('skipped')).toBe('idle');
    expect(toneForStepStatus('cancelled')).toBe('idle');
    expect(toneForStepStatus('pending')).toBe('idle');
  });

  it('maps genuine outcomes correctly', () => {
    expect(toneForStepStatus('running')).toBe('running');
    expect(toneForStepStatus('succeeded')).toBe('ok');
    expect(toneForStepStatus('failed')).toBe('error');
    expect(toneForStepStatus('denied')).toBe('error');
  });

  it('covers every declared status', () => {
    const all: ExecutionStepStatus[] = [
      'pending', 'running', 'succeeded', 'failed', 'skipped', 'denied', 'cancelled',
    ];
    for (const status of all) {
      expect(['running', 'ok', 'warn', 'error', 'idle']).toContain(toneForStepStatus(status));
    }
  });

  it('only a running dot animates', () => {
    const { container: running, unmount } = render(<StatusDot tone="running" />);
    expect(running.innerHTML).toContain('animate-pulse');
    unmount();

    for (const tone of ['ok', 'warn', 'error', 'idle'] as const) {
      const { container, unmount: close } = render(<StatusDot tone={tone} />);
      expect(container.innerHTML, `${tone} must be still`).not.toContain('animate-pulse');
      close();
    }
  });
});

describe('truthful empties', () => {
  it('PlanTimeline renders an honest message, not placeholder rows', () => {
    const { container } = render(<PlanTimeline steps={[]} emptyMessage="No steps yet" testId="tl" />);
    expect(screen.getByText('No steps yet')).toBeInTheDocument();
    // No <li> standing in for data that does not exist.
    expect(container.querySelectorAll('li')).toHaveLength(0);
  });

  it('EmptyState shows the message and optional hint', () => {
    render(<EmptyState message="No actions yet" hint="Run a command to begin" testId="empty" />);
    expect(screen.getByText('No actions yet')).toBeInTheDocument();
    expect(screen.getByText('Run a command to begin')).toBeInTheDocument();
  });
});

describe('PlanTimeline', () => {
  const steps = [
    { stepId: 'a', status: 'succeeded' as const, summary: 'Create notes.txt', durationMs: 12 },
    { stepId: 'b', status: 'failed' as const, summary: 'Launch editor', detail: 'disk full' },
    { stepId: 'c', status: 'skipped' as const, summary: 'Report', dependsOn: ['b'] },
  ];

  it('renders each step with its status as data', () => {
    render(<PlanTimeline steps={steps} emptyMessage="none" />);
    expect(screen.getByTestId('plan-step-a')).toHaveAttribute('data-status', 'succeeded');
    expect(screen.getByTestId('plan-step-b')).toHaveAttribute('data-status', 'failed');
    expect(screen.getByTestId('plan-step-c')).toHaveAttribute('data-status', 'skipped');
  });

  it('shows the real duration and failure detail rather than a generic message', () => {
    render(<PlanTimeline steps={steps} emptyMessage="none" />);
    expect(screen.getByText('12ms')).toBeInTheDocument();
    expect(screen.getByText('disk full')).toBeInTheDocument();
  });

  it('names the dependency a skipped step was waiting on', () => {
    render(<PlanTimeline steps={steps} emptyMessage="none" />);
    expect(screen.getByText('after b')).toBeInTheDocument();
  });

  it('preserves the given order', () => {
    const { container } = render(<PlanTimeline steps={steps} emptyMessage="none" />);
    const ids = [...container.querySelectorAll('li')].map((li) => li.getAttribute('data-testid'));
    expect(ids).toEqual(['plan-step-a', 'plan-step-b', 'plan-step-c']);
  });
});

describe('MonoPath', () => {
  it('keeps the full path available even when truncated', () => {
    // A truncated path the user cannot verify is worse than none: it looks
    // authoritative while hiding where the work actually went.
    const path = 'C:\\Users\\someone\\AppData\\Roaming\\Morpheus\\files\\report.txt';
    render(<MonoPath path={path} testId="p" />);
    const element = screen.getByTestId('p');
    expect(element).toHaveAttribute('title', path);
    expect(element).toHaveAttribute('data-full-path', path);
  });

  it('uses monospace, because it is machine truth', () => {
    render(<MonoPath path="C:\\x" testId="p" />);
    expect(screen.getByTestId('p').className).toContain('font-mono');
  });
});

describe('Panel', () => {
  it('renders children without requiring a title', () => {
    render(<Panel testId="panel"><span>content</span></Panel>);
    expect(screen.getByText('content')).toBeInTheDocument();
    expect(screen.getByTestId('panel').querySelector('header')).toBeNull();
  });

  it('renders title, description and actions when given', () => {
    render(
      <Panel title="Trust" description="Active grants" actions={<button type="button">Revoke</button>} testId="panel">
        <span>body</span>
      </Panel>,
    );
    expect(screen.getByText('Trust')).toBeInTheDocument();
    expect(screen.getByText('Active grants')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeInTheDocument();
  });

  it('sits on elevation 2 with a border and no shadow', () => {
    render(<Panel testId="panel"><span>x</span></Panel>);
    const className = screen.getByTestId('panel').className;
    expect(className).toContain('--morpheus-surface-2');
    expect(className).toContain('border');
    expect(className).not.toContain('shadow');
  });
});

describe('KeyValue', () => {
  it('renders the label and value', () => {
    render(<KeyValue label="Platform" value="win32" testId="kv" />);
    expect(screen.getByText('Platform')).toBeInTheDocument();
    expect(screen.getByText('win32')).toBeInTheDocument();
  });

  it('uses monospace only when asked', () => {
    const { rerender } = render(<KeyValue label="a" value="b" testId="kv" />);
    expect(screen.getByTestId('kv').innerHTML).not.toContain('font-mono');
    rerender(<KeyValue label="a" value="b" mono testId="kv" />);
    expect(screen.getByTestId('kv').innerHTML).toContain('font-mono');
  });
});
