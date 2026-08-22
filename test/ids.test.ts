import { test } from "node:test";
import assert from "node:assert/strict";
import { sha256OfString, sha256OfBytes, sha256OfFileContents, resourceIdFor, inspectionIdFor, canonicalizeWorkspaceRoot, hashSessionFilePath } from "../src/ids.js";

test("sha256OfString is hex and deterministic", () => {
    const a = sha256OfString("hello world");
    const b = sha256OfString("hello world");
    assert.equal(a, b);
    assert.equal(a.length, 64);
    assert.match(a, /^[0-9a-f]{64}$/);
    // known vector
    assert.equal(sha256OfString(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

test("sha256OfBytes matches sha256OfString for utf8", () => {
    const s = "héllo\nline2";
    const bytes = new TextEncoder().encode(s);
    assert.equal(sha256OfBytes(bytes), sha256OfString(s));
});

test("resourceIdFor is deterministic and depends on path+kind+ranges", () => {
    const a = resourceIdFor({ canonicalPath: "/abs/file.ts", kind: "full" });
    const b = resourceIdFor({ canonicalPath: "/abs/file.ts", kind: "full" });
    assert.equal(a, b);
    assert.equal(a.length, 64);

    const c = resourceIdFor({ canonicalPath: "/abs/file.ts", kind: "range", range: { startLine: 1, endLine: 10 } });
    assert.notEqual(a, c, "different kind/range must produce different id");

    const d = resourceIdFor({ canonicalPath: "/abs/file.ts", kind: "range", range: { startLine: 2, endLine: 10 } });
    assert.notEqual(c, d, "different range must produce different id");

    const e = resourceIdFor({ canonicalPath: "/abs/other.ts", kind: "full" });
    assert.notEqual(a, e, "different path must produce different id");
});

test("inspectionIdFor is deterministic for same inputs, different across sessions/workspaces", () => {
    const a = inspectionIdFor({ sessionId: "s1", workspaceRoot: "/ws", resources: [{ canonicalPath: "/ws/a.ts" }] });
    const b = inspectionIdFor({ sessionId: "s1", workspaceRoot: "/ws", resources: [{ canonicalPath: "/ws/a.ts" }] });
    assert.equal(a, b);

    const c = inspectionIdFor({ sessionId: "s2", workspaceRoot: "/ws", resources: [{ canonicalPath: "/ws/a.ts" }] });
    assert.notEqual(a, c);

    const d = inspectionIdFor({ sessionId: "s1", workspaceRoot: "/ws2", resources: [{ canonicalPath: "/ws/a.ts" }] });
    assert.notEqual(a, d);

    const e = inspectionIdFor({ sessionId: "s1", workspaceRoot: "/ws", resources: [{ canonicalPath: "/ws/b.ts" }] });
    assert.notEqual(a, e);
});

test("canonicalizeWorkspaceRoot resolves to absolute, normalized, no trailing slash", async () => {
    const real = await canonicalizeWorkspaceRoot("/tmp");
    // realpathSync on macOS resolves /tmp -> /private/tmp
    assert.match(real, /^\/(private\/)?tmp$/);
    const real2 = await canonicalizeWorkspaceRoot("/tmp/");
    assert.equal(real, real2, "trailing slash is stripped");
});

test("hashSessionFilePath returns stable hex sha256 of the file path", () => {
    const id1 = hashSessionFilePath("/sessions/abc.jsonl");
    const id2 = hashSessionFilePath("/sessions/abc.jsonl");
    assert.equal(id1, id2);
    assert.equal(id1.length, 64);
    assert.match(id1, /^[0-9a-f]{64}$/);
    // different path -> different id
    const other = hashSessionFilePath("/sessions/def.jsonl");
    assert.notEqual(id1, other);
});

test("sha256OfFileContents matches sha256OfString for same string", () => {
    const s = "const x = 1;\n";
    assert.equal(sha256OfFileContents(s), sha256OfString(s));
    assert.equal(sha256OfFileContents(""), sha256OfString(""));
    assert.equal(sha256OfFileContents("hello").length, 64);
});

test("inspectionIdFor is invariant to resource ordering", () => {
    const res = (path: string) => ({ canonicalPath: path });
    const ordered = [res("/ws/a.ts"), res("/ws/b.ts"), res("/ws/c.ts")];
    const shuffled = [res("/ws/c.ts"), res("/ws/a.ts"), res("/ws/b.ts")];
    const a = inspectionIdFor({ sessionId: "s1", workspaceRoot: "/ws", resources: ordered });
    const b = inspectionIdFor({ sessionId: "s1", workspaceRoot: "/ws", resources: shuffled });
    assert.equal(a, b, "inspectionId must not depend on resource order");
    assert.equal(a.length, 64);
});
