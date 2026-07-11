/**
 * Canonical, versioned types for the Pi inspect+patch protocol.
 * No Pi imports. No filesystem state. No singletons.
 */

export const PROTOCOL_SCHEMA_VERSION = 2 as const;

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

export type Coverage = "full-file" | "line-range";
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

/** A reference to a specific inspection's resources for use by patch. */
export interface EvidenceRef {
    readonly inspectionId: string;
    readonly resourceIds: ReadonlyArray<string>;
}

/** A single edit item, same shape as SmartEdit's single-file edit item. */
export interface PatchEditItem {
    readonly oldText?: string;
    readonly newText?: string;
    readonly description?: string;
    readonly replaceAll?: boolean;
}

export type RejectReason = "stale" | "coverage" | "conflict" | "approval" | "session";
export type FailPhase = "stage" | "write" | "verify";
export type PatchStatus =
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

export interface PatchDetails {
    readonly tool: "patch";
    readonly status: PatchStatus;
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

/** v3: per-edit paths for multi-file patch. path is still required as default. */
export interface PatchEditItemV3 extends PatchEditItem {
    readonly path?: CanonicalPath;
}

export interface PatchRequest {
    readonly path: CanonicalPath;
    readonly edits: ReadonlyArray<PatchEditItemV3>;
    readonly evidenceRef: EvidenceRef;
    readonly toolCallId: string;
}

// ── Event RPC ───────────────────────────────────────────────────────

export type RpcMethod = "resolve_evidence" | "publish_inspection" | "invalidate";

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
} as const;

export type RpcChannel = (typeof RPC_CHANNELS)[keyof typeof RPC_CHANNELS];
