# Rendering and animation follow-up

Investigated plot refresh limits, audio polling, drawing resolution, 8192-point
FFTs, and SVG fish repainting. This pass changes visual scheduling and rendering;
audio DSP continues at its normal sample rate.

## Implemented

- Waveform rendering caps at 60 fps. Pitch-based capture spacing and phase locking
  remain in place. Spectrum polling/rendering caps at 30 fps on mobile, 60 on
  desktop, and skips unchanged audio timestamps. Loops stop when hidden or idle.
- A fractional-deadline frame loop maintains the intended average cadence across
  60/90/120/144 Hz screens without repeatedly drifting to a slower refresh divisor.
- Waveform point count follows CSS width, capped at 512. Spectrum groups bins by
  actual displayed columns, capped at 720. Each column retains its strongest peak;
  this reduces drawing work without reducing the underlying FFT resolution.
- WebGL merges waveform glow and stroke into one pass. It skips submissions for
  geometry that differs by less than 0.075 CSS pixels from the last submitted trace.
  Accumulated movement is compared against the last drawing, so slow motion remains
  visible. Resizing, theme changes and context restoration force a redraw.
- Swimming transforms and fin motion update DOM transforms directly instead of
  publishing reactive pose objects each frame. Looping SVG decorations advance
  together at 60 Hz; offscreen/hidden fish animations pause. Finite pop animations
  retain their existing timing. Reduced-motion preferences are cached and observed.
- Mouth synchronization during pitch glides also caps at 60 Hz.

## Measured trace example

Chrome 156, 375x812 mobile emulation, DPR 2, 4x CPU throttling, roughly 1.5 seconds
of sustained playback. The host supplied approximately 144 animation callbacks/s.
`devtools.timeline` tracing adds overhead; elapsed times vary between runs.

| Work during trace | Before | After |
| --- | ---: | ---: |
| GPU draw submissions | 651 | 136 |
| Spectrum polls | 217 | 45 |
| Uploaded trace bytes | 1,831,480 | 386,760 |
| SVG paint events | 436 | 184 |
| Paint duration | 218.8 ms | 95.4 ms |
| Main-thread task duration | 1,441 ms | 757 ms |

With the fish scrolled offscreen, the optimized trace recorded zero SVG paints.
These numbers quantify reduced work, not a physical-phone FPS guarantee. On a
60 Hz phone the Spectrum poll reduction is approximately 50%, rather than the
79% measured on this high-refresh host. The visible tradeoff is a 30 fps mobile
Spectrum; waveform and looping fish motion remain capped at 60 fps.

## FFT-size decision

8192 samples reduce analysis cost but do not address the continuously repainting
fish or excessive display-rate submissions. At 48 kHz, bin spacing changes from
2.93 Hz (16384) to 5.86 Hz (8192), while the window shortens from 341 to 171 ms.
That sacrifices useful bass detail. Retained 16384 and reduced the rate/size of
rendering work instead. The strongest peak in each drawn column remains visible.

Adding compositor hints to SVG groups did not remove the observed repaints.
Removing the shadow also did not eliminate them, so those experiments were not
used. Explicit animation scheduling and offscreen pausing produced a measurable
reduction while preserving the fish design.

Local trace scripts/results remain under ignored `.tmp/`: `render-profile.mjs`,
`render-baseline.json`, `fish-layers.json`, and `render-after.json`.

Validation includes GPU pixels/fallbacks/context recovery, mobile resizing and
pinch prevention, phase/glide tracking, animation/pop/drag behavior, SVG export,
reduced motion, 30/60 fps work budgets, offscreen freezing/resume, and narrow-peak
retention at reduced drawing widths. Frame cadence is unit-tested at 60/90/120/144 Hz.
