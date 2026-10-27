import { encodeWav } from "./audio.js";

self.onmessage = ({ data: { channels, sampleRate } }) => {
  try {
    const blob = encodeWav({
      length: channels[0].length,
      numberOfChannels: channels.length,
      sampleRate,
      getChannelData: index => channels[index],
    });
    self.postMessage({ blob });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
