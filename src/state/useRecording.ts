import { create } from 'zustand';

export type Point = { lat: number; lng: number; ts: number };

type RecState = {
  recording: boolean;
  startTime: number | null;
  points: Point[];
  start: () => void;
  stop: () => void;     // just flips flag; saving happens in screen
  add: (p: Point) => void;
  reset: () => void;
};

export const useRecording = create<RecState>((set, get) => ({
  recording: false,
  startTime: null,
  points: [],
  start: () => {
    if (get().recording) return; // guard double-starts
    set({ recording: true, startTime: Date.now(), points: [] });
  },
  stop: () => set({ recording: false }),
  add: (p) => set((s) => ({ points: [...s.points, p] })),
  reset: () => set({ recording: false, startTime: null, points: [] }),
}));