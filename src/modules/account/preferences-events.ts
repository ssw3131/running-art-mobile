const listeners = new Set<() => void>();
export const preferencesEvents = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  changed() { listeners.forEach(listener => listener()); },
};
