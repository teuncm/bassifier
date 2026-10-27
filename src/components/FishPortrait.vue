<script setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { noteFrequency, parameters, seededRandom, signature } from "../settings.js";
import { filterResponse } from "../filter-response.js";
import FishBody from "./FishBody.vue";
const props = defineProps({
  settings: Object,
  playing: Boolean,
  generation: Number,
  voice: Object,
  sampleRate: { type: Number, default: 44100 },
});
const svg = ref(null),
  fish = ref(null);
const appearance = ref({ ...props.settings });
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
  const matrix = svg.value?.querySelector(".fish-tail")?.getScreenCTM();
  if (!matrix) return;
  const point = new DOMPoint(261, 140).matrixTransform(matrix);
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
  const scale = 1 + noise * 1.35;
  return {
    x: 95,
    y: 132 - noise * 2,
    radius: 10.5 * scale,
    pupil: 4.8 * scale,
  };
});
const bodyScale = 0.98;
const centerTransform = ref("translate(0 0)");
function centeredTransform(bounds) {
  return `translate(${150 - bounds.x - bounds.width / 2} ${115 - bounds.y - bounds.height / 2})`;
}
function centerFish() {
  if (dragging.value || returning.value) return;
  const geometry = svg.value?.querySelector(".fish-body-parts");
  if (!geometry) return;
  const bounds = geometry.getBBox();
  if (bounds.width && bounds.height) centerTransform.value = centeredTransform(bounds);
}
watch(() => [signature(appearance.value), props.playing, burstKey.value, dragging.value, returning.value],
  centerFish, { flush: "post" });
const mouth = computed(() => {
  const voices = (appearance.value.unisonVoices - 1) / 6;
  const point = (x, y) =>
    `${83 + (x - 83) * (1 + voices * 1.35)} ${146 + (y - 146) * (1 + voices * 1.355)}`;
  return {
    open: `M${point(53, 145)} H83 V${156 + voices * 13.5} H${53 - voices * 40.5}Z`,
    closed: `M${point(53, 146)} L${point(83, 146)}`,
    body: `M${point(51, 142)} L${point(86, 142)} ${point(86, 160)} ${point(51, 160)}Z`,
  };
});
const vibration = computed(() => {
  const noise = props.settings.noiseLevel / parameters.noiseLevel.max;
  return {
    strength: 0.15 + noise * 0.85,
    duration: 0.2 - noise * 0.04,
    tilt: 0.03 + noise * 0.09,
  };
});
const dorsal = computed(() => {
  const height = 12 + ((appearance.value.drive - parameters.drive.min) / (parameters.drive.max - parameters.drive.min)) * 86;
  const response = filterResponse(
    appearance.value.cutoff,
    appearance.value.resonance,
    props.sampleRate,
  );
  const points = response.map(({ position, y }, index) => {
    const x = 100 + position * 118;
    const base = 116 + 18 * ((x - 154) / 85) ** 2;
    const tooth = 0.24 + 0.76 * (1 - (index % 32) / 32);
    const level = Math.max(0, (77 - y) / 37);
    const envelope = level <= 1 ? level : 1 + (level - 1) * 1.8;
    const rise = Math.min(94, height * envelope * tooth);
    return `L${x.toFixed(2)},${(base - rise).toFixed(2)}`;
  });
  return `M100 128 ${points.join(" ")} L218 140 Q154 120 100 128Z`;
});
// Every sound setting contributes to a repeatable decorative pattern.
const speckles = computed(() => {
  let seed = 2166136261;
  for (const char of signature(appearance.value))
    seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  const random = seededRandom(seed);
  return Array.from({ length: 14 + Math.floor(random() * 7) }, () => {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random());
    return { x: 153 + Math.cos(angle) * radius * 49,
      y: 141 + Math.sin(angle) * radius * 28, r: 1.4 + random() * 2 };
  });
});
const bodyLength = computed(() => 0.5 + (appearance.value.unisonWidth / 100) * 0.68);
const fins = computed(() => {
  const detune = appearance.value.unisonDetune / 75;
  const fan = 18 + detune * 33;
  return {
    side: `M130 145Q155 142 196 ${160 - fan}L189 ${160 - fan * 0.45}L196 160L189 ${160 + fan * 0.45}L192 ${160 + fan}Q151 170 130 145Z`,
    rays: `M137 146L186 ${160 - fan * 0.72}M137 148L188 160M137 151L183 ${160 + fan * 0.72}`,
  };
});
const tail = computed(() => {
  const tip = 261;
  const spread = 14 + (appearance.value.unisonDetune / 75) * 64;
  return {
    path: `M217 140 L${tip} ${140 - spread} L${tip - 5} ${140 - spread * 0.4} L${tip} 140 L${tip - 5} ${140 + spread * 0.4} L${tip} ${140 + spread}Z`,
    ribs: `M222 140 L${tip - 7} ${140 - spread * 0.72} M222 140 H${tip - 5} M222 140 L${tip - 7} ${140 + spread * 0.72}`,
  };
});
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
        Object.assign(appearance.value, props.settings);
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
        Object.assign(appearance.value, props.settings);
        popPhase.value = "in";
        popTimer = setTimeout(() => {
          popPhase.value = "";
        }, 480);
      }, 120);
      particleTimer = setTimeout(() => {
        particles.value = [];
      }, 750);
    } else if (popPhase.value !== "out") {
      Object.assign(appearance.value, props.settings);
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
  clone.querySelector(".fish-face")?.removeAttribute("transform");
  clone.querySelector(".fish-eye-open").style.display = "none";
  clone.querySelector(".fish-eyelid").style.removeProperty("display");
  const pupil = clone.querySelector(".fish-pupil");
  pupil.setAttribute("cx", eyes.value.x - 3 * 0.55);
  pupil.setAttribute("cy", eyes.value.y + 0.55);
  const mouthPath = clone.querySelector(".fish-mouth");
  mouthPath.setAttribute("d", mouth.value.closed);
  mouthPath.setAttribute("fill", "none");
  const geometry = clone.querySelector(".fish-body-parts");
  const centering = clone.querySelector(".fish-centering");
  clone
    .querySelectorAll("[class]")
    .forEach((element) => element.removeAttribute("class"));
  // Measure the exported resting pose without animation or dragging styles.
  clone.style.cssText = "position:fixed;left:-10000px;visibility:hidden;pointer-events:none";
  document.body.appendChild(clone);
  try {
    const bounds = geometry.getBBox();
    if (bounds.width && bounds.height) centering.setAttribute("transform", centeredTransform(bounds));
  } finally {
    clone.remove();
    clone.removeAttribute("style");
  }
  return new Blob([new XMLSerializer().serializeToString(clone)], {
    type: "image/svg+xml",
  });
}
defineExpose({ exportSvg });
onMounted(() => {
  centerFish();
  window.addEventListener("blur", release);
});
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
                  :transform="`translate(${150 * (1 - bodyScale)} ${115 * (1 - bodyScale)}) scale(${bodyScale})`"
                >
                  <g class="fish-centering" :transform="centerTransform">
                  <FishBody
                    :body="body" :dark="dark" :light="light"
                    :eyes="eyes" :mouth="mouth" :dorsal="dorsal" :tail="tail"
                    :body-length="bodyLength" :fins="fins" :speckles="speckles"
                    :dragging="dragging" :gaze="gaze" :playing="playing" :beat-frequency="beatFrequency"
                    :returning="returning" :return-stroke="returnStroke"
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
