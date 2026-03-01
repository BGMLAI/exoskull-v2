import { create } from "zustand";

interface SpatialState {
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  activeHashtag: string | null;
  setActiveHashtag: (tag: string | null) => void;

  is3DMode: boolean;
  set3DMode: (enabled: boolean) => void;

  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  // Code panel (right side)
  codePanelOpen: boolean;
  setCodePanelOpen: (open: boolean) => void;
  codePanelFile: string | null;
  setCodePanelFile: (file: string | null) => void;
}

export const useSpatialStore = create<SpatialState>((set) => ({
  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  activeHashtag: null,
  setActiveHashtag: (tag) => set({ activeHashtag: tag }),

  is3DMode: false,
  set3DMode: (enabled) => set({ is3DMode: enabled }),

  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  codePanelOpen: false,
  setCodePanelOpen: (open) => set({ codePanelOpen: open }),
  codePanelFile: null,
  setCodePanelFile: (file) => set({ codePanelFile: file }),
}));
