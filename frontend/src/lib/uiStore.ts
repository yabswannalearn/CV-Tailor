import { create } from "zustand";

type ResumeUiState = {
  editorMode: "friendly" | "preview" | "source";
  selectedTemplate: "classic" | "modern";
  setEditorMode: (mode: "friendly" | "preview" | "source") => void;
  setSelectedTemplate: (template: "classic" | "modern") => void;
};

export const useResumeUiStore = create<ResumeUiState>((set) => ({
  editorMode: "friendly",
  selectedTemplate: "classic",
  setEditorMode: (editorMode) => set({ editorMode }),
  setSelectedTemplate: (selectedTemplate) => set({ selectedTemplate }),
}));
