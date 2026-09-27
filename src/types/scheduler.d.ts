// Used surface of the installed scheduler 0.27.0 API. Metro resolves index.native.js
// to React Native's runtime scheduler; Node/web use the package's host scheduler.
declare module 'scheduler' {
  export const unstable_LowPriority: number;
  export function unstable_scheduleCallback(priority: number, callback: () => void): unknown;
}
