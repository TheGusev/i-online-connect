import { create } from "zustand";

import type { OnboardingDraft, OnboardingIntent } from "@/api";

export const ONBOARDING_STEPS = [
  "name",
  "intent",
  "about",
  "media",
  "interests",
  "values",
  "location",
  "account",
  "summary",
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number];

export interface ChatEntry {
  stepId: OnboardingStepId;
  answer: string;
}

const emptyDraft: OnboardingDraft = {
  name: "",
  age: null,
  intent: null,
  about: "",
  photoName: null,
  videoName: null,
  videoSkipped: false,
  interests: [],
  values: { values: "", joy: "", dealbreakers: "" },
  city: "",
  hideExactLocation: true,
};

/**
 * Файлы держим отдельно от draft: draft уходит на сервер как JSON,
 * а фото и видео загружаются отдельным multipart-запросом после регистрации.
 */
interface OnboardingFiles {
  photo: File | null;
  video: File | Blob | null;
  videoName: string | null;
}

const emptyFiles: OnboardingFiles = { photo: null, video: null, videoName: null };

interface OnboardingState {
  stepIndex: number;
  draft: OnboardingDraft;
  files: OnboardingFiles;
  answers: ChatEntry[];
  setStepIndex: (index: number) => void;
  goBack: () => void;
  patchDraft: (patch: Partial<OnboardingDraft>) => void;
  setPhotoFile: (file: File | null) => void;
  setVideoFile: (file: File | Blob | null, filename: string | null) => void;
  setIntent: (intent: OnboardingIntent) => void;
  toggleInterest: (interest: string) => void;
  answerStep: (entry: ChatEntry) => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  stepIndex: 0,
  draft: emptyDraft,
  files: emptyFiles,
  answers: [],
  setStepIndex: (stepIndex) => set({ stepIndex }),
  goBack: () =>
    set((state) => ({
      stepIndex: Math.max(0, state.stepIndex - 1),
      answers: state.answers.slice(0, Math.max(0, state.stepIndex - 1)),
    })),
  patchDraft: (patch) => set((state) => ({ draft: { ...state.draft, ...patch } })),
  setPhotoFile: (file) =>
    set((state) => ({
      files: { ...state.files, photo: file },
      draft: { ...state.draft, photoName: file ? file.name : null },
    })),
  setVideoFile: (file, filename) =>
    set((state) => ({
      files: { ...state.files, video: file, videoName: filename },
      draft: { ...state.draft, videoName: filename, videoSkipped: file === null },
    })),
  setIntent: (intent) => set((state) => ({ draft: { ...state.draft, intent } })),
  toggleInterest: (interest) =>
    set((state) => {
      const has = state.draft.interests.includes(interest);
      return {
        draft: {
          ...state.draft,
          interests: has
            ? state.draft.interests.filter((item) => item !== interest)
            : [...state.draft.interests, interest],
        },
      };
    }),
  answerStep: (entry) =>
    set((state) => ({
      answers: [...state.answers.filter((item) => item.stepId !== entry.stepId), entry],
      stepIndex: Math.min(state.stepIndex + 1, ONBOARDING_STEPS.length - 1),
    })),
  reset: () => set({ stepIndex: 0, draft: emptyDraft, files: emptyFiles, answers: [] }),
}));

