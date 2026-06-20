import logger from '../utils/logger.js';

const API_BASE_URL = process.env.CALENDLY_API_BASE_URL || 'https://api.calendly.com';
const DEFAULT_TIME_ZONE = process.env.CALENDLY_TIME_ZONE || process.env.BUSINESS_TIME_ZONE || 'America/Toronto';
const DEFAULT_TIMEOUT_MS = Number(process.env.CALENDLY_BOOKING_TIMEOUT_MS || 6500);

function getToken() {
  return process.env.CALENDLY_PERSONAL_ACCESS_TOKEN || process.env.CALENDLY_API_TOKEN;
}

function getEventTypeUri() {
  return process.env.CALENDLY_EVENT_TYPE_URI || process.env.CALENDLY_DEFAULT_EVENT_TYPE_URI || null;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfLocalDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function parseRequestedDate(reply, now = new Date()) {
  const text = String(reply || '').toLowerCase();
  const today = startOfLocalDay(now);

  if (/\btoday\b/.test(text)) return today;
  if (/\btomorrow\b/.test(text)) return addDays(today, 1);

  const isoMatch = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }

  const slashMatch = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/);
  if (slashMatch) {
    const candidate = new Date(slashMatch[3] ? Number(slashMatch[3]) : now.getFullYear(), Number(slashMatch[1]) - 1, Number(slashMatch[2]));
    if (!slashMatch[3] && candidate < today) candidate.setFullYear(candidate.getFullYear() + 1);
    return candidate;
  }

  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const weekdayIndex = weekdays.findIndex((day) => new RegExp(`\\b${day}\\b`).test(text));
  if (weekdayIndex >= 0) {
    const current = today.getDay();
    let daysUntil = (weekdayIndex - current + 7) % 7;
    if (daysUntil === 0 || /\bnext\b/.test(text)) daysUntil += 7;
    return addDays(today, daysUntil);
  }

  return null;
}

function parseRequestedTime(reply) {
  const text = String(reply || '')
    .toLowerCase()
    .replace(/\b(a|p)\s*\.?\s*m\.?\b/g, '$1m')
    .replace(/\bo['’]?clock\b/g, '')
    .replace(/\s+/g, ' ');
  const match = text.match(/\b(?:at|by|around|about)?\s*(\d{1,4})(?::(\d{2}))?\s*(am|pm)\b/);
  if (!match) return null;

  const rawHour = match[1];
  const compactTime = !match[2] && rawHour.length >= 3;
  let hour = compactTime ? Number(rawHour.slice(0, -2)) : Number(rawHour);
  const minute = match[2] ? Number(match[2]) : compactTime ? Number(rawHour.slice(-2)) : 0;
  const period = match[3];

  if (hour < 1 || hour > 12 || minute > 59) return null;
  if (period === 'pm' && hour !== 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;

  return { hour, minute };
}

function getDateParts(date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate(),
  };
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );
  return asUtc - date.getTime();
}

function zonedTimeToUtc({ year, month, day, hour, minute, timeZone }) {
  const utcGuess = new Date(Date.UTC(year, month, day, hour, minute, 0, 0));
  const offset = getTimeZoneOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offset);
}

function formatSlot(startTime, timeZone = DEFAULT_TIME_ZONE) {
  return new Date(startTime).toLocaleString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  });
}

function toAvailableTimes(payload) {
  const collection = Array.isArray(payload?.collection) ? payload.collection : [];
  return collection
    .map((slot) => slot?.start_time || slot?.startTime)
    .filter(Boolean)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
}

class CalendlySchedulingService {
  constructor(options = {}) {
    this.fetch = options.fetch || globalThis.fetch;
    this.apiBaseUrl = options.apiBaseUrl || API_BASE_URL;
    this.token = options.token || getToken();
    this.eventTypeUri = options.eventTypeUri || getEventTypeUri();
    this.timeZone = options.timeZone || DEFAULT_TIME_ZONE;
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  }

  isConfigured() {
    return Boolean(this.fetch && this.token);
  }

  parseRequestedSlot(reply, now = new Date()) {
    const date = parseRequestedDate(reply, now);
    const time = parseRequestedTime(reply);
    if (!date || !time) return null;

    const dateParts = getDateParts(date);
    const requested = zonedTimeToUtc({
      ...dateParts,
      hour: time.hour,
      minute: time.minute,
      timeZone: this.timeZone,
    });
    if (Number.isNaN(requested.getTime())) return null;

    return requested;
  }

  async calendlyRequest(path, { method = 'GET', searchParams, body } = {}) {
    if (!this.token) {
      throw new Error('Calendly token is not configured');
    }

    const url = path.startsWith('http') ? new URL(path) : new URL(path, this.apiBaseUrl);
    Object.entries(searchParams || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    let data;

    try {
      response = await this.fetch(url, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await response.text();
      data = text ? JSON.parse(text) : {};
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Calendly API request timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(data?.message || data?.title || `Calendly API request failed with ${response.status}`);
    }

    return data;
  }

  async getEventTypeUri() {
    if (this.eventTypeUri) return this.eventTypeUri;

    const userData = await this.calendlyRequest('/users/me');
    const userUri = userData?.resource?.uri;
    if (!userUri) {
      throw new Error('Calendly current user URI was not returned');
    }

    const eventTypes = await this.calendlyRequest('/event_types', {
      searchParams: {
        user: userUri,
        active: 'true',
        count: 1,
      },
    });
    const eventTypeUri = eventTypes?.collection?.[0]?.uri;
    if (!eventTypeUri) {
      throw new Error('No active Calendly event type found for direct booking');
    }

    this.eventTypeUri = eventTypeUri;
    return eventTypeUri;
  }

  async listAvailableTimes({ startTime, endTime }) {
    const eventTypeUri = await this.getEventTypeUri();
    const data = await this.calendlyRequest('/event_type_available_times', {
      searchParams: {
        event_type: eventTypeUri,
        start_time: startTime,
        end_time: endTime,
      },
    });
    return toAvailableTimes(data);
  }

  findBestSlot(availableTimes, requestedStart) {
    const requestedMs = requestedStart.getTime();
    const exactWindowMs = 15 * 60 * 1000;
    const exact = availableTimes.find((slot) => Math.abs(new Date(slot).getTime() - requestedMs) <= exactWindowMs);
    if (exact) return { startTime: exact, exact: true, suggestions: [] };

    return {
      startTime: null,
      exact: false,
      suggestions: availableTimes.slice(0, 3),
    };
  }

  async createEventInvitee({ lead, startTime, trackingId }) {
    const eventTypeUri = await this.getEventTypeUri();
    const name = lead.fullName || [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email || 'Calendly Invitee';
    const payload = {
      event_type: eventTypeUri,
      start_time: startTime,
      invitee: {
        name,
        email: lead.email,
        timezone: this.timeZone,
      },
      tracking: {
        utm_source: 'bob_voice_call',
        utm_medium: 'voice',
        utm_campaign: 'direct_booking',
        utm_content: lead.id || trackingId,
      },
    };

    return this.calendlyRequest('/event_invitees', {
      method: 'POST',
      body: payload,
    });
  }

  async bookRequestedSlot({ lead, reply, trackingId, now = new Date() }) {
    if (!this.isConfigured()) {
      return {
        success: false,
        reason: 'not_configured',
        message: 'Calendly direct booking is not configured',
      };
    }

    if (!lead?.email) {
      return {
        success: false,
        reason: 'missing_email',
        message: 'Lead email is required to create a Calendly booking',
      };
    }

    const requestedStart = this.parseRequestedSlot(reply, now);
    if (!requestedStart) {
      return {
        success: false,
        reason: 'needs_time',
        message: 'Could not understand requested day and time',
      };
    }

    const windowStart = new Date(requestedStart.getTime() - 12 * 60 * 60 * 1000);
    const windowEnd = new Date(requestedStart.getTime() + 12 * 60 * 60 * 1000);

    const availableTimes = await this.listAvailableTimes({
      startTime: windowStart.toISOString(),
      endTime: windowEnd.toISOString(),
    });
    const match = this.findBestSlot(availableTimes, requestedStart);

    if (!match.startTime) {
      return {
        success: false,
        reason: 'unavailable',
        requestedStart: requestedStart.toISOString(),
        suggestions: match.suggestions,
        message: match.suggestions.length
          ? `Requested slot is unavailable. Suggested: ${match.suggestions.map((slot) => formatSlot(slot, this.timeZone)).join(', ')}.`
          : 'Requested day has no available slots.',
      };
    }

    const booking = await this.createEventInvitee({
      lead,
      startTime: match.startTime,
      trackingId,
    });

    logger.info('Calendly direct booking created from voice call', {
      trackingId,
      leadId: lead.id,
      startTime: match.startTime,
    });

    return {
      success: true,
      booked: true,
      startTime: match.startTime,
      exact: match.exact,
      booking,
      formattedTime: formatSlot(match.startTime, this.timeZone),
    };
  }
}

const calendlySchedulingService = new CalendlySchedulingService();
export default calendlySchedulingService;
export { CalendlySchedulingService, parseRequestedDate, parseRequestedTime, formatSlot };
