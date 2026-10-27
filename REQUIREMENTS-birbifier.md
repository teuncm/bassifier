# Birbifier — implemented specification

Snapshot: 24 October 2026. This document describes the current implementation in this repository, including the final behavior after earlier design iterations. Numeric values describe the current controls and animation tuning, rather than earlier requested ranges.

## 1. Product and runtime

- **PR-01:** Provide a compact, mobile-friendly birdsong synthesizer and a generated SVG bird that represents its sound.
- **PR-02:** Run synthesis, waveform analysis, bird generation, sharing-link encoding, and downloads locally in the browser. No application server, account, uploaded audio, or synthesis service is required.
- **PR-03:** Use Vue 3 with the Composition API, Tailwind CSS, Vite, native SVG, and the Web Audio API. Use one editable, audible synth oscillator; vibrato and tremolo have separate modulation oscillators. There are no oscillator-count indicators.
- **PR-04:** Present the app name as **Birbifier**, without a trailing period. The header contains its bird icon, the home link, **Teun M. ↗** linking to `https://teuncm.nl/`, and the appearance toggle. There is no additional visible “birdsong generator” subtitle or header separator.
- **PR-05:** Keep interface copy short. Place “Locks preserve parameters during randomization.” below the controls, followed by an “Inspired by ZzFX” link to `https://github.com/KilledByAPixel/ZzFX`.

## 2. Startup and state

- **ST-01:** On an ordinary page load, select one of the 100 presets randomly, enable Repeat, show Ready, and leave playback stopped.
- **ST-02:** A valid shared `?p=` URL takes precedence over random startup and restores all sound parameters and the Repeat state without autoplay. Invalid shared data falls back to normal random startup.
- **ST-03:** Initially expand all five control groups. Initially lock Chorus against randomization; leave the other parameters unlocked.
- **ST-04:** Match the preset dropdown to the complete set of sound settings. Display **Custom** when the settings do not exactly match a preset. Repeat is independent of preset matching.
- **ST-05:** Persist a manually chosen appearance locally. Sound settings, locks, playback state, and expanded groups otherwise live in the current page session; shared URLs explicitly carry sound settings and Repeat.

## 3. Sound parameters

All sound parameters, including Shape, have individual randomization locks. Each numeric control displays its current value and unit. Visible endpoint labels and “applies to the next play” helper text are omitted.

The baseline column is `defaultSettings`, also used by **001 Little chirp** and Reset. Ordinary startup uses the randomly selected preset instead.

| Group | Display label / setting | Range | Manual slider increment | Baseline |
| --- | --- | --- | --- | --- |
| Wave | Shape / `shape` | Sine, Square, Sawtooth | Discrete buttons | Sine |
| Wave | Frequency / `frequency` | 250–8,000 Hz | 10 Hz; linear position in Hz | 2,400 Hz |
| Wave | Amplitude / `amplitude` | −10 to 0 dB; linear gain `10^(−10/20)` to `1` | Continuous linear gain (`step="any"`) | `0.45`, approximately −6.94 dB |
| Vibrato | Frequency / `vibratoFrequency` | 0–30 Hz | 0.1 Hz | 8 Hz |
| Vibrato | Depth / `vibratoDepth` | 0–1,200 cents | 10 cents | 180 cents |
| Tremolo | Frequency / `tremoloFrequency` | 0–30 Hz | 0.1 Hz | 6 Hz |
| Tremolo | Depth / `tremoloDepth` | 0–100%; internally `0–1` | 1 percentage point | 45% |
| Effects | Low pass / `cutoff` | 250–15,000 Hz | 50 Hz | 8,000 Hz |
| Effects | Chorus / `chorus` | 0–100%; internally `0–1` | 1 percentage point | 30%, locked |
| Timing | Duration / `duration` | 0.5–2 seconds | 0.05 seconds | 0.8 seconds |
| Timing | Pause / `pause` | 0–1 second | 0.05 seconds | 0.2 seconds |

- **PA-01:** Label frequency controls **Frequency**, rather than Speed; use **Amplitude**, **Shape**, **Depth**, **Low pass**, **Chorus**, **Duration**, and **Pause** as shown above.
- **PA-02:** Display amplitude as `20 × log10(linear gain)` in dB while retaining linear gain internally. Format numeric readouts with up to two decimal places and locale-aware formatting.
- **PA-03:** Zero modulation depth disables that modulation's audible effect. Vibrato modulates pitch in cents; tremolo modulates amplitude without changing pitch.
- **PA-04:** Apply shape, frequency, amplitude, modulation, low-pass, and chorus edits to an active voice. Duration is scheduled when a chirp starts, so a changed duration applies to a subsequent chirp. A changed repeat pause reschedules a pending gap.

## 4. Controls and responsive layout

- **UI-01:** Put Randomize, Reset, and Collapse/Expand in one compact action row. Randomize uses a die icon; Reset has a subdued red treatment; Collapse/Expand is the rightmost action.
- **UI-02:** Group **Wave**, **Vibrato**, and **Tremolo** vertically under **Synth**. Group **Effects** and **Timing** under **Master**. Effects contains Low pass first, then Chorus; Timing contains Duration and Pause.
- **UI-03:** Give each control group a clickable header with an expansion chevron. Collapsed groups retain labeled values and working lock buttons; expanded groups show sliders, shape choices, and applicable XY visualizers. Preserve sound settings, locks, and playback when collapsing.
- **UI-04:** The global action collapses all groups if any are expanded, and expands all groups if all are collapsed. Its visible label is simply **Collapse** or **Expand**.
- **UI-05:** Use one column of control groups, with paired sliders side by side where each can receive at least 240 px plus the inter-column gap. Stack pairs in narrower cards, including the desktop Master sidebar.
- **UI-06:** Combine **Your bird** and Presets into one card with a shared footer. On mobile, show the bird to the left of the preset selector, with previous/next arrows beneath the dropdown. On desktop, put the preset selector above the bird in the right sidebar, with arrow buttons beside the dropdown.
- **UI-07:** Use a centered container with a maximum width of 1,160 px. At the desktop breakpoint of 64 rem, use a flexible main column and a 320 px sidebar. Below that breakpoint, put bird/presets first, then Synth, then Master.
- **UI-08:** Below 64 rem, attach the full-width playback player to the viewport's bottom edge. Include a small waveform above the controls, omit the separate desktop Playback heading, and use a straight full-width top edge rather than a floating rounded dock.
- **UI-09:** Respect bottom and horizontal device safe-area insets. Reserve `8rem + safe-area-inset-bottom` beneath the content and for scroll padding so the player does not cover the last controls.
- **UI-10:** On desktop, keep the Playback card above Synth. Its controls remain attached to its waveform and use the page's surface color.
- **UI-11:** Keep headers, card padding, and mobile horizontal gutters compact. Use subtle card and group borders, stronger interactive-control borders, rounded corners, and color separation. Section headings have no decorative icons.
- **UI-12:** Preserve the bird's fixed 23:20 portrait space as its SVG proportions change. Parameter edits, including Duration and Tremolo depth, must not move the surrounding layout or introduce horizontal overflow at narrow mobile widths.

## 5. Presets, randomization, and locks

- **PS-01:** Supply 100 unique presets numbered with three digits, from **001 Little chirp** through **100 Galactic goose**. Include whistles, coos, warbles, rattles, low calls, and electronic sounds. The catalogue is listed below.
- **PS-02:** Dropdown selection loads every sound setting, including Pause and Chorus. Previous/next navigation wraps at either end. After custom edits or randomization, navigation continues from the last selected preset.
- **PS-03:** Preserve the current Repeat toggle while browsing, loading presets, randomizing, or resetting.
- **PS-04:** Randomize every unlocked setting, including Shape, Duration, Pause, and Effects. Disable Randomize when every parameter is locked. Random numeric values use the parameter increments; amplitude randomization uses approximately 0.01 linear-gain increments and two-decimal rounding.
- **PS-05:** Locks protect against randomization only. Manual slider/XY edits, preset loading, and Reset remain available. Preserve other lock states when loading/resetting; always restore Chorus to its locked state on preset loading and Reset. Every built-in preset specifies 30% Chorus.
- **PS-06:** Use a visible selected treatment and a closed-lock icon for locked parameters, with matching pressed state, accessible label, and tooltip. Keep the treatment clear but restrained.
- **PS-07:** Couple random pitch and filter selection using the bottom of the vibrato pitch range:

  ```text
  lowest vibrato frequency = wave frequency × 2^(−vibrato depth / 1200)
  randomized low pass ≥ max(250 Hz, lowest vibrato frequency)
  ```

  Round an unlocked cutoff upward to its 50 Hz grid before choosing within the available range. Choose vibrato depth before wave frequency, then cutoff. A locked cutoff constrains an unlocked randomized wave frequency; when wave frequency and cutoff are locked, increase an unlocked vibrato depth as needed within its range. Preserve locks even if locked values make the relationship impossible. Manual edits and shared sounds can use independently chosen values.

## 6. Playback and keyboard behavior

| Action | Implemented behavior |
| --- | --- |
| Play | Start the current sound from its beginning. |
| Stop / active Play toggle | Stop the voice and master tail and cancel pending repeats. |
| Randomize | Randomize unlocked settings and always start/restart playback. |
| Reset | Load 001 Little chirp and always stop playback, including pending gaps. |
| Preset dropdown | Restart from the beginning if playing or starting, including during a repeat gap; remain silent if stopped. |
| Previous/next preset | Load and immediately play from the beginning, even if previously stopped. |
| Enable Repeat | Continue repeating at chirp boundaries while playback is active; do not start stopped playback. |
| Disable Repeat during a chirp | Finish the current chirp and its effect tail, then stop. |
| Disable Repeat during a gap | Cancel the next chirp and return to Ready. |
| Download | Export the current sound without starting or interrupting playback. |

- **PB-01:** Show icon-only Play/Stop, Repeat, and WAV download controls with accessible names and tooltips. The download name is **Download (WAV)**. Keep download size/padding aligned with the other playback controls.
- **PB-02:** Show **Ready**, **Playing**, or **Pause** beside a small status dot. Reserve a fixed 48 px label width, fixed dot size, and fixed gap so neither dot nor label shifts between states. Gently glow the dot during active chirps, rather than repeat gaps.
- **PB-03:** Base completion on the audio context clock and the full rendered duration, including chorus tail. Let the waveform cursor reach its right edge before treating the chirp as complete. Begin the selected repeat pause after that completion.
- **PB-04:** Rapid starts, stops, preset changes, and pending audio-context resumes must honor only the latest playback request. Cancel stale completion and repeat callbacks.
- **PB-05:** Stop on window blur, hidden-document visibility, page exit (`pagehide`), and document freeze. Cancel voices/repeats, close the audio context to release the device, and remain silent when focus/visibility returns. Moving focus between controls within the page does not stop playback.

| Shortcut | Behavior |
| --- | --- |
| Space | Toggle Play/Stop without scrolling; ignore repeated keydown while held. |
| Left / Right | Previous/next preset, including immediate audition and wrapping. |
| Down | Download WAV without scrolling or starting playback. |
| Arrow keys on a focused range input | Preserve native slider adjustment. |
| Left / Right on an XY pad | Adjust its LFO frequency by 0.1 Hz. |
| Up / Down on an XY pad | Adjust its LFO depth by the relevant depth increment. |

- **KB-01:** Preserve native keyboard behavior in focused inputs, selects, editable fields, and XY controls. Space also preserves native button/link behavior. Ignore global shortcuts with modifiers, composition, or an already-handled event.
- **KB-02:** Trigger the corresponding visible button press treatment for preset arrows, Down/download, and Space/play. Keyboard press feedback lasts approximately 250 ms.

## 7. Audio synthesis, effects, and output safety

- **AU-01:** Use the same synthesis/effects implementation for live playback and offline preview/export. Render offline buffers at 44,100 Hz with two channels. Live playback uses the browser audio context's sample rate.
- **AU-02:** Use this signal flow:

  ```text
  Single audible oscillator
    → Amplitude gain
    → Tremolo gain
    → User low-pass filter
    → Chirp envelope
    → Dry/chorus stereo mix
    → Fourth-order safety low pass
    → Soft limiter (4× oversampling)
    → Final peak guard
    → Tail fade/output

  Vibrato sine LFO → oscillator detune in cents
  Tremolo sine LFO → tremolo gain
  ```

- **AU-03:** Tremolo gain is centered at `1 − depth/2`, with sine modulation amplitude `depth/2`; full depth ranges from silence to full gain. The user filter is a low-pass biquad with Q `0.707`; clamp its actual cutoff to the lower of the selected value, 15,000 Hz, and 40% of the sample rate.
- **AU-04:** Use short chirp fades: 15 ms attack to a headroom gain of `0.25`, then a 35 ms release at the scheduled end. Smooth live parameter changes with a 15 ms target time constant. Stop uses a short fade instead of an abrupt cut.
- **AU-05:** Implement stereo chorus with 14 ms and 21 ms delay bases, opposing ±2 ms modulation, and a shared 0.5 Hz sine control cycle. Mix dry and wet linearly as `1 − chorus` and `chorus`. Zero mix bypasses its contribution; the UI supports the full 0–100% range. There is no ping-pong delay effect.
- **AU-06:** When Chorus is nonzero at voice creation, include 40 ms of effect tail beyond Duration. Fade the final 25 ms of the full rendered output. Clear previous chorus tails on Stop and restarting; shut down an idle master graph after natural nonrepeating completion.
- **AU-07:** Apply a fourth-order Butterworth safety low pass after chorus, built from two biquads with Q values approximately `0.5411961` and `1.306563`. Its cutoff is `min(12,000 Hz, sample rate × 0.4)` to attenuate near-Nyquist content. This safety stage is separate from the user-adjustable Low pass control.
- **AU-08:** Apply a soft limiter after chorus and safety filtering. Magnitudes up to `0.2` pass unchanged; larger magnitudes smoothly approach `0.25` using a tanh knee. Use 4× waveshaper oversampling, then a final hard peak guard at ±`0.25` to constrain reconstruction overshoot. Keep the output finite under extreme settings.
- **AU-09:** Calibrate built-in preset amplitudes to approximately `0.05` RMS (−26.0 dBFS) over the active chirp at 44.1 kHz with default effects. Exclude tails from the measurement. The preset regression tolerance is ±`0.002` RMS. This balances average signal levels; it is not perceptual loudness normalization or automatic leveling of manual edits.

## 8. Waveform and audio download

- **WF-01:** Show 180 uniform-color, centered vertical peak bars for the full current wet render. Each bar uses the maximum absolute sample across both channels in its time window, preserving opposite-polarity stereo peaks without cancellation.
- **WF-02:** Use compact waveform heights of 32 px below the desktop breakpoint and 80 px on desktop. Do not display a grid, horizontal axis, time labels, or frequency-based bar coloring.
- **WF-03:** Draw a vertical playback cursor synchronized to the audio clock. Include the chorus tail in progress, retain its final right-edge position at natural completion or during a repeat gap, and remove it on explicit Stop.
- **WF-04:** Refresh previews after sound edits, show a rendering/busy state, and provide “Preview unavailable” when rendering fails. Pause changes alone reuse the same sound render.
- **EX-01:** Download one complete current chirp and its tail as `birbifier-song.wav`: stereo, 44.1 kHz, 16-bit little-endian PCM, correctly interleaved RIFF/WAVE. Export the full current effects and limiting; there is no separate dry-export option.
- **EX-02:** Generate exports from a settings snapshot, including when a new preview has not yet rendered or the waveform is off screen. Reuse the same render when possible. Disable concurrent export clicks, expose the busy state, and revoke temporary download URLs after use.

## 9. Bird generation and parameter morphs

- **BR-01:** Generate a deterministic, scalable SVG bird from the current sound settings. Seed decorative markings from the sorted sound settings so revisiting a preset or opening its shared link restores the same portrait. Transient feather positions are separately randomized.
- **BR-02:** Keep the portrait framed within its reserved space, with adjusted SVG bounds for large heads, crests, tails, and beaks. The SVG contains body, belly, wing feathers, tail, head, crest, eyes/highlight, cheek, beak, feet/legs, and a ground shadow.

| Input | Implemented visual mapping |
| --- | --- |
| Wave frequency | Body hue, with coordinated wing, belly, and cheek colors. Hue progresses approximately 25°–335° across the frequency range; body saturation remains 55%. |
| Amplitude | Body size; its SVG radius is `39 + 32 × linear amplitude`. |
| Sine shape | Round body. |
| Square shape | Square body. |
| Sawtooth shape | Upright right-triangle body, rising diagonally from bottom-left to top-right with a vertical right edge, like the rising part of a sawtooth wave. Shift its tail attachment to remain connected. |
| Vibrato frequency | Separation of the two crest/hair tufts, independently of tail spread. |
| Vibrato depth | Crest/hair size; retain a small crest at zero depth. |
| Tremolo frequency | Tail-feather spread; also changes the number of wing feather strokes. |
| Tremolo depth | Tail length/size; also changes the number of decorative body spots. |
| Duration | Head size, from a scale of `0.69` to `1.31`. |
| Pause | Beak length, from 24 to 51 SVG units. |
| Low pass | Whole-head vertical position: higher cutoff raises the head, lower cutoff lowers it; 8,000 Hz is the neutral offset. |
| Chorus | Beak thickness around its familiar 30% setting: thickness scale `1 + (chorus − 0.3) × 0.65`, preserving beak length. |
| Repeat on | A tiny subtle speck on the face. |

- **BR-03:** Crest and tail spread each range approximately 3°–39° according to their own LFO frequency. Crest size ranges 7–36 SVG units; tail size ranges 22–72 SVG units.
- **BR-04:** Keep feet/leg thickness and stance at the current fixed proportions. Chorus now changes the beak rather than legs; Low pass now moves the head rather than changing stance. Legs extend into the body.
- **BR-05:** Offer `birbifier-bird.svg` as a standalone static download, including during playback or flight. Remove temporary root positioning and gaze/facing transforms and singing state from the exported copy; preserve the parameter-generated geometry and colors.

## 10. Bird singing and flight animations

- **AN-01:** Animate the beak only during an active chirp, close it during repeat gaps and after Stop, and make it chatter rapidly rather than slowly opening once.
- **AN-02:** Use Vibrato frequency for beak frequency when Tremolo depth is at or below 80%. Above 80%, use Tremolo frequency alone. Clamp the visual rate to 2–20 Hz; each alternating half-cycle takes `0.5 / rate` seconds, rotating the lower beak from 0° to 25°.
- **AN-03:** While singing, flutter wings with 180 ms alternating strokes, flick the tail with 270 ms alternating strokes, and bob/tilt the body with 420 ms alternating strokes. Pause perched bird animations while its perch is off screen.
- **FL-01:** Allow mouse, pen, and touch dragging of the main bird anywhere across the page, outside its card. Capture the active pointer, prevent touch scrolling on the dragged bird, and reserve its original portrait space so the page does not reflow.
- **FL-02:** Hide the ground shadow both while dragging and while returning. Turn the bird toward its stationary position and tilt its gaze toward home during both phases.
- **FL-03:** Use recent pointer velocity to throw the bird on release. Retain a short continuation in the thrown direction, followed by a curved return with ease-in-out timing. Current tuning uses a 1.45 velocity multiplier, a 4.5 px/ms speed cap, and approximately 220 ms momentum damping.
- **FL-04:** Return over approximately 1.8 seconds, extending as needed to settle on a moving landing position. Recalculate the destination after scroll, resize, and layout changes, smoothing destination movement over approximately 70 ms. Land at the updated perch without a final jump, including when scrolling on mobile after throwing.
- **FL-05:** During return, use stronger 110 ms wing-flap strokes, tail flicks, and 140 ms alternating leg wiggles. Restore normal facing, gaze, position, and ground on landing. Pointer cancellation also returns the bird safely.
- **FL-06:** Drop small body-colored feathers during a visible flight, approximately every 140 ms until near landing. These fall about 65 px, drift/rotate, and fade over 1.2 seconds. Skip particle spawning when the flying bird is outside the viewport.

## 11. Preset/randomize replacement animation

- **RP-01:** Trigger replacement when selecting a preset, using previous/next navigation or keyboard navigation, or randomizing. Manual parameter edits and Reset do not initiate it. Do not perform the effect for an off-screen main bird or the reflection copy.
- **RP-02:** Briefly retain an outgoing copy of the old bird, then make it pop out of existence in approximately 80 ms, with near-constant scale. Do not expand it into an outward explosion. Remove the outgoing ground and mark the copy decorative and noninteractive.
- **RP-03:** Leave 12 feathers in the old bird's colors at independently randomized positions across its former area, rather than arranged in a circle. Let them fall downward with a gentle sideways flutter.
- **RP-04:** Vary each replacement feather's size, starting tilt, rotation, drift, sway, fall distance, final shrink, and lifetime. Current ranges include 60–125 px fall distance, approximately ±20 px final drift, approximately ±21 px sway, and 1.8–3 seconds lifetime. Some feathers flutter and dwindle more than others.
- **RP-05:** Pop the new bird in with a 100 ms delay and 300 ms animation, scaling approximately `0.65 → 1.06 → 1` while fading in. Start the sound independently; animation must not delay synthesis or restart timing.
- **RP-06:** Cancel/replace obsolete outgoing and incoming animations during rapid changes. Keep at most one outgoing copy, give its copied clip paths unique IDs, and clean it up after completion/unmount. Keep all feather particles bounded to 16 per main bird, shared by replacement and flight effects; remove oldest particles when necessary.

## 12. Off-screen bird reflection

- **RF-01:** When a sound setting changes while the main bird is off screen, show a temporary small circular reflection near the most recently used control. Mirror current geometry, colors, Repeat speck, and singing state.
- **RF-02:** Only show it when the actual main bird is outside the viewport. Check current portrait geometry when editing/repositioning rather than trusting stale intersection notifications. A visibly dragged bird suppresses the bubble even if its stationary perch is off screen.
- **RF-03:** Hide the reflection when the main bird becomes visible, its anchor leaves the viewport, or 1.8 seconds pass without another relevant update. New edits refresh the timer. Allow a recent edit to be reflected when an off-screen intersection notification arrives just after scrolling.
- **RF-04:** Keep the reflection inside the viewport near its control, with a 12 px edge gap and size of `min(144 px, 34% of viewport width)`. Fade it in over 180 ms. It must not accept pointer input, duplicate actionable sharing controls, or collide with the main bird's SVG IDs.

## 13. Sharing and URL contract

- **SH-01:** Put Share, with its share icon, on the left of the bird card footer and the icon-only bird SVG download on the right. Sharing is separate from WAV download in the playback controls.
- **SH-02:** Prefer native Web Share with the title Birbifier and the current link. Respect user cancellation. Otherwise copy the link and show temporary Copied feedback; if clipboard access is unavailable, show and select a copyable URL input.
- **SH-03:** Use one compact GET parameter `p`, containing comma-separated positional numbers. Omit leading zeroes from fractional values. Replace existing query data and remove the hash when generating a share URL.

| Zero-based index | Meaning | Encoding |
| --- | --- | --- |
| 0 | Shape | `0` sine, `1` square, `2` saw |
| 1 | Wave frequency | Hz |
| 2 | Amplitude | Linear gain, not dB |
| 3 | Vibrato frequency | Hz |
| 4 | Vibrato depth | Cents |
| 5 | Tremolo frequency | Hz |
| 6 | Tremolo depth | `0–1` |
| 7 | Duration | Seconds |
| 8 | Low pass | Hz |
| 9 | Pause | Seconds |
| 10 | Chorus | `0–1` |
| 11 | Repeat | `0` off, `1` on |

Example: `https://teuncm.nl/birbifier/?p=0,2400,.45,8,180,6,.45,.8,8000,.2,.3,1`.

- **SH-04:** Keep this field order stable. The current decoder requires exactly 12 values and at most 256 characters. Validate numeric syntax, finite values, parameter bounds, an integer shape index, and a binary Repeat value; preserve valid fractional precision rather than rounding to slider increments.
- **SH-05:** Sharing carries sound and Repeat, not locks, theme, expanded state, transient animations, or playback position. Opening a link does not start audio.
- **SH-06:** Provide one static 1,200 × 630 PNG social card featuring a cute generated bird and Teun M. attribution, with an editable SVG source. GitHub Pages serves this same preview for all query strings; per-bird dynamic social images are not part of the current hosting implementation.

## 14. Visual feedback, themes, and accessibility

- **VF-01:** Give button presses and slider drags consistent orange feedback on mouse and touch, including quick taps. Preserve held-slider feedback throughout dragging; clear it on release/cancel, blur, or hidden-document transitions. Brief post-release feedback lasts approximately 100 ms for sliders and 180 ms for buttons.
- **VF-02:** Highlight a slider's own value readout while dragging it. Do not highlight its XY dot merely because a slider is active. Dragging an XY controller highlights its dot and both relevant value labels.
- **VF-03:** On hover-capable devices, blink the XY dot gently on hover with a 1-second cycle. While actually dragging the pad, use an orange dot and a small pulsing orange glow with 350 ms alternating strokes.
- **VF-04:** Half a second after loading, attract attention to Play with two 650 ms bright glow pulses, a slight lift, and enlargement. Stop the hint after it finishes or playback starts.
- **VF-05:** Make Repeat-on visually clear with a filled selected state, ring, and continuous green/less-green 800 ms cycle. Add a brief 400 ms orange glow when a repeat begins. Active interaction feedback takes precedence over decorative animations.
- **TH-01:** Default to the device light/dark preference and track device changes until the user manually chooses a theme. Apply appearance before Vue mounts to avoid a wrong-theme flash. Manual selection persists under `birbifier-theme` when local storage is available.
- **TH-02:** Use a soft sage light palette and neutral charcoal dark surfaces with green accents. Keep readable text and control contrast without a high-contrast appearance or a strongly green dark background. Set browser `theme-color` and native `color-scheme` to match.
- **AC-01:** Use semantic headings, labeled groups and inputs, accessible icon-button names/tooltips, expansion/pressed/busy states, status announcements, a descriptive bird image label, and visible keyboard focus indicators. Mark decorative particles/copies/reflections as hidden from accessibility APIs.
- **AC-02:** Keep XY pads keyboard-focusable with screen-reader instructions. Show a circular controller dot with equal edge reach and a centered one-second LFO trace. Do not show grid, boundary guides, horizontal axis, the zero label, or visible drag instructions. Keep the trace visible at zero and near-zero depth.
- **AC-03:** Disable ordinary text selection to feel like an app, while keeping the sharing fallback URL explicitly selectable. Keep semantic text in the DOM and metadata for search engines.
- **AC-04:** Respect reduced motion: disable decorative control pulses, hover blinks, reflection fades, singing/flight limb animation, and replacement effects; return a released bird immediately rather than flying it home. Use a still, slightly open beak while singing and retain static orange feedback during interaction.
- **AC-05:** Show actionable audio-start/export errors in an alert. Support missing Web Audio with a useful message. Preview failure should not crash the app. Theme switching must work even when local storage is blocked.

## 15. Implemented performance and resource management

### Audio and analysis

- **PF-01:** Share a four-entry least-recently-used render cache between preview and export. Cache in-flight promises as well as completed results, evict old entries, and remove rejected work. Exclude Pause from the sound-render key.
- **PF-02:** Cache waveform analysis by buffer and bar count using weak references, retaining at most two bar-count variants per buffer. Cache encoded WAV blobs by buffer with weak references.
- **PF-03:** Debounce preview edits for 100 ms. Allow at most one preview render in flight, then render only the latest queued settings. Reject stale results with version checks; do not attempt to cancel unsupported offline rendering work.
- **PF-04:** Defer previews while their waveform is off screen or the document is hidden, and resume with current settings when visible. Exports still render the requested current sound immediately. The mobile bottom player's visible waveform remains available while scrolling.
- **PF-05:** Share an immutable chorus control AudioBuffer across voices and contexts instead of allocating its sine cycle for every chirp. Reuse the master graph by context/output while needed, and disconnect it on Stop or idle completion.
- **PF-06:** Only schedule audio automation for parameters whose values changed. Do not reset unrelated ramps on every slider edit. Disconnect finished voice nodes, cancel obsolete callbacks, and close the audio context when backgrounded or unmounted.

### SVG, animation, and interaction

- **PF-07:** Memoize waveform bars and the bird SVG subtree so unrelated parent updates do not rebuild their geometry. Match presets through a prebuilt settings-signature index rather than scanning every preset during each edit.
- **PF-08:** Animate the waveform cursor through direct SVG attribute writes based on the audio clock. Stop its animation-frame loop when off screen, hidden, or complete, and catch up on return without reactive frame-by-frame app updates.
- **PF-09:** Batch XY pointer moves to one update per animation frame, reuse measured bounds through a drag, and invalidate them after scroll/resize. Commit the final pointer position on release.
- **PF-10:** Rebuild an LFO's sampled sine path when frequency changes; use an SVG transform for depth changes. Keep a minimum visual scale of `0.0001` so a zero-depth transform remains drawable, without affecting the true zero value or dot position.
- **PF-11:** Write bird flight translation/scale directly once per animation frame. Keep fixed base SVG dimensions during flight and resize through transforms, avoiding width/height layout changes each frame. Cache home geometry and invalidate it on scroll, resize, or observed layout changes.
- **PF-12:** Run limb and feather animations through CSS and replacements through the Web Animations API, rather than a Vue render loop. Keep feather lists in their own shallow-reactive component so particle creation/expiry does not rerender bird geometry.
- **PF-13:** Bound particles to 16, remove them on animation completion with timed fallback cleanup, and cancel animations/observers/listeners/timers on unmount. Skip invisible flight particles and off-screen replacement effects; pause perched animations off screen.
- **PF-14:** Cache reflection anchor positioning and batch scroll repositioning per frame. Use current bird geometry for reflection eligibility to avoid stale visibility bugs; this edit-time check takes precedence over the former cached-only optimization.
- **PF-15:** Delegate control feedback listeners instead of attaching independent timer logic to every control. Keep held feedback without restarting a timeout for every input event; preserve quick-tap feedback after Vue patches selection/lock classes.
- **PF-16:** Use compiled Vue/Tailwind assets, local SVG icons, and system fonts. Exclude Vue's unused Options API support from production bundles.

## 16. Search, attribution, and deployment

- **SEO-01:** Use `https://teuncm.nl/birbifier/` as the canonical URL. Include a descriptive HTML title, meta description, author **Teun M.**, Open Graph metadata, Twitter large-image metadata, social-image alt text, and WebApplication JSON-LD.
- **SEO-02:** Include descriptive app content, attribution, and a JavaScript-required message in the initial HTML before Vue mounts. Metadata and the share card are available without client-side rendering.
- **SEO-03:** Publish `sitemap.xml` for the canonical app URL and link it from HTML. The backlink to teuncm.nl is implemented here; linking from the main site's navigation and managing the domain-root robots file/Search Console are external site configuration, not runtime features of this repository.
- **DP-01:** Build with Vite and deploy generated `dist` assets through GitHub Pages. Use relative built asset URLs (`base: './'`) so the app works under `/birbifier/` and other repository subpaths. Do not publish the raw source HTML as the production build, which would request `/src/main.js` and cause the HTML/MIME module-loading failure.
- **DP-02:** The Pages workflow runs on pushes to `main` or manual dispatch, uses Node 24 and `npm ci`, builds, uploads the `dist` artifact, and deploys after a successful build. Cancel superseded workflow runs in its Pages concurrency group. The custom domain remains configured on the account's main Pages site.
- **DP-03:** Development requires Node `^22.18.0 || >=24.12.0`. Provide `npm run dev`, `npm run build`, `npm run preview`, and `npm test`. Require a recent JavaScript browser with Web Audio for synthesis and OfflineAudioContext for waveform/export; use Pointer Events, SVG, observers, and native sharing/clipboard where available.

## 17. Verification reference

This is a map of the regression coverage present in the repository, not a claim that a fresh full test run was performed when writing this document. Runtime source defines current behavior where an older assertion reflects a superseded implementation detail.

| Area | Relevant test files in `tests/` |
| --- | --- |
| Core controls, audio, bounds, locks, WAV | `birbifier.spec.js`, `restart-sound.spec.js` |
| Startup, hints, preset catalogue/levels, repeat scheduling | `startup.spec.js`, `repeat-presets.spec.js` |
| Randomized filter/pitch constraints and linear frequency | `randomize-filter.spec.js`, `linear-frequency.spec.js` |
| Stereo chorus, wet output, safety filter, limiter | `master-effects.spec.js`, `anti-alias.spec.js`, `limiter.spec.js` |
| Waveform peaks, cursor completion, mobile playback dock | `waveform.spec.js`, `playback-cursor.spec.js`, `playback-dock.spec.js` |
| Bird morphs, static SVG export, singing | `bird.spec.js` |
| Drag/throw, moving landing, particles, replacement transitions | `bird-drag.spec.js`, `bird-replacement.spec.js` |
| Off-screen reflection, stale notifications, dragged visibility | `bird-reflection.spec.js` |
| Keyboard shortcuts and browser lifecycle | `keyboard-playback.spec.js`, `background-playback.spec.js` |
| XY boundaries, zero depth, touch feedback | `lfo-boundaries.spec.js`, `touch-feedback.spec.js` |
| Responsive layout stability and appearance | `layout-stability.spec.js`, `theme.spec.js` |
| Share codec, round trips, fallbacks, static social metadata | `share.spec.js` |
| Caching, deferred rendering, audio automation, DOM/frame efficiency | `performance.spec.js` |

Run Playwright with `npm test`; install its browser with `npx playwright install chromium`, or set `BIRBIFIER_TEST_CHANNEL=msedge` / `chrome` for an installed browser. Responsive coverage includes 320, 375, 560, 768, 1,024, and 1,280 px layouts.

## 18. Preset catalogue

The names and order below are the current built-in catalogue from `src/audio.js`. Preset sound values remain defined there.

| 001–025 | 026–050 | 051–075 | 076–100 |
| --- | --- | --- | --- |
| 001 Little chirp | 026 Glasswing | 051 Pygmy owl | 076 Bubblegum gull |
| 002 Forest trill | 027 Bubblebird | 052 Kingfisher flash | 077 Clockwork chick |
| 003 Soft coo | 028 Copper finch | 053 Reed flute | 078 Amber reed |
| 004 Bright whistle | 029 Space gull | 054 Acorn woodpecker | 079 Starlight shimmer |
| 005 Warbling finch | 030 Pixel robin | 055 Prairie wobble | 080 Alien duckling |
| 006 Evening dove | 031 Moon owl | 056 Peacock trumpet | 081 Velcro wings |
| 007 Chattering sparrow | 032 Velvet thrush | 057 Snow bunting | 082 Singing satellite |
| 008 Reedy call | 033 Rainforest ping | 058 Mangrove gargle | 083 Papaya parrot |
| 009 Tiny peep | 034 Reedbed rattle | 059 Oriole ribbon | 084 Ice cave pip |
| 010 Meadow song | 035 Alpine echo | 060 Sedge warbler | 085 Frog in feathers |
| 011 Owl hoot | 036 Ruby hummingbird | 061 Raindrop peep | 086 Saffron spiral |
| 012 Canary flutter | 037 Pocket robot | 062 Cedar waxwing | 087 Neon nectar |
| 013 Robin whistle | 038 Cricket cousin | 063 Burrowing hoot | 088 Pocket pterodactyl |
| 014 Wren chatter | 039 Marsh tremble | 064 Jungle squeaker | 089 Quicksilver quail |
| 015 Blackbird warble | 040 Sea whistle | 065 Willow lullaby | 090 Fern fax |
| 016 Swallow twitter | 041 Solar flare | 066 Sandpiper sprint | 091 Teacup tempest |
| 017 Cuckoo pulse | 042 Mossy bass | 067 Toucan croak | 092 Dreaming heron |
| 018 Lark trill | 043 Helium canary | 068 Swifts at dusk | 093 Bamboo hiccup |
| 019 Chickadee peep | 044 Comet trill | 069 Bittern bottle | 094 Apricot alarm |
| 020 Crane call | 045 Silver bell | 070 Juniper jingle | 095 Dusty gramophone |
| 021 Goldfinch ripple | 046 Rusty gate | 071 Dewdrop modem | 096 Aurora warbler |
| 022 Woodland buzz | 047 Tiny UFO | 072 Orbiting owl | 097 Circuit cicada |
| 023 Waterbird murmur | 048 Flute call | 073 Laser lark | 098 Ginger squeak |
| 024 Dawn chorus | 049 Electric flock | 074 Moss telephone | 099 Midnight marimba |
| 025 Night song | 050 Radio birb | 075 Crystal nest | 100 Galactic goose |
