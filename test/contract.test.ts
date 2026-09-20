import { test } from "node:test";
import assert from "node:assert/strict";
import {
    PROTOCOL_SCHEMA_VERSION,
    validateInspectionEnvelope,
    validateEvidenceRef,
    validateMutationStatus,
    validateMutationDetails,
    validateEventMessage,
    encodeEventMessage,
    decodeEventMessage,
} from "../src/index.js";
import type {
    WorkspaceEvidenceEnvelope,
    EvidenceRef,
    MutationDetails,
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

test("PROTOCOL_SCHEMA_VERSION is 4", () => {
    assert.equal(PROTOCOL_SCHEMA_VERSION, 4);
});

test("mutation validators accept edit and transfer lifecycle details", () => {
    for (const tool of ["edit", "transfer"] as const) {
        const status = validateMutationStatus({ kind: "applied" });
        assert.equal(status.ok, true);
        const details: MutationDetails = {
            tool, status: { kind: "applied" }, toolCallId: "tc1",
            evidenceRef: { inspectionId: "a".repeat(64), resourceIds: ["r1"] },
            usedEvidence: ["r1"], changedResources: [],
            checks: { blocking: [], completed: [], advisory: [], skipped: [], timedOut: [] },
            diagnostics: [],
        };
        assert.equal(validateMutationDetails(details).ok, true);
    }
});

test("mutation details rejects malformed changed resource coverage", () => {
    const details = {
        tool: "edit", status: { kind: "applied" }, toolCallId: "tc1",
        evidenceRef: { inspectionId: "a".repeat(64), resourceIds: ["r1"] },
        usedEvidence: ["r1"],
        changedResources: [{ resourceId: "r1", canonicalPath: "/abs/ws/a.ts", fullFileSha256: "d".repeat(64), coverage: "invalid" }],
        checks: { blocking: [], completed: [], advisory: [], skipped: [], timedOut: [] }, diagnostics: [],
    };
    assert.equal(validateMutationDetails(details).ok, false);
});

test("mutation details rejects malformed lifecycle check records and outcomes", () => {
    const base = {
        tool: "edit", status: { kind: "applied" }, toolCallId: "tc1",
        evidenceRef: { inspectionId: "a".repeat(64), resourceIds: ["r1"] }, usedEvidence: ["r1"], changedResources: [], diagnostics: [],
    };
    assert.equal(validateMutationDetails({ ...base, checks: { blocking: [{ id: "", outcome: "pass" }], completed: [], advisory: [], skipped: [], timedOut: [] } }).ok, false);
    assert.equal(validateMutationDetails({ ...base, checks: { blocking: [{ id: "check", outcome: "unknown" }], completed: [], advisory: [], skipped: [], timedOut: [] } }).ok, false);
});

test("mutation details rejects invalid rollback reason", () => {
    const details = {
        tool: "edit", status: { kind: "applied" }, toolCallId: "tc1",
        evidenceRef: { inspectionId: "a".repeat(64), resourceIds: ["r1"] }, usedEvidence: ["r1"], changedResources: [],
        checks: { blocking: [], completed: [], advisory: [], skipped: [], timedOut: [] }, diagnostics: [], rollback: { ok: false, reason: 42 },
    };
    assert.equal(validateMutationDetails(details).ok, false);
});

test("mutation status rejects unknown reason", () => {
    assert.equal(validateMutationStatus({ kind: "rejected", reason: "patch" }).ok, false);
});

test("mutation status rejects contradictory discriminant fields", () => {
    assert.equal(validateMutationStatus({ kind: "applied", reason: "stale" }).ok, false);
    assert.equal(validateMutationStatus({ kind: "applied", phase: "write" }).ok, false);
    assert.equal(validateMutationStatus({ kind: "rejected", reason: "stale", phase: "write" }).ok, false);
    assert.equal(validateMutationStatus({ kind: "failed", phase: "write", reason: "stale" }).ok, false);
});

test("mutation details rejects NUL paths and sparse nested arrays", () => {
    const base = {
        tool: "edit", status: { kind: "applied" }, toolCallId: "tc1",
        evidenceRef: { inspectionId: "a".repeat(64), resourceIds: ["r1"] },
        usedEvidence: ["r1"], changedResources: [],
        checks: { blocking: [], completed: [], advisory: [], skipped: [], timedOut: [] }, diagnostics: [],
    };
    assert.equal(validateMutationDetails({ ...base, changedResources: [{ resourceId: "r1", canonicalPath: "/abs/ws/\0a.ts", fullFileSha256: "d".repeat(64), coverage: "full-file" }] }).ok, false);

    const sparseUsed = [] as string[];
    sparseUsed.length = 1;
    assert.equal(validateMutationDetails({ ...base, usedEvidence: sparseUsed }).ok, false);
    const sparseDiagnostics = [] as string[];
    sparseDiagnostics.length = 1;
    assert.equal(validateMutationDetails({ ...base, diagnostics: sparseDiagnostics }).ok, false);
    for (const field of ["blocking", "completed", "advisory", "skipped", "timedOut"] as const) {
        const sparseChecks = { ...base.checks, [field]: [] as unknown[] };
        sparseChecks[field].length = 1;
        assert.equal(validateMutationDetails({ ...base, checks: sparseChecks }).ok, false, `sparse ${field} must reject`);
    }
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

test("validateEventMessage accepts new language-intelligence RPC methods", () => {
    for (const rpc of ["language_intelligence_capabilities", "check_post_edit_diagnostics"] as const) {
        const r = validateEventMessage({ kind: "request", requestId: "r", rpc, payload: {}, schemaVersion: PROTOCOL_SCHEMA_VERSION } as any);
        assert.equal(r.ok, true, `rpc=${rpc} should be accepted`);
        if (r.ok) assert.equal((r.value as any).rpc, rpc);
    }
});

test("validateEventMessage still accepts existing RPC methods (no regression)", () => {
    for (const rpc of ["resolve_evidence", "publish_inspection", "invalidate"] as const) {
        const r = validateEventMessage({ kind: "request", requestId: "r", rpc, payload: {}, schemaVersion: PROTOCOL_SCHEMA_VERSION } as any);
        assert.equal(r.ok, true, `rpc=${rpc} should still be accepted`);
    }
    // unknown still rejected
    const bad = validateEventMessage({ kind: "request", requestId: "r", rpc: "unknown_method", payload: {}, schemaVersion: PROTOCOL_SCHEMA_VERSION } as any);
    assert.equal(bad.ok, false);
});

test("validateEventMessage v3 evidence still round-trips unchanged", () => {
    const env = buildValidEnvelope();
    // existing validation must still accept valid envelope
    const r = validateInspectionEnvelope(env);
    assert.equal(r.ok, true);
    const msg: EventMessage = { kind: "request", requestId: "abc", rpc: "resolve_evidence", payload: { x: 1 }, schemaVersion: PROTOCOL_SCHEMA_VERSION };
    const enc = encodeEventMessage(msg);
    const dec = decodeEventMessage(enc);
    assert.equal(dec.kind, "request");
    assert.equal((dec as any).rpc, "resolve_evidence");
});

test("validateInspectionEnvelope rejects NUL in canonicalWorkspaceRoot", () => {
    const env = buildValidEnvelope();
    const bad = validateInspectionEnvelope({ ...env, canonicalWorkspaceRoot: "/abs/ws/\0evil" });
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.match(bad.error, /NUL/);
    assert.equal(validateInspectionEnvelope(env).ok, true);
    assert.equal(validateInspectionEnvelope({ ...env, canonicalWorkspaceRoot: "/" }).ok, true);
});
