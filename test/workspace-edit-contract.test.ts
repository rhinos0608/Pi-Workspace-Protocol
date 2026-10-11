import { test } from "node:test";
import assert from "node:assert/strict";
import {
    PROTOCOL_SCHEMA_VERSION,
    validateApplyStagedEditRequest,
    validateEventMessage,
    validateStageWorkspaceEditRequest,
    validateStageWorkspaceEditSource,
} from "../src/index.js";

function hex64(c = "a") {
    return c.repeat(64);
}

function validStage() {
    return {
        workspaceEdit: { fileEdits: [] },
        source: {
            operation: "rename",
            document: {
                canonicalPath: "/abs/ws/file.ts",
                sha256: hex64("a"),
            },
        },
        sessionFilePath: "/tmp/session.json",
        cwd: "/abs/ws",
    };
}

function validApply() {
    return { proposalId: "p1", toolCallId: "t1", sessionFilePath: "/tmp/session.json", cwd: "/abs/ws" };
}

test("validateStageWorkspaceEditRequest rejects source missing origin document precondition", () => {
    const legacyWithoutDocument = {
        workspaceEdit: { fileEdits: [] },
        source: { operation: "rename" },
        sessionFilePath: "/tmp/session.json",
        cwd: "/abs/ws",
    };
    const res = validateStageWorkspaceEditRequest(legacyWithoutDocument);
    assert.equal(res.ok, false, "stage source without origin document must be rejected");
});

test("validateStageWorkspaceEditRequest accepts valid", () => {
    assert.equal(validateStageWorkspaceEditRequest(validStage()).ok, true);
    assert.equal(validateStageWorkspaceEditRequest({
        ...validStage(),
        source: {
            operation: "rename",
            document: { canonicalPath: "/abs/ws/file.ts", sha256: hex64("a") },
            serverDescriptorId: "s1",
        },
    }).ok, true);
});

test("validateStageWorkspaceEditSource accepts valid POSIX, Windows drive-absolute, UNC paths cross-platform without cwd jail", () => {
    const validPaths = [
        "/abs/ws/file.ts",
        "/outside/cwd/file.ts",
        "C:/abs/ws/file.ts",
        "C:\\abs\\ws\\file.ts",
        "d:/outside/file.ts",
        "D:\\outside\\file.ts",
        "\\\\server\\share\\file.ts",
        "//server/share/file.ts",
    ];
    for (const canonicalPath of validPaths) {
        const res = validateStageWorkspaceEditSource({
            operation: "codeAction",
            document: { canonicalPath, sha256: hex64("b") },
        });
        assert.equal(res.ok, true, `path ${canonicalPath} should be accepted`);
    }
});

test("validateStageWorkspaceEditRequest rejects non-absolute / relative shaped paths and NUL bytes", () => {
    const invalidPaths = [
        "",
        "file.ts",
        "./file.ts",
        "../file.ts",
        "sub/dir/file.ts",
        "C:relative/file.ts",
        "\\\\",
        "\\\\server",
        "\\\\server\\",
        "\\\\server\\\\share",
        "/abs/file\0.ts",
        "C:/abs/\0file.ts",
    ];
    for (const canonicalPath of invalidPaths) {
        const res = validateStageWorkspaceEditRequest({
            ...validStage(),
            source: {
                operation: "rename",
                document: { canonicalPath, sha256: hex64() },
            },
        });
        assert.equal(res.ok, false, `path ${JSON.stringify(canonicalPath)} should be rejected`);
    }
});

test("validateStageWorkspaceEditRequest rejects malformed origin document sha256", () => {
    const invalidSha = [
        "",
        hex64("A"), // uppercase rejected
        "a".repeat(63), // too short
        "a".repeat(65), // too long
        "g".repeat(64), // non-hex
        123 as unknown as string,
        null as unknown as string,
        undefined as unknown as string,
    ];
    for (const sha of invalidSha) {
        const res = validateStageWorkspaceEditRequest({
            ...validStage(),
            source: {
                operation: "rename",
                document: { canonicalPath: "/abs/file.ts", sha256: sha },
            },
        });
        assert.equal(res.ok, false, `sha ${JSON.stringify(sha)} should be rejected`);
    }
});

test("validateStageWorkspaceEditRequest fails closed on unknown document fields", () => {
    for (const extraKey of ["lease", "extra", "fresh", "coverage", "etag"]) {
        const res = validateStageWorkspaceEditRequest({
            ...validStage(),
            source: {
                operation: "rename",
                document: {
                    canonicalPath: "/abs/file.ts",
                    sha256: hex64(),
                    [extraKey]: "forbidden",
                },
            },
        });
        assert.equal(res.ok, false, `unknown field ${extraKey} should be rejected`);
        if (!res.ok) {
            assert.match(res.error, /unknown field/);
        }
    }
});

test("validateStageWorkspaceEditRequest rejects missing or invalid document", () => {
    for (const invalidDoc of [null, undefined, "not-an-obj", 42, [], true]) {
        const res = validateStageWorkspaceEditRequest({
            ...validStage(),
            source: {
                operation: "rename",
                document: invalidDoc,
            },
        });
        assert.equal(res.ok, false, `invalid doc ${JSON.stringify(invalidDoc)} should be rejected`);
    }
});

test("validateStageWorkspaceEditRequest rejects missing/mistyped fields", () => {
    const base = validStage() as Record<string, unknown>;
    for (const key of ["workspaceEdit", "source", "sessionFilePath", "cwd"] as const) {
        const bad = { ...base };
        delete bad[key];
        assert.equal(validateStageWorkspaceEditRequest(bad).ok, false, `missing ${key}`);
    }
    assert.equal(validateStageWorkspaceEditRequest({ ...base, workspaceEdit: null }).ok, false);
    assert.equal(validateStageWorkspaceEditRequest({ ...base, workspaceEdit: "x" }).ok, false);
    assert.equal(validateStageWorkspaceEditRequest({ ...base, source: { operation: "" } }).ok, false);
    assert.equal(validateStageWorkspaceEditRequest({ ...base, source: { operation: "x", serverDescriptorId: "" } }).ok, false);
    assert.equal(validateStageWorkspaceEditRequest({ ...base, sessionFilePath: "" }).ok, false);
    assert.equal(validateStageWorkspaceEditRequest({ ...base, cwd: 42 }).ok, false);
    assert.equal(validateStageWorkspaceEditRequest("nope").ok, false);
});

test("validateApplyStagedEditRequest accepts valid", () => {
    assert.equal(validateApplyStagedEditRequest(validApply()).ok, true);
});

test("validateApplyStagedEditRequest rejects missing/mistyped fields", () => {
    const base = validApply() as Record<string, unknown>;
    for (const key of ["proposalId", "toolCallId", "sessionFilePath", "cwd"] as const) {
        const bad = { ...base };
        delete bad[key];
        assert.equal(validateApplyStagedEditRequest(bad).ok, false, `missing ${key}`);
    }
    assert.equal(validateApplyStagedEditRequest({ ...base, proposalId: "" }).ok, false);
    assert.equal(validateApplyStagedEditRequest({ ...base, toolCallId: 7 }).ok, false);
    assert.equal(validateApplyStagedEditRequest(null).ok, false);
});

test("validateEventMessage accepts new workspace-edit rpc names", () => {
    for (const rpc of ["stage_workspace_edit", "apply_staged_edit"] as const) {
        const r = validateEventMessage({ kind: "request", requestId: "r", rpc, payload: {}, schemaVersion: PROTOCOL_SCHEMA_VERSION } as any);
        assert.equal(r.ok, true, `rpc=${rpc} should be accepted`);
    }
});

test("PROTOCOL_SCHEMA_VERSION is 6 and rejects prior schema versions", () => {
    assert.equal(PROTOCOL_SCHEMA_VERSION, 6);
    for (const staleVersion of [5, 4, 3, 2, 1, 0, 7]) {
        const r = validateEventMessage({
            kind: "request",
            requestId: "r",
            rpc: "stage_workspace_edit",
            payload: {},
            schemaVersion: staleVersion as unknown as 6,
        });
        assert.equal(r.ok, false, `schemaVersion=${staleVersion} should be rejected`);
    }
});
