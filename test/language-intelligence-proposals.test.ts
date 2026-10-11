import { test } from "node:test";
import assert from "node:assert/strict";
import {
    validateRenamePreviewResponse,
    validateFormattingResponse,
    validateCodeActionRequest,
    validateCodeActionResponse,
    validateCodeActionSelection,
} from "../src/index.js";

function hex64(c = "a") { return c.repeat(64); }

function stagedProposal(overrides: Record<string, unknown> = {}) {
    return { ok: true, proposalId: "p1", files: ["/x/a.ts"], diff: "@@ -1 +1 @@", ...overrides };
}

function discoveryItem(overrides: Record<string, unknown> = {}) {
    return { title: "Organize imports", kind: "source.organizeImports", actionId: hex64("a"), sourceSha256: hex64("b"), isPreferred: true, ...overrides };
}

// ── rename_preview / formatting: staged proposals, never raw edits ──

for (const [name, validate] of [
    ["RenamePreviewResponse", validateRenamePreviewResponse],
    ["FormattingResponse", validateFormattingResponse],
] as const) {
    test(`${name}: success requires proposalId/files/diff`, () => {
        assert.equal(validate(stagedProposal()).ok, true);
        assert.equal(validate({ ...stagedProposal(), serverDescriptorId: "s1" }).ok, true);
        assert.equal(validate({ ok: true }).ok, false);
        assert.equal(validate({ ok: true, proposalId: "p1", files: [], diff: "" }).ok, true);
        assert.equal(validate({ ok: true, proposalId: "", files: [], diff: "" }).ok, false);
        assert.equal(validate({ ok: true, proposalId: "p1", files: [42], diff: "" }).ok, false);
        assert.equal(validate({ ok: true, proposalId: "p1", files: [], diff: 7 }).ok, false);
    });

    test(`${name}: success rejects a workspaceEdit field`, () => {
        const edit = { positionEncoding: "utf-16", fileEdits: [{ filePath: "/x/a.ts", edits: [] }] };
        assert.equal(validate({ ...stagedProposal(), workspaceEdit: edit }).ok, false);
        assert.equal(validate({ ok: true, workspaceEdit: edit }).ok, false);
    });

    test(`${name}: failure carries error and no proposal fields`, () => {
        assert.equal(validate({ ok: false, error: "no-server" }).ok, true);
        assert.equal(validate({ ok: false }).ok, false);
        assert.equal(validate({ ok: false, error: "" }).ok, false);
        assert.equal(validate({ ok: false, error: "x", proposalId: "p1" }).ok, false);
        assert.equal(validate({ ok: false, error: "x", workspaceEdit: {} }).ok, false);
    });
}

// ── code_action discovery: candidates without edits ──

test("CodeActionResponse discovery requires actionId+sourceSha256 (lowercase 64-hex)", () => {
    const ok = { ok: true, actions: [discoveryItem()] };
    assert.equal(validateCodeActionResponse(ok).ok, true);
    assert.equal(validateCodeActionResponse({ ok: true, actions: [] }).ok, true);
    assert.equal(validateCodeActionResponse({ ...ok, serverDescriptorId: "s1" }).ok, true);
    // missing identity
    assert.equal(validateCodeActionResponse({ ok: true, actions: [{ title: "t" }] }).ok, false);
    assert.equal(validateCodeActionResponse({ ok: true, actions: [{ title: "t", actionId: hex64(), sourceSha256: "zzz" }] }).ok, false);
    // malformed sha shapes
    for (const bad of [hex64().toUpperCase(), hex64().slice(1), "g".repeat(64), "", 42]) {
        assert.equal(validateCodeActionResponse({ ok: true, actions: [{ title: "t", actionId: bad, sourceSha256: hex64() }] }).ok, false, `actionId=${JSON.stringify(bad)}`);
        assert.equal(validateCodeActionResponse({ ok: true, actions: [{ title: "t", actionId: hex64(), sourceSha256: bad }] }).ok, false, `sourceSha256=${JSON.stringify(bad)}`);
    }
});

test("CodeActionResponse discovery item rejects workspaceEdit", () => {
    const edit = { positionEncoding: "utf-16", fileEdits: [{ filePath: "/x/a.ts", edits: [] }] };
    assert.equal(validateCodeActionResponse({ ok: true, actions: [{ ...discoveryItem(), workspaceEdit: edit }] }).ok, false);
});

test("CodeActionResponse discovery item rejects other edit-carrying fields", () => {
    assert.equal(validateCodeActionResponse({ ok: true, actions: [{ ...discoveryItem(), edit: {} }] }).ok, false);
    assert.equal(validateCodeActionResponse({ ok: true, actions: [{ ...discoveryItem(), command: "x" }] }).ok, false);
});

// ── code_action selection: explicit { actionId, sourceSha256 } ──

test("validateCodeActionSelection accepts exact identity and rejects extras", () => {
    assert.equal(validateCodeActionSelection({ actionId: hex64("a"), sourceSha256: hex64("b") }).ok, true);
    assert.equal(validateCodeActionSelection({ actionId: hex64(), sourceSha256: hex64(), extra: 1 }).ok, false);
    assert.equal(validateCodeActionSelection({ actionId: hex64() }).ok, false);
    assert.equal(validateCodeActionSelection({ sourceSha256: hex64() }).ok, false);
    assert.equal(validateCodeActionSelection({ actionId: "not-hex", sourceSha256: hex64() }).ok, false);
    assert.equal(validateCodeActionSelection({ actionId: hex64(), sourceSha256: hex64().toUpperCase() }).ok, false);
    assert.equal(validateCodeActionSelection(null).ok, false);
});

test("CodeActionRequest accepts an explicit selection and validates it", () => {
    const base = { filePath: "/x/a.ts", line: 1, character: 2 };
    const selection = { actionId: hex64("a"), sourceSha256: hex64("b") };
    assert.equal(validateCodeActionRequest({ ...base, selection }).ok, true);
    assert.equal(validateCodeActionRequest(base).ok, true);
    assert.equal(validateCodeActionRequest({ ...base, selection: { actionId: "bad", sourceSha256: hex64() } }).ok, false);
    assert.equal(validateCodeActionRequest({ ...base, selection: "x" }).ok, false);
});

// ── code_action resolution returns a staged proposal ──

test("CodeActionResponse staged resolution requires proposalId/files/diff", () => {
    assert.equal(validateCodeActionResponse(stagedProposal()).ok, true);
    assert.equal(validateCodeActionResponse({ ...stagedProposal(), serverDescriptorId: "s1" }).ok, true);
    assert.equal(validateCodeActionResponse({ ok: true, proposalId: "p1" }).ok, false);
});

test("CodeActionResponse rejects mixing discovery and staged shapes", () => {
    assert.equal(validateCodeActionResponse({ ...stagedProposal(), actions: [discoveryItem()] }).ok, false);
    assert.equal(validateCodeActionResponse({ ok: true }).ok, false);
    assert.equal(validateCodeActionResponse({ ok: true, actions: [discoveryItem()], workspaceEdit: {} }).ok, false);
});

test("CodeActionResponse failure carries error", () => {
    assert.equal(validateCodeActionResponse({ ok: false, error: "timeout" }).ok, true);
    assert.equal(validateCodeActionResponse({ ok: false }).ok, false);
    assert.equal(validateCodeActionResponse({ ok: false, error: "x", actions: [] }).ok, false);
});
