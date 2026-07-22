/**
 * A generic Result type, modeled after Rust's Result<T, E> / Vue's common
 * "ok" pattern for async composables. Used instead of throwing across
 * layer boundaries (db -> route) so failure is a typed value the caller
 * must handle, not an exception they might forget to catch.
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Narrow a Result and unwrap it, or throw — useful at the very edge (route handler). */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw result.error instanceof Error ? result.error : new Error(String(result.error));
}
