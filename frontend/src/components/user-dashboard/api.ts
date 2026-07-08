import type { MemberActionsResponse, MemberDashboardResponse } from "./types";

async function request<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Request to ${path} failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchMemberDashboard(): Promise<MemberDashboardResponse> {
  return request<MemberDashboardResponse>("/api/member/dashboard");
}

export function fetchMemberActions(): Promise<MemberActionsResponse> {
  return request<MemberActionsResponse>("/api/member/actions");
}
