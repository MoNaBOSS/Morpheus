import type {
  MediaAccessPermissionRequest,
  PermissionCheckHandlerHandlerDetails,
  Session,
  WebContents,
} from 'electron';

type PermissionSession = Pick<Session, 'setPermissionCheckHandler' | 'setPermissionRequestHandler'>;

function isTrustedContents(
  contents: WebContents | null,
  getMainWebContents: () => WebContents | null,
): contents is WebContents {
  const mainContents = getMainWebContents();
  return Boolean(contents && mainContents && contents === mainContents && !mainContents.isDestroyed());
}

function isAudioOnlyRequest(details: MediaAccessPermissionRequest): boolean {
  return Array.isArray(details.mediaTypes)
    && details.mediaTypes.length > 0
    && details.mediaTypes.every((type) => type === 'audio');
}

function isAudioCheck(details: PermissionCheckHandlerHandlerDetails): boolean {
  return details.mediaType === 'audio';
}

function isTrustedApplicationPermission(
  contents: WebContents | null,
  permission: string,
  getMainWebContents: () => WebContents | null,
): boolean {
  return permission === 'clipboard-sanitized-write'
    && isTrustedContents(contents, getMainWebContents);
}

/**
 * The default session is shared by the application shell, so install one
 * explicit policy: only the live Morpheus window may request microphone audio
 * or perform a sanitized clipboard write. Clipboard reads remain Main-owned;
 * video, display capture, embedded guests and every unrelated permission are
 * denied. The isolated browser guest session has its own deny-all policy.
 */
export function installMorpheusMediaPermissionPolicy(options: {
  targetSession: PermissionSession;
  getMainWebContents: () => WebContents | null;
}): void {
  options.targetSession.setPermissionCheckHandler((contents, permission, _origin, details) => (
    isTrustedApplicationPermission(contents, permission, options.getMainWebContents)
    || (
      permission === 'media'
      && isTrustedContents(contents, options.getMainWebContents)
      && isAudioCheck(details)
    )
  ));

  options.targetSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(
      isTrustedApplicationPermission(contents, permission, options.getMainWebContents)
      || (
        permission === 'media'
        && isTrustedContents(contents, options.getMainWebContents)
        && isAudioOnlyRequest(details as MediaAccessPermissionRequest)
      ),
    );
  });
}
