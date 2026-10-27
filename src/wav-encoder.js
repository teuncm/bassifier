import { encodeWav } from "./audio.js";

// Long exports should not block pointer handling or the live analysis graphs.
export function encodeWavAsync(buffer) {
  if (typeof Worker === "undefined") return Promise.resolve(encodeWav(buffer));
  let worker;
  try {
    worker = new Worker(new URL("./wav-worker.js", import.meta.url), { type: "module" });
  } catch {
    return Promise.resolve(encodeWav(buffer));
  }
  return new Promise((resolve, reject) => {
    worker.onmessage = ({ data }) => {
      worker.terminate();
      if (data.error) reject(new Error(data.error));
      else resolve(data.blob);
    };
    worker.onerror = () => { worker.terminate(); reject(new Error("WAV encoding failed.")); };
    try {
      // Transfer copies: the cached AudioBuffer must remain intact for reuse.
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) =>
        buffer.getChannelData(index).slice());
      worker.postMessage({ channels, sampleRate: buffer.sampleRate }, channels.map(channel => channel.buffer));
    } catch (error) {
      worker.terminate();
      reject(error);
    }
  });
}
