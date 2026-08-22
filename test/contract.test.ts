import { test } from "node:test";
import assert from "node:assert/strict";
import {
    PROTOCOL_SCHEMA_VERSION,
    validateInspectionEnvelope,
    validateEvidenceRef,
    validatePatchRequest,
    validateEventMessage,
    encodeEventMessage,
    decodeEventMessage,
} from "../src/index.js";
import type {
    WorkspaceEvidenceEnvelope,
    EvidenceRef,
    PatchRequest,
    EventMessage,
} from "../src/index.js";

function buildValidEnvelope(): WorkspaceEvidenceEnvelope {
    return {
        schemaVersion: PROTOCOL_SCHEMA_VERSION,
        inspectionId: "a".repeat(64),
        sessionId: "b".repeat(64),
        workspaceRoot: "/abs/ws",
        canonicalWorkspaceRoot: "/abs/ws",
        createdAt: "2026-07-12T00:00:00.000Z",
        resources: [
            {
                resourceId: "c".repeat(64),
                canonicalPath: "/abs/ws/a.ts",
                kind: "full",
                coverage: "full-file",
                allowedRanges: [{ startLine: 1, endLine: 100 }],
                fullFileSha256: "d".repeat(64),
                fresh: true,
            },
        ],
    };
}

test("PROTOCOL_SCHEMA_VERSION is 3", () => {
    assert.equal(PROTOCOL_SCHEMA_VERSION, 3);
});

test("validateInspectionEnvelope accepts a valid envelope", () => {
    const r = validateInspectionEnvelope(buildValidEnvelope());
    assert.equal(r.ok, true);
});

test("validateInspectionEnvelope rejects wrong schema version", () => {
    const r = validateInspectionEnvelope({ ...buildValidEnvelope(), schemaVersion: 999 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /schemaVersion/);
});

test("validateInspectionEnvelope rejects truncated full file (coverage=full-file must have fullFileSha256)", () => {
    const env = buildValidEnvelope();
    const bad = { ...env, resources: [{ ...env.resources[0]!, fullFileSha256: undefined, fresh: false, coverage: "truncated" as any }] };
    const r = validateInspectionEnvelope(bad);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /coverage/);
});

test("validateInspectionEnvelope rejects range with endLine<startLine", () => {
    const env = buildValidEnvelope();
    const bad = { ...env, resources: [{ ...env.resources[0]!, kind: "range" as const, coverage: "line-range" as const, allowedRanges: [{ startLine: 50, endLine: 10 }], fullFileSha256: undefined }] };
    const r = validateInspectionEnvelope(bad);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /endLine/);
});

test("validateInspectionEnvelope accepts line-range without fullFileSha256 (used by inside-queue verification)", () => {
    const env = buildValidEnvelope();
    const ok = { ...env, resources: [{ ...env.resources[0]!, kind: "range" as const, coverage: "line-range" as const, fullFileSha256: undefined }] };
    const r = validateInspectionEnvelope(ok);
    assert.equal(r.ok, true);
});

test("validateInspectionEnvelope accepts line-range WITH fullFileSha256", () => {
    const env = buildValidEnvelope();
    const ok = { ...env, resources: [{ ...env.resources[0]!, kind: "range" as const, coverage: "line-range" as const, fullFileSha256: "e".repeat(64), fresh: true }] };
    const r = validateInspectionEnvelope(ok);
    assert.equal(r.ok, true);
});

test("validateInspectionEnvelope rejects empty resources", () => {
    const r = validateInspectionEnvelope({ ...buildValidEnvelope(), resources: [] });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /non-empty/);
});

test("validateInspectionEnvelope allows empty resources for map/query/symbol modes", () => {
    for (const mode of ["map", "query", "symbol"] as const) {
        const r = validateInspectionEnvelope({ ...buildValidEnvelope(), resources: [], mode });
        assert.equal(r.ok, true, `mode=${mode} should allow empty resources`);
    }
    const rPath = validateInspectionEnvelope({ ...buildValidEnvelope(), resources: [], mode: "path" });
    assert.equal(rPath.ok, false, "mode=path should still require resources");
});

test("validateInspectionEnvelope accepts search-match and metadata-only coverage", () => {
    const env = buildValidEnvelope();
    for (const coverage of ["search-match", "metadata-only"] as const) {
        const weak = { ...env, resources: [{ ...env.resources[0]!, kind: "range" as const, coverage, fullFileSha256: undefined, fresh: false }] };
        const r = validateInspectionEnvelope(weak);
        assert.equal(r.ok, true, `coverage=${coverage} should be accepted`);
    }
});

test("validateEvidenceRef requires inspectionId (64-hex) and resourceIds", () => {
    const ok: EvidenceRef = { inspectionId: "a".repeat(64), resourceIds: ["r1"] };
    assert.equal(validateEvidenceRef(ok).ok, true);
    let r = validateEvidenceRef({ inspectionId: "", resourceIds: ["r1"] });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /64-hex sha256/);
    r = validateEvidenceRef({ inspectionId: "a".repeat(64), resourceIds: [] });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /resourceIds must be a non-empty/);
    r = validateEvidenceRef({ inspectionId: "a".repeat(64), resourceIds: [""] });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /resourceIds\[0\]/);
    // H3: non-hex inspectionId is rejected
    r = validateEvidenceRef({ inspectionId: "not-a-hex-string", resourceIds: ["r1"] });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /64-hex sha256/);
});

test("validatePatchRequest accepts multi-file patch with per-edit paths", () => {
    const valid: PatchRequest = {
        path: "/abs/ws/a.ts",
        edits: [{ oldText: "x", newText: "y" }],
        evidenceRef: { inspectionId: "a".repeat(64), resourceIds: ["r"] },
        toolCallId: "tc1",
    };
    assert.equal(validatePatchRequest(valid).ok, true);

    // empty edits forbidden
    const bad1: PatchRequest = { ...valid, edits: [] };
    assert.equal(validatePatchRequest(bad1).ok, false);

    // multi-file (different path in an edit) now accepted in v3
    const multi: PatchRequest = { ...valid, edits: [{ oldText: "a", newText: "b" }, { oldText: "c", newText: "d", path: "/abs/ws/other.ts" }] };
    assert.equal(validatePatchRequest(multi).ok, true);

    // missing path
    const bad2: PatchRequest = { ...valid, path: "" };
    assert.equal(validatePatchRequest(bad2).ok, false);
});

test("validatePatchRequest allows omitted evidenceRef (auto-inspect) and omitted path when every edit has one", () => {
    const autoInspect = {
        edits: [{ oldText: "x", newText: "y", path: "/abs/ws/a.ts" }],
        toolCallId: "tc1",
    };
    assert.equal(validatePatchRequest(autoInspect).ok, true);

    // path omitted at top level, but not every edit has one -> reject
    const missingPath = {
        edits: [{ oldText: "x", newText: "y", path: "/abs/ws/a.ts" }, { oldText: "a", newText: "b" }],
        toolCallId: "tc1",
    };
    assert.equal(validatePatchRequest(missingPath).ok, false);

    // missing toolCallId always rejected
    const noToolCallId = {
        path: "/abs/ws/a.ts",
        edits: [{ oldText: "x", newText: "y" }],
    };
    assert.equal(validatePatchRequest(noToolCallId).ok, false);
});

test("validatePatchRequest rejects edit without oldText and newText (H1)", () => {
    const baseEdits = [{ path: "/abs/ws/a.ts" }];
    // missing both fields
    let r = validatePatchRequest({ edits: [{ path: "/abs/ws/a.ts" }], toolCallId: "tc1" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /oldText or newText/);

    // both empty strings
    r = validatePatchRequest({ path: "/abs/ws/a.ts", edits: [{ oldText: "", newText: "" }], toolCallId: "tc1" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /oldText or newText/);

    // one empty string, other missing
    r = validatePatchRequest({ path: "/abs/ws/a.ts", edits: [{ oldText: "" }], toolCallId: "tc1" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /oldText or newText/);

    // valid: oldText present
    r = validatePatchRequest({ path: "/abs/ws/a.ts", edits: [{ oldText: "x" }], toolCallId: "tc1" });
    assert.equal(r.ok, true);

    // valid: newText present
    r = validatePatchRequest({ path: "/abs/ws/a.ts", edits: [{ newText: "y" }], toolCallId: "tc1" });
    assert.equal(r.ok, true);
});

test("validatePatchRequest rejects edit with non-hex evidenceRef.inspectionId (H3)", () => {
    const r = validatePatchRequest({
        path: "/abs/ws/a.ts",
        edits: [{ oldText: "x", newText: "y" }],
        evidenceRef: { inspectionId: "not-hex", resourceIds: ["r"] },
        toolCallId: "tc1",
    });
    assert.equal(r.ok, false);
    assert.equal((r as any).error, "evidenceRef.inspectionId must be 64-hex sha256");
});

test("event message codec round-trips", () => {
    const msg: EventMessage = {
        kind: "request",
        requestId: "abc",
        rpc: "resolve_evidence",
        payload: { foo: 1 },
        schemaVersion: PROTOCOL_SCHEMA_VERSION,
    };
    const enc = encodeEventMessage(msg);
    assert.equal(typeof enc, "string");
    const dec = decodeEventMessage(enc);
    assert.equal(dec.kind, "request");
    assert.equal(dec.requestId, "abc");
    assert.equal(dec.rpc, "resolve_evidence");
    assert.deepEqual((dec as any).payload, { foo: 1 });
});

test("validateEventMessage rejects unknown kind", () => {
    const r = validateEventMessage({ kind: "weird", requestId: "r", rpc: "x", payload: {}, schemaVersion: PROTOCOL_SCHEMA_VERSION } as any);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /kind/);
});

test("validateEventMessage rejects wrong schema version", () => {
    const r = validateEventMessage({ kind: "request", requestId: "r", rpc: "x", payload: {}, schemaVersion: 99 } as any);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /schemaVersion/);
});

test("validateEventMessage rejects missing requestId on request", () => {
    const r = validateEventMessage({ kind: "request", requestId: "", rpc: "x", payload: {}, schemaVersion: PROTOCOL_SCHEMA_VERSION } as any);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /requestId/);
});
