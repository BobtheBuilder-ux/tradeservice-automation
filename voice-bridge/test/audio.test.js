import assert from 'node:assert/strict';
import test from 'node:test';
import {
  pcm16Base64ToTwilioMuLaw,
  twilioMuLawToPcm16Base64,
} from '../src/audio.js';

function pcmValues(base64Audio) {
  const buffer = Buffer.from(base64Audio, 'base64');
  return Array.from({ length: buffer.length / 2 }, (_, index) => buffer.readInt16LE(index * 2));
}

test('Twilio μ-law silence becomes PCM16 silence at the ElevenLabs rate', () => {
  const twilioSilence = Buffer.alloc(160, 0xff).toString('base64');
  const pcm = twilioMuLawToPcm16Base64(twilioSilence, 16000);

  assert.equal(Buffer.from(pcm, 'base64').length, 640);
  assert.ok(pcmValues(pcm).every((sample) => Math.abs(sample) < 8));
});

test('PCM16 silence becomes 8 kHz Twilio μ-law silence', () => {
  const pcmBuffer = Buffer.alloc(640);
  const twilioAudio = pcm16Base64ToTwilioMuLaw(pcmBuffer.toString('base64'), 16000);
  const decoded = Buffer.from(twilioAudio, 'base64');

  assert.equal(decoded.length, 160);
  assert.ok(Array.from(decoded).every((byte) => byte === 0xff));
});
