export const SUBMIT_FAILED =
  "Die Anfrage konnte nicht übermittelt werden. Bitte versuchen Sie es erneut oder schreiben Sie an info@tayyipuenal.de.";
export const CONNECTION_LOST =
  "Die Verbindung wurde unterbrochen. Bitte versuchen Sie es erneut. Bereits übermittelte Anfragen werden nicht doppelt versendet.";

/**
 * Posts a form payload to the PHP mail endpoint. The caller owns the request
 * id so that a retry after a connection loss reuses it (the endpoint treats
 * it as idempotent); a validation error clears it so the next attempt is new.
 */
export async function postInquiry(
  payload: Record<string, unknown>,
  requestId: { current: string | null },
): Promise<{ reference: string }> {
  requestId.current ??= crypto.randomUUID();
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch("/api/inquiry.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, requestId: requestId.current }),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      if (response.status >= 400 && response.status < 500) requestId.current = null;
      throw new Error(result?.message || SUBMIT_FAILED);
    }
    return { reference: String(result.reference) };
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError")
      throw new Error(CONNECTION_LOST, { cause });
    if (cause instanceof TypeError) throw new Error(SUBMIT_FAILED, { cause });
    throw cause;
  } finally {
    clearTimeout(timer);
  }
}
