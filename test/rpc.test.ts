import { test } from "node:test";
import assert from "node:assert/strict";
import { createRpcClient, createRpcServer } from "../src/rpc.js";
import type { EventMessage } from "../src/index.js";

type Emitted = { channel: string; data: unknown };
type Handler = (data: unknown) => void;

function makeBus() {
    const subs = new Map<string, Set<Handler>>();
    return {
        emit(channel: string, data: unknown) {
            const set = subs.get(channel);
            if (!set) return;
            for (const h of [...set]) h(data);
        },
        on(channel: string, handler: Handler) {
            let set = subs.get(channel);
            if (!set) { set = new Set(); subs.set(channel, set); }
            set.add(handler);
            return () => { set!.delete(handler); };
        },
    };
}

test("rpc request/reply correlates by requestId and supports timeout", async () => {
    const bus = makeBus();
    const server = createRpcServer({
        bus: bus as any,
        channel: "test.rpc",
        handler: async (req) => ({ ok: true, requestId: req.requestId, doubled: (req.payload as any).n * 2 }),
    });
    const client = createRpcClient({ bus: bus as any, channel: "test.rpc", timeoutMs: 1000 });

    const reply = await client.request("resolve_evidence", { n: 21 });
    assert.equal(reply.kind, "reply");
    assert.equal((reply as any).payload.doubled, 42);

    server.dispose();
});

test("rpc timeout surfaces a timeout error reply with the requestId", async () => {
    const bus = makeBus();
    const server = createRpcServer({
        bus: bus as any,
        channel: "test.rpc",
        handler: async () => { /* never resolves in time */ await new Promise(() => {}); },
    });
    const client = createRpcClient({ bus: bus as any, channel: "test.rpc", timeoutMs: 25 });

    await assert.rejects(client.request("slow", {}), /timed out|timed_out|timeout/i);
    server.dispose();
});

test("rpc handler error returns error reply with message", async () => {
    const bus = makeBus();
    const server = createRpcServer({
        bus: bus as any,
        channel: "test.rpc",
        handler: async () => { throw new Error("boom"); },
    });
    const client = createRpcClient({ bus: bus as any, channel: "test.rpc", timeoutMs: 1000 });

    const reply = await client.request("resolve_evidence", {});
    assert.equal((reply as any).ok, false);
    assert.match((reply as any).error, /boom/);
    server.dispose();
});

test("rpc client cancellation rejects in-flight request", async () => {
    const bus = makeBus();
    let release: (() => void) | undefined;
    const server = createRpcServer({
        bus: bus as any,
        channel: "test.rpc",
        handler: async (req) => {
            await new Promise<void>((r) => { release = r; });
            return { requestId: req.requestId };
        },
    });
    const client = createRpcClient({ bus: bus as any, channel: "test.rpc", timeoutMs: 5000 });
    const ctrl = new AbortController();
    const p = client.request("resolve_evidence", {}, { signal: ctrl.signal });
    // give server a tick to start handler
    await new Promise((r) => setImmediate(r));
    ctrl.abort();
    await assert.rejects(p, /abort|cancel/i);
    release?.();
    server.dispose();
});

test("rpc server disposal rejects subsequent in-flight replies and stops handling", async () => {
    const bus = makeBus();
    let count = 0;
    const server = createRpcServer({
        bus: bus as any,
        channel: "test.rpc",
        handler: async () => { count++; return { ok: true }; },
    });
    const client = createRpcClient({ bus: bus as any, channel: "test.rpc", timeoutMs: 1000 });
    server.dispose();
    // After dispose, the server no longer subscribes; client should time out.
    await assert.rejects(client.request("resolve_evidence", {}), /timeout|timed/i);
    assert.equal(count, 0);
});

test("rpc validates message schema and ignores invalid", async () => {
    const bus = makeBus();
    const seen: EventMessage[] = [];
    const server = createRpcServer({
        bus: bus as any,
        channel: "test.rpc",
        handler: async (req) => { seen.push(req); return { ok: true }; },
    });
    const client = createRpcClient({ bus: bus as any, channel: "test.rpc", timeoutMs: 1000 });

    // Send an invalid message directly
    bus.emit("test.rpc", { kind: "garbage" });
    bus.emit("test.rpc", { kind: "request", requestId: "r1", rpc: "resolve_evidence", payload: {}, schemaVersion: 4 });
    // give server a moment
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(seen.length, 1);
    assert.equal(seen[0]!.rpc, "resolve_evidence");
    server.dispose();
});
