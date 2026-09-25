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
