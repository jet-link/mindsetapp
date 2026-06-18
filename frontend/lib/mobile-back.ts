let visible = false;
const listeners = new Set<() => void>();

export function setMobileBackVisible(next: boolean) {
  if (visible === next) return;
  visible = next;
  listeners.forEach((fn) => fn());
}

export function getMobileBackVisible() {
  return visible;
}

export function subscribeMobileBack(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
