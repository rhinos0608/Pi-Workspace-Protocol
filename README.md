# Pi Workspace Protocol

Versioned, serializable TypeScript contracts, runtime validators, canonical SHA-256/ID helpers, and a small event-bus RPC layer for the Pi SmartRead/SmartEdit inspect+patch protocol.

- No Pi imports. No filesystem singletons. No `import fs` at module top.
- Schema version `1`; bumping is a non-breaking change for envelopes when a consumer trusts `schemaVersion`.
- Distributable as `@rhinos0608/pi-workspace-protocol`.

## Install

```json
{
  "dependencies": {
    "@rhinos0608/pi-workspace-protocol": "github:rhinos0608/Pi-Workspace-Protocol#v0.1.0"
  }
}
```

## Layout

- `types.ts` — All versioned types (envelope, evidence, patch request, event messages).
- `ids.ts` — Canonical SHA-256 helpers and ID derivation (resourceId, inspectionId, sessionId).
- `contract.ts` — Runtime validators and JSON codecs.
- `rpc.ts` — Request/reply RPC with correlation, timeout, cancellation, and cleanup.

## Build

```
npm install
npm run typecheck
npm test
```
