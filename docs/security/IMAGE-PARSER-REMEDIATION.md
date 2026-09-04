# Bundled image parser remediation

## Boundary and finding

`@larksuite/openclaw-lark/src/tools/oapi/drive/doc-media.js` reads an image and
calls `image-size`. Malformed ICNS entries or HEIF/JXL boxes in image-size 2.0.2
could fail to advance parsing, exhausting memory or blocking the gateway event
loop. The caller's try/catch cannot recover from a loop that never returns.

The original zero-length ICNS entry was reproduced in a separate Node process
with a 32 MiB heap limit: the child terminated with status 134. No malformed
input was passed into the running user gateway.

References: [ICNS advisory](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr),
[HEIF/JXL advisory](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq).
The registry has no corrected image-size version at the time of this change.

## Repository-owned fix

`patches/image-size@2.0.2.patch` is applied by pnpm's locked patched dependency
mechanism. It checks complete headers, requires positive bounded entry progress,
and interprets a legal ISO BMFF zero-length box as extending to EOF. Unsupported
undersized/extended headers cannot become non-progressing entries. All 18 copies
of the box helper and 12 ICNS implementations are covered, including CJS, ESM,
direct types, detector, lookup and fromFile bundles.

The ICNS bound uses the declared file size, not the number of loaded payload
bytes: fromFile intentionally reads at most 512 KiB. A complete header for a
legitimate larger image must continue to return its dimensions. This is a
dimension reader, not a complete image-integrity validator.

## Verification and audit policy

`pnpm run security:check` first runs an isolated, 64 MiB / 15-second parser probe.
It then audits **the entire dependency tree**, including development dependencies
that are later packaged into OpenClaw. It reports the two exact known advisories
as locally patched, not absent. Unknown advisories, another version, another
dependency path, missing patch, malformed/incomplete audit output and failed
regression probes fail the release gate. No global advisory-ignore list is used.

`scripts/security/verify-image-size-patch.mjs` checks malformed and legitimate
ICNS/HEIF/JXL, real PNG metadata, CJS/ESM/standalone handlers, file reads and a
600 KiB ICNS control. The dangerous regressions run in a disposable child with
bounded memory and time. It also accepts a package-root argument so the exact
parser copied into a Windows package can be verified after packaging.

The raw `pnpm audit` command will still show two high-severity advisories because
the upstream version remains 2.0.2. This is intentionally visible. Remove the
local patch and classification only when a verified upstream release replaces it.

Both plugin packaging paths stamp a Morpheus bundle revision derived from the
app version and lockfile (including the patch hash). Main's channel installation
and gateway prelaunch checks compare that revision, not just the unchanged
upstream plugin version. Thus previously installed managed mirrors receive the
updated dependency payload once, without reinstalling on every startup. Upstream
npm names/versions and OpenClaw configuration identity remain unchanged.

This remediation is not a claim that the whole dependency tree is vulnerability
free. It addresses these concrete loops and current published audit findings.

An independent read-only prepatch investigation confirmed the entry points and
the 512 KiB compatibility constraint. The separate postpatch reviewer service
was unavailable; the implementing engineer performed the fallback review and
expanded the executable controls to JP2, AVIF, multipart JXL, multi-image ICNS
and box-offset/EOF cases (142 assertions). Independent postpatch security review
is not claimed and remains advisable before public distribution.
