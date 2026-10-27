<script setup>
import {
  computed,
  markRaw,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
  watch,
} from "vue";
import AppIcon from "./components/AppIcon.vue";
import RangeControl from "./components/RangeControl.vue";
import UnisonDisplay from "./components/UnisonDisplay.vue";
import NoiseDisplay from "./components/NoiseDisplay.vue";
import FilterDisplay from "./components/FilterDisplay.vue";
import ControlGroup from "./components/ControlGroup.vue";
import PianoKeyboard from "./components/PianoKeyboard.vue";
import FishPortrait from "./components/FishPortrait.vue";
import WaveformDisplay from "./components/WaveformDisplay.vue";
import FftDisplay from "./components/FftDisplay.vue";
import {
  defaults,
  parameters,
  signature,
  randomSettings,
  noteName,
  noteFrequency,
  decodeSettings,
  encodeSettings,
} from "./settings.js";
import {
  BassEngine,
  renderSound,
  encodeWav,
  driveSample,
} from "./audio.js";

const playbackLayout = window.matchMedia("(max-width: 1023px)");
const mobilePlayback = ref(playbackLayout.matches);
function updatePlaybackLayout(event) { mobilePlayback.value = event.matches; }
const shared = decodeSettings(new URLSearchParams(location.search).get("p"));
const settings = reactive(shared?.settings || { ...defaults });
const locks = reactive(
  Object.fromEntries(
    Object.keys(defaults).map((key) => [key, false]),
  ),
);
const expanded = reactive({
  sound: true,
});
const allLocked = computed(() => Object.values(locks).every(Boolean));
const anyExpanded = computed(() => Object.values(expanded).some(Boolean));
const status = ref("Ready"),
  playing = ref(false),
  exporting = ref(false);
const audioError = ref("");
const driveDragging = ref(false);
let driveGesture = null;
function driveDown(event) {
  if (event.button !== 0 || driveGesture) return;
  event.preventDefault();
  const element = event.currentTarget;
  driveGesture = {
    id: event.pointerId,
    y: event.clientY,
    value: settings.drive,
    height: element.getBoundingClientRect().height,
  };
  element.focus({ preventScroll: true });
  element.setPointerCapture(event.pointerId);
  driveDragging.value = true;
}
function driveMove(event) {
  if (driveGesture?.id !== event.pointerId) return;
  setDrive(
    driveGesture.value +
      ((driveGesture.y - event.clientY) / driveGesture.height) * (parameters.drive.max - parameters.drive.min),
  );
}
function setDrive(value) {
  settings.drive = Math.max(
    parameters.drive.min,
    Math.min(parameters.drive.max, Math.round(value * 10) / 10),
  );
}
function driveRelease(event) {
  if (driveGesture?.id !== event.pointerId) return;
  driveGesture = null;
  driveDragging.value = false;
  if (event.currentTarget.hasPointerCapture(event.pointerId))
    event.currentTarget.releasePointerCapture(event.pointerId);
}
function driveKeydown(event) {
  const values = {
    ArrowUp: settings.drive + 0.1,
    ArrowRight: settings.drive + 0.1,
    ArrowDown: settings.drive - 0.1,
    ArrowLeft: settings.drive - 0.1,
    Home: parameters.drive.min,
    End: parameters.drive.max,
  };
  if (!(event.key in values)) return;
  event.preventDefault();
  event.stopPropagation();
  setDrive(values[event.key]);
}
const engine = new BassEngine(),
  currentVoice = shallowRef(null),
  audioContext = shallowRef(null),
  audioAnalyser = shallowRef(null);
const held = reactive(new Map()),
  heldNotes = computed(() => [...held.values()].map((value) => value.note));
function octaveForNote(note) {
  return [1, 2, 3].find(value => note >= (value + 1) * 12 && note <= (value + 3) * 12)
    ?? (note < 24 ? 0 : 4);
}
const octave = ref(octaveForNote(settings.note));
const octavePressed = ref(null);
const generation = ref(0),
  fish = ref(null),
  shareMessage = ref(""),
  shareFallback = ref(""),
  shareInput = ref(null);
const midiStatus = ref("Connect MIDI"),
  midiConnected = ref(false),
  midiBusy = ref(false);
let midiAccess,
  shareTimer,
  playRequest = 0;
const midiInputs = new Set();
const theme = ref(document.documentElement.dataset.theme || "light");
const media = window.matchMedia("(prefers-color-scheme: dark)");
let manualTheme = false;
try {
  manualTheme = !!localStorage.getItem("bassifier-theme");
} catch {
  /* storage is optional */
}

function setTheme(value) {
  theme.value = value;
  document.documentElement.dataset.theme = value;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      "content",
      getComputedStyle(document.documentElement)
        .getPropertyValue("--page")
        .trim(),
    );
}
function toggleTheme() {
  manualTheme = true;
  setTheme(theme.value === "dark" ? "light" : "dark");
  try {
    localStorage.setItem("bassifier-theme", theme.value);
  } catch {
    /* private mode */
  }
}
function systemTheme(event) {
  if (!manualTheme) setTheme(event.matches ? "dark" : "light");
}
const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const frequencyText = computed(() =>
  numberFormat.format(
    noteFrequency(settings.note),
  ),
);
const curvePath = computed(() =>
  Array.from({ length: 101 }, (_, i) => {
    const x = i / 50 - 1;
    return `${i ? "L" : "M"}${i * 4},${40 - driveSample(x, settings.drive) * 36}`;
  }).join(" "),
);

function stop() {
  ++playRequest;
  engine.stop();
  held.clear();
  playing.value = false;
  status.value = "Ready";
  currentVoice.value = null;
}
async function startPlayback(duration = null) {
  stop();
  const request = ++playRequest;
  playing.value = true;
  status.value = "Starting";
  audioError.value = "";
  try {
    const voice = await engine.play({ ...settings }, {
      duration,
      onEnded: () => {
        if (request === playRequest) stop();
      },
    });
    if (!voice || request !== playRequest) return;
    engine.update({ ...settings });
    currentVoice.value = markRaw(voice);
    audioContext.value = markRaw(engine.context);
    audioAnalyser.value = markRaw(engine.analyser);
    status.value = "Playing";
  } catch (error) {
    if (request === playRequest) {
      stop();
      audioError.value = error.message;
    }
  }
}
function togglePlayback() {
  if (playing.value) stop();
  else startPlayback();
}

function latestHeldNote() {
  return [...held.values()].reduce(
    (winner, candidate) =>
      !winner ||
      candidate.timestamp > winner.timestamp ||
      (candidate.timestamp === winner.timestamp && candidate.note < winner.note)
        ? candidate
        : winner,
    null,
  );
}
function noteOn(
  token,
  note,
  velocity = 1,
  timestamp = performance.now(),
) {
  if (held.get(token)?.note === note) return;
  note = Math.max(parameters.note.min, Math.min(parameters.note.max, note));
  held.set(token, { note, velocity, timestamp });
  const selected = latestHeldNote();
  if (selected !== held.get(token)) return;
  playHeldNote(selected);
}
async function playHeldNote(selected) {
  ++playRequest;
  settings.note = selected.note;
  playing.value = true;
  status.value = "Playing";
  audioError.value = "";
  const request = playRequest;
  try {
    const voice = await engine.play({ ...settings }, { velocity: selected.velocity });
    if (request !== playRequest || !voice) return;
    engine.update({ ...settings });
    currentVoice.value = markRaw(voice);
    audioContext.value = markRaw(engine.context);
    audioAnalyser.value = markRaw(engine.analyser);
  } catch (error) {
    if (request === playRequest) {
      stop();
      audioError.value = error.message;
    }
  }
}
function noteOff(token) {
  if (!held.has(token)) return;
  const previous = latestHeldNote();
  held.delete(token);
  const selected = latestHeldNote();
  if (!selected) stop();
  else if (selected !== previous) playHeldNote(selected);
}
function randomize() {
  const next = randomSettings(settings, locks);
  stop();
  Object.assign(settings, next);
  octave.value = octaveForNote(next.note);
  generation.value++;
  startPlayback(3);
}
function reset() {
  stop();
  Object.assign(settings, defaults);
  octave.value = octaveForNote(defaults.note);
  locks.drive = false;
}
function toggleGroups() {
  const value = !anyExpanded.value;
  Object.keys(expanded).forEach((key) => {
    expanded[key] = value;
  });
}
function shiftOctave(direction) {
  const next = Math.max(0, Math.min(4, octave.value + direction));
  if (next === octave.value) return;
  stop();
  octave.value = next;
}

watch(
  () => signature(settings),
  () => engine.update({ ...settings }),
);

function download(blob, name) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function downloadWav() {
  if (exporting.value) return;
  exporting.value = true;
  audioError.value = "";
  try {
    download(
      encodeWav(await renderSound({ ...settings })),
      "bassifier-tone.wav",
    );
  } catch (error) {
    audioError.value = `Could not export this sound. ${error.message}`;
  } finally {
    exporting.value = false;
  }
}
function downloadFish() {
  if (fish.value) download(fish.value.exportSvg(), "bassifier-bass.svg");
}
async function share() {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("p", encodeSettings(settings));
  try {
    if (navigator.share) {
      await navigator.share({
        title: "Bassifier",
        text: "Bassifier",
        url: url.href,
      });
      return;
    }
    await navigator.clipboard.writeText(url.href);
    shareMessage.value = "Copied!";
  } catch (error) {
    if (error.name === "AbortError") return;
    shareFallback.value = url.href;
    await nextTick();
    shareInput.value?.select();
  }
  clearTimeout(shareTimer);
  shareTimer = setTimeout(() => {
    shareMessage.value = "";
  }, 2200);
}

function handleMidi(event) {
  if (document.hidden) return;
  const [statusByte, note, value = 0] = event.data,
    type = statusByte & 0xf0,
    channel = statusByte & 0x0f;
  const port = event.target?.id || "input",
    token = `midi-${port}-${channel}-${note}`;
  if (type === 0x90 && value > 0) {
    if (note < parameters.note.min || note > parameters.note.max) return;
    held.delete(token);
    noteOn(
      token,
      note,
      value / 127,
      event.timeStamp ?? event.receivedTime ?? performance.now(),
    );
  } else if (type === 0x80 || type === 0x90) {
    noteOff(token);
  } else if (type === 0xb0 && [120, 123].includes(note)) stop();
}
function attachMidi() {
  midiInputs.forEach((input) => {
    input.onmidimessage = null;
  });
  midiInputs.clear();
  const inputs = [...midiAccess.inputs.values()].filter(
    (input) => input.state === "connected",
  );
  for (const input of inputs) {
    input.onmidimessage = handleMidi;
    midiInputs.add(input);
  }
  midiConnected.value = true;
  midiStatus.value = inputs.length
    ? inputs.map((input) => input.name || "MIDI keyboard").join(", ")
    : "MIDI ready · plug in a keyboard";
}
async function connectMidi() {
  if (midiBusy.value) return;
  if (!navigator.requestMIDIAccess) {
    midiStatus.value = "MIDI unavailable in this browser";
    return;
  }
  midiBusy.value = true;
  try {
    midiAccess = await navigator.requestMIDIAccess({ sysex: false });
    attachMidi();
    midiAccess.onstatechange = () => {
      stop();
      attachMidi();
    };
  } catch {
    midiStatus.value = "MIDI access denied · retry";
  } finally {
    midiBusy.value = false;
  }
}

const computerKeys = [
  "KeyA",
  "KeyW",
  "KeyS",
  "KeyE",
  "KeyD",
  "KeyF",
  "KeyT",
  "KeyG",
  "KeyY",
  "KeyH",
  "KeyU",
  "KeyJ",
  "KeyK",
  "KeyO",
  "KeyL",
  "KeyP",
  "Semicolon",
  "Quote",
];
function keydown(event) {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey
  )
    return;
  const target = event.target,
    editable = target.closest(
      'input, select, textarea, [contenteditable="true"], .lfo-pad',
    );
  if (editable) return;
  if (event.code === "KeyZ" || event.code === "KeyX") {
    event.preventDefault();
    octavePressed.value = event.code;
    if (!event.repeat) shiftOctave(event.code === "KeyZ" ? -1 : 1);
    return;
  }
  if (event.code === "Space" && !target.closest("button, a")) {
    event.preventDefault();
    if (!event.repeat) togglePlayback();
    return;
  }
  const index = computerKeys.indexOf(event.code);
  if (index !== -1) {
    event.preventDefault();
    if (!event.repeat)
      noteOn(
        `key-${event.code}`,
        (octave.value + 1) * 12 + index,
        1,
        event.timeStamp,
      );
    return;
  }
  if (event.code === "Escape") stop();
  if (!event.repeat && event.code === "ArrowDown") {
    event.preventDefault();
    downloadWav();
  }
}
function keyup(event) {
  if (event.code === octavePressed.value) octavePressed.value = null;
  noteOff(`key-${event.code}`);
}
function background() {
  octavePressed.value = null;
  stop();
  engine.close().catch(() => {});
}
function visibility() {
  if (document.hidden) background();
}

onMounted(() => {
  playbackLayout.addEventListener("change", updatePlaybackLayout);
  setTheme(theme.value);
  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  window.addEventListener("blur", background);
  window.addEventListener("pagehide", background);
  document.addEventListener("visibilitychange", visibility);
  document.addEventListener("freeze", background);
  media.addEventListener("change", systemTheme);
});
onBeforeUnmount(() => {
  background();
  playbackLayout.removeEventListener("change", updatePlaybackLayout);
  clearTimeout(shareTimer);
  window.removeEventListener("keydown", keydown);
  window.removeEventListener("keyup", keyup);
  window.removeEventListener("blur", background);
  window.removeEventListener("pagehide", background);
  document.removeEventListener("visibilitychange", visibility);
  document.removeEventListener("freeze", background);
  media.removeEventListener("change", systemTheme);
  midiInputs.forEach((input) => {
    input.onmidimessage = null;
  });
  if (midiAccess) midiAccess.onstatechange = null;
});
</script>

<template>
  <div class="app-shell">
    <header class="site-header">
      <a class="brand" href="./" aria-label="Bassifier home"
        ><span class="brand-icon"><AppIcon name="fish" :size="27" /></span>
        <h1>Bassifier</h1></a
      >
      <nav aria-label="Main">
        <a
          class="author-link"
          href="https://teuncm.nl/"
          target="_blank"
          rel="noopener"
          >Teun M. <span>↗</span></a
        ><button
          class="icon-button theme-button"
          :aria-label="`Switch to ${theme === 'light' ? 'dark' : 'light'} appearance`"
          :title="`Switch to ${theme === 'light' ? 'dark' : 'light'} appearance`"
          @click="toggleTheme"
        >
          <AppIcon :name="theme === 'light' ? 'moon' : 'sun'" />
        </button>
      </nav>
    </header>

    <div class="action-row">
      <button
        class="text-button random-button"
        :disabled="allLocked"
        @click="randomize"
      >
        <AppIcon name="dice" :size="16" />Randomize</button
      ><button class="text-button reset-button" @click="reset">
        <AppIcon name="reset" :size="14" />Reset</button
      ><button class="text-button collapse-button" @click="toggleGroups">
        <AppIcon
          :name="anyExpanded ? 'collapse' : 'expand'"
          :size="14"
        />{{ anyExpanded ? "Collapse" : "Expand" }}
      </button>
    </div>

    <div class="workspace">
      <main class="main-column">
        <section class="card playback-card" aria-label="Playback">
          <div class="section-heading playback-heading">
            <h2>Playback</h2>
          </div>
          <WaveformDisplay
            :analyser="audioAnalyser"
            :voice="currentVoice"
            :context="audioContext"
            :playing="playing"
          />
          <div id="playback-fft"></div>
          <div class="player-controls">
            <div class="player-buttons">
              <button
                class="play-button icon-button"
                :class="{ 'is-playing': playing }"
                :aria-label="playing ? 'Stop' : 'Play'"
                :title="playing ? 'Stop (Space)' : 'Play (Space)'"
                @click="togglePlayback"
              >
                <AppIcon :name="playing ? 'stop' : 'play'" :size="18" /></button
              ><button
                class="icon-button download-button"
                :disabled="exporting"
                :aria-busy="exporting"
                aria-label="Download WAV (5s)"
                title="Download WAV (5s)"
                @click="downloadWav"
              >
                <AppIcon name="download" :size="18" /><span>(5s)</span>
              </button>
            </div>
            <div class="play-status" role="status">
              <span
                class="status-dot"
                :class="{ active: playing && status === 'Playing' }"
              /><span>{{ status }}</span>
            </div>
          </div>
        </section>

        <Teleport defer to="#playback-fft" :disabled="mobilePlayback">
          <section class="card fft-card" aria-label="Spectrum">
            <div class="section-heading"><h2>Spectrum</h2></div>
            <FftDisplay :analyser="audioAnalyser" :context="audioContext" :playing="playing" />
          </section>
        </Teleport>

        <div v-if="audioError" class="error-message" role="alert">
          {{ audioError
          }}<button
            class="icon-button"
            aria-label="Dismiss error"
            @click="audioError = ''"
          >
            <AppIcon name="close" :size="16" />
          </button>
        </div>

        <section class="card piano-card" aria-label="Piano">
          <div class="section-heading">
            <h2>Piano</h2>
            <button
              class="midi-button"
              :class="{ connected: midiConnected }"
              :disabled="midiBusy"
              :aria-busy="midiBusy"
              @click="connectMidi"
            >
              <AppIcon name="keyboard" :size="15" /><span>{{
                midiBusy ? "Connecting…" : midiStatus
              }}</span
              ><span v-if="!midiConnected">↗</span>
            </button>
          </div>
          <div class="piano-info">
            <div class="selected-tone">
              <strong>{{ noteName(settings.note) }}</strong
              ><span>{{ frequencyText }} Hz</span
              ><button
                class="lock-button"
                :class="{ selected: locks.note }"
                :aria-pressed="locks.note"
                :aria-label="`${locks.note ? 'Unlock' : 'Lock'} Note`"
                title="Lock note for randomization"
                @click="locks.note = !locks.note"
              >
                <AppIcon :name="locks.note ? 'lock' : 'unlock'" :size="13" />
              </button>
            </div>
            <div class="octave-picker">
              <span>Octave</span
              ><button
                class="mini-button"
                :class="{ 'keyboard-pressed': octavePressed === 'KeyZ' }"
                :disabled="octave <= 0"
                aria-label="Lower octave"
                aria-keyshortcuts="z"
                title="Lower octave (Z)"
                @click="shiftOctave(-1)"
              >
                <span aria-hidden="true">−</span><kbd aria-hidden="true">Z</kbd></button
              ><span class="octave-value">{{ octave }}</span
              ><button
                class="mini-button"
                :class="{ 'keyboard-pressed': octavePressed === 'KeyX' }"
                :disabled="octave >= 4"
                aria-label="Higher octave"
                aria-keyshortcuts="x"
                title="Higher octave (X)"
                @click="shiftOctave(1)"
              >
                <span aria-hidden="true">+</span><kbd aria-hidden="true">X</kbd>
              </button>
            </div>
          </div>
          <PianoKeyboard
            :octave="octave"
            :selected="settings.note"
            :held="heldNotes"
            :preview-playing="playing && status === 'Playing' && currentVoice?.endTime < Infinity"
            @note-on="noteOn"
            @note-off="noteOff"
          />
        </section>

        <section class="card synth-card">
          <div class="section-heading">
            <h2>Synth</h2>
          </div>

          <ControlGroup
            title="Chain"
            :summary="`${settings.unisonVoices} voices · ${settings.cutoff} Hz · ${settings.noiseLevel}% noise · ${settings.drive} dB`"
            :expanded="expanded.sound"
            @toggle="expanded.sound = !expanded.sound"
          >
            <div class="processing-controls">
              <div>
                <UnisonDisplay
                  v-model:voices="settings.unisonVoices"
                  v-model:detune="settings.unisonDetune"
                  v-model:width="settings.unisonWidth"
                />
                <div class="paired-controls">
                  <RangeControl
                    v-for="key in ['unisonVoices', 'unisonDetune', 'unisonWidth']"
                    :key="key"
                    v-model="settings[key]"
                    :name="key"
                    :parameter="parameters[key]"
                    :locked="locks[key]"
                    @toggle-lock="locks[key] = !locks[key]"
                  />
                </div>
              </div>
              <div>
                <FilterDisplay
                  v-model:cutoff="settings.cutoff"
                  v-model:resonance="settings.resonance"
                  :sample-rate="audioContext?.sampleRate || 44100"
                />
                <div class="paired-controls">
                  <RangeControl
                    v-for="key in ['cutoff', 'resonance']"
                    :key="key"
                    v-model="settings[key]"
                    :name="key"
                    :parameter="parameters[key]"
                    :locked="locks[key]"
                    @toggle-lock="locks[key] = !locks[key]"
                  />
                </div>
              </div>
              <div class="noise-oscillator shaper-content">
                <RangeControl
                  v-model="settings.noiseLevel"
                  name="noiseLevel"
                  :parameter="parameters.noiseLevel"
                  :locked="locks.noiseLevel"
                  @toggle-lock="locks.noiseLevel = !locks.noiseLevel"
                />
                <NoiseDisplay v-model:level="settings.noiseLevel" />
              </div>
              <div class="shaper-content">
                <RangeControl
                  v-model="settings.drive"
                  name="drive"
                  :parameter="parameters.drive"
                  :locked="locks.drive"
                  @toggle-lock="locks.drive = !locks.drive"
                />
                <svg
                  class="shaper-curve parameter-visual"
                  :class="{ dragging: driveDragging }"
                  viewBox="0 0 400 80"
                  preserveAspectRatio="none"
                  tabindex="0"
                  aria-label="Drive visual control"
                  aria-description="Drag up to increase drive, down to decrease. Arrow keys also adjust drive."
                  role="slider"
                  aria-orientation="vertical"
                  :aria-valuemin="parameters.drive.min"
                  :aria-valuemax="parameters.drive.max"
                  :aria-valuenow="settings.drive"
                  :aria-valuetext="`${settings.drive} dB`"
                  @pointerdown="driveDown"
                  @pointermove="driveMove"
                  @pointerup="driveRelease"
                  @pointercancel="driveRelease"
                  @lostpointercapture="driveRelease"
                  @keydown="driveKeydown"
                >
                  <path :d="curvePath" class="curve-path visual-line" />
                </svg>
              </div>
            </div>
          </ControlGroup>

        </section>

      </main>

      <aside class="side-column">
        <section class="card fish-card">
          <div class="section-heading">
            <h2>Your bass</h2>
          </div>
          <FishPortrait
            ref="fish"
            :settings="settings"
            :voice="currentVoice"
            :playing="playing && status === 'Playing'"
            :generation="generation"
            :sample-rate="audioContext?.sampleRate || 44100"
          />
          <div class="fish-footer">
            <button
              class="text-button"
              :aria-label="shareMessage || 'Share your bass'"
              @click="share"
            >
              <AppIcon
                :name="shareMessage ? 'check' : 'share'"
                :size="15"
              /><span role="status">{{
                shareMessage || "Share your bass"
              }}</span></button
            ><button
              class="text-button"
              aria-label="Download bass (SVG)"
              title="Download bass (SVG)"
              @click="downloadFish"
            >
              <AppIcon name="download" :size="17" /><span>Save SVG</span>
            </button>
          </div>
          <div v-if="shareFallback" class="share-fallback">
            <label for="share-url">Copy this link</label
            ><input
              id="share-url"
              ref="shareInput"
              :value="shareFallback"
              readonly
              @focus="$event.target.select()"
            />
          </div>
        </section>
      </aside>
    </div>
    <footer class="workspace-footer">
      <p class="locks-help">Locks preserve parameters during randomization.</p>
      <p class="inspiration">
        Inspired by
        <a href="https://github.com/KilledByAPixel/ZzFX" target="_blank" rel="noopener">ZzFX ↗</a>
      </p>
    </footer>
  </div>
</template>
