// fetch for the app's own JSON API, from client components.
//
// Every page used to call fetch directly and read `data.posts || []`, which
// turned a 401 or a 500 into an empty page: an expired session looked like
// "your feed is empty" instead of a login prompt. This helper makes the
// failure explicit (an ApiError carrying the server's message) and sends an
// expired session back to the login page, so callers only handle the happy
// path plus one catch that surfaces the message.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiFetchOptions extends RequestInit {
  /**
   * Whether a 401 should navigate to the login page. On by default, which is
   * right for every authenticated page. The login form itself turns it off:
   * there a 401 means "wrong password", not "session expired".
   */
  redirectOnUnauthorized?: boolean;
}

/** Where a 401 sends the browser. Absolute, so no relative-navigation lint rule fires. */
function loginUrl(): string {
  return new URL("/auth/login", window.location.origin).href;
}

/**
 * Fetch a JSON API route. Resolves with the parsed body on 2xx; throws an
 * ApiError with the server's `error` message otherwise.
 */
export async function apiFetch<T>(input: string, init: ApiFetchOptions = {}): Promise<T> {
  const { redirectOnUnauthorized = true, ...requestInit } = init;
  const res = await fetch(input, requestInit);

  // Body parsing is best-effort: an error page from the proxy is not JSON.
  const body: unknown = await res.json().catch(() => null);

  if (res.status === 401 && redirectOnUnauthorized && typeof window !== "undefined") {
    window.location.assign(loginUrl());
  }
  if (!res.ok) {
    throw new ApiError(res.status, errorMessageFrom(body, res.status));
  }
  return body as T;
}

function errorMessageFrom(body: unknown, status: number): string {
  if (body && typeof body === "object" && "error" in body) {
    const message = (body as { error: unknown }).error;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return `Request failed (${status}).`;
}

/** The message to show a user for any error a page catches. */
export function userMessage(error: unknown, fallback = "Something went wrong."): string {
  return error instanceof ApiError ? error.message : fallback;
}
