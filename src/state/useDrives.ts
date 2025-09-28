import { create } from 'zustand';
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
};

type DrivesState = {
  drives: SavedDrive[];
  addDrive: (d: SavedDrive) => void;
  removeDrive: (id: string) => void;          // NEW
  clearAll: () => void;
  _hydrate: () => Promise<void>;
};

const STORAGE_KEY = 'tracklink.drives.v1';

export const useDrives = create<DrivesState>((set, get) => ({
  drives: [],
  addDrive: (d) => {
    const next = [d, ...get().drives];
    set({ drives: next });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  },
  removeDrive: (id) => {                       // NEW
    const next = get().drives.filter((x) => x.id !== id);
    set({ drives: next });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  },
  clearAll: () => {
    set({ drives: [] });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([])).catch(() => {});
  },
  _hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SavedDrive[];
        const normalized = parsed.map((d) => ({ description: '', ...d }));
        set({ drives: normalized });
      }
    } catch {}
  },
}));
