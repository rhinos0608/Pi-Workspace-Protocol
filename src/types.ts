/**
 * Canonical, versioned types for the Pi workspace mutation protocol.
 * No Pi imports. No filesystem state. No singletons.
 */

export const PROTOCOL_SCHEMA_VERSION = 5 as const;

/** LSP request timeout envelope (ms). Applies to all language-intelligence request DTOs invoking LSP via optional `timeoutMs`. */
export const LSP_TIMEOUT_MS_MIN = 250 as const;
export const LSP_TIMEOUT_MS_DEFAULT = 10000 as const;
export const LSP_TIMEOUT_MS_MAX = 30000 as const;

/** sha256 hex digest (64 chars) */
export type Sha256 = string;

/** Canonical, absolute, realpath-resolved path. */
export type CanonicalPath = string;

/** Canonical workspace root, realpath-resolved, no trailing slash. */
export type CanonicalWorkspaceRoot = string;

/** Hashed session identifier (sha256 of session file path). */
export type HashedSessionId = string;

/** Allowed line range, both 1-based, endLine >= startLine. */
export interface LineRange {
    readonly startLine: number;
    readonly endLine: number;
}

/**
 * - "full-file" / "line-range": strong coverage. Backed by a real
 *   fullFileSha256 (full-file) or MAY carry one (line-range). Authorizes mutation.
 * - "search-match" / "metadata-only": weak coverage. Produced by query/symbol
 *   inspect modes from match pointers, not a targeted read. Never carries a
 *   trustworthy fullFileSha256. Mutation tools MUST reject these — the model must
 *   path-mode inspect the file before mutating it.
 */
export type Coverage = "full-file" | "line-range" | "search-match" | "metadata-only";
export type ResourceKind = "full" | "range";

/** Inspect mode: how the agent discovered the resources. */
export type InspectMode = "path" | "query" | "symbol" | "map";

/**
 * A single resource captured by an inspect call.
 * - kind="full", coverage="full-file" => entire file is authorized. Requires fullFileSha256 + fresh=true.
 * - kind="range", coverage="line-range" => only the listed ranges are authorized.
 *   fullFileSha256 MAY be present to allow mutation-time full-content verification.
 *
 * Truncated output MUST NOT be advertised as full-file. A range resource MAY have
 * allowedRanges with one or more disjoint line intervals.
 */
export interface InspectedResource {
    readonly resourceId: string;
    readonly canonicalPath: CanonicalPath;
    readonly kind: ResourceKind;
    readonly coverage: Coverage;
    readonly allowedRanges: ReadonlyArray<LineRange>;
    readonly fullFileSha256?: Sha256;
    readonly fresh: boolean;
    readonly byteLength?: number;
    readonly lineCount?: number;
}

/**
 * The durable evidence envelope returned in tool result `details.workspaceEvidence`.
 * Tool result details are the durable source of truth; the in-memory map is only
 * a cache index. Tool result details MUST be schema-valid before being trusted.
 */
export interface WorkspaceEvidenceEnvelope {
    readonly schemaVersion: typeof PROTOCOL_SCHEMA_VERSION;
    readonly inspectionId: string;
    readonly sessionId: HashedSessionId;
    readonly workspaceRoot: string;
    readonly canonicalWorkspaceRoot: CanonicalWorkspaceRoot;
    readonly createdAt: string;
    readonly resources: ReadonlyArray<InspectedResource>;
    /** v3: how the agent discovered these resources. */
    readonly mode?: InspectMode;
}

/** A reference to a specific inspection's resources for use by mutation tools. */
export interface EvidenceRef {
    readonly inspectionId: string;
    readonly resourceIds: ReadonlyArray<string>;
}

export type MutationTool = "edit" | "transfer";
export type RejectReason = "stale" | "coverage" | "conflict" | "approval" | "session";
export type FailPhase = "stage" | "write" | "verify";
export type MutationStatus =
    | { kind: "applied" }
    | { kind: "rejected"; reason: RejectReason }
    | { kind: "failed"; phase: FailPhase };

export interface ResourceInvalidation {
    readonly resourceId: string;
    readonly canonicalPath: CanonicalPath;
    readonly fullFileSha256: Sha256;
    readonly newFullFileSha256?: Sha256;
    readonly coverage: Coverage;
}

export interface PostEditEvidence {
    readonly fullFileSha256: Sha256;
    readonly lineCount: number;
    readonly byteLength: number;
}

export interface CheckRecord {
    readonly id: string;
    readonly outcome: "pass" | "fail" | "skipped" | "timeout";
    readonly detail?: string;
}

export interface LifecycleChecks {
    readonly blocking: ReadonlyArray<CheckRecord>;
    readonly completed: ReadonlyArray<CheckRecord>;
    readonly advisory: ReadonlyArray<CheckRecord>;
    readonly skipped: ReadonlyArray<CheckRecord>;
    readonly timedOut: ReadonlyArray<CheckRecord>;
}

export interface MutationDetails {
    readonly tool: MutationTool;
    readonly status: MutationStatus;
    readonly toolCallId: string;
    readonly evidenceRef: EvidenceRef;
    readonly usedEvidence: ReadonlyArray<string>;
    readonly changedResources: ReadonlyArray<ResourceInvalidation>;
    readonly postEditEvidence?: PostEditEvidence;
    readonly checks: LifecycleChecks;
    readonly diagnostics: ReadonlyArray<string>;
    readonly rollback?: { ok: boolean; reason?: string };
    readonly error?: string;
}

// ── Event RPC ───────────────────────────────────────────────────────

export type RpcMethod =
    | "resolve_evidence"
    | "publish_inspection"
    | "invalidate"
    | "language_intelligence_capabilities"
    | "check_post_edit_diagnostics"
    | "rename_preview"
    | "organize_imports"
    | "formatting"
    | "code_action";

export interface EventMessageBase {
    readonly schemaVersion: typeof PROTOCOL_SCHEMA_VERSION;
}

export interface RequestEvent extends EventMessageBase {
    readonly kind: "request";
    readonly requestId: string;
    readonly rpc: RpcMethod;
    readonly payload: unknown;
}

export interface ReplyEvent extends EventMessageBase {
    readonly kind: "reply";
    readonly requestId: string;
    readonly ok: boolean;
    readonly payload?: unknown;
    readonly error?: string;
}

export type EventMessage = RequestEvent | ReplyEvent;

// ── Channels ────────────────────────────────────────────────────────

export const RPC_CHANNELS = {
    inspectPatch: "pi.workspace.inspect_patch.rpc",
    languageIntelligence: "pi.workspace.language_intelligence.rpc",
} as const;

export const LANGUAGE_INTELLIGENCE_RPC_METHODS = {
    capabilities: "language_intelligence_capabilities",
    checkPostEditDiagnostics: "check_post_edit_diagnostics",
    renamePreview: "rename_preview",
    organizeImports: "organize_imports",
    formatting: "formatting",
    codeAction: "code_action",
} as const;

export type RpcChannel = (typeof RPC_CHANNELS)[keyof typeof RPC_CHANNELS];

// ── Rename preview DTOs ─────────────────────────────────────────────

export interface LspTextEdit {
    readonly filePath: string;
    readonly range: { start: { line: number; character: number }; end: { line: number; character: number } };
    readonly newText: string;
}

export interface LspWorkspaceEdit {
    readonly positionEncoding: "utf-16";
    readonly fileEdits: ReadonlyArray<{
        readonly filePath: string;
        readonly edits: ReadonlyArray<LspTextEdit>;
    }>;
}

export interface RenamePreviewRequest {
    readonly filePath: string;
    readonly line: number;
    readonly character: number;
    readonly newName: string;
    readonly timeoutMs?: number;
}

export interface RenamePreviewResponse {
    readonly ok: boolean;
    readonly workspaceEdit?: LspWorkspaceEdit;
    readonly error?: string;
    readonly serverDescriptorId?: string;
}

// ── Organize imports DTOs ───────────────────────────────────────────

export interface OrganizeImportsRequest {
    readonly filePath: string;
    readonly timeoutMs?: number;
}

export interface OrganizeImportsResponse {
    readonly ok: boolean;
    readonly workspaceEdit?: LspWorkspaceEdit;
    readonly error?: string;
    readonly serverDescriptorId?: string;
}

// ── Formatting DTOs ─────────────────────────────────────────────────

export interface FormattingRequest {
    readonly filePath: string;
    /** Optional LSP timeout in ms. Integer 250..30000. */
    readonly timeoutMs?: number;
    readonly tabSize?: number;
    readonly insertSpaces?: boolean;
}

export interface FormattingResponse {
    readonly ok: boolean;
    readonly workspaceEdit?: LspWorkspaceEdit;
    readonly error?: string;
    readonly serverDescriptorId?: string;
}

// ── Code action DTOs ────────────────────────────────────────────────

export interface CodeActionRequest {
    readonly filePath: string;
    readonly line: number;
    readonly character: number;
    readonly endLine?: number;
    readonly endCharacter?: number;
    readonly diagnostics?: ReadonlyArray<{
        readonly range: { start: { line: number; character: number }; end: { line: number; character: number } };
        readonly code?: string;
        readonly message: string;
    }>;
    readonly only?: ReadonlyArray<string>;
    readonly timeoutMs?: number;
}

export interface CodeActionItem {
    readonly title: string;
    readonly kind?: string;
    readonly workspaceEdit?: LspWorkspaceEdit;
    readonly isPreferred?: boolean;
}

export interface CodeActionResponse {
    readonly ok: boolean;
    readonly actions?: ReadonlyArray<CodeActionItem>;
    readonly error?: string;
    readonly serverDescriptorId?: string;
}
