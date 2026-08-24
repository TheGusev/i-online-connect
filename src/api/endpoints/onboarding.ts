import { request } from "../client";
import type { OnboardingDraft, User } from "../types";

/** Отправка собранного в онбординге профиля одним объектом. */
export async function submitOnboarding(draft: OnboardingDraft): Promise<User> {
  return request<User>("/onboarding", { method: "POST", body: draft });
}
