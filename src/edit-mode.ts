/**
 * Edit mode resolution. Single operator config shared by SmartEdit and SmartRead.
 * Pure functions. No I/O. Never throws.
 */

export type EditMode = "text" | "hashline";

export const EDIT_MODES = ["text", "hashline"] as const;

export const EDIT_MODE_ENV = "PI_EDIT_MODE" as const;

export interface EditModeResolution {
    readonly mode: EditMode;
    readonly source: "env" | "legacy" | "default";
    readonly warning?: string;
}

const LEGACY_DIRECT_ENV = "SMART_EDIT_USE_HASHLINE_EDITING" as const;
const LEGACY_ALIAS_ENV = "SMART_EDIT_HASHLINE_EXPERIMENTAL" as const;

function isTruthyBooleanString(value: string): boolean {
    const v = value.trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes" || v === "on";
}

function resolveLegacy(value: string | undefined): EditMode | undefined {
    if (value === undefined) return undefined;
    if (value.trim() === "") return undefined;
    return isTruthyBooleanString(value) ? "hashline" : "text";
}

export function resolveEditMode(env: Record<string, string | undefined>): EditModeResolution {
    const raw = env[EDIT_MODE_ENV];
    if (raw !== undefined) {
        const trimmed = raw.trim();
        if (trimmed !== "") {
            const lower = trimmed.toLowerCase();
            if (lower === "text" || lower === "hashline") return { mode: lower, source: "env" };
            return {
                mode: "text",
                source: "default",
                warning: `Invalid ${EDIT_MODE_ENV} "${trimmed}": expected "text" or "hashline"; defaulting to "text".`,
            };
        }
    }
    const direct = resolveLegacy(env[LEGACY_DIRECT_ENV]);
    if (direct !== undefined) return { mode: direct, source: "legacy" };
    const alias = resolveLegacy(env[LEGACY_ALIAS_ENV]);
    if (alias !== undefined) return { mode: alias, source: "legacy" };
    return { mode: "text", source: "default" };
}
