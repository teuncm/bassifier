<script setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useId,
  watch,
} from "vue";
import { noteFrequency, parameters, seededRandom, signature } from "../settings.js";
import { filterResponse } from "../filter-response.js";
const props = defineProps({
  settings: Object,
  playing: Boolean,
  generation: Number,
  voice: Object,
  sampleRate: { type: Number, default: 44100 },
});
const id = useId().replaceAll(":", ""),
  svg = ref(null),
  fish = ref(null),
  face = ref(null);
const appearance = shallowRef({ ...props.settings });
const dragging = ref(false),
  returning = ref(false),
  heading = ref({ right: false, angle: 0 }),
  returnStroke = ref({ sway: 0, yaw: 0, tail: 0, fin: 0 }),
  offset = ref({ x: 0, y: 0 }),
  gaze = ref({ x: -3, y: 1 }),
  popPhase = ref(""),
  burstKey = ref(0),
  particles = ref([]),
  burstPosition = ref({ x: 50, y: 55 });
const trailBubbles = ref([]);
let trailFrame, bubbleId = 0, lastBubbleTime = -Infinity;
let origin, popTimer, particleTimer, mouthFrame, returnFrame;
function clearTrail() {
  cancelAnimationFrame(trailFrame);
  trailBubbles.value = [];
  lastBubbleTime = -Infinity;
}
function ageTrail(now) {
  trailBubbles.value = trailBubbles.value.filter((bubble) => now - bubble.born < 900);
  if (trailBubbles.value.length) trailFrame = requestAnimationFrame(ageTrail);
}
function leaveBubble(now = performance.now()) {
  if (
    now - lastBubbleTime < 80 ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) return;
  const matrix = svg.value?.querySelector(".fish-heading")?.getScreenCTM();
  if (!matrix) return;
  const point = new DOMPoint(245, 140).matrixTransform(matrix);
  lastBubbleTime = now;
  const id = ++bubbleId;
  const empty = !trailBubbles.value.length;
  trailBubbles.value.push({ id, born: now, x: point.x, y: point.y, size: 4 + id % 4 * 2 });
  if (empty) trailFrame = requestAnimationFrame(ageTrail);
}
const beatFrequency = computed(() => {
  const frequency = noteFrequency(props.settings.note);
  const detuneRatio = 2 ** (props.settings.unisonDetune / 1200);
  return props.settings.unisonVoices > 1
    ? frequency * (detuneRatio - 1 / detuneRatio)
    : 0;
});
function syncMouth() {
  cancelAnimationFrame(mouthFrame);
  if (!props.playing || !props.voice || !fish.value) return;
  const ratio = 2 ** (props.settings.unisonDetune / 1200);
  const beat =
    props.settings.unisonVoices > 1
      ? props.voice.frequency * (ratio - 1 / ratio)
      : 0;
  fish.value.style.setProperty(
    "--mouth-cycle",
    beat > 0 ? `${1 / beat}s` : "0s",
  );
  if (props.voice.gliding) mouthFrame = requestAnimationFrame(syncMouth);
}
watch(
  () => [
    props.voice,
    props.playing,
    props.settings.note,
    props.settings.unisonDetune,
    props.settings.unisonVoices,
  ],
  syncMouth,
  { flush: "post" },
);
const hue = computed(() => (appearance.value.note % 12) * 30);
const body = computed(() => `hsl(${hue.value} 38% 54%)`);
const dark = computed(() => `hsl(${hue.value} 36% 31%)`);
const light = computed(() => `hsl(${hue.value} 50% 78%)`);
const eyes = computed(() => {
  const noise = Math.max(0, Math.min(1, appearance.value.noiseLevel / parameters.noiseLevel.max));
  const scale = 1 + noise;
  return {
    x: 95,
    y: 119 - noise * 3,
    radius: 9.5 * scale,
    pupil: 6 * scale,
  };
});
const bodyScale = 0.98;
const mouth = computed(() => {
  const voices = (appearance.value.unisonVoices - 1) / 6;
  const point = (x, y) =>
    `${83 + (x - 83) * (1 + voices * 0.75)} ${146 + (y - 146) * (1 + voices * 0.8)}`;
  return {
    open: `M${point(47, 139)} Q${point(63, 131)} ${point(82, 140)} Q${point(86, 155)} ${point(60, 157)} Q${point(45, 157)} ${point(47, 139)}Z`,
    closed: `M${point(44, 143)} Q${point(62, 151)} ${point(83, 140)}`,
    body: `M67 132C70 102 102 89 146 96 181 98 211 115 231 139 215 162 186 178 148 180 108 183 80 170 67 159 Q${point(48, 165)} ${point(44, 153)} L${point(43, 142)} Q${point(47, 135)} 67 132Z`,
  };
});
const vibration = computed(() => {
  const noise = props.settings.noiseLevel / parameters.noiseLevel.max;
  return {
    strength: 0.6 + noise * 3.4,
    duration: 0.14 - noise * 0.06,
    tilt: 0.12 + noise * 0.4,
  };
});
const dorsal = computed(() => {
  const height = 6 + (appearance.value.drive / 30) * 78;
  const response = filterResponse(
    appearance.value.cutoff,
    appearance.value.resonance,
    props.sampleRate,
  );
  const points = response.map(({ position, y }, index) => {
    const x = 88 + position * 136;
    const base = 96 + 32 * ((x - 145) / 85) ** 2;
    const tooth = 0.4 + 0.6 * (1 - (index % 32) / 32);
    const level = Math.max(0, (77 - y) / 37);
    const envelope = level <= 1 ? level : 1 + (level - 1) * 1.8;
    const rise = Math.min(90, height * envelope * tooth);
    return `L${x.toFixed(2)},${(base - rise).toFixed(2)}`;
  });
  return `M88 119 ${points.join(" ")} L224 139 Q155 105 88 119Z`;
});
const tail = computed(() => {
  const voices = (appearance.value.unisonVoices - 1) / 6;
  const length = 25 + voices * 54;
  const spread =
    10 +
    voices * 18 +
    (appearance.value.unisonDetune / 75) * (22 + voices * 24);
  const tip = 217 + length,
    fork = tip - length * 0.28;
  return {
    path: `M217 133 Q${217 + length * 0.5} ${140 - spread * 0.65} ${tip} ${140 - spread} L${fork} 140 ${tip} ${140 + spread} Q${217 + length * 0.5} ${140 + spread * 0.65} 217 147Z`,
    ribs: `M226 137 L${tip - 4} ${140 - spread * 0.78} M228 140 H${fork - 2} M226 143 L${tip - 4} ${140 + spread * 0.78}`,
  };
});
const spots = (() => {
  const random = seededRandom(0xba55);
  return Array.from(
    { length: 18 },
    () => ({
      x: 118 + random() * 90,
      y: 115 + random() * 33,
      r: 1 + random() * 3,
    }),
  );
})();
function down(event) {
  if (event.button !== 0 || origin) return;
  event.preventDefault();
  const transform = new DOMMatrix(getComputedStyle(fish.value).transform);
  const matrix = svg.value.getScreenCTM();
  const center = new DOMPoint(150, 135).matrixTransform(matrix);
  cancelAnimationFrame(returnFrame);
  returning.value = false;
  returnStroke.value = { sway: 0, yaw: 0, tail: 0, fin: 0 };
  origin = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    offset: { x: transform.m41, y: transform.m42 },
    center,
    scale: Math.hypot(matrix.a, matrix.b),
  };
  offset.value = { ...origin.offset };
  dragging.value = true;
  followAnchor(0, 0);
  event.currentTarget.setPointerCapture(event.pointerId);
}
function followAnchor(dx, dy) {
  const x = origin.x - origin.center.x - dx;
  const y = origin.y - origin.center.y - dy;
  aimBody(x, y);
  const length = Math.hypot(x, y);
  const amount = Math.min(4.5, length / (origin.scale * 12));
  const angle = (heading.value.angle * Math.PI) / 180;
  const localX =
    (Math.cos(angle) * x + Math.sin(angle) * y) *
    (heading.value.right ? -1 : 1);
  const localY = -Math.sin(angle) * x + Math.cos(angle) * y;
  gaze.value = length
    ? { x: (localX / length) * amount, y: (localY / length) * amount }
    : { x: 0, y: 0 };
}
function move(event) {
  if (!dragging.value || origin?.id !== event.pointerId) return;
  if (event.pointerType === "mouse" && !(event.buttons & 1)) {
    release(event);
    return;
  }
  const dx = event.clientX - origin.x,
    dy = event.clientY - origin.y;
  offset.value = { x: origin.offset.x + dx, y: origin.offset.y + dy };
  followAnchor(dx, dy);
  leaveBubble();
}
function release(event) {
  if (event?.pointerId !== undefined && event.pointerId !== origin?.id) return;
  const pointerId = origin?.id;
  origin = null;
  dragging.value = false;
  if (pointerId !== undefined && fish.value?.hasPointerCapture(pointerId))
    fish.value.releasePointerCapture(pointerId);
  if (
    event?.pointerId !== undefined &&
    event?.type !== "blur" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    swimHome();
  else {
    resetHome();
    clearTrail();
  }
}
function resetHome() {
  cancelAnimationFrame(returnFrame);
  returning.value = false;
  offset.value = { x: 0, y: 0 };
  heading.value = { right: false, angle: 0 };
  returnStroke.value = { sway: 0, yaw: 0, tail: 0, fin: 0 };
  gaze.value = { x: -3, y: 1 };
}
function aimBody(x, y) {
  if (Math.hypot(x, y) < 0.01) return;
  const right =
    Math.abs(x) < Math.hypot(x, y) * 0.08 ? heading.value.right : x > 0;
  const angle = (Math.atan2(y, Math.abs(x)) * (right ? 1 : -1) * 180) / Math.PI;
  heading.value = { right, angle: Math.max(-85, Math.min(85, angle)) };
}
function swimHome() {
  cancelAnimationFrame(returnFrame);
  const start = { ...offset.value };
  const distance = Math.hypot(start.x, start.y);
  if (distance < 2) {
    resetHome();
    return;
  }
  const duration = Math.max(600, Math.min(1500, 500 + distance * 2));
  const arc = Math.min(28, distance * 0.12);
  const began = performance.now();
  let previous = began,
    phase = 0;
  returning.value = true;
  gaze.value = { x: -4, y: 0 };
  aimBody(-start.x, -start.y);
  function step(now) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      resetHome();
      return;
    }
    const progress = Math.min(1, (now - began) / duration);
    if (progress >= 1) {
      resetHome();
      return;
    }
    const travel = progress * progress * (3 - 2 * progress);
    const bend = Math.sin(Math.PI * progress) ** 2 * arc;
    const travelSpeed = 6 * progress * (1 - progress);
    const bendSpeed = Math.PI * Math.sin(2 * Math.PI * progress) * arc;
    offset.value = {
      x: start.x * (1 - travel) + (start.y / distance) * bend,
      y: start.y * (1 - travel) - (start.x / distance) * bend,
    };
    aimBody(
      -start.x * travelSpeed + (start.y / distance) * bendSpeed,
      -start.y * travelSpeed - (start.x / distance) * bendSpeed,
    );
    const effort = Math.sin(Math.PI * progress);
    phase +=
      Math.min(0.05, (now - previous) / 1000) *
      (2.2 + effort * 2.2) *
      Math.PI *
      2;
    previous = now;
    returnStroke.value = {
      sway: Math.sin(phase) * 1.8 * effort,
      yaw: Math.sin(phase + Math.PI * 0.25) * 2 * effort,
      tail: Math.sin(phase - Math.PI * 0.4) * 17 * effort,
      fin: -Math.sin(phase) * 9 * effort,
    };
    leaveBubble(now);
    returnFrame = requestAnimationFrame(step);
  }
  returnFrame = requestAnimationFrame(step);
}
watch(
  () => [props.generation, signature(props.settings)],
  ([generation], [previousGeneration]) => {
    if (generation !== previousGeneration) {
      clearTimeout(popTimer);
      clearTimeout(particleTimer);
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        release();
        appearance.value = { ...props.settings };
        popPhase.value = "";
        particles.value = [];
        return;
      }
      const pond = fish.value.closest(".pond").getBoundingClientRect();
      const center = new DOMPoint(150, 135).matrixTransform(
        svg.value.getScreenCTM(),
      );
      burstPosition.value = {
        x: ((center.x - pond.x) / pond.width) * 100,
        y: ((center.y - pond.y) / pond.height) * 100,
      };
      const random = seededRandom(generation * 7919);
      const radius = Math.min(pond.width, pond.height) * 0.4;
      const palette = [
        body.value,
        light.value,
        "var(--visual-signal)",
        "var(--interaction)",
      ];
      particles.value = Array.from({ length: 20 }, (_, index) => {
        const angle = (index / 20) * Math.PI * 2 + random() * 0.2;
        const distance = radius * (0.55 + random() * 0.45);
        return {
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance,
          size: 3 + random() * 5,
          turn: random() * 300 - 150,
          color: palette[index % palette.length],
          round: index % 3 !== 0,
        };
      });
      burstKey.value++;
      popPhase.value = "out";
      popTimer = setTimeout(() => {
        release();
        appearance.value = { ...props.settings };
        popPhase.value = "in";
        popTimer = setTimeout(() => {
          popPhase.value = "";
        }, 480);
      }, 120);
      particleTimer = setTimeout(() => {
        particles.value = [];
      }, 750);
    } else if (popPhase.value !== "out") {
      appearance.value = { ...props.settings };
    }
  },
);
function exportSvg() {
  const clone = svg.value.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", "600");
  clone.setAttribute("height", "460");
  clone.removeAttribute("class");
  clone.removeAttribute("style");
  clone.querySelector(".fish-heading")?.removeAttribute("style");
  clone.querySelector(".fish-propulsion")?.removeAttribute("style");
  clone.querySelector(".fish-tail")?.removeAttribute("style");
  clone.querySelector(".fish-fin")?.removeAttribute("style");
  clone
    .querySelectorAll("[class]")
    .forEach((element) => element.removeAttribute("class"));
  return new Blob([new XMLSerializer().serializeToString(clone)], {
    type: "image/svg+xml",
  });
}
defineExpose({ exportSvg });
onMounted(() => window.addEventListener("blur", release));
onBeforeUnmount(() => {
  clearTimeout(popTimer);
  clearTimeout(particleTimer);
  cancelAnimationFrame(mouthFrame);
  cancelAnimationFrame(returnFrame);
  clearTrail();
  window.removeEventListener("blur", release);
});
</script>
<template>
  <Teleport to="body">
    <div class="fish-trail" aria-hidden="true">
      <span
        v-for="bubble in trailBubbles"
        :key="bubble.id"
        class="swim-bubble"
        :style="{
          left: `${bubble.x}px`, top: `${bubble.y}px`,
          width: `${bubble.size}px`, height: `${bubble.size}px`,
          '--drift': `${bubble.id % 2 ? 12 : -12}px`,
        }"
      />
    </div>
  </Teleport>
  <div class="pond" :class="{ sounding: playing }">
    <svg
      class="pond-scenery"
      viewBox="0 0 320 280"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M0 238Q70 222 145 243T320 230V280H0Z"
        fill="currentColor"
        opacity=".04"
      />
      <g
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        opacity=".15"
      >
        <path
          d="M24 259Q8 220 21 197M25 259Q39 225 32 215M282 259Q265 219 278 188M283 260Q298 221 292 210M273 258Q259 240 258 224"
        />
      </g>
      <g fill="currentColor" opacity=".12">
        <ellipse cx="34" cy="265" rx="17" ry="4" />
        <ellipse cx="271" cy="265" rx="23" ry="5" />
      </g>
    </svg>
    <span
      v-for="i in 7"
      :key="i"
      class="bubble"
      :style="{
        '--i': i,
        left: `${12 + ((i * 29) % 80)}%`,
        width: `${3 + (i % 3) * 3}px`,
        height: `${3 + (i % 3) * 3}px`,
      }"
      aria-hidden="true"
    />
    <div
      v-if="particles.length"
      :key="burstKey"
      class="fish-burst"
      :style="{ left: `${burstPosition.x}%`, top: `${burstPosition.y}%` }"
      aria-hidden="true"
    >
      <span
        v-for="(particle, index) in particles"
        :key="index"
        class="fish-particle"
        :style="{
          '--dx': `${particle.x}px`,
          '--dy': `${particle.y}px`,
          '--turn': `${particle.turn}deg`,
          width: `${particle.size}px`,
          height: `${particle.size}px`,
          background: particle.color,
          borderRadius: particle.round ? '50%' : '2px',
        }"
      />
    </div>
    <div
      ref="fish"
      class="fish-draggable"
      :class="{
        dragging,
        returning,
        'popping-out': popPhase === 'out',
        'popping-in': popPhase === 'in',
        singing: playing,
      }"
      :style="{
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        '--swim-speed': '0.4s',
        '--vibration-strength': `${vibration.strength}px`,
        '--vibration-duration': `${vibration.duration}s`,
        '--vibration-tilt': `${vibration.tilt}deg`,
        '--mouth-cycle': beatFrequency > 0 ? `${1 / beatFrequency}s` : '0s',
      }"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="release"
      @pointercancel="release"
      @lostpointercapture="release"
    >
      <svg
        :key="burstKey"
        ref="svg"
        class="fish-svg"
        viewBox="0 0 300 230"
        role="img"
        aria-label="Bass with sawtooth fins, shaped by your sound"
      >
        <defs>
          <linearGradient :id="`${id}-body`" x1="0" y1="0" x2="0.2" y2="1">
            <stop offset="0" :stop-color="body" />
            <stop offset="1" :stop-color="light" />
          </linearGradient>
          <linearGradient :id="`${id}-belly`" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" :stop-color="light" />
            <stop offset="1" stop-color="#f4d9ba" />
          </linearGradient>
        </defs>
        <g class="fish-swim" :style="{ transformOrigin: '150px 135px' }">
          <g
            class="fish-heading"
            :style="{
              transform: `scaleX(${heading.right ? -1 : 1})`,
              rotate: `${heading.angle}deg`,
            }"
          >
            <g
              class="fish-propulsion"
              :style="{
                transform: `translateY(${returnStroke.sway}px) rotate(${returnStroke.yaw}deg)`,
              }"
            >
              <g class="fish-vibration">
                <g
                  :transform="`translate(${150 * (1 - bodyScale)} ${135 * (1 - bodyScale)}) scale(${bodyScale})`"
                >
                  <g
                    class="fish-tail"
                    :style="{
                      transformOrigin: '218px 140px',
                      transform: returning
                        ? `rotate(${returnStroke.tail}deg)`
                        : undefined,
                    }"
                  >
                    <path
                      class="fish-tail-shape"
                      :d="tail.path"
                      :fill="body"
                      :stroke="dark"
                      stroke-width="2.4"
                      stroke-linejoin="round"
                    />
                    <path
                      :d="tail.ribs"
                      :stroke="dark"
                      stroke-width="1.3"
                      opacity=".5"
                    />
                  </g>
                  <path
                    class="fish-hair"
                    :d="dorsal"
                    :fill="body"
                    :stroke="dark"
                    stroke-width="2.4"
                    stroke-linejoin="round"
                  />
                  <path
                    d="m146 166 10 22 28-15"
                    :fill="body"
                    :stroke="dark"
                    stroke-width="2"
                    stroke-linejoin="round"
                  />
                  <path
                    :d="mouth.body"
                    :fill="`url(#${id}-body)`"
                    :stroke="dark"
                    stroke-width="2.5"
                    stroke-linejoin="round"
                  />
                  <path
                    d="M75 150Q128 159 215 151C189 176 152 185 113 174 93 170 80 161 75 150"
                    :fill="`url(#${id}-belly)`"
                  />
                  <path
                    d="M118 134Q165 117 221 139 170 134 124 145Z"
                    :fill="dark"
                    opacity=".46"
                  />
                  <circle
                    v-for="(spot, i) in spots"
                    :key="i"
                    :cx="spot.x"
                    :cy="spot.y"
                    :r="spot.r"
                    :fill="dark"
                    opacity=".28"
                  />
                  <path
                    d="M112 114Q127 140 110 161"
                    fill="none"
                    :stroke="dark"
                    stroke-width="2"
                    opacity=".65"
                    stroke-linecap="round"
                  />
                  <g
                    class="fish-fin"
                    :style="{
                      transformOrigin: '130px 145px',
                      transform: returning
                        ? `rotate(${returnStroke.fin}deg)`
                        : undefined,
                    }"
                  >
                    <path
                      d="M130 140Q158 139 166 161 144 169 130 149Z"
                      :fill="body"
                      :stroke="dark"
                      stroke-width="1.8"
                    />
                    <path
                      d="m135 146 20 10m-18-6 13 10"
                      :stroke="dark"
                      stroke-width="1"
                      opacity=".6"
                    />
                  </g>
                  <g
                    ref="face"
                    class="fish-face"
                    :transform="
                      dragging
                        ? `translate(${gaze.x * 0.7} ${gaze.y * 0.7}) rotate(${gaze.y * 1.4} 88 128)`
                        : undefined
                    "
                  >
                    <g class="fish-eye">
                      <circle
                        :cx="eyes.x"
                        :cy="eyes.y"
                        :r="eyes.radius"
                        fill="#dfbe78"
                        :stroke="dark"
                        stroke-width="2"
                      />
                      <circle
                        class="fish-pupil"
                        :cx="eyes.x + gaze.x * 0.55"
                        :cy="eyes.y + gaze.y * 0.55"
                        :r="eyes.pupil"
                        fill="#482d2d"
                      />
                    </g>
                    <path
                      class="fish-mouth"
                      :class="{ 'mouth-beating': playing && beatFrequency > 0 }"
                      :d="playing ? mouth.open : mouth.closed"
                      :fill="playing ? '#663f3a' : 'none'"
                      :stroke="dark"
                      stroke-width="2.5"
                      stroke-linecap="round"
                    />
                  </g>
                </g>
              </g>
            </g>
          </g>
        </g>
      </svg>
    </div>
  </div>
</template>
