import { create } from "zustand";

interface UiState {
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeConversationId: null,
  setActiveConversationId: (id) => set({ activeConversationId: id }),
}));
