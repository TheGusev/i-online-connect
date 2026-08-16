import { USE_MOCKS, request } from "../client";
import { mockApi } from "../mocks";
import type { OnboardingDraft, User } from "../types";

/** Отправка собранного в онбординге профиля одним объектом. */
export async function submitOnboarding(draft: OnboardingDraft): Promise<User> {
  return USE_MOCKS
    ? mockApi.submitOnboarding(draft)
    : request<User>("/onboarding", { method: "POST", body: draft });
}
