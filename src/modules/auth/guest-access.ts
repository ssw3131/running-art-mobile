/** Browsing consent for this app session; never a credential or membership receipt. */
let browsing = false;
const listeners = new Set<() => void>();
export const guestAccess = {
  getSnapshot: () => browsing,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  enter() { browsing = true; listeners.forEach(listener => listener()); },
  leave() { if (!browsing) return; browsing = false; listeners.forEach(listener => listener()); },
};
