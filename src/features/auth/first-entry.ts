export const PHONE_LOGIN_ENABLED = import.meta.env?.["VITE_PHONE_LOGIN_ENABLED"] === "true";
export function needsFirstEntry(user: { age?: number | null } | null | undefined) {
  return Boolean(user && (!Number.isInteger(user.age) || Number(user.age) < 18 || Number(user.age) > 100));
}
export function validEntryAge(value: string) {
  const age = Number(value);
  return value.trim() !== "" && Number.isInteger(age) && age >= 18 && age <= 100;
}
export function visibleAge(age: number | null | undefined) {
  return typeof age === "number" && Number.isFinite(age) && age > 0 ? `, ${age}` : "";
}
export function noticeKey(userId: string, kind: "recovery" | "verification" | "verification-pending") {
  return `first-entry:v1:${userId}:${kind}`;
}
export function noticeDismissed(storage: Pick<Storage, "getItem">, userId: string, kind: "recovery" | "verification") {
  return storage.getItem(noticeKey(userId, kind)) === "dismissed";
}
export function dismissNotice(storage: Pick<Storage, "setItem">, userId: string, kind: "recovery" | "verification") {
  storage.setItem(noticeKey(userId, kind), "dismissed");
}