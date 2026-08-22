/**
 * Canonical IDs, SHA-256 helpers, and workspace root resolution.
 *
 * Hashes are deterministic and side-effect free. canonicalizeWorkspaceRoot
 * performs one realpathSync call (filesystem I/O) to resolve symlinks.
 */
import { realpathSync } from "node:fs";
import { createHash } from "node:crypto";

export function sha256OfString(s: string): string {
    return createHash("sha256").update(s, "utf8").digest("hex");
}

export function sha256OfBytes(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
}

export function sha256OfFileContents(contents: string): string {
    return sha256OfString(contents);
}

export interface ResourceKey {
    readonly canonicalPath: string;
    readonly kind: "full" | "range";
    readonly range?: { startLine: number; endLine: number };
}

export function resourceIdFor(key: ResourceKey): string {
    const rangePart = key.range ? `:${key.range.startLine}-${key.range.endLine}` : "";
    return sha256OfString(`resource|${key.kind}|${key.canonicalPath}${rangePart}`);
}

export interface InspectionKey {
    readonly sessionId: string;
    readonly workspaceRoot: string;
    readonly resources: ReadonlyArray<{ canonicalPath: string; range?: { startLine: number; endLine: number } }>;
}

export function inspectionIdFor(key: InspectionKey): string {
    // Sort resource paths so the inspection id is invariant to resource ordering.
    const resourceKey = [...key.resources]
        .map((r) => {
            const range = r.range ? `:${r.range.startLine}-${r.range.endLine}` : "";
            return `${r.canonicalPath}${range}`;
        })
        .sort()
        .join("\n");
    return sha256OfString(`inspection|${key.sessionId}|${key.workspaceRoot}\n${resourceKey}`);
}

export function hashSessionFilePath(sessionFilePath: string): string {
    return sha256OfString(`session|${sessionFilePath}`);
}

/**
 * Resolve a workspace root to a canonical absolute path with no trailing slash.
 * Throws if the path does not exist.
 */
export function canonicalizeWorkspaceRoot(workspaceRoot: string): string {
    const real = realpathSync(workspaceRoot);
    let out = real;
    if (out.length > 1 && out.endsWith("/")) out = out.slice(0, -1);
    return out;
}
