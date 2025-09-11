import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { useRecording } from '../state/useRecording';

export const TASK_NAME = 'tracklink.location';

// Define once per app process (Expo Fast Refresh re-runs modules; this is fine)
TaskManager.defineTask(TASK_NAME, ({ data, error }) => {
  if (error) {
    console.error('Location task error:', error);
    return;
  }
  const payload = data as { locations?: Location.LocationObject[] } | undefined;
  const loc = payload?.locations?.[0];
  if (!loc) return;

  const { latitude, longitude } = loc.coords;
  // Push into the in-memory recording buffer
  useRecording.getState().add({
    lat: latitude,
    lng: longitude,
    ts: Date.now(),
  });
});
