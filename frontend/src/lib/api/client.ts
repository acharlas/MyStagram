export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message?: string) {
    super(message ?? `API request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
  }
}

export type ApiRequestOptions = RequestInit & {
  headers?: HeadersInit;
};

export type ApiPage<T> = {
  data: T;
  nextOffset: number | null;
};

const DEFAULT_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
};
const FORWARDED_AUTH_COOKIE_NAMES = new Set(["access_token", "refresh_token"]);

async function readApiErrorMessage(
  response: Response,
): Promise<string | undefined> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const payload = (await response.json()) as {
        detail?: unknown;
        message?: unknown;
      };
      if (typeof payload?.detail === "string" && payload.detail.length > 0) {
        return payload.detail;
      }
      if (typeof payload?.message === "string" && payload.message.length > 0) {
        return payload.message;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  try {
    const text = (await response.text()).trim();
    return text.length > 0 ? text : undefined;
  } catch {
    return undefined;
  }
}

function headersToRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) {
    return {};
  }
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...(headers as Record<string, string>) };
}

function findHeaderKey(
  headers: Record<string, string>,
  nameLowercase: string,
): string | undefined {
  return Object.keys(headers).find(
    (headerName) => headerName.toLowerCase() === nameLowercase,
  );
}

function getHeaderValue(
  headers: Record<string, string>,
  nameLowercase: string,
): string | undefined {
  const key = findHeaderKey(headers, nameLowercase);
  if (!key) {
    return undefined;
  }
  return headers[key];
}

function setHeaderValue(
  headers: Record<string, string>,
  canonicalName: string,
  value: string,
): void {
  const existingKey = findHeaderKey(headers, canonicalName.toLowerCase());
  if (existingKey && existingKey !== canonicalName) {
    delete headers[existingKey];
  }
  headers[canonicalName] = value;
}

function deleteHeaderValue(
  headers: Record<string, string>,
  nameLowercase: string,
): void {
  const key = findHeaderKey(headers, nameLowercase);
  if (key) {
    delete headers[key];
  }
}

function parseCookieHeader(cookieHeader?: string): Map<string, string> {
  const parsed = new Map<string, string>();
  if (!cookieHeader) {
    return parsed;
  }

  for (const pair of cookieHeader.split(";")) {
    const trimmedPair = pair.trim();
    if (!trimmedPair) {
      continue;
    }
    const separatorIndex = trimmedPair.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const name = trimmedPair.slice(0, separatorIndex).trim();
    const value = trimmedPair.slice(separatorIndex + 1).trim();
    if (!name) {
      continue;
    }
    parsed.set(name, value);
  }

  return parsed;
}

function serializeCookieHeader(
  cookieValues: Map<string, string>,
): string | undefined {
  if (cookieValues.size === 0) {
    return undefined;
  }
  return Array.from(cookieValues.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function parseNextOffsetHeader(response: Response): number | null {
  const raw = response.headers.get("x-next-offset");
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

export async function apiFetch<T = unknown>(
  input: RequestInfo | URL,
  { headers, ...init }: ApiRequestOptions = {},
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      ...DEFAULT_HEADERS,
      ...headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(response.status, await readApiErrorMessage(response));
  }

  return (await response.json()) as T;
}

async function apiServerFetchResponse(
  path: string,
  options: ApiRequestOptions = {},
): Promise<Response> {
  if (typeof window !== "undefined") {
    throw new Error("apiServerFetch can only be invoked on the server");
  }

  const base = process.env.BACKEND_API_URL ?? "http://backend:8000";
  const url = path.startsWith("http") ? path : new URL(path, base).toString();

  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const headers = headersToRecord(options.headers);
  const incomingCookieHeader = getHeaderValue(headers, "cookie");
  const mergedCookies = parseCookieHeader(incomingCookieHeader);

  for (const cookieName of FORWARDED_AUTH_COOKIE_NAMES) {
    if (mergedCookies.has(cookieName)) {
      continue;
    }
    const cookie = cookieStore.get(cookieName);
    if (cookie?.value) {
      mergedCookies.set(cookieName, cookie.value);
    }
  }

  const serializedCookies = serializeCookieHeader(mergedCookies);
  if (serializedCookies) {
    setHeaderValue(headers, "Cookie", serializedCookies);
  } else {
    deleteHeaderValue(headers, "cookie");
  }

  if (!getHeaderValue(headers, "authorization")) {
    const accessToken = mergedCookies.get("access_token");
    if (accessToken) {
      setHeaderValue(headers, "Authorization", `Bearer ${accessToken}`);
    }
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...DEFAULT_HEADERS,
      ...headers,
    },
  });
  if (!response.ok) {
    throw new ApiError(response.status, await readApiErrorMessage(response));
  }
  return response;
}

export async function apiServerFetch<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const response = await apiServerFetchResponse(path, options);
  return (await response.json()) as T;
}

export async function apiServerFetchPage<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiPage<T>> {
  const response = await apiServerFetchResponse(path, options);
  return {
    data: (await response.json()) as T,
    nextOffset: parseNextOffsetHeader(response),
  };
}
