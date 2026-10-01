# Phase 7 D1 source worker checkpoint

Implemented the Main-owned `web.readPage` worker through the existing Core plan
permission, checkpoint, audit and artifact path. The action accepts one URL;
Main authors objective/attempt/plan/step/worker identifiers, cancellation
generation, exact origin/service/tool scope, 30-second deadline (maximum 60),
four retrieval/redirect steps, 512 KiB body and 32 KiB extracted context limits.
Provider route is local public HTTPS, with measured zero inference tokens/cost.
There is no model or tool-enabled agent turn inside this adapter.

The HTTPS adapter resolves and validates public addresses before every connection
and pins the chosen address through the actual Node HTTPS lookup callback while
retaining hostname/SNI and certificate verification. Mixed public/private DNS
answers, private/special/transition addresses, cross-origin redirects, insecure
protocols, credentials, unusual ports, binary downloads, attachments, encoded
responses and oversized bodies are rejected. It never imports personal cookies,
authorization headers, proxy configuration, browser profiles or provider secrets.
Remote markup is parsed as bounded text and never executes. Unsupported text
encodings are reported rather than silently misdecoded.

An actual retrieved source observation contains original/final URL, title,
retrieval time, body-text excerpt/location, digest, body size and truncation.
It is retained as a `report` artifact with `sourceType: public-https`, preserving
the current artifact contract. Audit/checkpoint metadata omit excerpts and query
strings. These observations are inputs to D3 cited answers/reports; source
retrieval alone does not implement that entire workflow or browser DOM actions.

One heavy worker slot is independent of native execution slots and rate counters.
Mixed worker/native plans retain workspace dependencies and acquire desktop
leases only during each native step. Queued cancellation never launches a worker;
owned requests/deadlines abort, stale progress is ignored and leases release only
after settlement. The plan executor records in-flight worker cancellation as
cancelled, preserving already-completed native results.

Worker checkpoints persist admission/outcome metadata before projection. Unknown
effect or usage stays `needs-review` and blocks this task's automatic continuation,
including after restart. Only the read-only, local, known-zero source route is
eligible for safe read replay. Custom profile restrictions are preserved;
fresh built-in profiles include this capability.

## Evidence

- 122 focused tests passed across worker adapter/port/runtime, coordinator,
  runtime plan/action regression, registry and isolation suites.
- Three production HTTPS transport fixtures additionally passed: actual pinned
  lookup callback/SNI/no inherited credentials, enforced body cap and no implicit
  cross-origin redirect follow. No real external/provider requests used.
- Node typecheck passed before concurrent E1 registration. Later combined check
  requires E1 capability descriptions being added by its owner.
- Narrow task spec structural validation passed. Its diff-aware validation and
  dry-run are deferred to the combined checkpoint: simultaneous C4/E1/G2 edits
  deliberately lie outside this narrow task's ownership.
- No build, Electron journey, installer, physical device or live public-web
  acceptance performed for D1 in this pass. Root owns combined communications,
  fresh-build E2E and package acceptance.

Next: D2 task-owned browser DOM interaction with enforced egress and verified
effects; D3 source-grounded research and saved reports. Do not label public text
retrieval as completed DOM browsing or claim generated prose proves execution.
