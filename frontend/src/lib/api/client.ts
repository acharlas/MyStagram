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

const DEFAULT_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
};

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
    throw new ApiError(response.status);
  }

  return (await response.json()) as T;
}

export async function apiServerFetch<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  if (typeof window !== "undefined") {
    throw new Error("apiServerFetch can only be invoked on the server");
  }

  const base = process.env.BACKEND_API_URL ?? "http://backend:8000";
  const url = path.startsWith("http") ? path : new URL(path, base).toString();

  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const forwardedCookies = cookieStore.getAll();

  const headers = headersToRecord(options.headers);
  if (forwardedCookies.length > 0) {
    const serialized = forwardedCookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
    headers.Cookie = headers.Cookie
      ? `${headers.Cookie}; ${serialized}`
      : serialized;
  }

  if (!headers.Authorization) {
    const accessToken = cookieStore.get("access_token");
    if (accessToken?.value) {
      headers.Authorization = `Bearer ${accessToken.value}`;
    }
  }

  return apiFetch<T>(url, {
    ...options,
    headers,
  });
}
