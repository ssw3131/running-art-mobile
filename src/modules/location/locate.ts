export type Position = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
};

type Permission = { granted: boolean; canAskAgain: boolean };
type Subscription = { remove(): void };

export type LocationProvider = {
  getPermission(): Promise<Permission>;
  requestPermission(): Promise<Permission>;
  servicesEnabled(): Promise<boolean>;
  watch(onPosition: (position: Position) => void, onError: () => void): Promise<Subscription>;
};

export type LocationResult =
  | { kind: 'located'; position: Position }
  | { kind: 'denied'; canAskAgain: boolean }
  | { kind: 'services-disabled' }
  | { kind: 'timeout' }
  | { kind: 'unavailable' }
  | { kind: 'cancelled' };

// A one-shot, cancellable watch lets us release native GPS resources even on timeout.
export async function locateForeground(
  provider: LocationProvider,
  signal: AbortSignal,
  { askPermission = true, timeoutMs = 15000 } = {},
): Promise<LocationResult> {
  try {
    if (signal.aborted) return { kind: 'cancelled' };
    let permission = await provider.getPermission();
    if (signal.aborted) return { kind: 'cancelled' };
    if (!permission.granted && permission.canAskAgain && askPermission) {
      permission = await provider.requestPermission();
      if (signal.aborted) return { kind: 'cancelled' };
      // Android can return a stale canAskAgain flag immediately after the second denial.
      if (!permission.granted) permission = await provider.getPermission();
    }
    if (signal.aborted) return { kind: 'cancelled' };
    if (!permission.granted) return { kind: 'denied', canAskAgain: permission.canAskAgain };
    const enabled = await provider.servicesEnabled();
    if (signal.aborted) return { kind: 'cancelled' };
    if (!enabled) return { kind: 'services-disabled' };

    return await new Promise<LocationResult>((resolve) => {
      let settled = false;
      let subscription: Subscription | undefined;
      const finish = (result: LocationResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', cancel);
        subscription?.remove();
        resolve(result);
      };
      const cancel = () => finish({ kind: 'cancelled' });
      const timer = setTimeout(() => finish({ kind: 'timeout' }), timeoutMs);
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) {
        cancel();
        return;
      }

      // The first callback may arrive before the subscription promise resolves.
      Promise.resolve().then(() => {
        if (settled) return;
        return provider.watch(
          (position) => {
            if (!Number.isFinite(position.latitude) || Math.abs(position.latitude) > 90 ||
                !Number.isFinite(position.longitude) || Math.abs(position.longitude) > 180 ||
                !Number.isFinite(position.timestamp) || Date.now() - position.timestamp > 30000) {
              return;
            }
            finish({ kind: 'located', position });
          },
          () => finish({ kind: 'unavailable' }),
        );
      }).then((watch) => {
        subscription = watch;
        if (settled) subscription?.remove();
      }).catch(() => finish({ kind: 'unavailable' }));
    });
  } catch {
    return { kind: signal.aborted ? 'cancelled' : 'unavailable' };
  }
}
