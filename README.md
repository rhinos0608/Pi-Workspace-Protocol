# Pi Workspace Protocol

Versioned, serializable TypeScript contracts, runtime validators, canonical SHA-256/ID helpers, and a small event-bus RPC layer for the Pi SmartRead/SmartEdit workspace mutation protocol and language intelligence runtime RPC.

- No Pi imports. No filesystem singletons. No `import fs` at module top.
- Distributable as `@rhinos0608/pi-workspace-protocol`.

## Overview

Versioned TypeScript contracts for the Pi SmartRead/SmartEdit workspace mutation protocol plus language intelligence runtime RPC. Provides envelope/evidence/mutation/event types, canonical ID derivation, runtime validators with JSON codecs, and a correlated request/reply RPC layer over an event-bus surface.

## Install

```json
{
  "dependencies": {
    "@rhinos0608/pi-workspace-protocol": "github:rhinos0608/Pi-Workspace-Protocol#v0.5.0"
  }
}
```

## Layout

- `src/index.ts` — Package entry; re-exports all public API.
- `src/types.ts` — All versioned types (envelope, evidence, mutation lifecycle, event messages, language intelligence DTOs).
- `src/ids.ts` — Canonical SHA-256 helpers and ID derivation (`sha256OfString`, `sha256OfBytes`, `sha256OfFileContents`, `resourceIdFor`, `inspectionIdFor`, `hashSessionFilePath`, `canonicalizeWorkspaceRoot`).
- `src/contract.ts` — Runtime validators and JSON codecs for all DTOs.
- `src/rpc.ts` — Request/reply RPC with correlation, timeout, cancellation (`createRpcServer`, `createRpcClient`, `BusLike`).
- `src/language-intelligence.ts` — Language intelligence channel types and validators (`CheckPostEditDiagnosticsRequest/Response`, `LanguageDiagnostic`, capabilities types).
- `test/` — Node test runner tests for all modules.

## RPC Channels

Two channels exported via `RPC_CHANNELS`:

- `inspectPatch` (`pi.workspace.inspect_patch.rpc`) — Workspace evidence and inspection RPC (original channel). Methods: `resolve_evidence`, `publish_inspection`, `invalidate`.
- `languageIntelligence` (`pi.workspace.language_intelligence.rpc`) — Language intelligence operations. Methods:
  - `language_intelligence_capabilities` — Check server capabilities.
  - `check_post_edit_diagnostics` — Post-edit LSP diagnostics.
  - `rename_preview` — Preview a symbol rename via LSP.
  - `organize_imports` — Preview organize-imports action.
  - `formatting` — Preview document formatting.
  - `code_action` — List code actions at a position.

Constants: `RPC_CHANNELS.inspectPatch`, `RPC_CHANNELS.languageIntelligence`, `LANGUAGE_INTELLIGENCE_RPC_METHODS` (maps `capabilities`, `checkPostEditDiagnostics`, `renamePreview`, `organizeImports`, `formatting`, `codeAction` to wire method strings).

## Language Intelligence DTOs

All types in `src/types.ts`; validators in `src/contract.ts` / `src/language-intelligence.ts`.

- `LspTextEdit` — `{ filePath: string, range: { start: { line, character }, end: { line, character } }, newText: string }`
- `LspWorkspaceEdit` — `{ fileEdits: { filePath: string, edits: LspTextEdit[] }[] }`
- `RenamePreviewRequest` — `{ filePath: string, line: number, character: number, newName: string }`
- `RenamePreviewResponse` — `{ ok: boolean, workspaceEdit?: LspWorkspaceEdit, error?: string, serverDescriptorId?: string }`
- `OrganizeImportsRequest` — `{ filePath: string }`
- `OrganizeImportsResponse` — `{ ok: boolean, workspaceEdit?: LspWorkspaceEdit, error?: string, serverDescriptorId?: string }`
- `FormattingRequest` — `{ filePath: string, tabSize?: number, insertSpaces?: boolean }`
- `FormattingResponse` — `{ ok: boolean, workspaceEdit?: LspWorkspaceEdit, error?: string, serverDescriptorId?: string }`
- `CodeActionRequest` — `{ filePath: string, line: number, character: number, endLine?: number, endCharacter?: number, diagnostics?: { range, code?, message }[], only?: string[] }`
- `CodeActionResponse` — `{ ok: boolean, actions?: CodeActionItem[], error?: string, serverDescriptorId?: string }`
- `CodeActionItem` — `{ title: string, kind?: string, workspaceEdit?: LspWorkspaceEdit, isPreferred?: boolean }`
- `LANGUAGE_INTELLIGENCE_RPC_METHODS` — constant mapping logical names to wire method strings.
- `RPC_CHANNELS.languageIntelligence` — channel string `pi.workspace.language_intelligence.rpc`.

Additional language-intelligence types in `src/language-intelligence.ts`: `LanguageIntelligenceCapabilitiesRequest` (`{}`), `LanguageIntelligenceCapabilitiesResponse` (`{ provider: "pi-smartread", capabilities: ("post-edit-diagnostics")[] }`), `CheckPostEditDiagnosticsRequest` (`{ canonicalPath, canonicalWorkspaceRoot, expectedContentSha256, waitMs 0..3000, maxDiagnostics 1..100 }`), `CheckPostEditDiagnosticsResponse` (discriminated union on `status`: `confirmed` | `empty` | `unavailable` | `degraded`), `LanguageDiagnostic` (`{ message, severity 1|2|3|4, range, source }`).

## Runtime Validators

`src/contract.ts` exports validators for every request/response DTO:

`validateInspectionEnvelope`, `validateEvidenceRef`, `validateMutationStatus`, `validateMutationDetails`, `validateEventMessage`, `encodeEventMessage`, `decodeEventMessage`, `validateRenamePreviewRequest/Response`, `validateOrganizeImportsRequest/Response`, `validateFormattingRequest/Response`, `validateCodeActionRequest/Response`.

`src/language-intelligence.ts` exports `validateLanguageDiagnostic`, `validateLanguageIntelligenceCapabilitiesRequest/Response`, `validateCheckPostEditDiagnosticsRequest/Response`.

All validators return `{ ok: true, value } | { ok: false, error }` and enforce required field shapes, hex/format constraints, and cross-field invariants.

## Schema Versioning

- Schema version `4` (`PROTOCOL_SCHEMA_VERSION = 4`); any bump is a **breaking change** — validators require exact `schemaVersion` equality (`src/contract.ts`), so both consumers must update in lockstep.
- Version `0.5.0` generalizes mutation lifecycle contracts and added the language intelligence channel and its DTOs additively (no schema bump needed).

## Build / Test

```
npm install
npm run typecheck
npm test
```

Build outputs to `dist/` via `tsc -p tsconfig.json`.

## License

MIT — see `LICENSE`.
