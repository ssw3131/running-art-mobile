/** Remove both the persistent task and any independently redelivered service. */
export async function stopTracking(operations: {
  registered(): Promise<boolean>;
  unregister(): Promise<void>;
  stopService(): Promise<void>;
}) {
  try {
    if (await operations.registered()) await operations.unregister();
  } finally {
    // An absent/failed TaskManager registration is not proof the service stopped.
    await operations.stopService();
  }
}
