# Bassifier requirements

## Sound
- Browser-based Vue 3/Vite instrument using Web Audio, deterministic SVG visuals, and local processing.
- One to seven sawtooth unison voices, default two, sharing the selected note. Detune ranges from 0 to 75 cents, default 9, evenly distributed symmetrically. One voice stays centered.
- Stereo width ranges from 0 to 100%, default 75%. Pan active voices evenly from negative width to positive width; one voice remains centered. Zero width produces mono. Smooth width changes during playback.
- Normalize voice gains by voice count. Smooth count/detune changes, maintain ongoing glides, and bound the oscillator bank to seven sources. Mute inactive sources.
- Separate white noise source: 0 to 20%, default zero. Clamp historical noise values up to 30% to 20%.
- Processing order: panned unison -> resonant low-pass filter -> sum with unfiltered noise -> drive/parabolic waveshaper -> envelope -> limiter -> peak guard. Preserve stereo through live and offline graphs.
- Low-pass cutoff: logarithmic 75 to 10,000 Hz. Resonance: 0 to 100%, mapping from Q sqrt(0.5) to 20; convert linear Q to the Web Audio low-pass Q in dB.
- Drive: 5 to 25 dB, default 25. At d >= 5 use 2u - u * abs(u), where u = clamp(input * 10^(d/20), -1, 1) with 4x oversampling. Parabolic shaping applies throughout the range. The visual uses the identical transfer. Keep output safety limiting.
- No chorus, notch, or amplitude control. Retain cutoff LFO code behind cutoffLfoEnabled = false, disconnected and absent from controls, randomization, and new links.

## Notes and playback
- Equal-tempered tuning, A4 = 440 Hz. Manual MIDI notes 12 to 84. Octave views 0 to 4; default 1, each displaying 25 keys. Random notes remain MIDI 28 to 52.
- Mouse/touch piano supports dragging across white and black keys, leaving and re-entering keys, cancellation, and simultaneous inputs.
- Latest held note wins; exact timestamp ties choose the lower note. Releasing the active note returns to the previous held note and its velocity; releasing an inactive note does not interrupt playback. Last release stops. Sustain pedal does not override release.
- Pitch glides linearly in Hz over 300 ms, including between separate notes. Interrupted glides resume from instantaneous frequency. First note begins at its selected pitch.
- Randomization plays for three seconds plus a 25 ms release tail, then stops. Keyboard takeover sustains until release. Play sustains until Stop. Blur and page hiding stop audio and clear held inputs.
- Randomization selects the first normal octave view containing its note; locked outer notes use view 0 or 4. Highlight the correct note. The randomized preview key pulses slowly while playing, then remains selected.
- Keyboard mapping: A W S E D F T G Y H U J K O L P ; ' for notes, Space play/stop, Escape stop, Down download WAV. Ignore editable targets and modified shortcuts. Z lowers octave; X raises it. Show Z/X hints in minus/plus buttons and purple feedback while held. Respect octave bounds and clear feedback on blur.
- Key labels remain readable and unbolded. Show only an octave number near the top of every C key; emphasize the octave picker number. Quiet selected keys must be clear in light and dark modes. Held keys use purple.
- Optional MIDI requires explicit connection, supports velocity and note-stack behavior, and stops safely on disconnect/background.

## Interface and feedback
- Follow the birbifier's readable font, control value badges, highlighting conventions, top Randomize/Reset placement, and bottom lock help. Keep the warm red theme; interaction highlights are purple in both light and dark themes.
- Shared visuals use consistent background, border, corner radius, signal color, and line style via parameter-visual and visual-line.
- One Chain section groups unison, low pass, noise, and drive in that order, with individual randomization locks. Unison visual drags vertically for voice count and horizontally for detune.
- Noise has a compact particle visual beside its slider in the Drive layout style. Higher noise creates more particles without widening the cloud; zero is empty. Drag up for more noise. Support mouse/touch cancellation, arrows, Home and End.
- Low-pass visual shows frequency response including resonance. Horizontal dragging changes logarithmic cutoff; vertical dragging changes resonance. Drive visual supports vertical dragging, arrow keys, Home and End.
- All parameter visuals highlight purple while touched or dragged. Highlight the full slider track and thumb during interaction, plus the value badge. Manual edits remain available when randomization locks are enabled.
- All eight sound parameters start unlocked. Randomization respects locks; Reset stops playback and restores defaults, preserving other locks while unlocking Drive. Start silently, including shared sounds. No presets or preset navigation.
- Collapse uses a chevron rather than X. Keep play icon centered. Do not show explanatory glide/hold-key text.
- Use available width for the fish, especially on mobile. Keep Share and SVG download accessible, maintain readable controls, and avoid horizontal overflow at 320, 375, 560, 768, 1024, and 1280 pixels.
- Keep playback usable while editing controls on mobile. Place lock help outside cards at the bottom, followed by the inspiration credit.

## Oscilloscope
- Display live audio output rather than a static generated waveform. Show roughly two note periods, including unison interference, refreshed at half the played frequency capped by display frame rate.
- Integrate a continuous nominal note phase using the audio clock, including the linear frequency glide. Keep a fixed capture buffer for the lowest note and smooth display updates over 25 ms. Changes in harmonics or zero crossings must not re-anchor the trace. Stop displays a flat line.

## Fish
- Keep the classic complete body in src/components/FishPortraitClassic.vue as a backup. Current renderer is FishBody.vue, with animation/interaction controlled by FishPortrait.vue.
- Flat component-style bass: oval body and belly, triangular tail and fins, rectangular muzzle. Use one upright pale eye with a dark rim and a large flat pupil, without gloss, blinking, or blush. Preserve gaze tracking and existing animations.
- Pitch class determines rainbow color: C red, 30 degrees per semitone, repeating each octave. Drive changes only dorsal hair size. Vibration depends only on noise.
- Hair uses the same logarithmic filter response, including resonance. Unison width lengthens the body, voice count grows the beak, and detune spreads the always-large scalloped fins and tail without shortening them. Keep maximum geometry inside the SVG and preserve layout.
- Noise grows the eye and pupil smoothly to 2.35 times their base size at 20%. Gentle vibration ranges from 0.15 to 1 SVG pixels at roughly 5 to 6.25 cycles/second, stopping on release.
- Mouth follows outer-unison beating, including during glides; one voice or zero detune has no beating.
- Drag above all UI elements; face and body track the grabbed point. Release swims home on a curve with coordinated tail/fin strokes and body sway, leaving temporary bubbles above the UI. Grabbing mid-return interrupts swimming.
- Randomization pops the old fish into particles and bounces the new fish in; repeated randomization restarts. Reduced motion disables motion/particles and returns immediately. Clean up animation state on blur, reset, randomization, and unmount.
- SVG export includes the current geometry/colors and removes animation classes/styles.

## Sharing and downloads
- Share uses native navigator.share when supported, including the mobile share sheet. Invoke directly from the user click. Cancellation is quiet; otherwise use clipboard or a selectable URL fallback.
- Version 17 links omit noise width; version 16 noise width is validated and discarded. Version 15 links contain note, voices, detune, noise, cutoff, resonance, drive, and width. Version 14 links retain mono width. Validate syntax, length, version, bounds, integer notes/voice counts. Earlier versions validate and discard removed chorus/notch/obsolete processing controls; pre-unison sounds migrate to two sawtooth voices.
- WAV button shows (5s), accessible as Download WAV (5s). Offline export is exactly five seconds including release, stereo 44.1 kHz 16-bit PCM, using the live graph without interrupting playback.
- Production assets use relative paths. Preserve keyboard accessibility, visible focus, responsive light/dark themes, and reduced-motion behavior.

Unison graph: wheel up increases stereo width, wheel down decreases it; prevent page scrolling even at limits. Voice lines tilt toward their pan direction, with centered voices vertical.

Live FFT frequency spectrum: inside desktop playback below the waveform; separate card below 1024px. Logarithmic 20 Hz to 20 kHz frequency scale without visible axis labels; uses a dedicated 16,384-point FFT and a continuous peak-preserving line, refreshing every animation frame without smoothing, shows a flat trace on stop, has no separate bottom baseline and pauses rendering when hidden.

Tanh shaping remains available in code as tanhSample, but is not selected for drive.

Body speckles are deterministically seeded from every sound parameter. Any sound edit updates the pattern; restoring settings or opening a shared link restores the same speckles. Include speckles in SVG export.

Performance: cache logarithmic FFT layouts and shared filter responses with bounded caches; reuse oscilloscope capture storage and coordinate formatting. Create noise sources only when noise is enabled. Update fish appearance properties individually. On mobile, order cards as fish, piano, FFT, synth so the fixed player does not cover the initial keyboard.

Drive is capped at 25 dB for controls, randomization, and audio; historical shared values up to 30 dB clamp to 25 dB.

The fish closes its eye while silent and opens it during playback or held notes. Static SVG exports use the closed-eye resting pose.

Minimum drive is 5 dB; historical nonnegative shared values below 5 dB clamp to 5 dB.

Low-pass cutoff is capped at 10 kHz; historical shared values up to 12 kHz clamp to 10 kHz.

Minimum low-pass cutoff is 75 Hz, with 5 Hz steps. Historical cutoff values of 80 Hz and above remain valid.

Center the visible fish geometry horizontally and vertically for every body size and morph, keeping drag/swim transforms independent. Static SVG exports recenter the resting pose.


Noise is centered mono, bypassing Low pass before entering Drive.
