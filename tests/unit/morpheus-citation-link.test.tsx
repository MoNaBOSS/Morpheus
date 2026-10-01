import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MorpheusCitationLink } from '@/components/common/MorpheusCitationLink';
import MarkdownPreview from '@/components/file-preview/MarkdownPreview';
import { hostApi } from '@/lib/host-api';

vi.mock('@/lib/host-api', () => ({ hostApi: { shell: { openExternal: vi.fn(async () => {}) } } }));
beforeEach(() => { vi.mocked(hostApi.shell.openExternal).mockReset(); });
it('opens a public citation only after an explicit click through the typed host route', async () => {
  render(<MorpheusCitationLink href="https://example.com/read">Source</MorpheusCitationLink>);
  expect(hostApi.shell.openExternal).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Source' }));
  await waitFor(() => expect(hostApi.shell.openExternal).toHaveBeenCalledWith('https://example.com/read'));
});
it.each(['file:///outside', 'javascript:alert(1)', 'https://127.0.0.1/', 'https://example.com/?token=secret'])('keeps unsafe citation inert: %s', (href) => {
  render(<MorpheusCitationLink href={href}>Source</MorpheusCitationLink>);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(hostApi.shell.openExternal).not.toHaveBeenCalled();
});
it('shows failure rather than an unhandled rejected open', async () => {
  vi.mocked(hostApi.shell.openExternal).mockRejectedValue(new Error('Unavailable'));
  render(<MorpheusCitationLink href="https://example.com">Source</MorpheusCitationLink>);
  fireEvent.click(screen.getByRole('button', { name: 'Source' }));
  await waitFor(() => expect(screen.getByRole('alert')).toBeVisible());
});
it('only enables citation buttons in explicitly opted-in saved previews', () => {
  const { rerender } = render(<MarkdownPreview source="[s1](<https://example.com>)" />);
  expect(screen.queryByTestId('report-citation-open')).not.toBeInTheDocument();
  rerender(<MarkdownPreview source="[s1](<https://example.com>)" allowPublicCitations />);
  expect(screen.getByTestId('report-citation-open')).toHaveTextContent('s1');
});
