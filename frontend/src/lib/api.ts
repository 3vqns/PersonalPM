import { getDemoApiResponse, isDemoMode } from "./demo";
import { getCurrentSession } from "./authSession";

type AuthMode = boolean | "optional";

interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  auth?: AuthMode;
  body?: unknown;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  requestId?: string;
  path: string;

  constructor({
    message,
    status,
    code,
    details,
    requestId,
    path,
  }: {
    message: string;
    status: number;
    code?: string;
    details?: unknown;
    requestId?: string;
    path: string;
  }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
    this.path = path;
  }
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() ?? "";
const networkRetryDelayMs = 300;

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {},
) {
  const method = options.method ?? "GET";

  if (isDemoMode()) {
    return getDemoApiResponse<T>(path, { method, body: options.body });
  }

  if (!apiBaseUrl) {
    throw new Error(
      "Missing VITE_API_BASE_URL. Configure the frontend to call the backend API outside demo mode.",
    );
  }

  const { auth = true, body, headers, ...requestInit } = options;
  const requestHeaders = new Headers(headers);
  const requestBody = serializeBody(body, requestHeaders);
  let sentOptionalAuth = false;

  if (auth !== false) {
    const session = await getCurrentSession();

    if (session?.access_token) {
      requestHeaders.set("Authorization", `Bearer ${session.access_token}`);
      sentOptionalAuth = auth === "optional";
    } else if (auth !== "optional") {
      throw new Error("You need to sign in before continuing.");
    }
  }

  let response = await fetchWithNetworkRetry(`${apiBaseUrl}${path}`, {
    ...requestInit,
    method,
    headers: requestHeaders,
    body: requestBody,
  });

  if (auth === "optional" && method === "GET" && sentOptionalAuth && response.status === 401) {
    requestHeaders.delete("Authorization");
    response = await fetchWithNetworkRetry(`${apiBaseUrl}${path}`, {
      ...requestInit,
      method,
      headers: requestHeaders,
      body: requestBody,
    });
  }

  if (!response.ok) {
    throw await getApiError(response, path);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function fetchWithNetworkRetry(url: string, request: RequestInit) {
  try {
    return await fetch(url, request);
  } catch (error) {
    if (request.method !== "GET" || !isTransientNetworkError(error)) {
      throw error;
    }
    await wait(networkRetryDelayMs);
    return fetch(url, request);
  }
}

function isTransientNetworkError(error: unknown) {
  return (
    error instanceof TypeError &&
    /failed to fetch|networkerror|load failed/i.test(error.message)
  );
}

function wait(delayMs: number) {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

function serializeBody(body: unknown, headers: Headers) {
  if (typeof body === "undefined") {
    return undefined;
  }

  if (body instanceof FormData) {
    return body;
  }

  headers.set("Content-Type", "application/json");
  return JSON.stringify(body);
}

async function getApiError(response: Response, path: string) {
  let message = response.statusText || "PictureMe could not complete the request.";
  let code: string | undefined;
  let details: unknown;

  try {
    const payload = (await response.json()) as {
      message?: unknown;
      error?: unknown;
      code?: unknown;
      details?: unknown;
    };
    if (typeof payload.message === "string") {
      message = payload.message;
    } else if (typeof payload.error === "string") {
      message = payload.error;
    }
    if (typeof payload.code === "string") {
      code = payload.code;
    }
    details = payload.details;
  } catch {
    // Fall through to the status text.
  }

  return new ApiError({
    message,
    status: response.status,
    code,
    details,
    requestId: response.headers.get("X-Request-ID") ?? undefined,
    path,
  });
}
