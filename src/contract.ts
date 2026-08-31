/**
 * Runtime validators / codecs.
 * Pure functions. No I/O. No Pi imports.
 */
import { PROTOCOL_SCHEMA_VERSION, type WorkspaceEvidenceEnvelope, type EvidenceRef, type PatchRequest, type EventMessage, type InspectedResource, type InspectMode } from "./types.js";

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const HEX64 = /^[0-9a-f]{64}$/;
const ISO_DURATION_SAFE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function ok<T>(value: T): Result<T> { return { ok: true, value }; }
function fail(error: string): Result<never> { return { ok: false, error }; }

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateLineRange(v: unknown, where: string): Result<true> {
    if (!isPlainObject(v)) return fail(`${where} must be an object`);
    const { startLine, endLine } = v;
    if (typeof startLine !== "number" || !Number.isInteger(startLine) || startLine < 1)
        return fail(`${where}.startLine must be a positive integer`);
    if (typeof endLine !== "number" || !Number.isInteger(endLine) || endLine < startLine)
        return fail(`${where}.endLine must be a positive integer >= startLine`);
    return ok(true);
}

function validateResource(r: unknown, idx: number): Result<InspectedResource> {
    const where = `resources[${idx}]`;
    if (!isPlainObject(r)) return fail(`${where} must be an object`);
    const { resourceId, canonicalPath, kind, coverage, allowedRanges, fullFileSha256, fresh, byteLength, lineCount } = r;

    if (typeof resourceId !== "string" || !HEX64.test(resourceId))
        return fail(`${where}.resourceId must be a 64-char hex sha256`);
    if (typeof canonicalPath !== "string" || canonicalPath.length === 0)
        return fail(`${where}.canonicalPath must be a non-empty string`);
    if (canonicalPath !== canonicalPath.split("\0").join(""))
        return fail(`${where}.canonicalPath must not contain NUL`);
    if (kind !== "full" && kind !== "range")
        return fail(`${where}.kind must be 'full' or 'range'`);
    if (coverage !== "full-file" && coverage !== "line-range" && coverage !== "search-match" && coverage !== "metadata-only")
        return fail(`${where}.coverage must be 'full-file', 'line-range', 'search-match', or 'metadata-only'`);

    // Cross-field rules
    if (kind === "full" && coverage !== "full-file")
        return fail(`${where}: kind=full requires coverage=full-file`);
    if (kind === "range" && coverage === "full-file")
        return fail(`${where}: kind=range is incompatible with coverage=full-file`);

    if (!Array.isArray(allowedRanges) || allowedRanges.length === 0)
        return fail(`${where}.allowedRanges must be a non-empty array`);
    for (let i = 0; i < allowedRanges.length; i++) {
        const v = validateLineRange(allowedRanges[i], `${where}.allowedRanges[${i}]`);
        if (!v.ok) return v;
    }

    if (coverage === "full-file") {
        if (typeof fullFileSha256 !== "string" || !HEX64.test(fullFileSha256))
            return fail(`${where}: coverage=full-file requires fullFileSha256 (64-hex sha256)`);
        if (fresh === true) {
            // ok
        } else {
            return fail(`${where}: coverage=full-file requires fresh=true`);
        }
    } else {
        // line-range / search-match / metadata-only: fullFileSha256 optional
        // but if present must be valid hex.
        if (fullFileSha256 !== undefined && (typeof fullFileSha256 !== "string" || !HEX64.test(fullFileSha256)))
            return fail(`${where}: fullFileSha256, if present, must be a 64-hex sha256`);
        if (fresh !== true && fresh !== false)
            return fail(`${where}: fresh must be boolean`);
    }

    if (byteLength !== undefined && (typeof byteLength !== "number" || byteLength < 0 || !Number.isInteger(byteLength)))
        return fail(`${where}.byteLength must be a non-negative integer if present`);
    if (lineCount !== undefined && (typeof lineCount !== "number" || lineCount < 0 || !Number.isInteger(lineCount)))
        return fail(`${where}.lineCount must be a non-negative integer if present`);

    return ok(r as unknown as InspectedResource);
}

export function validateInspectionEnvelope(input: unknown): Result<WorkspaceEvidenceEnvelope> {
    if (!isPlainObject(input)) return fail("envelope must be an object");
    const { schemaVersion, inspectionId, sessionId, workspaceRoot, canonicalWorkspaceRoot, createdAt, resources, mode } = input;

    if (schemaVersion !== PROTOCOL_SCHEMA_VERSION) return fail(`schemaVersion must be ${PROTOCOL_SCHEMA_VERSION}`);
    if (typeof inspectionId !== "string" || !HEX64.test(inspectionId))
        return fail("inspectionId must be 64-hex sha256");
    if (typeof sessionId !== "string" || !HEX64.test(sessionId))
        return fail("sessionId must be 64-hex sha256");
    if (typeof workspaceRoot !== "string" || workspaceRoot.length === 0)
        return fail("workspaceRoot must be a non-empty string");
    if (typeof canonicalWorkspaceRoot !== "string" || canonicalWorkspaceRoot.length === 0)
        return fail("canonicalWorkspaceRoot must be a non-empty string");
    if (typeof createdAt !== "string" || !ISO_DURATION_SAFE.test(createdAt))
        return fail("createdAt must be an ISO-8601 UTC string");
    if (mode !== undefined && mode !== "path" && mode !== "query" && mode !== "symbol" && mode !== "map")
        return fail("mode, if present, must be 'path', 'query', 'symbol', or 'map'");
    if (!Array.isArray(resources))
        return fail("resources must be an array");
    // map mode issues no file-level authorization by design (zero resources).
    // query/symbol modes may legitimately have zero resources (zero hits).
    // path mode (or no mode, for v1/v2 back-compat) always requires >= 1 resource.
    const modeAllowsEmpty: InspectMode[] = ["map", "query", "symbol"];
    if (resources.length === 0 && !(typeof mode === "string" && modeAllowsEmpty.includes(mode as InspectMode)))
        return fail("resources must be a non-empty array for path mode (or when mode is omitted)");

    for (let i = 0; i < resources.length; i++) {
        const v = validateResource(resources[i], i);
        if (!v.ok) return v;
    }
    return ok(input as unknown as WorkspaceEvidenceEnvelope);
}

export function validateEvidenceRef(input: unknown): Result<EvidenceRef> {
    if (!isPlainObject(input)) return fail("evidenceRef must be an object");
    const { inspectionId, resourceIds } = input;
    if (typeof inspectionId !== "string" || !HEX64.test(inspectionId))
        return fail("evidenceRef.inspectionId must be 64-hex sha256");
    if (!Array.isArray(resourceIds) || resourceIds.length === 0)
        return fail("evidenceRef.resourceIds must be a non-empty array");
    for (let i = 0; i < resourceIds.length; i++) {
        if (typeof resourceIds[i] !== "string" || (resourceIds[i] as string).length === 0)
            return fail(`evidenceRef.resourceIds[${i}] must be a non-empty string`);
    }
    return ok(input as unknown as EvidenceRef);
}

export function validatePatchRequest(input: unknown): Result<PatchRequest> {
    if (!isPlainObject(input)) return fail("patch request must be an object");
    const { path, edits, evidenceRef, toolCallId } = input;
    if (path !== undefined && (typeof path !== "string" || path.length === 0))
        return fail("patch.path, if present, must be a non-empty string");
    if (!Array.isArray(edits) || edits.length === 0)
        return fail("patch.edits must be a non-empty array");
    // v3: multi-file patch. Each edit may carry its own path.
    // If an edit has no path, it inherits the top-level path — so when the
    // top-level path is omitted, every edit MUST supply its own.
    // Each edit must provide at least oldText or newText (non-empty).
    let everyEditHasPath = true;
    for (let i = 0; i < edits.length; i++) {
        const e = edits[i];
        if (!isPlainObject(e)) return fail(`patch.edits[${i}] must be an object`);
        const ep = (e as { path?: unknown }).path;
        if (ep !== undefined) {
            if (typeof ep !== "string" || ep.length === 0)
                return fail(`patch.edits[${i}].path must be a non-empty string if present`);
        } else {
            everyEditHasPath = false;
        }
        const eOld = (e as { oldText?: unknown }).oldText;
        const eNew = (e as { newText?: unknown }).newText;
        const hasOld = typeof eOld === "string" && eOld.length > 0;
        const hasNew = typeof eNew === "string" && eNew.length > 0;
        if (!hasOld && !hasNew)
            return fail(`patch.edits[${i}] must have at least one of oldText or newText (non-empty)`);
    }
    if (path === undefined && !everyEditHasPath)
        return fail("patch.path is required unless every edit provides its own path");
    if (typeof toolCallId !== "string" || toolCallId.length === 0)
        return fail("patch.toolCallId must be a non-empty string");
    // evidenceRef is optional: omitted means auto-inspect. If present, validate it.
    if (evidenceRef !== undefined) {
        const er = validateEvidenceRef(evidenceRef);
        if (!er.ok) return er;
    }
    return ok(input as unknown as PatchRequest);
}

export function validateEventMessage(input: unknown): Result<EventMessage> {
    if (!isPlainObject(input)) return fail("event must be an object");
    const { kind, schemaVersion } = input;
    if (schemaVersion !== PROTOCOL_SCHEMA_VERSION) return fail(`event.schemaVersion must be ${PROTOCOL_SCHEMA_VERSION}`);
    if (kind === "request") {
        const { requestId, rpc, payload } = input;
        if (typeof requestId !== "string" || requestId.length === 0) return fail("request.requestId required");
        if (typeof rpc !== "string" || (rpc !== "resolve_evidence" && rpc !== "publish_inspection" && rpc !== "invalidate" && rpc !== "language_intelligence_capabilities" && rpc !== "check_post_edit_diagnostics" && rpc !== "rename_preview" && rpc !== "organize_imports" && rpc !== "formatting" && rpc !== "code_action"))
            return fail("request.rpc must be a known method");
        return ok(input as unknown as EventMessage);
    }
    if (kind === "reply") {
        const { requestId, ok: okFlag, payload, error } = input;
        if (typeof requestId !== "string" || requestId.length === 0) return fail("reply.requestId required");
        if (typeof okFlag !== "boolean") return fail("reply.ok must be boolean");
        if (error !== undefined && typeof error !== "string") return fail("reply.error must be string if present");
        return ok(input as unknown as EventMessage);
    }
    return fail("event.kind must be 'request' or 'reply'");
}

export function encodeEventMessage(msg: EventMessage): string {
    return JSON.stringify(msg);
}

export function decodeEventMessage(text: string): EventMessage {
    const parsed: unknown = JSON.parse(text);
    const v = validateEventMessage(parsed);
    if (!v.ok) throw new Error(`invalid event message: ${v.error}`);
    return v.value;
}
