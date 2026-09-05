// Runtime allowlist for request bodies that get spread into Prisma writes.
//
// Written after a QA run demonstrated the problem live: a SUPERVISOR created
// slabs directly as `salesStatus: "sold"` with no state transitions at all,
// bypassing the sales flow and its entire audit trail. An OPERATOR set a
// row's primary key. A machine runtime log posted to B-21's URL was written
// against LPM, defeating the ownership check immediately above it.
//
// The cause in every case was the same shape:
//
//     data: { factoryId, salesStatus: "in_stock", ...input }
//
// The controllers type the body `any`, and there is no global ValidationPipe
// (deliberately — see main.ts; it arrives with the DTO layer, which does not
// exist yet). So `input` is whatever the client sent, and any key in it that
// collides with a column is written.
//
// Reordering the spread would only fix the collisions. It would still let a
// body set `id`, or any other column the caller happens to name. So this
// picks explicitly instead: anything not named is dropped.
//
// The services already declare their writable fields as TypeScript
// interfaces. Those are erased at runtime and enforce nothing — the constants
// beside each call site restate them as values, which is what actually holds.

// Never copied, whatever an allowlist says. JSON.parse makes "__proto__" an
// OWN property, so a hasOwnProperty check alone lets it through, and a plain
// `out[key] = value` assignment then invokes the prototype setter rather than
// creating a field. No allowlist in this codebase names these, but a helper
// whose job is to make untrusted input safe should not depend on that.
const NEVER_COPY = new Set(["__proto__", "constructor", "prototype"]);

// Returns a new object containing only `allowed` keys that are actually
// present. Keys explicitly set to undefined are dropped too, so a client
// cannot use one to blank a column it was never permitted to write.
export function pickFields<T extends object>(source: unknown, allowed: readonly string[]): Partial<T> {
  if (source === null || typeof source !== "object") return {};

  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (NEVER_COPY.has(key)) continue;
    // Own properties only — `in` would also find inherited ones.
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const value = (source as Record<string, unknown>)[key];
    if (value === undefined) continue;
    // defineProperty rather than assignment: it always creates an own data
    // property and never triggers a setter inherited from Object.prototype.
    Object.defineProperty(out, key, { value, enumerable: true, writable: true, configurable: true });
  }
  return out as Partial<T>;
}
