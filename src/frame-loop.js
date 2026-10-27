// Limit expensive work without drifting to a lower divisor on 90/120/144 Hz screens.
export function createFrameLoop(callback, framesPerSecond = 60) {
  let frame = 0, running = false, next = -Infinity;
  function tick(time) {
    frame = 0;
    if (!running) return;
    const fps = typeof framesPerSecond === "function" ? framesPerSecond() : framesPerSecond;
    const interval = 1000 / fps;
    if (time + 0.1 >= next) {
      next = Number.isFinite(next) ? next + interval : time + interval;
      if (next < time) next = time + interval;
      callback(time);
    }
    if (running) frame = requestAnimationFrame(tick);
  }
  return {
    start() {
      if (running) return;
      running = true; next = -Infinity;
      frame = requestAnimationFrame(tick);
    },
    stop() { running = false; cancelAnimationFrame(frame); frame = 0; },
  };
}
