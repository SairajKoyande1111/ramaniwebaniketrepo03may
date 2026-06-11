import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  url: string,
  method: string,
  data?: unknown | undefined,
  isFormData?: boolean,
): Promise<any> {
  const isAdminRoute = url.includes('/admin/');
  const token = isAdminRoute 
    ? localStorage.getItem("adminToken") 
    : localStorage.getItem("token");
  
  const headers: Record<string, string> = {};
  
  if (data && !isFormData) {
    headers["Content-Type"] = "application/json";
  }
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? (isFormData ? (data as FormData) : JSON.stringify(data)) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);

  // 204 No Content — nothing to parse
  if (res.status === 204) return null;

  const text = await res.text();
  if (!text || text.trim() === '') return null;

  // Guard against HTML error pages leaking through (e.g. Vite dev fallback)
  if (text.trimStart().startsWith('<')) {
    throw new Error(`Server returned HTML for ${method} ${url} — route may not be registered`);
  }

  return JSON.parse(text);
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey[0] as string;
    const isAdminRoute = url.includes('/admin/');
    const token = isAdminRoute 
      ? localStorage.getItem("adminToken") 
      : localStorage.getItem("token");
    
    const headers: Record<string, string> = {};
    
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(url, {
      headers,
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 30000,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    },
    mutations: {
      retry: false,
    },
  },
});
