/**
 * Permission Center.
 *
 * Renders the active profile, live grants and denials with revoke controls.
 * Everything shown is read from the Main-owned policy store; the renderer can
 * request changes but never writes a grant itself.
 *
 * `compact` renders the Command Center summary; the full form lives in Settings.
 */
import { useTranslation } from 'react-i18next';
import { ShieldAlert, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { PERMISSION_PROFILES, type PermissionGrant, type PermissionProfile } from '@shared/morpheus/permission-types';

type PermissionCenterProps = {
  compact?: boolean;
};

function GrantRow({ grant, onRevoke }: { grant: PermissionGrant; onRevoke: (id: string) => void }) {
  const { t } = useTranslation('dashboard');
  return (
    <li
      data-testid="morpheus-grant-row"
      data-grant-type={grant.grantType}
      className="flex items-center justify-between gap-2 rounded-md border bg-surface-modal px-2.5 py-1.5"
    >
      <div className="min-w-0">
        <p className="truncate text-2xs font-medium">
          {grant.capabilityId}
          <span className="text-muted-foreground"> · {grant.resourceScope}</span>
        </p>
        <p className="text-2xs text-muted-foreground">
          {t(`morpheus.permission.grantTypes.${grant.grantType}`)}
          {grant.lastUsedAt ? ` · ${t('morpheus.permission.lastUsed', {
            time: new Date(grant.lastUsedAt).toLocaleTimeString(),
          })}` : ''}
        </p>
      </div>
      <Button
        size="sm"
        variant="ghost"
        data-testid="morpheus-grant-revoke"
        aria-label={t('morpheus.permission.revoke')}
        onClick={() => onRevoke(grant.grantId)}
        className="h-7 shrink-0 px-2"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </Button>
    </li>
  );
}

export function PermissionCenter({ compact = false }: PermissionCenterProps) {
  const { t } = useTranslation('dashboard');
  const permission = useMorpheusCommandStore((state) => state.permission);
  const setProfile = useMorpheusCommandStore((state) => state.setProfile);
  const revokeGrant = useMorpheusCommandStore((state) => state.revokeGrant);
  const revokeAllSession = useMorpheusCommandStore((state) => state.revokeAllSession);
  const resetPolicy = useMorpheusCommandStore((state) => state.resetPolicy);

  if (!permission) {
    return (
      <p data-testid="morpheus-permission-center" className="text-tiny text-muted-foreground">
        {t('morpheus.permission.loading')}
      </p>
    );
  }

  const handleRevoke = (grantId: string) => void revokeGrant(grantId);

  return (
    <div
      data-testid="morpheus-permission-center"
      className={compact ? 'flex flex-col gap-2' : 'flex flex-col gap-3'}
    >
      {permission.auditDegraded ? (
        <div
          data-testid="morpheus-permission-degraded"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <p className="text-2xs">{t('morpheus.permission.degradedExplanation')}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('morpheus.permission.profileLabel')}>
        {PERMISSION_PROFILES.map((profile: PermissionProfile) => (
          <Button
            key={profile}
            size="sm"
            data-testid={`morpheus-profile-${profile}`}
            data-active={permission.profile === profile ? 'true' : 'false'}
            variant={permission.profile === profile ? 'default' : 'outline'}
            onClick={() => void setProfile(profile)}
            className="h-7"
          >
            {t(`morpheus.permission.profiles.${profile}.name`)}
          </Button>
        ))}
      </div>

      <p className="text-2xs text-muted-foreground">
        {t(`morpheus.permission.profiles.${permission.profile}.description`)}
      </p>

      <div className="flex flex-wrap items-center gap-2 text-2xs">
        <Badge variant="secondary" data-testid="morpheus-session-grant-count">
          {t('morpheus.permission.sessionCount', { count: permission.sessionGrants.length })}
        </Badge>
        <Badge variant="secondary" data-testid="morpheus-persistent-grant-count">
          {t('morpheus.permission.persistentCount', { count: permission.persistentGrants.length })}
        </Badge>
        {permission.deniedScopes.length > 0 ? (
          <Badge variant="destructive" data-testid="morpheus-denied-count">
            {t('morpheus.permission.deniedCount', { count: permission.deniedScopes.length })}
          </Badge>
        ) : null}
      </div>

      {!compact ? (
        <>
          {[
            { key: 'session', grants: permission.sessionGrants },
            { key: 'persistent', grants: permission.persistentGrants },
            { key: 'denied', grants: permission.deniedScopes },
          ].map(({ key, grants }) => (
            grants.length > 0 ? (
              <section key={key} className="flex flex-col gap-1.5">
                <h3 className="text-2xs uppercase tracking-wide text-muted-foreground">
                  {t(`morpheus.permission.sections.${key}`)}
                </h3>
                <ul className="flex flex-col gap-1">
                  {grants.map((grant) => (
                    <GrantRow key={grant.grantId} grant={grant} onRevoke={handleRevoke} />
                  ))}
                </ul>
              </section>
            ) : null
          ))}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              data-testid="morpheus-revoke-all-session"
              onClick={() => void revokeAllSession()}
              className="h-7"
            >
              {t('morpheus.permission.revokeAllSession')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              data-testid="morpheus-reset-policy"
              onClick={() => void resetPolicy()}
              className="h-7"
            >
              {t('morpheus.permission.resetPolicy')}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
