import { USE_MOCK, request } from "../client";
import { mockApi } from "../mock";
import type { OnboardingDraft, User } from "../types";

/** Отправка собранного в онбординге профиля одним объектом. */
export async function submitOnboarding(draft: OnboardingDraft): Promise<User> {
  return USE_MOCK
    ? mockApi.submitOnboarding(draft)
    : request<User>("/onboarding", { method: "POST", body: draft });
}
