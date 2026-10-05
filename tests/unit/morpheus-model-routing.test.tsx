import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderAccount } from '@/lib/providers';
import type { MorpheusPlannerRoutingPolicy } from '@shared/morpheus/planner-routing';

const mocks = vi.hoisted(() => ({ getAll: vi.fn(), set: vi.fn(), accounts: vi.fn(), getDefaultAccount: vi.fn() }));
vi.mock('@/lib/host-api', () => ({ hostApi: { settings: { getAll: mocks.getAll, set: mocks.set }, providers: { accounts: mocks.accounts, getDefaultAccount: mocks.getDefaultAccount } } }));
vi.mock('@/stores/providers', () => ({ useProviderStore: (selector: (state: unknown) => unknown) => selector({ defaultAccountId: null, accounts: [] }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, values?: Record<string, unknown>) => values ? `${key} ${JSON.stringify(values)}` : key }) }));

import { MorpheusModelRouting } from '@/components/morpheus/MorpheusModelRouting';

const ACCOUNT: ProviderAccount = { id: 'personal-router', vendorId: 'openrouter', label: 'Personal connection',
  authMode: 'api_key', enabled: true, isDefault: true, model: 'saved/model', fallbackModels: ['configured/strong'], createdAt: 'fixture', updatedAt: 'fixture' };
let policy: MorpheusPlannerRoutingPolicy;
let accounts: ProviderAccount[];
let defaultId: string | null;

beforeEach(() => {
  vi.clearAllMocks();
  policy = { mode: 'adaptive', routes: { 'other-account': { strongModelId: 'other/strong' } } };
  accounts = [{ ...ACCOUNT }];
  defaultId = ACCOUNT.id;
  mocks.getAll.mockImplementation(async () => ({ morpheusPlannerRouting: structuredClone(policy) }));
  mocks.accounts.mockImplementation(async () => structuredClone(accounts));
  mocks.getDefaultAccount.mockImplementation(async () => ({ accountId: defaultId }));
  mocks.set.mockImplementation(async (_key, next) => { policy = structuredClone(next); });
});

async function ready() {
  await waitFor(() => expect(screen.getByTestId('morpheus-routing-adaptive')).toBeEnabled());
}
const field = (role: 'efficientModelId' | 'strongModelId') => screen.getByTestId(`morpheus-routing-${role}`);

describe('connected task model routing', () => {
  it('uses saved-model defaults without provider calls or account mutations', async () => {
    render(<MorpheusModelRouting/>);
    await ready();
    expect(screen.getByTestId('morpheus-routing-adaptive')).toHaveAttribute('aria-pressed', 'true');
    expect(field('efficientModelId')).toHaveValue('');
    expect(field('strongModelId')).toHaveValue('');
    expect(screen.getByTestId('morpheus-routing-account')).toHaveTextContent('saved/model');
    expect(screen.getByTestId('morpheus-routing-options')).not.toHaveAttribute('open');
    expect(screen.getByTestId('morpheus-routing-save')).toBeDisabled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('saves explicit custom same-account roles and retains latest other-account preferences', async () => {
    render(<MorpheusModelRouting/>);
    await ready();
    fireEvent.change(field('efficientModelId'), { target: { value: ' economical/new-model ' } });
    fireEvent.change(field('strongModelId'), { target: { value: 'strong/new-model' } });
    policy.routes['other-account'] = { efficientModelId: 'other/new-economy', strongModelId: 'other/new-strong' };
    fireEvent.click(screen.getByTestId('morpheus-routing-save'));
    await waitFor(() => expect(mocks.set).toHaveBeenCalledExactlyOnceWith('morpheusPlannerRouting', {
      mode: 'adaptive', routes: { 'personal-router': { efficientModelId: 'economical/new-model', strongModelId: 'strong/new-model' },
        'other-account': { efficientModelId: 'other/new-economy', strongModelId: 'other/new-strong' } },
    }));
    await waitFor(() => expect(screen.getByTestId('morpheus-routing-feedback')).toHaveTextContent('morpheus.modelRouting.saved'));
    expect(accounts).toEqual([ACCOUNT]);
    expect(defaultId).toBe(ACCOUNT.id);
  });

  it('rejects stale drafts when the default account changes before Save', async () => {
    render(<MorpheusModelRouting/>);
    await ready();
    fireEvent.change(field('strongModelId'), { target: { value: 'old-account/strong' } });
    accounts = [...accounts, { ...ACCOUNT, id: 'new-account', label: 'New connection', model: 'new/saved', isDefault: true }];
    defaultId = 'new-account';
    fireEvent.click(screen.getByTestId('morpheus-routing-save'));
    await waitFor(() => expect(screen.getByTestId('morpheus-routing-feedback')).toHaveTextContent('morpheus.modelRouting.changed'));
    expect(mocks.set).not.toHaveBeenCalled();
    expect(field('strongModelId')).toHaveValue('');
    expect(screen.getByTestId('morpheus-routing-account')).toHaveTextContent('new/saved');
  });

  it('rejects a stale same-account endpoint/model revision and an intervening role edit', async () => {
    render(<MorpheusModelRouting/>);
    await ready();
    fireEvent.change(field('strongModelId'), { target: { value: 'requested/strong' } });
    accounts = [{ ...ACCOUNT, model: 'updated/saved', baseUrl: 'https://fixture.invalid', updatedAt: 'new-revision' }];
    fireEvent.click(screen.getByTestId('morpheus-routing-save'));
    await waitFor(() => expect(screen.getByTestId('morpheus-routing-feedback')).toHaveTextContent('morpheus.modelRouting.changed'));
    expect(mocks.set).not.toHaveBeenCalled();
    fireEvent.change(field('strongModelId'), { target: { value: 'requested/strong' } });
    policy.routes[ACCOUNT.id] = { strongModelId: 'other-editor/strong' };
    fireEvent.click(screen.getByTestId('morpheus-routing-save'));
    await waitFor(() => expect(field('strongModelId')).toHaveValue('other-editor/strong'));
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('refreshes account changes on focus without erasing same-connection drafts', async () => {
    render(<MorpheusModelRouting/>);
    await ready();
    fireEvent.change(field('strongModelId'), { target: { value: 'unsaved/strong' } });
    fireEvent(window, new Event('focus'));
    await waitFor(() => expect(mocks.getAll).toHaveBeenCalledTimes(2));
    await ready();
    expect(field('strongModelId')).toHaveValue('unsaved/strong');
    defaultId = null;
    fireEvent(window, new Event('focus'));
    await waitFor(() => expect(field('strongModelId')).toBeDisabled());
    expect(field('strongModelId')).toHaveValue('');
    expect(screen.getByTestId('morpheus-routing-account')).toHaveTextContent('morpheus.modelRouting.noAccount');
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('fixed mode retains optional roles but disables them and makes no account change', async () => {
    policy.routes[ACCOUNT.id] = { strongModelId: 'retained/strong' };
    render(<MorpheusModelRouting/>);
    await ready();
    fireEvent.click(screen.getByTestId('morpheus-routing-fixed'));
    expect(field('strongModelId')).toBeDisabled();
    fireEvent.click(screen.getByTestId('morpheus-routing-save'));
    await waitFor(() => expect(mocks.set).toHaveBeenCalledOnce());
    expect(policy.mode).toBe('fixed');
    expect(policy.routes[ACCOUNT.id]).toEqual({ strongModelId: 'retained/strong' });
  });

  it('keeps an in-flight save bound to its account and refreshes a subsequent default change', async () => {
    let finish!: () => void;
    mocks.set.mockImplementation(async (_key, next) => {
      policy = structuredClone(next);
      await new Promise<void>((resolve) => { finish = resolve; });
    });
    render(<MorpheusModelRouting/>);
    await ready();
    fireEvent.change(field('strongModelId'), { target: { value: 'first/approved-strong' } });
    fireEvent.click(screen.getByTestId('morpheus-routing-save'));
    await waitFor(() => expect(mocks.set).toHaveBeenCalledOnce());
    accounts.push({ ...ACCOUNT, id: 'other-account', label: 'Other', model: 'other/saved', isDefault: true });
    defaultId = 'other-account';
    fireEvent(window, new Event('focus'));
    await act(async () => { finish(); });
    await waitFor(() => expect(screen.getByTestId('morpheus-routing-account')).toHaveTextContent('other/saved'));
    expect(screen.getByTestId('morpheus-routing-feedback')).toHaveTextContent('morpheus.modelRouting.changed');
    expect(field('strongModelId')).toHaveValue('other/strong');
    expect(policy.routes[ACCOUNT.id]).toEqual({ strongModelId: 'first/approved-strong' });
    expect(policy.routes['other-account']).toEqual({ strongModelId: 'other/strong' });
    expect(mocks.set).toHaveBeenCalledOnce();
  });

  it('rejects malformed model IDs before writing and clears an optional choice back to saved model', async () => {
    policy.routes[ACCOUNT.id] = { strongModelId: 'old/strong' };
    render(<MorpheusModelRouting/>);
    await ready();
    fireEvent.change(field('strongModelId'), { target: { value: 'invalid model name' } });
    fireEvent.click(screen.getByTestId('morpheus-routing-save'));
    await waitFor(() => expect(screen.getByTestId('morpheus-routing-feedback')).toHaveTextContent('morpheus.modelRouting.invalidModel'));
    expect(mocks.set).not.toHaveBeenCalled();
    fireEvent.change(field('strongModelId'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('morpheus-routing-save'));
    await waitFor(() => expect(mocks.set).toHaveBeenCalledOnce());
    expect(policy.routes[ACCOUNT.id]).toBeUndefined();
    expect(policy.routes['other-account']).toEqual({ strongModelId: 'other/strong' });
  });

  it('shows sanitized load/save failures and supports retry without losing the unsaved draft', async () => {
    mocks.getAll.mockRejectedValueOnce(new Error('fixture-sensitive-error'));
    render(<MorpheusModelRouting/>);
    await waitFor(() => expect(screen.getByTestId('morpheus-routing-feedback')).toHaveTextContent('morpheus.modelRouting.loadError'));
    expect(document.body.textContent).not.toContain('fixture-sensitive-error');
    expect(screen.getByTestId('morpheus-routing-save')).toBeDisabled();
    fireEvent.click(screen.getByTestId('morpheus-routing-refresh'));
    await ready();
    fireEvent.change(field('strongModelId'), { target: { value: 'retry/strong' } });
    mocks.set.mockRejectedValueOnce(new Error('fixture-sensitive-save'));
    fireEvent.click(screen.getByTestId('morpheus-routing-save'));
    await waitFor(() => expect(screen.getByTestId('morpheus-routing-feedback')).toHaveTextContent('morpheus.modelRouting.saveError'));
    expect(field('strongModelId')).toHaveValue('retry/strong');
    expect(document.body.textContent).not.toContain('fixture-sensitive-save');
    fireEvent.click(screen.getByTestId('morpheus-routing-save'));
    await waitFor(() => expect(screen.getByTestId('morpheus-routing-feedback')).toHaveTextContent('morpheus.modelRouting.saved'));
  });

  it('does not commit a pending preflight after leaving the component', async () => {
    const rendered = render(<MorpheusModelRouting/>);
    await ready();
    fireEvent.change(field('strongModelId'), { target: { value: 'abandoned/strong' } });
    let finish!: (value: unknown) => void;
    mocks.getAll.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    fireEvent.click(screen.getByTestId('morpheus-routing-save'));
    rendered.unmount();
    await act(async () => { finish({ morpheusPlannerRouting: policy }); });
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
