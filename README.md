# Bassifier

Browser-based unison bass synthesizer built with Vue 3, Vite, SVG, and Web Audio.

```sh

npm install
npm run dev
```

## Controls and processing

- **Unison voices:** 1–5 sawtooth voices, default 2. All voices use the same selected note.

- **Unison detune:** 0–75 cents. Voices are evenly spread from −detune to +detune. One voice is centered and ignores detune. Voice levels are normalized by count, and count/detune changes work during playback.

- **Unison display:** one vertical line per voice, spaced by its detune. Drag up/down to add/remove voices and right/left to increase/decrease detune, with mouse or touch. Arrow keys adjust the focused display; the sliders remain available for precise edits.

- **Noise particles:** a compact visual beside the noise slider; particle density increases with noise. Drag up/down or use arrow keys and Home/End to adjust the level. Manual edits remain available when randomization is locked.

- **Noise level:** a separate white-noise source, 0–20%, default zero. Older shared settings above 20% are capped at 20%.

- **Low pass:** 75–10,000 Hz, with a logarithmic cutoff slider.

- **Resonance:** 0–100%, mapping from Q ≈ 0.707 to Q = 20.

- **Filter curve:** shows the low-pass frequency response and resonance peak. Drag left/right for cutoff (logarithmic), up/down for resonance; mouse, touch, and focused arrow keys are supported.

- **Drive:** 5–25 dB input gain into parabolic saturation at every drive level. Defaults to 25 dB; supports randomization and locking.
- **Drive curve:** drag upward to increase drive or downward to decrease it, using mouse or touch. The focused visual also accepts arrow keys, Home, and End.

All synth controls share one Chain section, ordered as unison, low pass, noise, and drive. The signal chain is:

```text

Sawtooth unison → resonant low pass
  + white noise (bypasses low pass)
  → drive
  → parabolic waveshaper
  → envelope, limiter, peak guard
```

At drive `d >= 5`, the symmetric transfer is `2u - u * abs(u)`, where `u = clamp(x * 10^(d/20), -1, 1)`, with 4x oversampling. Parabolic shaping applies throughout the range. The visual uses the same transfer. Output safety limiting remains active.

There is no amplitude control. Cutoff LFO code is retained behind `cutoffLfoEnabled = false`; it is disconnected and absent from the interface, randomization, and new share links.

## Notes and playback

The piano supports mouse, touch, computer keys, and optional Web MIDI. Octave views range from 0–4, covering notes C0–C6. Random notes range from C1 through C3 inclusive (MIDI 24–48), fitting entirely in octave view 1. A4 = 440 Hz; the displayed keyboard defaults to octave 1.

Hold and drag across the piano to follow the key under the mouse or finger, including black keys. Moving outside the keys releases that input; moving back onto a key while still held resumes it. Release or touch cancellation releases that input and returns to any other held note.

The latest press wins. Exact timestamp ties choose the lower note. Pitch changes glide linearly in Hz over 300 ms, including between separate notes. Interrupted glides continue from the instantaneous pitch. Overlapping notes retune the existing voice. The first note starts at its selected pitch.

Randomize plays once for three seconds plus the 25 ms tail, then stops automatically. Play sustains until Stop. Keyboard notes sustain until release, including when taking over a randomized preview. Held notes form a stack: the latest key takes priority, and releasing it glides back to the previous held key with its original velocity. Releasing an inactive key leaves the current note sounding; releasing the last held key stops audio. Sustain-pedal messages do not override release. Blur and page hiding also stop audio.

The fish uses flat geometric parts: an oval body and belly, triangular tail and fins, and a rectangular muzzle. It has an upright pale eye with a dark rim and larger dark pupil. The crest has taller, deeper-cut spikes while retaining the drive and filter mapping. Drive grows its sawtooth hair; the same frequency response as the filter visual trims the hair across its length, including the resonance peak. Unison width lengthens the body; voice count grows the beak; detune spreads the always-large, ray-lined fins and tail without shortening them. Its mouth follows the beat between the outer unison voices, including during glides. One voice or zero detune produces no beating. Reduced motion disables animation.

The current body renderer is `src/components/FishBody.vue`. The previous complete fish is preserved in `src/components/FishPortraitClassic.vue`; switch App.vue's FishPortrait import to that file to restore it.

Noise grows the eye and pupil, reaching 2.35× their size at 20%. More unison voices also enlarge the mouth and protruding muzzle, in both playing and resting poses. Dragging turns the entire fish toward the fixed point where you grabbed it; its gaze follows that direction. On release it swims home along a gentle curve, steering along the path with coordinated tail strokes, fin movement, and body sway. The stroke builds with speed and settles on arrival. Grabbing it mid-return interrupts the swim. Reduced motion returns it immediately. Randomize pops the old fish out into particles, then brings the new fish in with a bounce. Repeated randomization restarts the effect, and reduced motion swaps the fish immediately without particles.

While playing, the fish vibrates. Noise increases the strength (0.15–1 SVG pixels) and speed (roughly 5–6.25 cycles/second). The vibration stops on note release, composes with dragging and pop animations, and is disabled by reduced motion.

## Experimenting, sharing, and downloads

The app starts silently from its default settings, ready for keyboard experimentation. Randomize explores new sounds while respecting individual parameter locks; Reset restores defaults and stops playback. Light/dark themes, URL sharing, WAV downloads, and SVG fish downloads are included. Sound processing runs locally.

Version 1 share links carry the eight current sound parameters. Unsupported versions, obsolete layouts, and values outside current limits are rejected.

The live oscilloscope shows two note periods from the actual audio output, including unison interference and parameter changes. It follows the pitch during glides and refreshes at half the note frequency, capped by the display frame rate. A continuous phase reference keeps the trace aligned as the sound changes. A fixed capture buffer avoids resizing during glides, and a short 25 ms display smoothing time softens capture steps without changing the audio.

WAV exports render the selected note at a steady pitch for exactly five seconds including the release tail, using the same graph as live playback: stereo, 44.1 kHz, 16-bit PCM. Exports do not interrupt playback.

## Keyboard

| Key                                  | Action                                    |
| ------------------------------------ | ----------------------------------------- |
| A W S E D F T G Y H U J K O L P ; '  | Piano notes from the displayed octave's C |
| Space                                | Play / stop                               |
| Z / X                                | Octave down / up                          |
| Escape                               | Stop                                      |
| Down                                 | Download WAV                              |
| Arrows on a focused slider           | Adjust slider                             |
| Enter / Space on a focused piano key | Hold note                                 |

Connect hardware explicitly with **Connect MIDI**. Hardware MIDI requires a compatible browser on HTTPS or localhost.

## Build and verification

```sh

npm run build
npm run preview
npm test
```

Requires Node `^22.18.0 || >=24.12.0`. Production output is in `dist/` with relative asset URLs.

## GitHub Pages

`.github/workflows/pages.yml` installs locked dependencies, runs unit tests, builds `dist/`, and deploys on pushes to `main`. It can also be run manually from Actions on `main`.

In [repository Pages settings](https://github.com/teuncm/bassifier/settings/pages), choose **GitHub Actions** as the publishing source. The public URL is `https://teuncm.nl/bassifier/`; the workflow does not change domain or DNS settings.

Vite already uses `base: "./"`, so built assets work at either a custom-domain root or the repository's Pages path. A `CNAME` file is unnecessary for this Actions deployment; custom domains are managed through Pages settings. See [GitHub's custom-domain instructions](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).

Tests use Node and Playwright with installed Chrome. Set `BASSIFIER_TEST_CHANNEL=msedge` for Edge, or `BASSIFIER_TEST_URL` to use an already-running Vite development server. Otherwise tests start a server on port 5187. Automated MIDI tests emulate hardware.

The original reference is [REQUIREMENTS-birbifier.md](REQUIREMENTS-birbifier.md). Current scope is in [REQUIREMENTS-bassifier.md](REQUIREMENTS-bassifier.md).

Fish color follows the keyboard through the rainbow: C is red, each semitone advances the hue by 30°, and the next C is red again. Drive changes only hair size; decorative speckles follow all sound settings.

Stereo unison width ranges from 0–100% (default 75%); one voice stays centered. Older links retain mono width. All parameter visuals and complete slider tracks highlight purple during interaction. Z/X highlight their octave buttons while held. Noise particle positions stay fixed as density increases.


Unison graph: wheel up increases stereo width, wheel down decreases it; prevent page scrolling even at limits. Voice lines tilt toward their pan direction, with centered voices vertical.

Live FFT frequency spectrum: inside desktop playback below the waveform; separate card below 1024px. Logarithmic 20 Hz to 20 kHz frequency scale without visible axis labels; uses a dedicated 16,384-point FFT and a continuous peak-preserving line, refreshing every animation frame without smoothing, shows a flat trace on stop, has no separate bottom baseline and pauses rendering when hidden.

Tanh shaping remains available in code as tanhSample, but is not selected for drive.

Body speckles are deterministically seeded from every sound parameter. Any sound edit updates the pattern; restoring settings or opening a shared link restores the same speckles. Include speckles in SVG export.

Performance: cache logarithmic FFT layouts and shared filter responses with bounded caches; reuse oscilloscope capture storage and coordinate formatting. Create noise sources only when noise is enabled. Update fish appearance properties individually. On mobile, order cards as fish, piano, FFT, synth so the fixed player does not cover the initial keyboard.

`npm test` runs unit and browser checks, owning and closing its Vite server directly to avoid Windows process-tree teardown stalls. Existing test servers and BASSIFIER_TEST_URL remain supported.

Drive is capped at 25 dB for controls, randomization, and audio.

The fish closes its eye while silent and opens it during playback or held notes. Static SVG exports use the closed-eye resting pose.

Minimum drive is 10 dB.

Low-pass cutoff is capped at 10 kHz.

Minimum low-pass cutoff is 75 Hz, with 5 Hz steps.

Center the visible fish geometry horizontally and vertically for every body size and morph, keeping drag/swim transforms independent. Static SVG exports recenter the resting pose.


Noise is centered mono, bypassing Low pass before entering Drive.


## Search and social previews

The initial HTML includes a descriptive title, meta description, canonical URL,
Open Graph/X large-image cards, WebApplication JSON-LD, and useful fallback content
for visitors and crawlers without JavaScript. Preset query URLs use the base app
as their canonical page. The shared preset URL itself still carries its settings.

`public/social-card.png` is a checked-in 1200x630 preview with editable SVG source.
Regenerate it and the touch/favicon assets with `node scripts/generate-social-card.mjs`
(requires Chrome and development dependencies). Production builds copy the assets;
they do not launch a browser.

The sitemap is published at `https://teuncm.nl/bassifier/sitemap.xml`. Submit that
URL in Search Console after deployment. A robots.txt under `/bassifier/` would not
control crawling: robots policy belongs to `https://teuncm.nl/robots.txt`, managed
by the domain's root site. This project leaves that site's policy untouched.
