import { closeElectronApp, expect, getStableWindow, installIpcMocks, test } from './fixtures/electron';

const signedOut = { configured: true, signedIn: false, authState: 'idle', access: { state: 'signed-out', account: null } };
const key = (action: string, payload: unknown = null) => JSON.stringify(['managedAccount', action, payload]);

test.describe('Morpheus managed account', () => {
  test('real Main reports missing configuration without offering a fake trial', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await page.getByTestId('sidebar-nav-settings').click();
      const section = page.getByTestId('morpheus-managed-account');
      await expect(section.getByTestId('managed-account-unconfigured')).toBeVisible();
      await expect(section.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0);
      await expect(section).toContainText('your own AI providers');
    } finally { await closeElectronApp(app); }
  });

  test('email sign-in, allowance and sign-out use the host boundary', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      await installIpcMocks(app, { hostApi: { [key('status')]: signedOut } });
      const page = await getStableWindow(app);
      await page.getByTestId('sidebar-nav-settings').click();
      const section = page.getByTestId('morpheus-managed-account');
      await section.getByLabel('Email address').fill('person@example.test');
      await installIpcMocks(app, { hostApi: {
        [key('status')]: { ...signedOut, authState: 'email-code' },
        [key('requestEmailCode', { email: 'person@example.test' })]: { success: true },
      } });
      await section.getByRole('button', { name: 'Send a sign-in code' }).click();
      await section.getByLabel('Email verification code').fill('123456');
      await installIpcMocks(app, { hostApi: {
        [key('verifyEmailCode', { code: '123456' })]: { success: true },
        [key('status')]: { configured: true, signedIn: true, authState: 'signed-in', access: { state: 'ready', account: {
          accountId: 'fixture-account', tier: 'trial', enabled: true, expiresAt: Date.now() + 60000,
          features: ['planning'], allowance: { currency: 'USD', unit: 'micro-usd', granted: 1000000, spent: 100000, reserved: 200000, available: 700000 }, billing: 'not-configured',
        } } },
      } });
      await section.getByRole('button', { name: 'Verify code' }).click();
      await expect(section.getByTestId('managed-account-allowance')).toContainText('$0.70');
      await expect(section).toContainText('Paid plans are not available yet');
      await installIpcMocks(app, { hostApi: { [key('status')]: signedOut, [key('signOut')]: { success: true } } });
      await section.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(section.getByLabel('Email address')).toBeVisible();
    } finally { await closeElectronApp(app); }
  });

  test('browser sign-in can be cancelled and errors remain actionable', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      await installIpcMocks(app, { hostApi: { [key('status')]: signedOut } });
      const page = await getStableWindow(app);
      await page.getByTestId('sidebar-nav-settings').click();
      const section = page.getByTestId('morpheus-managed-account');
      await expect(section.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
      await installIpcMocks(app, { hostApi: { [key('status')]: { ...signedOut, authState: 'browser' }, [key('googleSignIn')]: { success: true } } });
      await section.getByRole('button', { name: 'Continue with Google' }).click();
      await expect(section).toContainText('Finish signing in in your browser');
      await installIpcMocks(app, { hostApi: { [key('status')]: signedOut, [key('cancelSignIn')]: signedOut } });
      await section.getByRole('button', { name: 'Cancel sign-in' }).click();
      await expect(section.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
      await installIpcMocks(app, { hostApi: { [key('status')]: signedOut, [key('googleSignIn')]: { success: false, error: 'auth-failed' } } });
      await section.getByRole('button', { name: 'Continue with Google' }).click();
      await expect(section.getByRole('alert')).toContainText('Could not complete');
    } finally { await closeElectronApp(app); }
  });
});
