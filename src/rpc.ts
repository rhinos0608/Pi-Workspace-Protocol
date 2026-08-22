/**
 * Tiny request/reply RPC over an event-bus-like surface.
 *
 * The Pi event bus is just `emit/on -> disposer`. This module provides
 * correlation IDs, timeouts, cancellation, and proper cleanup so callers
 * can build safe request/reply flows on top of it.
 *
 * The "bus" interface intentionally matches Pi's `EventBus` (emit/on returning
 * a disposer), so wiring is one-liner.
 */

import { PROTOCOL_SCHEMA_VERSION, type EventMessage, type RequestEvent, type ReplyEvent } from "./types.js";
import { validateEventMessage } from "./contract.js";

export interface BusLike {
    emit(channel: string, data: unknown): void;
    on(channel: string, handler: (data: unknown) => void): () => void;
}

export interface RpcServerOptions {
    readonly bus: BusLike;
    readonly channel: string;
    readonly handler: (req: RequestEvent) => Promise<unknown>;
    readonly onError?: (err: unknown) => void;
}

export interface RpcServer {
    readonly dispose: () => void;
}

export function createRpcServer(opts: RpcServerOptions): RpcServer {
    const inFlight = new Set<string>();

    const off = opts.bus.on(opts.channel, (raw) => {
        const v = validateEventMessage(raw);
        if (!v.ok) return;
        const msg = v.value;
        if (msg.kind !== "request") return;

        // Duplicate-request protection: ignore concurrent duplicate requestIds.
        if (inFlight.has(msg.requestId)) return;
        inFlight.add(msg.requestId);

        Promise.resolve()
            .then(() => opts.handler(msg))
            .then((payload) => {
                inFlight.delete(msg.requestId);
                const reply: ReplyEvent = {
                    kind: "reply",
                    requestId: msg.requestId,
                    ok: true,
                    payload,
                    schemaVersion: PROTOCOL_SCHEMA_VERSION,
                };
                opts.bus.emit(opts.channel, reply);
            })
            .catch((err) => {
                inFlight.delete(msg.requestId);
                if (opts.onError) opts.onError(err);
                const reply: ReplyEvent = {
                    kind: "reply",
                    requestId: msg.requestId,
                    ok: false,
                    error: err instanceof Error ? err.message : String(err),
                    schemaVersion: PROTOCOL_SCHEMA_VERSION,
                };
                opts.bus.emit(opts.channel, reply);
            });
    });
    return { dispose: off };
}

export interface RpcClientOptions {
    readonly bus: BusLike;
    readonly channel: string;
    readonly timeoutMs: number;
    readonly newId?: () => string;
}

export interface RpcRequestOptions {
    readonly signal?: AbortSignal;
}

export interface RpcClient {
    request(rpc: RequestEvent["rpc"], payload: unknown, options?: RpcRequestOptions): Promise<ReplyEvent>;
    readonly dispose: () => void;
}

interface PendingEntry {
    resolve: (r: ReplyEvent) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
    onAbort?: () => void;
    signal?: AbortSignal;
}

function defaultNewId(): string {
    const bytes = new Uint8Array(16);
    // globalThis.crypto is available in Node 20+
    (globalThis as { crypto: { getRandomValues(arr: Uint8Array): void } }).crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function createRpcClient(opts: RpcClientOptions): RpcClient {
    const pending = new Map<string, PendingEntry>();

    const off = opts.bus.on(opts.channel, (raw) => {
        const v = validateEventMessage(raw);
        if (!v.ok) return;
        const msg = v.value;
        if (msg.kind !== "reply") return;
        const p = pending.get(msg.requestId);
        if (!p) return;
        clearTimeout(p.timer);
        if (p.signal && p.onAbort) p.signal.removeEventListener("abort", p.onAbort);
        pending.delete(msg.requestId);
        p.resolve(msg);
    });

    const dispose = () => {
        off();
        for (const [, p] of pending) {
            clearTimeout(p.timer);
            if (p.signal && p.onAbort) p.signal.removeEventListener("abort", p.onAbort);
            p.reject(new Error("rpc client disposed"));
        }
        pending.clear();
    };

    const newId = opts.newId ?? defaultNewId;

    async function request(
        rpc: RequestEvent["rpc"],
        payload: unknown,
        options?: RpcRequestOptions,
    ): Promise<ReplyEvent> {
        const requestId = newId();
        const req: RequestEvent = {
            kind: "request",
            requestId,
            rpc,
            payload,
            schemaVersion: PROTOCOL_SCHEMA_VERSION,
        };

        return new Promise<ReplyEvent>((resolve, reject) => {
            const onAbort = () => {
                clearTimeout(timer);
                pending.delete(requestId);
                reject(new Error("rpc request aborted"));
            };

            const timer = setTimeout(() => {
                if (options?.signal && onAbortRef.value) {
                    options.signal.removeEventListener("abort", onAbortRef.value);
                }
                pending.delete(requestId);
                reject(new Error(`rpc request ${rpc} timed out after ${opts.timeoutMs}ms`));
            }, opts.timeoutMs);

            // holder to allow timeout closure to remove the abort listener
            const onAbortRef: { value?: () => void } = {};

            const entry: PendingEntry = { resolve, reject, timer };
            pending.set(requestId, entry);

            if (options?.signal) {
                if (options.signal.aborted) {
                    clearTimeout(timer);
                    pending.delete(requestId);
                    reject(new Error("rpc request aborted"));
                    return;
                }
                onAbortRef.value = onAbort;
                options.signal.addEventListener("abort", onAbort, { once: true });
                entry.onAbort = onAbort;
                entry.signal = options.signal;
            }

            opts.bus.emit(opts.channel, req);
        });
    }

    return { request, dispose };
}
