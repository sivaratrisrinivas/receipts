// Keep the screen on while Beam reads. A ~70 second streaming call dies if a phone locks
// its screen or the tab is backgrounded, so ask the browser to stay awake. Best effort:
// browsers without the Screen Wake Lock API just carry on.

export function keepAwake(): () => void {
  let sentinel: WakeLockSentinel | null = null;
  let stopped = false;

  const acquire = async () => {
    try {
      const lock = await navigator.wakeLock?.request('screen');
      if (!lock) return;
      if (stopped) void lock.release();
      else sentinel = lock;
    } catch {
      // Denied (low battery, not allowed in this frame): nothing to do.
    }
  };
  // The lock is dropped when the tab is hidden; take it again when the Giver comes back.
  const onVisible = () => {
    if (document.visibilityState === 'visible' && !stopped) void acquire();
  };

  void acquire();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', onVisible);
    void sentinel?.release();
    sentinel = null;
  };
}
