---
id: renderer-main-boundary
title: Renderer Main Boundary
type: ai-coding-rule
appliesTo:
  - gateway-backend-communication
---

Renderer pages and components use the existing host API and API client modules as their only backend entrypoints. Main-process IPC details stay behind those modules.

The Main process binds privileged host invocation to the active application
renderer. It validates capability-specific payloads and keeps secrets, native
paths, executable selection, Gateway authority, permission grants and audit
persistence out of Renderer control. Generic IPC compatibility routes must be
narrowly allowlisted and may not return plaintext provider credentials or grant
arbitrary filesystem, shell, URL-protocol or Gateway RPC access.
