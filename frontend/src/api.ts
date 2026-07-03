import type { ActionsResponse, DashboardResponse } from "./types";

async function request<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Request to ${path} failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchDashboard(): Promise<DashboardResponse> {
  return request<DashboardResponse>("/api/dashboard");
}

export function fetchActions(query = ""): Promise<ActionsResponse> {
  const search = query ? `?q=${encodeURIComponent(query)}` : "";
  return request<ActionsResponse>(`/api/actions${search}`);
}
