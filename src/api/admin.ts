/**
 * Клиент админ-API.
 *
 * Отдельный от пользовательского намеренно:
 *  - токен админки уходит в заголовке x-admin-token, а не в Authorization,
 *    поэтому обычная сессия пользователя админку не открывает;
 *  - токен лежит в sessionStorage: закрыл вкладку — сессия закончилась,
 *    и он не остаётся в localStorage на чужом компьютере;
 *  - авто-обновления токена нет. Сессия короткая (2 часа), истекла —
 *    только повторный вход с паролем и кодом из приложения.
 */
import { API_URL, ApiError } from "./client";

const TOKEN_KEY = "ya-online.admin-token";
const EXPIRES_KEY = "ya-online.admin-expires";

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  const expires = Number(window.sessionStorage.getItem(EXPIRES_KEY) ?? 0);
  if (expires && expires < Date.now()) {
    clearAdminSession();
    return null;
  }
  return window.sessionStorage.getItem(TOKEN_KEY);
}

export function setAdminSession(token: string, expiresInSeconds: number) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(TOKEN_KEY, token);
  window.sessionStorage.setItem(EXPIRES_KEY, String(Date.now() + expiresInSeconds * 1000));
}

export function clearAdminSession() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(EXPIRES_KEY);
}

export function adminSessionExpiresAt(): number | null {
  if (typeof window === "undefined") return null;
  const value = Number(window.sessionStorage.getItem(EXPIRES_KEY) ?? 0);
  return value || null;
}

type Query = Record<string, string | number | boolean | undefined>;

async function adminRequest<T>(
  path: string,
  options: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; query?: Query } = {},
): Promise<T> {
  const base = API_URL.endsWith("/") ? API_URL : `${API_URL}/`;
  const url = new URL(`admin${path}`.replace(/^\//, ""), base);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  const token = getAdminToken();
  const response = await fetch(url.toString(), {
    method: options.method ?? "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { "x-admin-token": token } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (response.status === 403 && path !== "/session") clearAdminSession();

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = (await response.json()) as { message?: string };
      if (data?.message) message = data.message;
    } catch {
      /* не JSON — оставляем код статуса */
    }
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// ── Формы ответов ───────────────────────────────────────────────────────────

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface AdminUserRow {
  id: string;
  email: string;
  role: string;
  name: string;
  city: string;
  trustLevel: string;
  trustScore: number;
  videoVerified: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  blockedAt: string | null;
  blockedReason: string;
  pausedAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface AdminReportRow {
  id: string;
  category: string;
  source: string;
  details: string;
  state: string;
  reviewHours: number;
  reporterId: string;
  reporterName: string;
  subjectId: string;
  subjectName: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AdminVerificationRow {
  id: string;
  userId: string;
  email: string;
  name: string;
  city: string;
  trustLevel: string;
  status: string;
  confidence: number | null;
  reason: string;
  manual: boolean;
  challenge: string;
  reviewerNote: string;
  submittedAt: string;
  reviewedAt: string | null;
}

export interface AdminSupportRow {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  topic: string;
  message: string;
  status: string;
  reply: string;
  repliedAt: string | null;
  createdAt: string;
}

export interface AdminListingRow {
  id: string;
  authorId: string;
  authorName: string;
  trustLevel: string;
  category: string;
  city: string;
  title: string;
  description: string;
  priceMinor: number | null;
  currency: string;
  state: string;
  expiresAt: string;
  createdAt: string;
}

export interface AdminSpaceRow {
  id: string;
  title: string;
  category: string;
  format: string;
  city: string;
  verifiedCommunity: boolean;
  hostId: string;
  hostName: string;
  members: number;
  upcomingEvents: number;
  createdAt: string;
}

export interface AdminActionRow {
  id: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  note: string;
  createdAt: string;
}

export interface AdminStats {
  periodDays: number;
  signupsByDay: { day: string; count: number }[];
  usersTotal: number;
  usersBlocked: number;
  usersVerified: number;
  activeSessions: number;
  matches: number;
  messages: number;
  listings: number;
  listingsActive: number;
  reportsOpen: number;
  verificationsPending: number;
  supportOpen: number;
}

export interface AdminSession {
  id: string;
  email: string;
  displayName: string | null;
}

// ── Методы ──────────────────────────────────────────────────────────────────

export const adminApi = {
  /** Вход: email + пароль + код TOTP. contactFax — скрытая ловушка для ботов. */
  login: (input: {
    email: string;
    password: string;
    totp: string;
    captchaToken?: string;
    contactFax?: string;
  }) => adminRequest<{ token: string; expiresIn: number }>("/session", { method: "POST", body: input }),

  session: () => adminRequest<AdminSession>("/session"),

  users: (query: Query) => adminRequest<Paged<AdminUserRow>>("/users", { query }),
  user: (id: string) => adminRequest<Record<string, unknown>>(`/users/${id}`),
  blockUser: (id: string, reason: string) =>
    adminRequest<{ ok: true }>(`/users/${id}/block`, { method: "POST", body: { reason } }),
  unblockUser: (id: string) =>
    adminRequest<{ ok: true }>(`/users/${id}/unblock`, { method: "POST" }),
  deleteUser: (id: string, reason: string) =>
    adminRequest<{ ok: true }>(`/users/${id}`, { method: "DELETE", body: { reason } }),

  reports: (query: Query) => adminRequest<Paged<AdminReportRow>>("/reports", { query }),
  updateReport: (id: string, body: { state: string; note?: string }) =>
    adminRequest<{ ok: true }>(`/reports/${id}`, { method: "PATCH", body }),

  verifications: (query: Query) =>
    adminRequest<Paged<AdminVerificationRow>>("/verifications", { query }),
  reviewVerification: (id: string, body: { status: "verified" | "rejected"; note?: string }) =>
    adminRequest<{ ok: true }>(`/verifications/${id}`, { method: "PATCH", body }),

  support: (query: Query) => adminRequest<Paged<AdminSupportRow>>("/support", { query }),
  updateSupport: (id: string, body: { status?: string; reply?: string }) =>
    adminRequest<{ ok: true }>(`/support/${id}`, { method: "PATCH", body }),

  listings: (query: Query) => adminRequest<Paged<AdminListingRow>>("/listings", { query }),
  updateListing: (id: string, body: { state: "active" | "closed"; note?: string }) =>
    adminRequest<{ ok: true }>(`/listings/${id}`, { method: "PATCH", body }),

  spaces: (query: Query) => adminRequest<Paged<AdminSpaceRow>>("/spaces", { query }),
  deleteSpace: (id: string, reason: string) =>
    adminRequest<{ ok: true }>(`/spaces/${id}`, { method: "DELETE", body: { reason } }),

  stats: (days: number) => adminRequest<AdminStats>("/stats", { query: { days } }),
  actions: (query: Query) => adminRequest<Paged<AdminActionRow>>("/actions", { query }),
};
