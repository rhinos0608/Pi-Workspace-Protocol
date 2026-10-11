# Pi Workspace Protocol

Versioned, serializable TypeScript contracts, runtime validators, canonical SHA-256/ID helpers, and a small event-bus RPC layer for the Pi SmartRead/SmartEdit workspace mutation protocol and language intelligence runtime RPC.

- No Pi imports. No filesystem singletons. Only `canonicalizeWorkspaceRoot` performs filesystem I/O (`fs.realpathSync`); all other helpers are side-effect-free.
- Distributable as `@rhinos0608/pi-workspace-protocol`.

## Overview

Versioned TypeScript contracts for the Pi SmartRead/SmartEdit workspace mutation protocol plus language intelligence runtime RPC. Provides envelope/evidence/mutation/event types, canonical ID derivation, runtime validators with JSON codecs, and a correlated request/reply RPC layer over an event-bus surface.

## Install

```json
{
  "dependencies": {
    "@rhinos0608/pi-workspace-protocol": "github:rhinos0608/Pi-Workspace-Protocol#v0.8.0"
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
- `src/edit-mode.ts` — Edit mode resolution (`EditMode`, `EDIT_MODES`, `EDIT_MODE_ENV`, `resolveEditMode`).
- `test/` — Node test runner tests for all modules.

## RPC Channels

Three channels exported via `RPC_CHANNELS`:

- `inspectPatch` (`pi.workspace.inspect_patch.rpc`) — Workspace evidence and inspection RPC (original channel). Methods: `resolve_evidence`, `publish_inspection`, `invalidate`.
- `languageIntelligence` (`pi.workspace.language_intelligence.rpc`) — Language intelligence operations. Methods:
  - `language_intelligence_capabilities` — Check server capabilities.
  - `check_post_edit_diagnostics` — Post-edit LSP diagnostics.
  - `rename_preview` — Preview a symbol rename via LSP.
  - `organize_imports` — Preview organize-imports action.
  - `formatting` — Preview document formatting.
  - `code_action` — List code actions at a position.
- `workspaceEdit` (`pi.workspace.workspace_edit.rpc`) — Staged workspace edits, served by SmartEdit. Methods:
  - `stage_workspace_edit` — Stage a WorkspaceEdit; returns a `proposalId` plus affected files and diff.
  - `apply_staged_edit` — Apply a staged proposal by `proposalId`.

Constants: `RPC_CHANNELS.inspectPatch`, `RPC_CHANNELS.languageIntelligence`, `RPC_CHANNELS.workspaceEdit`, `LANGUAGE_INTELLIGENCE_RPC_METHODS` (maps `capabilities`, `checkPostEditDiagnostics`, `renamePreview`, `organizeImports`, `formatting`, `codeAction` to wire method strings), `WORKSPACE_EDIT_RPC_METHODS` (maps `stage`, `apply` to `stage_workspace_edit`, `apply_staged_edit`).

## Language Intelligence DTOs

All types in `src/types.ts`; validators in `src/contract.ts` / `src/language-intelligence.ts`.

- `LspTextEdit` — `{ filePath: string, range: { start: { line, character }, end: { line, character } }, newText: string }`
- `LspWorkspaceEdit` — `{ positionEncoding: "utf-16" (required), fileEdits: { filePath: string, edits: LspTextEdit[] }[] }`
- `RenamePreviewRequest` — `{ filePath: string, line: number, character: number, newName: string, timeoutMs?: number }`
- `RenamePreviewResponse` — `{ ok: boolean, workspaceEdit?: LspWorkspaceEdit, error?: string, serverDescriptorId?: string }`
- `OrganizeImportsRequest` — `{ filePath: string, timeoutMs?: number }`
- `OrganizeImportsResponse` — `{ ok: boolean, workspaceEdit?: LspWorkspaceEdit, error?: string, serverDescriptorId?: string }`
- `FormattingRequest` — `{ filePath: string, tabSize?: number, insertSpaces?: boolean, timeoutMs?: number }`
- `FormattingResponse` — `{ ok: boolean, workspaceEdit?: LspWorkspaceEdit, error?: string, serverDescriptorId?: string }`
- `CodeActionRequest` — `{ filePath: string, line: number, character: number, endLine?: number, endCharacter?: number, diagnostics?: { range, code?, message }[], only?: string[], timeoutMs?: number }`
- `CodeActionResponse` — `{ ok: boolean, actions?: CodeActionItem[], error?: string, serverDescriptorId?: string }`
- `CodeActionItem` — `{ title: string, kind?: string, workspaceEdit?: LspWorkspaceEdit, isPreferred?: boolean }`
- `LANGUAGE_INTELLIGENCE_RPC_METHODS` — constant mapping logical names to wire method strings.
- `RPC_CHANNELS.languageIntelligence` — channel string `pi.workspace.language_intelligence.rpc`.

Additional language-intelligence types in `src/language-intelligence.ts`: `LanguageIntelligenceCapabilitiesRequest` (`{}`), `LanguageIntelligenceCapabilitiesResponse` (`{ provider: "pi-smartread", capabilities: ("post-edit-diagnostics")[] }`), `CheckPostEditDiagnosticsRequest` (`{ canonicalPath, canonicalWorkspaceRoot, expectedContentSha256, waitMs 0..3000, maxDiagnostics 1..100, timeoutMs? 250..30000 }`), `CheckPostEditDiagnosticsResponse` (discriminated union on `status`: `confirmed` | `empty` | `unavailable` | `degraded`), `LanguageDiagnostic` (`{ message, severity 1|2|3|4, range, source }`).

`timeoutMs` is an optional LSP timeout envelope (integer 250..30000 ms) on all language-intelligence request DTOs (`RenamePreviewRequest`, `OrganizeImportsRequest`, `FormattingRequest`, `CodeActionRequest`, `CheckPostEditDiagnosticsRequest`). Omitted means consumer default applies. `LspWorkspaceEdit.positionEncoding` must be `"utf-16"`.

## Workspace Edit DTOs

All types in `src/types.ts`; validators in `src/contract.ts`.

- `StageWorkspaceEditRequest` — `{ workspaceEdit: unknown (non-null object), source: { operation: string, document: { canonicalPath: string, sha256: string }, serverDescriptorId?: string }, sessionFilePath: string, cwd: string }`
- `StageWorkspaceEditResponse` — `{ ok: true, proposalId: string, files: string[], diff: string } | { ok: false, reason: string }`
- `ApplyStagedEditRequest` — `{ proposalId: string, toolCallId: string, sessionFilePath: string, cwd: string }`
- `ApplyStagedEditResponse` — `{ ok: boolean, status: "applied" | "rejected" | "failed", text: string, diagnostics: string[], changedFiles: string[] }`

## Edit Mode

`src/edit-mode.ts` resolves the single operator edit dialect so SmartEdit and SmartRead agree:

- `EditMode = "text" | "hashline"`; `EDIT_MODES` readonly tuple; `EDIT_MODE_ENV = "PI_EDIT_MODE"`.
- `resolveEditMode(env)` — `PI_EDIT_MODE` (trimmed/lowercased) wins; invalid values fall back to `text` with a `warning` naming the bad value (never throws). When unset/empty, legacy `SMART_EDIT_USE_HASHLINE_EDITING` (direct, wins) then `SMART_EDIT_HASHLINE_EXPERIMENTAL` (alias) decide (`1|true|yes|on` → `hashline`, else `text`); otherwise `text`, source `default`.

## Runtime Validators

`src/contract.ts` exports validators for every request/response DTO:

`validateInspectionEnvelope`, `validateEvidenceRef`, `validateMutationStatus`, `validateMutationDetails`, `validateEventMessage`, `encodeEventMessage`, `decodeEventMessage`, `validateRenamePreviewRequest/Response`, `validateOrganizeImportsRequest/Response`, `validateFormattingRequest/Response`, `validateCodeActionRequest/Response`, `validateStageWorkspaceEditSource`, `validateStageWorkspaceEditRequest`, `validateApplyStagedEditRequest`.

`src/language-intelligence.ts` exports `validateLanguageDiagnostic`, `validateLanguageIntelligenceCapabilitiesRequest/Response`, `validateCheckPostEditDiagnosticsRequest/Response`.

All validators return `{ ok: true, value } | { ok: false, error }` and enforce required field shapes, hex/format constraints, and cross-field invariants.

## Schema Versioning

- Schema version `6` (`PROTOCOL_SCHEMA_VERSION = 6`); any bump is a **breaking change** — validators require exact `schemaVersion` equality (`src/contract.ts`), so both consumers must update in lockstep. No version shim or negotiation.
- Version `0.5.0` generalizes mutation lifecycle contracts and added the language intelligence channel and its DTOs additively (no schema bump needed).
- Version `0.6.0` (schema `5`) adds the optional `timeoutMs` envelope (integer 250..30000) on all language-intelligence request DTOs and requires `LspWorkspaceEdit.positionEncoding: "utf-16"`.
- Version `0.7.0` (schema `5`, additive) adds the workspace-edit channel (`RPC_CHANNELS.workspaceEdit`, `stage_workspace_edit` / `apply_staged_edit` plus DTOs) and the edit-mode helper (`src/edit-mode.ts`, `resolveEditMode`).
- Version `0.8.0` (schema `6`) requires `StageWorkspaceEditSource.document = { canonicalPath: string, sha256: string }` (lowercase 64-hex raw origin-source byte digest) as an explicit proposal generation precondition distinct from read authorization.
- Release train: protocol → SmartRead → SmartEdit, in order. Consumers pin the `v0.8.0` tag (no range).

## Build / Test

```
npm install
npm run typecheck
npm test
```

Build outputs to `dist/` via `tsc -p tsconfig.json`.

## License

MIT — see `LICENSE`.
