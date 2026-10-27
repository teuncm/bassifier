import { createFrameLoop } from "./frame-loop.js";

// SVG transforms repaint in current browsers. Advance all looping decorations
// together at 60 Hz instead of letting each animation repaint at screen refresh.
export function createAnimationClock(root) {
  let animations = [];
  const loop = createFrameLoop(time => {
    for (const { animation, began } of animations)
      if (animation.playState !== "idle") animation.currentTime = time - began;
  });
  function refresh(active) {
    loop.stop();
    const now = performance.now();
    animations = root.getAnimations({ subtree: true })
      .filter(animation => animation.effect?.getTiming().iterations === Infinity)
      .map(animation => {
        const elapsed = Number(animation.currentTime) || 0;
        animation.pause();
        return { animation, began: now - elapsed };
      });
    if (active && animations.length) loop.start();
  }
  return { refresh, stop: loop.stop };
}
