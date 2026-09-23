export type LanguageIntelligenceCapability = "post-edit-diagnostics";

export interface LanguageIntelligenceCapabilitiesRequest {}

export interface LanguageIntelligenceCapabilitiesResponse {
    readonly provider: "pi-smartread";
    readonly capabilities: ReadonlyArray<LanguageIntelligenceCapability>;
}

export interface CheckPostEditDiagnosticsRequest {
    readonly canonicalPath: string;
    readonly canonicalWorkspaceRoot: string;
    readonly expectedContentSha256: string; // 64-char lowercase hex
    readonly waitMs: number; // integer 0..3000
    readonly maxDiagnostics: number; // integer 1..100
    readonly timeoutMs?: number;
}

export interface LanguageDiagnostic {
    readonly message: string; // max 16384 chars
    readonly severity: 1 | 2 | 3 | 4;
    readonly range: {
        readonly start: { readonly line: number; readonly character: number };
        readonly end: { readonly line: number; readonly character: number };
    };
    readonly source: string; // max 256 chars
}

export type CheckPostEditDiagnosticsResponse =
    | { readonly status: "confirmed"; readonly diagnostics: readonly [LanguageDiagnostic, ...LanguageDiagnostic[]]; readonly truncated: boolean }
    | { readonly status: "empty"; readonly diagnostics: readonly []; readonly truncated: false }
    | { readonly status: "unavailable"; readonly reason: "no-server"; readonly diagnostics: readonly []; readonly truncated: false }
    | { readonly status: "degraded"; readonly reason: "unconfirmed" | "content-mismatch" | "file-unreadable"; readonly diagnostics: readonly []; readonly truncated: false };

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function ok<T>(value: T): ValidationResult<T> {
    return { ok: true, value };
}

function fail<T>(error: string): ValidationResult<T> {
    return { ok: false, error };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

const HEX64 = /^[0-9a-f]{64}$/;

// -- LanguageDiagnostic --

export function validateLanguageDiagnostic(v: unknown): ValidationResult<LanguageDiagnostic> {
    if (!isPlainObject(v)) return fail("LanguageDiagnostic must be an object");
    const { message, severity, range, source } = v as Record<string, unknown>;

    if (typeof message !== "string") return fail("LanguageDiagnostic.message must be a string");
    if (message.length > 16384) return fail("LanguageDiagnostic.message must be <= 16384 chars");

    if (severity !== 1 && severity !== 2 && severity !== 3 && severity !== 4) {
        return fail("LanguageDiagnostic.severity must be 1, 2, 3, or 4");
    }

    if (typeof source !== "string") return fail("LanguageDiagnostic.source must be a string");
    if (source.length > 256) return fail("LanguageDiagnostic.source must be <= 256 chars");

    if (!isPlainObject(range)) return fail("LanguageDiagnostic.range must be an object");
    const r = range as Record<string, unknown>;
    const start = r.start;
    const end = r.end;
    if (!isPlainObject(start)) return fail("LanguageDiagnostic.range.start must be an object");
    if (!isPlainObject(end)) return fail("LanguageDiagnostic.range.end must be an object");
    const sl = (start as Record<string, unknown>).line;
    const sc = (start as Record<string, unknown>).character;
    const el = (end as Record<string, unknown>).line;
    const ec = (end as Record<string, unknown>).character;
    for (const [label, val] of [
        ["LanguageDiagnostic.range.start.line", sl],
        ["LanguageDiagnostic.range.start.character", sc],
        ["LanguageDiagnostic.range.end.line", el],
        ["LanguageDiagnostic.range.end.character", ec],
    ] as const) {
        if (typeof val !== "number" || !Number.isInteger(val) || val < 0) {
            return fail(`${label} must be a non-negative integer`);
        }
    }

    return ok(v as unknown as LanguageDiagnostic);
}

// -- LanguageIntelligenceCapabilitiesRequest --

export function validateLanguageIntelligenceCapabilitiesRequest(
    v: unknown,
): ValidationResult<LanguageIntelligenceCapabilitiesRequest> {
    if (!isPlainObject(v)) return fail("LanguageIntelligenceCapabilitiesRequest must be an object");
    // Only allow empty object — reject extra keys to catch malformed calls
    // But per spec it's {}, so allow no required fields; if extra keys exist, still accept (forward-compat)
    // To match existing envelope validators that reject unknown shape only via missing fields, we accept empty.
    // However reject non-object already handled.
    return ok(v as LanguageIntelligenceCapabilitiesRequest);
}

// -- LanguageIntelligenceCapabilitiesResponse --

export function validateLanguageIntelligenceCapabilitiesResponse(
    v: unknown,
): ValidationResult<LanguageIntelligenceCapabilitiesResponse> {
    if (!isPlainObject(v)) return fail("LanguageIntelligenceCapabilitiesResponse must be an object");
    const { provider, capabilities } = v as Record<string, unknown>;
    if (provider !== "pi-smartread") return fail("LanguageIntelligenceCapabilitiesResponse.provider must be \"pi-smartread\"");
    if (!Array.isArray(capabilities)) return fail("LanguageIntelligenceCapabilitiesResponse.capabilities must be an array");
    for (let i = 0; i < capabilities.length; i++) {
        if (capabilities[i] !== "post-edit-diagnostics") {
            return fail(`LanguageIntelligenceCapabilitiesResponse.capabilities[${i}] must be \"post-edit-diagnostics\"`);
        }
    }
    return ok(v as unknown as LanguageIntelligenceCapabilitiesResponse);
}

// -- CheckPostEditDiagnosticsRequest --

export function validateCheckPostEditDiagnosticsRequest(v: unknown): ValidationResult<CheckPostEditDiagnosticsRequest> {
    if (!isPlainObject(v)) return fail("CheckPostEditDiagnosticsRequest must be an object");
    const { canonicalPath, canonicalWorkspaceRoot, expectedContentSha256, waitMs, maxDiagnostics, timeoutMs } = v as Record<string, unknown>;

    if (typeof canonicalPath !== "string" || canonicalPath.length === 0)
        return fail("CheckPostEditDiagnosticsRequest.canonicalPath must be a non-empty string");
    if (canonicalPath.includes("\0")) return fail("CheckPostEditDiagnosticsRequest.canonicalPath must not contain NUL bytes");

    if (typeof canonicalWorkspaceRoot !== "string" || canonicalWorkspaceRoot.length === 0)
        return fail("CheckPostEditDiagnosticsRequest.canonicalWorkspaceRoot must be a non-empty string");
    if (canonicalWorkspaceRoot.includes("\0"))
        return fail("CheckPostEditDiagnosticsRequest.canonicalWorkspaceRoot must not contain NUL bytes");

    if (typeof expectedContentSha256 !== "string" || !HEX64.test(expectedContentSha256)) {
        return fail("CheckPostEditDiagnosticsRequest.expectedContentSha256 must be 64-char lowercase hex");
    }

    if (typeof waitMs !== "number" || !Number.isInteger(waitMs) || waitMs < 0 || waitMs > 3000) {
        return fail("CheckPostEditDiagnosticsRequest.waitMs must be an integer 0..3000");
    }

    if (typeof maxDiagnostics !== "number" || !Number.isInteger(maxDiagnostics) || maxDiagnostics < 1 || maxDiagnostics > 100) {
        return fail("CheckPostEditDiagnosticsRequest.maxDiagnostics must be an integer 1..100");
    }

    if (timeoutMs !== undefined && (typeof timeoutMs !== "number" || !Number.isInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 30000)) {
        return fail("CheckPostEditDiagnosticsRequest.timeoutMs must be an integer 250..30000 if present");
    }

    return ok(v as unknown as CheckPostEditDiagnosticsRequest);
}

// -- CheckPostEditDiagnosticsResponse --

export function validateCheckPostEditDiagnosticsResponse(v: unknown): ValidationResult<CheckPostEditDiagnosticsResponse> {
    if (!isPlainObject(v)) return fail("CheckPostEditDiagnosticsResponse must be an object");
    const obj = v as Record<string, unknown>;
    const status = obj.status;

    if (status !== "confirmed" && status !== "empty" && status !== "unavailable" && status !== "degraded") {
        return fail("CheckPostEditDiagnosticsResponse.status must be one of confirmed, empty, unavailable, degraded");
    }

    // diagnostics array common validation
    const diagnostics = obj.diagnostics;
    if (!Array.isArray(diagnostics)) return fail("CheckPostEditDiagnosticsResponse.diagnostics must be an array");
    if (diagnostics.length > 100) return fail("CheckPostEditDiagnosticsResponse.diagnostics must have <= 100 entries");
    for (let i = 0; i < diagnostics.length; i++) {
        const r = validateLanguageDiagnostic(diagnostics[i]);
        if (!r.ok) return fail(`CheckPostEditDiagnosticsResponse.diagnostics[${i}]: ${r.error}`);
    }

    const truncated = obj.truncated;
    if (typeof truncated !== "boolean") return fail("CheckPostEditDiagnosticsResponse.truncated must be a boolean");

    if (status === "confirmed") {
        // confirmed: non-empty diagnostics, no reason, truncated may be true/false
        if (diagnostics.length === 0) return fail("CheckPostEditDiagnosticsResponse with status confirmed must have non-empty diagnostics");
        if ("reason" in obj && obj.reason !== undefined) return fail("CheckPostEditDiagnosticsResponse with status confirmed must not have reason");
        return ok(v as CheckPostEditDiagnosticsResponse);
    }

    if (status === "empty") {
        if (diagnostics.length !== 0) return fail("CheckPostEditDiagnosticsResponse with status empty must have empty diagnostics");
        if (truncated !== false) return fail("CheckPostEditDiagnosticsResponse with status empty must have truncated=false");
        if ("reason" in obj && obj.reason !== undefined) return fail("CheckPostEditDiagnosticsResponse with status empty must not have reason");
        return ok(v as CheckPostEditDiagnosticsResponse);
    }

    if (status === "unavailable") {
        if (diagnostics.length !== 0) return fail("CheckPostEditDiagnosticsResponse with status unavailable must have empty diagnostics");
        if (truncated !== false) return fail("CheckPostEditDiagnosticsResponse with status unavailable must have truncated=false");
        if (obj.reason !== "no-server") return fail("CheckPostEditDiagnosticsResponse with status unavailable reason must be \"no-server\"");
        return ok(v as CheckPostEditDiagnosticsResponse);
    }

    // degraded
    if (diagnostics.length !== 0) return fail("CheckPostEditDiagnosticsResponse with status degraded must have empty diagnostics");
    if (truncated !== false) return fail("CheckPostEditDiagnosticsResponse with status degraded must have truncated=false");
    if (obj.reason !== "unconfirmed" && obj.reason !== "content-mismatch" && obj.reason !== "file-unreadable") {
        return fail("CheckPostEditDiagnosticsResponse with status degraded reason must be one of unconfirmed, content-mismatch, file-unreadable");
    }
    return ok(v as CheckPostEditDiagnosticsResponse);
}
