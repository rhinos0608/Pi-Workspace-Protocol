# Pi Workspace Protocol

Versioned, serializable TypeScript contracts, runtime validators, canonical SHA-256/ID helpers, and a small event-bus RPC layer for the Pi SmartRead/SmartEdit inspect+patch protocol.

- No Pi imports. No filesystem singletons. No `import fs` at module top.
- Schema version `3`; any bump is a **breaking change** — validators require exact `schemaVersion` equality (`src/contract.ts`), so both consumers must update in lockstep.
- Distributable as `@rhinos0608/pi-workspace-protocol`.

## Install

```json
{
  "dependencies": {
    "@rhinos0608/pi-workspace-protocol": "github:rhinos0608/Pi-Workspace-Protocol#v0.4.0"
  }
}
```

## Layout

- `src/index.ts` — Package entry; re-exports all public API.
- `src/types.ts` — All versioned types (envelope, evidence, patch request, event messages).
- `src/ids.ts` — Canonical SHA-256 helpers and ID derivation (resourceId, inspectionId, sessionId).
- `src/contract.ts` — Runtime validators and JSON codecs.
- `src/rpc.ts` — Request/reply RPC with correlation, timeout, cancellation, and cleanup.
- `src/language-intelligence.ts` — Additive language-intelligence channel (post-edit LSP diagnostics); types and validators. Channel `pi.workspace.language_intelligence.rpc` with methods `language_intelligence_capabilities` and `check_post_edit_diagnostics`.
- `test/` — Node test runner tests for all modules.

## Build

```
npm install
npm run typecheck
npm test
```
