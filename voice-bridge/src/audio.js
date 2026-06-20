const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;

function decodeMuLawByte(value) {
  const inverted = (~value) & 0xff;
  let sample = ((inverted & 0x0f) << 3) + MULAW_BIAS;
  sample <<= (inverted & 0x70) >> 4;
  return (inverted & 0x80) ? MULAW_BIAS - sample : sample - MULAW_BIAS;
}

function encodeMuLawSample(value) {
  let sample = Math.max(-MULAW_CLIP, Math.min(MULAW_CLIP, Math.round(value)));
  const sign = sample < 0 ? 0x80 : 0;
  if (sample < 0) sample = -sample;
  sample += MULAW_BIAS;

  let exponent = 7;
  for (let bit = 0x4000; exponent > 0 && (sample & bit) === 0; bit >>= 1) {
    exponent -= 1;
  }

  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

function resamplePcm16(samples, fromRate, toRate) {
  if (!samples.length || fromRate === toRate) return samples;
  const targetLength = Math.max(1, Math.round(samples.length * toRate / fromRate));
  const output = new Int16Array(targetLength);
  const scale = fromRate / toRate;

  for (let index = 0; index < targetLength; index += 1) {
    const sourcePosition = index * scale;
    const left = Math.floor(sourcePosition);
    const right = Math.min(left + 1, samples.length - 1);
    const fraction = sourcePosition - left;
    output[index] = Math.round(samples[left] + (samples[right] - samples[left]) * fraction);
  }

  return output;
}

function pcm16ToBase64(samples) {
  const buffer = Buffer.alloc(samples.length * 2);
  for (let index = 0; index < samples.length; index += 1) {
    buffer.writeInt16LE(samples[index], index * 2);
  }
  return buffer.toString('base64');
}

function base64ToPcm16(base64Audio) {
  const buffer = Buffer.from(base64Audio, 'base64');
  const sampleCount = Math.floor(buffer.length / 2);
  const output = new Int16Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    output[index] = buffer.readInt16LE(index * 2);
  }
  return output;
}

export function twilioMuLawToPcm16Base64(base64Audio, targetSampleRate = 16000) {
  const source = Buffer.from(base64Audio, 'base64');
  const decoded = new Int16Array(source.length);
  for (let index = 0; index < source.length; index += 1) {
    decoded[index] = decodeMuLawByte(source[index]);
  }
  return pcm16ToBase64(resamplePcm16(decoded, 8000, targetSampleRate));
}

export function pcm16Base64ToTwilioMuLaw(base64Audio, sourceSampleRate = 16000) {
  const pcm16 = base64ToPcm16(base64Audio);
  const resampled = resamplePcm16(pcm16, sourceSampleRate, 8000);
  const output = Buffer.alloc(resampled.length);
  for (let index = 0; index < resampled.length; index += 1) {
    output[index] = encodeMuLawSample(resampled[index]);
  }
  return output.toString('base64');
}
