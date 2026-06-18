import assert from 'node:assert/strict';
import test from 'node:test';
import { CalendlySchedulingService, parseRequestedTime } from '../src/services/calendly-scheduling-service.js';

test('parseRequestedTime understands common spoken times', () => {
  assert.deepEqual(parseRequestedTime('tomorrow at 3 PM'), { hour: 15, minute: 0 });
  assert.deepEqual(parseRequestedTime('Friday 10:30 am'), { hour: 10, minute: 30 });
  assert.equal(parseRequestedTime('sometime later'), null);
});

test('bookRequestedSlot creates invitee when requested slot is available', async () => {
  const requests = [];
  const service = new CalendlySchedulingService({
    token: 'token',
    eventTypeUri: 'https://api.calendly.com/event_types/abc',
    apiBaseUrl: 'https://api.calendly.test',
    timeZone: 'America/Toronto',
    fetch: async (url, options = {}) => {
      requests.push({ url: url.toString(), options });
      if (url.pathname === '/event_type_available_times') {
        return new Response(JSON.stringify({
          collection: [{ start_time: '2026-06-19T19:00:00.000Z' }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ resource: { uri: 'https://api.calendly.com/scheduled_events/invitee' } }), { status: 201 });
    },
  });

  const result = await service.bookRequestedSlot({
    lead: { id: 'lead-1', email: 'lead@example.com', firstName: 'Ada' },
    reply: '2026-06-19 at 3 PM',
    trackingId: 'track-1',
    now: new Date('2026-06-18T12:00:00.000Z'),
  });

  assert.equal(result.success, true);
  assert.equal(result.startTime, '2026-06-19T19:00:00.000Z');
  assert.match(requests[0].url, /event_type_available_times/);
  assert.equal(JSON.parse(requests[1].options.body).invitee.email, 'lead@example.com');
});

test('bookRequestedSlot returns suggestions when requested slot is unavailable', async () => {
  const service = new CalendlySchedulingService({
    token: 'token',
    eventTypeUri: 'https://api.calendly.com/event_types/abc',
    apiBaseUrl: 'https://api.calendly.test',
    fetch: async () => new Response(JSON.stringify({
      collection: [
        { start_time: '2026-06-19T14:00:00.000Z' },
        { start_time: '2026-06-19T15:00:00.000Z' },
      ],
    }), { status: 200 }),
  });

  const result = await service.bookRequestedSlot({
    lead: { id: 'lead-1', email: 'lead@example.com' },
    reply: '2026-06-19 at 3 PM',
    trackingId: 'track-1',
    now: new Date('2026-06-18T12:00:00.000Z'),
  });

  assert.equal(result.success, false);
  assert.equal(result.reason, 'unavailable');
  assert.deepEqual(result.suggestions, ['2026-06-19T14:00:00.000Z', '2026-06-19T15:00:00.000Z']);
});
