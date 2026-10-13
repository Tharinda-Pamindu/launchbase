import { ApiError } from "@/lib/api-client";

// API errors share FastAPI's validation shape:
//   {"detail": [{"type": "<code>", "loc": ["body", <field>], "msg": "..."}]}
// The messages are written for people, so they can be shown as they are.
type ErrorDetail = { type?: string; msg?: string; loc?: unknown[] };

function firstDetail(error: unknown): ErrorDetail | undefined {
  if (!(error instanceof ApiError)) {
    return undefined;
  }
  const data = error.data as { detail?: unknown } | undefined;
  return Array.isArray(data?.detail)
    ? (data.detail[0] as ErrorDetail | undefined)
    : undefined;
}

export function errorStatus(error: unknown): number | undefined {
  return error instanceof ApiError ? error.status : undefined;
}

export function errorCode(error: unknown): string | undefined {
  return firstDetail(error)?.type;
}

export function errorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  if (error instanceof TypeError) {
    return "Can't reach the server. Check your connection and try again.";
  }
  const detail = firstDetail(error);
  if (!detail?.msg) {
    return fallback;
  }
  // Pydantic field errors read better with the field name in front.
  const field = detail.loc?.at(-1);
  return errorStatus(error) === 422 && typeof field === "string"
    ? `${field.replace(/_/g, " ")}: ${detail.msg}`
    : detail.msg;
}
