# FFT comparison

Compared the existing spectrum pipeline against FFT.js 4.0.4 and KissFFT WASM
2.0.1. Application FFT selection is unchanged; packages were downloaded into
ignored `.tmp/` directories for research only.

## Method

Chrome 156.0.8078.48 on this Windows machine, 375x812 mobile emulation, 48 kHz,
16,384-sample real FFT, zero temporal smoothing. Reusable buffers and prebuilt
FFT configurations. Each trial runs 220 animation frames; 60 frames warm up.
Methods rotate execution order each frame. Three trials use 4x CPU throttling.

Timings include live PCM/frequency capture, Blackman windowing, FFT, conversion
to display levels, and the same logarithmic spectrum reduction. Rendering is
excluded because it is shared by all implementations. External FFTs reuse a
precomputed Blackman window. KissFFT reads directly into reusable WASM memory.

Only frames with a fresh native analysis contribute to the comparison. Repeated
native reads can return cached analysis and must not be benchmarked as new FFTs.
There were 105-106 measured fresh frames per throttled trial. Real application
cadence can benefit from caching; an external replacement should skip unchanged
audio timestamps as well.

## Results

Mean milliseconds per fresh analysis, averaged across three throttled trials:

| Pipeline | Mean ms |
| --- | ---: |
| Current AnalyserNode + spectrum reduction | 1.25 |
| FFT.js + full dB conversion | 1.41 |
| KissFFT WASM + full dB conversion | 0.98 |
| FFT.js + peak-first dB conversion | 1.11 |
| KissFFT WASM + peak-first dB conversion | 0.60 |

The peak-first variant finds the strongest linear-power FFT bin in each display
column before applying the logarithm. Logarithms preserve ordering, so this
produces the same displayed peaks while converting far fewer bins to decibels.
With the test signal, the maximum vertical difference from the native plot was
less than 0.000004 plot units for every external implementation.

The signal is a looping sum of five bin-aligned tones. This validates scale,
windowing, plot geometry and steady-state timing, rather than transient handling
or arbitrary-noise accuracy. The comparator script and raw results are retained
locally as `.tmp/compare-fft.mjs`, `.tmp/fft-results-first.json` and
`.tmp/fft-results.json`. FFT.js uses its documented real transform; the WASM
comparison bypasses convenience wrappers that allocate every call.

## Interpretation

Native is not automatically fastest. Straightforward FFT.js is slightly slower
here; KissFFT WASM is faster. An optimized external spectrum pipeline roughly
halves fresh-analysis cost, saving about 0.65 ms in this throttled test. This is
a modest slice of the app's roughly 20 ms frame intervals from the wider profile.
A replacement warrants physical-phone and Safari measurements, including startup,
package size, PCM transfer, sustained playback and battery cost. This benchmark
does not establish a universal result for every browser or FFT library.

Chromium's current implementation performs analysis on the main thread, creates
a temporary sample buffer and computes the Blackman coefficients for each fresh
analysis. Those operations help explain why reusable external pipelines can win.
See [Chromium source](https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/modules/webaudio/realtime_analyser.cc).
The required windowing and dB steps are described in the
[Web Audio specification](https://webaudio.github.io/web-audio-api/#fft-windowing-and-smoothing-over-time).

Library sources: [FFT.js](https://github.com/indutny/fft.js),
[KissFFT WASM](https://github.com/iVilja/kissfft-wasm).
