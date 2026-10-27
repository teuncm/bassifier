# Mobile performance pass

Profiled the path from input events through Vue updates, Web Audio automation,
and waveform/spectrum rendering. Reproduce with `node scripts/profile.mjs`.
It writes `.tmp/performance.json`; use `PROFILE_URL` to profile a production preview
and `PROFILE_CPU_RATE` to change the default 4x CPU throttling.

## Findings and changes

- **Vue:** unrelated sliders already skipped rendering. Fish centering triggered
  a second component render for every edit; its final SVG transform is now applied
  directly after geometry updates. FishBody no longer rerenders for every swimming
  fin movement. Bubble expiration uses timers rather than replacing reactive lists
  on every animation frame. IntersectionObserver supplies fish visibility without
  a synchronous layout read for each parameter change.
- **Audio:** changing drive rebuilt and copied a 16,385-sample transfer curve.
  A shared parabolic curve now follows a smoothed input GainNode. This preserves
  the transfer function and 4x oversampling while automating a single AudioParam.
  Long WAV encoding runs in a worker; transferred channel copies preserve cached
  AudioBuffers. The synchronous encoder remains the fallback.
- **Graphics:** noise dots use one Canvas rather than 200 reactive DOM elements.
  Positions still reshuffle for every noise change; dots remain solid 3px.
  Instanced WebGL uploads each trace point once instead of expanding all segment
  vertices in JavaScript. Non-instanced WebGL and Canvas fallbacks remain available.
  Live graph status attributes update only when their values change.

## Local comparison

Chrome mobile emulation, 375x812, 4x CPU throttling, 90 input events per control,
same sequence and development build. Noise input rounding produces 62 distinct
values. Instrumentation counts DOM mutations, component renders, geometry reads,
curve assignments and GPU uploads; it also adds some overhead itself.

| Measure | Before | After |
| --- | ---: | ---: |
| Noise edits: frame interval p95 | 42.1 ms | 20.0 ms |
| Drive edits: frame interval p95 | 32.9 ms | 19.9 ms |
| Noise edits: DOM mutations | 30,419 | 4,380 |
| Noise edits: main-thread task time | 2,536 ms | 1,239 ms |
| GPU uploads per 90-frame sequence | 13.71 MB | 0.76 MB |
| Drive edits: curve assignments | 90 | 0 |
| Drive edits: FishPortrait renders | 180 | 90 |
| Parameter edits: visibility layout reads | 90 | 0 |

These are local comparisons, not physical-phone frame-rate guarantees. This first
pass preserved FFT size, refresh cadence, continuous-phase waveform alignment and
audio safety limits. The subsequent [rendering pass](rendering-performance.md)
adds explicit drawing/polling limits. GPU tests cover rendered pixels, context restoration, both
fallbacks, and compact uploads. Audio/export checks cover transfer and automation,
stereo bounds, channel routing, glide, WAV bytes and cached-buffer integrity.

Design references: [Vue performance](https://vuejs.org/guide/best-practices/performance),
[WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).
