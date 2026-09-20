import { test } from "node:test";
import assert from "node:assert/strict";
import {
    validateLanguageIntelligenceCapabilitiesRequest,
    validateLanguageIntelligenceCapabilitiesResponse,
    validateCheckPostEditDiagnosticsRequest,
    validateLanguageDiagnostic,
    validateCheckPostEditDiagnosticsResponse,
} from "../src/language-intelligence.js";

// -- helper --
function hex64(c = "a") { return c.repeat(64); }

function validDiag(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        message: "error",
        severity: 1 as const,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        source: "ts",
        ...overrides,
    };
}

// -- CapabilitiesRequest --
test("validateLanguageIntelligenceCapabilitiesRequest accepts empty object", () => {
    assert.equal(validateLanguageIntelligenceCapabilitiesRequest({}).ok, true);
});

// -- CapabilitiesResponse --
test("validateLanguageIntelligenceCapabilitiesResponse accepts valid", () => {
    assert.equal(validateLanguageIntelligenceCapabilitiesResponse({ provider: "pi-smartread", capabilities: [] }).ok, true);
    assert.equal(validateLanguageIntelligenceCapabilitiesResponse({ provider: "pi-smartread", capabilities: ["post-edit-diagnostics"] }).ok, true);
});
test("validateLanguageIntelligenceCapabilitiesResponse rejects bad provider", () => {
    const r = validateLanguageIntelligenceCapabilitiesResponse({ provider: "other", capabilities: [] });
    assert.equal(r.ok, false);
});
test("validateLanguageIntelligenceCapabilitiesResponse rejects bad capability", () => {
    const r = validateLanguageIntelligenceCapabilitiesResponse({ provider: "pi-smartread", capabilities: ["bad"] });
    assert.equal(r.ok, false);
});

// -- CheckPostEditDiagnosticsRequest valid --
test("validateCheckPostEditDiagnosticsRequest accepts valid", () => {
    const r = validateCheckPostEditDiagnosticsRequest({
        canonicalPath: "/ws/a.ts",
        canonicalWorkspaceRoot: "/ws",
        expectedContentSha256: hex64(),
        waitMs: 0,
        maxDiagnostics: 1,
    });
    assert.equal(r.ok, true);
    // boundary upper
    const r2 = validateCheckPostEditDiagnosticsRequest({
        canonicalPath: "/ws/a.ts",
        canonicalWorkspaceRoot: "/ws",
        expectedContentSha256: hex64("b"),
        waitMs: 3000,
        maxDiagnostics: 100,
    });
    assert.equal(r2.ok, true);
});
test("validateCheckPostEditDiagnosticsRequest rejects malformed sha256", () => {
    const base = { canonicalPath: "/ws/a.ts", canonicalWorkspaceRoot: "/ws", waitMs: 100, maxDiagnostics: 10 };
    for (const bad of ["", "ABC".repeat(21) + "A", hex64().toUpperCase(), "z".repeat(64), hex64().slice(1)]) {
        const r = validateCheckPostEditDiagnosticsRequest({ ...base, expectedContentSha256: bad });
        assert.equal(r.ok, false, `should reject sha256=${JSON.stringify(bad)}`);
    }
});
test("validateCheckPostEditDiagnosticsRequest rejects out-of-range waitMs/maxDiagnostics", () => {
    const base = { canonicalPath: "/ws/a.ts", canonicalWorkspaceRoot: "/ws", expectedContentSha256: hex64(), maxDiagnostics: 10 };
    assert.equal(validateCheckPostEditDiagnosticsRequest({ ...base, waitMs: -1 }).ok, false);
    assert.equal(validateCheckPostEditDiagnosticsRequest({ ...base, waitMs: 3001 }).ok, false);
    assert.equal(validateCheckPostEditDiagnosticsRequest({ ...base, waitMs: 1.5 }).ok, false);
    assert.equal(validateCheckPostEditDiagnosticsRequest({ ...base, waitMs: "100" as unknown as number }).ok, false);
    assert.equal(validateCheckPostEditDiagnosticsRequest({ canonicalPath: "/ws/a.ts", canonicalWorkspaceRoot: "/ws", expectedContentSha256: hex64(), waitMs: 100, maxDiagnostics: 0 }).ok, false);
    assert.equal(validateCheckPostEditDiagnosticsRequest({ canonicalPath: "/ws/a.ts", canonicalWorkspaceRoot: "/ws", expectedContentSha256: hex64(), waitMs: 100, maxDiagnostics: 101 }).ok, false);
    assert.equal(validateCheckPostEditDiagnosticsRequest({ canonicalPath: "/ws/a.ts", canonicalWorkspaceRoot: "/ws", expectedContentSha256: hex64(), waitMs: 100, maxDiagnostics: 1.2 }).ok, false);
});
test("validateCheckPostEditDiagnosticsRequest rejects missing required fields", () => {
    assert.equal(validateCheckPostEditDiagnosticsRequest({}).ok, false);
    assert.equal(validateCheckPostEditDiagnosticsRequest({ canonicalPath: "/a" }).ok, false);
});

// -- LanguageDiagnostic validators --
test("validateLanguageDiagnostic accepts valid", () => {
    assert.equal(validateLanguageDiagnostic(validDiag()).ok, true);
});
test("validateLanguageDiagnostic rejects invalid severity", () => {
    for (const s of [0, 5, "1" as unknown as number, 1.5]) {
        assert.equal(validateLanguageDiagnostic(validDiag({ severity: s } as unknown as Record<string, unknown>)).ok, false);
    }
});
test("validateLanguageDiagnostic rejects negative line/character", () => {
    assert.equal(validateLanguageDiagnostic(validDiag({ range: { start: { line: -1, character: 0 }, end: { line: 0, character: 0 } } } as unknown as Record<string, unknown>)).ok, false);
    assert.equal(validateLanguageDiagnostic(validDiag({ range: { start: { line: 0, character: -2 }, end: { line: 0, character: 0 } } } as unknown as Record<string, unknown>)).ok, false);
    assert.equal(validateLanguageDiagnostic(validDiag({ range: { start: { line: 0.5, character: 0 }, end: { line: 0, character: 0 } } } as unknown as Record<string, unknown>)).ok, false);
});
test("validateLanguageDiagnostic rejects oversized message/source", () => {
    assert.equal(validateLanguageDiagnostic(validDiag({ message: "x".repeat(16385) })).ok, false);
    assert.equal(validateLanguageDiagnostic(validDiag({ source: "x".repeat(257) })).ok, false);
    // boundary exact ok
    assert.equal(validateLanguageDiagnostic(validDiag({ message: "x".repeat(16384) })).ok, true);
    assert.equal(validateLanguageDiagnostic(validDiag({ source: "x".repeat(256) })).ok, true);
});
test("validateLanguageDiagnostic rejects malformed range", () => {
    assert.equal(validateLanguageDiagnostic({ message: "x", severity: 1, source: "ts" } as unknown as Record<string, unknown>).ok, false);
    assert.equal(validateLanguageDiagnostic(validDiag({ range: null as unknown as object })).ok, false);
});
test("validateCheckPostEditDiagnosticsResponse rejects too many diagnostics", () => {
    const diags = Array.from({ length: 101 }, () => validDiag());
    assert.equal(validateCheckPostEditDiagnosticsResponse({ status: "confirmed", diagnostics: diags, truncated: false }).ok, false);
});
test("validateCheckPostEditDiagnosticsResponse rejects diagnostics exceeding caps via nested validator", () => {
    const bad = validDiag({ message: "x".repeat(16385) });
    assert.equal(validateCheckPostEditDiagnosticsResponse({ status: "confirmed", diagnostics: [bad], truncated: false }).ok, false);
});

// -- CheckPostEditDiagnosticsResponse status variants --
test("validateCheckPostEditDiagnosticsResponse accepts confirmed", () => {
    assert.equal(validateCheckPostEditDiagnosticsResponse({ status: "confirmed", diagnostics: [], truncated: false }).ok, false);
    assert.equal(validateCheckPostEditDiagnosticsResponse({ status: "confirmed", diagnostics: [validDiag()], truncated: true }).ok, true);
    assert.equal(validateCheckPostEditDiagnosticsResponse({ status: "confirmed", diagnostics: Array.from({ length: 100 }, () => validDiag()), truncated: true }).ok, true);
});
test("validateCheckPostEditDiagnosticsResponse rejects confirmed with empty diagnostics", () => {
    assert.equal(validateCheckPostEditDiagnosticsResponse({ status: "confirmed", diagnostics: [], truncated: false }).ok, false);
    assert.equal(validateCheckPostEditDiagnosticsResponse({ status: "confirmed", diagnostics: [], truncated: true }).ok, false);
});
test("validateCheckPostEditDiagnosticsResponse accepts empty with zero diagnostics", () => {
    assert.equal(validateCheckPostEditDiagnosticsResponse({ status: "empty", diagnostics: [], truncated: false }).ok, true);
});
test("validateCheckPostEditDiagnosticsResponse accepts unavailable", () => {
    assert.equal(validateCheckPostEditDiagnosticsResponse({ status: "unavailable", reason: "no-server", diagnostics: [], truncated: false }).ok, true);
});
test("validateCheckPostEditDiagnosticsResponse accepts degraded variants", () => {
    for (const reason of ["unconfirmed", "content-mismatch", "file-unreadable"] as const) {
        assert.equal(validateCheckPostEditDiagnosticsResponse({ status: "degraded", reason, diagnostics: [], truncated: false }).ok, true);
    }
});
test("validateCheckPostEditDiagnosticsResponse rejects degraded without valid reason", () => {
    assert.equal(validateCheckPostEditDiagnosticsResponse({ status: "degraded", diagnostics: [], truncated: false } as unknown as Record<string, unknown>).ok, false);
    assert.equal(validateCheckPostEditDiagnosticsResponse({ status: "degraded", reason: "no-server", diagnostics: [], truncated: false }).ok, false);
});
test("validateCheckPostEditDiagnosticsResponse rejects unavailable with wrong reason", () => {
    assert.equal(validateCheckPostEditDiagnosticsResponse({ status: "unavailable", reason: "unconfirmed", diagnostics: [], truncated: false }).ok, false);
});
test("validateCheckPostEditDiagnosticsResponse rejects empty with non-empty diagnostics or truncated true", () => {
    assert.equal(validateCheckPostEditDiagnosticsResponse({ status: "empty", diagnostics: [validDiag()], truncated: false }).ok, false);
    assert.equal(validateCheckPostEditDiagnosticsResponse({ status: "empty", diagnostics: [], truncated: true }).ok, false);
});
test("validateCheckPostEditDiagnosticsResponse rejects unavailable/degraded with non-empty diagnostics", () => {
    assert.equal(validateCheckPostEditDiagnosticsResponse({ status: "unavailable", reason: "no-server", diagnostics: [validDiag()], truncated: false }).ok, false);
    assert.equal(validateCheckPostEditDiagnosticsResponse({ status: "degraded", reason: "unconfirmed", diagnostics: [validDiag()], truncated: false }).ok, false);
});
test("validateCheckPostEditDiagnosticsResponse rejects invalid severity inside confirmed diagnostics", () => {
    const bad = validDiag({ severity: 99 as unknown as number } as unknown as Record<string, unknown>);
    assert.equal(validateCheckPostEditDiagnosticsResponse({ status: "confirmed", diagnostics: [bad], truncated: false }).ok, false);
});
test("round-trip valid request/response acceptance", () => {
    const req = { canonicalPath: "/ws/a.ts", canonicalWorkspaceRoot: "/ws", expectedContentSha256: hex64("c"), waitMs: 500, maxDiagnostics: 50 };
    assert.equal(validateCheckPostEditDiagnosticsRequest(req).ok, true);
    const res = { status: "confirmed" as const, diagnostics: [validDiag({ message: "ok", severity: 2 as const })], truncated: false };
    assert.equal(validateCheckPostEditDiagnosticsResponse(res).ok, true);
});
