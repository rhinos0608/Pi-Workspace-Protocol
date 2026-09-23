import { test } from "node:test";
import assert from "node:assert/strict";
import {
    PROTOCOL_SCHEMA_VERSION,
    LSP_TIMEOUT_MS_MIN,
    LSP_TIMEOUT_MS_DEFAULT,
    LSP_TIMEOUT_MS_MAX,
} from "../src/types.js";
import {
    validateRenamePreviewRequest,
    validateOrganizeImportsRequest,
    validateFormattingRequest,
    validateCodeActionRequest,
    validateRenamePreviewResponse,
    validateEventMessage,
    encodeEventMessage,
    decodeEventMessage,
} from "../src/contract.js";
import { validateCheckPostEditDiagnosticsRequest } from "../src/language-intelligence.js";

function hex64(c = "a") { return c.repeat(64); }

const renameBase = { filePath: "/x/a.ts", line: 1, character: 2, newName: "b" };
const orgBase = { filePath: "/x/a.ts" };
const fmtBase = { filePath: "/x/a.ts" };
const caBase = { filePath: "/x/a.ts", line: 0, character: 0 };
const diagBase = {
    canonicalPath: "/w/a.ts",
    canonicalWorkspaceRoot: "/w",
    expectedContentSha256: hex64(),
    waitMs: 100,
    maxDiagnostics: 10,
};
const goodEdit = {
    positionEncoding: "utf-16",
    fileEdits: [{ filePath: "/x/a.ts", edits: [] }],
};

const requestValidators: Array<[string, (v: unknown) => { ok: boolean }, Record<string, unknown>]> = [
    ["RenamePreviewRequest", validateRenamePreviewRequest, renameBase],
    ["OrganizeImportsRequest", validateOrganizeImportsRequest, orgBase],
    ["FormattingRequest", validateFormattingRequest, fmtBase],
    ["CodeActionRequest", validateCodeActionRequest, caBase],
    ["CheckPostEditDiagnosticsRequest", validateCheckPostEditDiagnosticsRequest, diagBase],
];

for (const [name, validate, base] of requestValidators) {
    test(`${name}: timeoutMs optional (absent ok)`, () => {
        assert.equal(validate({ ...base }).ok, true);
    });
    test(`${name}: timeoutMs valid boundaries 250/10000/30000`, () => {
        for (const t of [250, 10000, 30000]) assert.equal(validate({ ...base, timeoutMs: t }).ok, true, `${name} timeoutMs=${t}`);
    });
    test(`${name}: timeoutMs rejects malformed/negative/non-integer/out-of-range`, () => {
        for (const t of [-1, 0, 249, 30001, 1.5, "1000", NaN, null, {}, true]) {
            const r = validate({ ...base, timeoutMs: t });
            assert.equal(r.ok, false, `${name} timeoutMs=${JSON.stringify(t)} should reject`);
        }
    });
}

test("constants: timeout envelope 250/10000/30000", () => {
    assert.equal(LSP_TIMEOUT_MS_MIN, 250);
    assert.equal(LSP_TIMEOUT_MS_DEFAULT, 10000);
    assert.equal(LSP_TIMEOUT_MS_MAX, 30000);
});

test("PROTOCOL_SCHEMA_VERSION is 5", () => {
    assert.equal(PROTOCOL_SCHEMA_VERSION, 5);
});

test("LspWorkspaceEdit: requires positionEncoding utf-16", () => {
    assert.equal(validateRenamePreviewResponse({ ok: true, workspaceEdit: goodEdit }).ok, true);
});

test("LspWorkspaceEdit: rejects missing/wrong encoding", () => {
    const { positionEncoding: _drop, ...noEncoding } = goodEdit;
    assert.equal(validateRenamePreviewResponse({ ok: true, workspaceEdit: noEncoding }).ok, false);
    for (const enc of ["utf-8", "utf-32", "", "UTF-16", null, 16]) {
        assert.equal(
            validateRenamePreviewResponse({ ok: true, workspaceEdit: { ...goodEdit, positionEncoding: enc } }).ok,
            false,
            `encoding=${JSON.stringify(enc)} should reject`,
        );
    }
});

test("schema-5 event round-trip (encode/decode + gate)", () => {
    const msg = {
        kind: "request",
        requestId: "r-schema5",
        rpc: "rename_preview",
        payload: { ...renameBase, timeoutMs: 1000 },
        schemaVersion: PROTOCOL_SCHEMA_VERSION,
    } as const;
    const wire = encodeEventMessage(msg as never);
    const back = decodeEventMessage(wire);
    assert.equal(back.requestId, "r-schema5");
    assert.equal(validateEventMessage(back).ok, true);
    assert.equal(validateRenamePreviewRequest((msg.payload as Record<string, unknown>)).ok, true);
});

test("schema-5 gate rejects stale schemaVersion 4", () => {
    const r = validateEventMessage({ kind: "request", requestId: "r", rpc: "rename_preview", payload: {}, schemaVersion: 4 });
    assert.equal(r.ok, false);
});
