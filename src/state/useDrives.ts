import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type SavedDrive = {
  id: string;
  title: string;
  description?: string;
  startedAt: number;
  endedAt: number;
  distanceKm: number;
  durationSec: number;
  avgKmh: number;
  points: { lat: number; lng: number; ts: number }[];
  originalRouteId?: string;
};

type DrivesState = {
  drives: SavedDrive[];
  addDrive: (d: SavedDrive) => void;
  updateDrive: (id: string, patch: Partial<SavedDrive>) => void;
  removeDrive: (id: string) => void;
  clearAll: () => void;
  _hydrate: () => Promise<void>; // no-op (kept for compat)
};

const STORAGE_KEY = 'tracklink.drives.v2';

const sortDrives = (arr: SavedDrive[]) =>
  [...arr].sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));

export const useDrives = create<DrivesState>()(
  persist(
    (set, get) => ({
      drives: [],

      addDrive: (d) => {
        const existing = get().drives.filter(x => x.id !== d.id);
        const next = sortDrives([d, ...existing]);
        set({ drives: next });
      },

      updateDrive: (id, patch) => {
        const next = sortDrives(
          get().drives.map(d => (d.id === id ? { ...d, ...patch } : d))
        );
        set({ drives: next });
      },

      removeDrive: (id) => {
        const next = get().drives.filter(x => x.id !== id);
        set({ drives: next });
      },

      clearAll: () => set({ drives: [] }),

      _hydrate: async () => Promise.resolve(),
    }),
    {
      name: STORAGE_KEY,
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: async (persisted, fromVersion) => {
        if (!persisted) return { drives: [] } as DrivesState;
        if (fromVersion < 2) {
          const drives = Array.isArray((persisted as any).drives)
            ? (persisted as any).drives.map((d: SavedDrive) => ({
                description: '',
                ...d,
              }))
            : [];
          return { ...(persisted as any), drives: sortDrives(drives) };
        }
        const drives = Array.isArray((persisted as any).drives)
          ? sortDrives((persisted as any).drives)
          : [];
        return { ...(persisted as any), drives };
      },
      partialize: (s) => ({ drives: s.drives }),
    }
  )
);
