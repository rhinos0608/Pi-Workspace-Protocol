import { test } from "node:test";
import assert from "node:assert/strict";
import {
    PROTOCOL_SCHEMA_VERSION,
    validateApplyStagedEditRequest,
    validateEventMessage,
    validateStageWorkspaceEditRequest,
} from "../src/index.js";

function validStage() {
    return {
        workspaceEdit: { fileEdits: [] },
        source: { operation: "rename" },
        sessionFilePath: "/tmp/session.json",
        cwd: "/abs/ws",
    };
}

function validApply() {
    return { proposalId: "p1", toolCallId: "t1", sessionFilePath: "/tmp/session.json", cwd: "/abs/ws" };
}

test("validateStageWorkspaceEditRequest accepts valid", () => {
    assert.equal(validateStageWorkspaceEditRequest(validStage()).ok, true);
    assert.equal(validateStageWorkspaceEditRequest({ ...validStage(), source: { operation: "rename", serverDescriptorId: "s1" } }).ok, true);
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
