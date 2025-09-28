import * as TaskManager from 'expo-task-manager';
// import * as Location from 'expo-location'; // only if you want to debug payloads

// Must MATCH what RecordScreen imports
export const TASK_NAME = 'tracklink-location';

// Define once per app process
TaskManager.defineTask(TASK_NAME, ({ data, error }) => {
  if (error) {
    console.warn('Location task error:', error);
    return;
  }
  // We intentionally do NOT mutate app state here to avoid double-logging and stuck sessions.
  // Foreground watchPositionAsync handles recording points.
  // If you need to debug, uncomment below:
  // const { locations } = (data ?? {}) as { locations?: Location.LocationObject[] };
  // console.log('BG tick', locations?.[0]?.coords);
});
