import { NextResponse } from 'next/server';

/**
 * Reads a request body as a JSON object, or `null` when it is not one — malformed JSON, an array,
 * a bare string. A route answers `null` with a 400 rather than letting `request.json()` throw
 * into a 500.
 */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * `readJsonObject`, typed for the route that reads it. The type is the route's own assertion about
 * the shape — exactly what `(await request.json()) as T` asserted before — so it is still the
 * route's job to check each field it relies on. What changes is only that a body which is not a
 * JSON object at all is answered, not thrown (2026-09-25: 48 routes answered 500 to one).
 */
export async function readJsonBody<T>(request: Request): Promise<T | null> {
  return (await readJsonObject(request)) as T | null;
}

export function invalidBody(): NextResponse {
  return NextResponse.json(
    { error: 'Geçersiz istek gövdesi: bir JSON nesnesi bekleniyordu.' },
    { status: 400 },
  );
}
