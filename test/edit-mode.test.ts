import { test } from "node:test";
import assert from "node:assert/strict";
import { EDIT_MODES, EDIT_MODE_ENV, resolveEditMode } from "../src/index.js";

test("EDIT_MODES tuple and env name", () => {
    assert.deepEqual([...EDIT_MODES], ["text", "hashline"]);
    assert.equal(EDIT_MODE_ENV, "PI_EDIT_MODE");
});

test("valid PI_EDIT_MODE both modes", () => {
    assert.deepEqual(resolveEditMode({ PI_EDIT_MODE: "text" }), { mode: "text", source: "env" });
    assert.deepEqual(resolveEditMode({ PI_EDIT_MODE: "hashline" }), { mode: "hashline", source: "env" });
});

test("PI_EDIT_MODE case and whitespace tolerant", () => {
    assert.equal(resolveEditMode({ PI_EDIT_MODE: "  HashLine " }).mode, "hashline");
    assert.equal(resolveEditMode({ PI_EDIT_MODE: "TEXT" }).mode, "text");
    assert.equal(resolveEditMode({ PI_EDIT_MODE: "  TEXT " }).source, "env");
});

test("invalid PI_EDIT_MODE warns and defaults to text", () => {
    const r = resolveEditMode({ PI_EDIT_MODE: "ast" });
    assert.equal(r.mode, "text");
    assert.equal(r.source, "default");
    assert.ok(r.warning?.includes("ast"));
    assert.ok(r.warning?.includes("text") && r.warning?.includes("hashline"));
});

test("empty PI_EDIT_MODE falls through to legacy", () => {
    const r = resolveEditMode({ PI_EDIT_MODE: "   ", SMART_EDIT_USE_HASHLINE_EDITING: "1" });
    assert.deepEqual(r, { mode: "hashline", source: "legacy" });
});

test("direct legacy var beats alias", () => {
    const r = resolveEditMode({ SMART_EDIT_USE_HASHLINE_EDITING: "0", SMART_EDIT_HASHLINE_EXPERIMENTAL: "1" });
    assert.deepEqual(r, { mode: "text", source: "legacy" });
});

test("legacy truthy variants", () => {
    for (const v of ["1", "true", "TRUE", " yes ", "ON"]) {
        assert.equal(resolveEditMode({ SMART_EDIT_USE_HASHLINE_EDITING: v }).mode, "hashline", v);
    }
    for (const v of ["0", "false", "no", "off", ""]) {
        if (v === "") continue;
        assert.equal(resolveEditMode({ SMART_EDIT_USE_HASHLINE_EDITING: v }).mode, "text", v);
    }
});

test("alias alone decides", () => {
    assert.deepEqual(resolveEditMode({ SMART_EDIT_HASHLINE_EXPERIMENTAL: "1" }), { mode: "hashline", source: "legacy" });
    assert.deepEqual(resolveEditMode({ SMART_EDIT_HASHLINE_EXPERIMENTAL: "0" }), { mode: "text", source: "legacy" });
});

test("nothing set defaults to text", () => {
    assert.deepEqual(resolveEditMode({}), { mode: "text", source: "default" });
});
