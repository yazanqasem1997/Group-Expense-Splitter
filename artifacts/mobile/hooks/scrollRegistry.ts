type ScrollCallback = () => void;

const callbacks = new Map<string, ScrollCallback>();

export const scrollRegistry = {
  register(tab: string, cb: ScrollCallback) {
    callbacks.set(tab, cb);
  },
  unregister(tab: string) {
    callbacks.delete(tab);
  },
  trigger(tab: string) {
    callbacks.get(tab)?.();
  },
};
