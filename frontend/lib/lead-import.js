const CHANNELS = ['call', 'sms', 'whatsapp', 'email'];

const HEADER_ALIASES = {
  email: ['email', 'email_address', 'email address', 'e-mail'],
  firstName: ['first_name', 'first name', 'firstname'],
  lastName: ['last_name', 'last name', 'lastname'],
  fullName: ['full_name', 'full name', 'name', 'contact name'],
  phone: ['phone', 'phone_number', 'phone number', 'mobile', 'mobile phone', 'cell'],
  company: ['company', 'company_name', 'company name', 'business'],
  jobTitle: ['job_title', 'job title', 'title', 'role'],
  website: ['website', 'url', 'company website'],
  leadSource: ['lead_source', 'lead source', 'source'],
  serviceInterest: ['service_interest', 'service interest', 'service', 'interest'],
  locationSummary: ['location_summary', 'location summary', 'location', 'city'],
  notes: ['notes', 'note'],
  tags: ['tags'],
  priority: ['priority'],
  preferredContactChannel: [
    'preferred_contact_channel',
    'preferred contact channel',
    'preferred channel',
    'preferred_contact_method',
    'preferred contact method',
    'preferred_method',
    'preferred method',
    'contact_method',
    'contact method',
  ],
  callConsent: ['call_consent', 'call consent', 'voice_consent', 'voice consent', 'can_call', 'can call'],
  smsConsent: ['sms_consent', 'sms consent', 'text_consent', 'text consent', 'can_sms', 'can sms'],
  whatsappConsent: ['whatsapp_consent', 'whatsapp consent', 'can_whatsapp', 'can whatsapp'],
  emailConsent: ['email_consent', 'email consent', 'can_email', 'can email', 'marketing_email_consent'],
  doNotContact: ['do_not_contact', 'do not contact', 'dnc', 'suppressed'],
  optOutChannel: ['opt_out_channel', 'opt out channel', 'opted_out_channel'],
  optOutReason: ['opt_out_reason', 'opt out reason', 'unsubscribe reason'],
};

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'y', 'consent', 'consented', 'allowed', 'allow', 'opted in', 'opt-in']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'n', 'denied', 'deny', 'not allowed', 'opted out', 'opt-out']);

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalHeader(header) {
  const normalized = normalizeHeader(header);
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((alias) => normalizeHeader(alias) === normalized)) return field;
  }
  return null;
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

export function isValidEmail(email) {
  const normalized = normalizeEmail(email);
  return !normalized || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function coerceBoolean(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return false;
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return false;
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

export function parseCsv(text) {
  const normalized = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line, index) => ({
    rowNumber: index + 2,
    cells: parseCsvLine(line),
  }));

  return { headers, rows };
}

function buildHeaderMap(headers) {
  const map = {};
  headers.forEach((header, index) => {
    const field = canonicalHeader(header);
    if (field && map[field] === undefined) map[field] = index;
  });
  return map;
}

function cell(row, headerMap, field) {
  const index = headerMap[field];
  if (index === undefined) return '';
  return String(row.cells[index] || '').trim();
}

function consentCell(row, headerMap, field) {
  const index = headerMap[field];
  if (index === undefined) return true;
  const value = String(row.cells[index] || '').trim();
  if (!value) return true;
  return coerceBoolean(value);
}

function extractAdditionalFields(headers, row) {
  return Object.fromEntries(
    headers
      .map((header, index) => [String(header || '').trim(), String(row.cells[index] || '').trim()])
      .filter(([header, value]) => header && value && !canonicalHeader(header))
  );
}

function parseTags(value) {
  const tags = String(value || '')
    .split(/[;,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  return tags.length ? tags : null;
}

function normalizePriority(value) {
  const priority = String(value || '').trim().toLowerCase();
  return ['low', 'medium', 'high', 'urgent'].includes(priority) ? priority : 'medium';
}

function normalizePreferredChannel(value) {
  const channel = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '_');
  if (['email', 'e_mail', 'mail'].includes(channel)) return 'email';
  if (['phone', 'voice', 'call', 'calls', 'phone_call', 'phonecall', 'telephone'].includes(channel)) return 'call';
  if (['sms', 'text', 'text_message'].includes(channel)) return 'sms';
  if (['whatsapp', 'wa'].includes(channel)) return 'whatsapp';
  return 'email';
}

function leadName(firstName, lastName, fullName) {
  const explicit = String(fullName || '').trim();
  if (explicit) return explicit;
  return [firstName, lastName].map((part) => String(part || '').trim()).filter(Boolean).join(' ') || null;
}

export function contactPolicyForLead(lead, channel) {
  const requestedChannel = channel === 'voice' ? 'call' : channel;
  if (!CHANNELS.includes(requestedChannel)) {
    return { allowed: false, reason: 'Unsupported outreach channel' };
  }

  if (lead?.doNotContact) {
    return { allowed: false, reason: 'Lead is marked do not contact' };
  }

  if (lead?.optedOutAt && (!lead.optOutChannel || lead.optOutChannel === 'all' || lead.optOutChannel === requestedChannel)) {
    return { allowed: false, reason: 'Lead has opted out of this channel' };
  }

  const consentField = requestedChannel + 'Consent';
  if (!lead?.[consentField]) {
    return { allowed: false, reason: 'Missing channel consent' };
  }

  return { allowed: true, reason: 'Consent is present' };
}

export function summarizeContactPolicy(lead) {
  return Object.fromEntries(CHANNELS.map((channel) => [channel, contactPolicyForLead(lead, channel)]));
}

export function buildLeadImportPreview(csvText, existingLeads = []) {
  const parsed = parseCsv(csvText);
  const headerMap = buildHeaderMap(parsed.headers);
  const existingEmails = new Set(existingLeads.map((lead) => normalizeEmail(lead.email)).filter(Boolean));
  const existingPhones = new Set(existingLeads.map((lead) => normalizePhone(lead.phone)).filter(Boolean));
  const fileEmails = new Set();
  const filePhones = new Set();

  const rows = parsed.rows.map((row) => {
    const additionalFields = extractAdditionalFields(parsed.headers, row);
    const firstName = cell(row, headerMap, 'firstName');
    const lastName = cell(row, headerMap, 'lastName');
    const fullName = leadName(firstName, lastName, cell(row, headerMap, 'fullName'));
    const email = normalizeEmail(cell(row, headerMap, 'email'));
    const phone = cell(row, headerMap, 'phone');
    const phoneDigits = normalizePhone(phone);
    const errors = [];
    const warnings = [];

    if (!email && !phoneDigits) errors.push('Email or phone is required');
    if (email && !isValidEmail(email)) errors.push('Email format is invalid');
    if (phoneDigits && phoneDigits.length < 8) errors.push('Phone number is too short');

    const duplicateByEmail = email && (existingEmails.has(email) || fileEmails.has(email));
    const duplicateByPhone = phoneDigits && (existingPhones.has(phoneDigits) || filePhones.has(phoneDigits));

    if (duplicateByEmail) warnings.push('Duplicate email');
    if (duplicateByPhone) warnings.push('Duplicate phone');

    if (email) fileEmails.add(email);
    if (phoneDigits) filePhones.add(phoneDigits);

    const lead = {
      email: email || null,
      firstName: firstName || null,
      lastName: lastName || null,
      fullName,
      phone: phone || null,
      company: cell(row, headerMap, 'company') || null,
      jobTitle: cell(row, headerMap, 'jobTitle') || null,
      website: cell(row, headerMap, 'website') || null,
      leadSource: cell(row, headerMap, 'leadSource') || 'csv_import',
      source: 'csv_import',
      serviceInterest: cell(row, headerMap, 'serviceInterest') || null,
      locationSummary: cell(row, headerMap, 'locationSummary') || null,
      notes: cell(row, headerMap, 'notes') || null,
      tags: parseTags(cell(row, headerMap, 'tags')),
      priority: normalizePriority(cell(row, headerMap, 'priority')),
      preferredContactChannel: normalizePreferredChannel(cell(row, headerMap, 'preferredContactChannel')),
      callConsent: consentCell(row, headerMap, 'callConsent'),
      smsConsent: consentCell(row, headerMap, 'smsConsent'),
      whatsappConsent: consentCell(row, headerMap, 'whatsappConsent'),
      emailConsent: consentCell(row, headerMap, 'emailConsent'),
      doNotContact: coerceBoolean(cell(row, headerMap, 'doNotContact')),
      optOutChannel: cell(row, headerMap, 'optOutChannel') || null,
      optOutReason: cell(row, headerMap, 'optOutReason') || null,
      qualificationStatus: 'unqualified',
      qualificationScore: 0,
      leadStage: 'new',
      schedulingState: 'not_started',
      status: 'new',
      customFields: Object.keys(additionalFields).length
        ? { importedLeadData: additionalFields }
        : {},
    };

    if (!CHANNELS.some((channel) => lead[channel + 'Consent'])) {
      warnings.push('No channel consent provided');
    }

    const duplicate = Boolean(duplicateByEmail || duplicateByPhone);
    const importable = errors.length === 0 && !duplicate;

    return {
      rowNumber: row.rowNumber,
      lead,
      errors,
      warnings,
      duplicate,
      importable,
      status: errors.length ? 'error' : duplicate ? 'duplicate' : 'ready',
    };
  });

  const summary = {
    totalRows: rows.length,
    validRows: rows.filter((row) => row.importable).length,
    duplicateRows: rows.filter((row) => row.duplicate).length,
    errorRows: rows.filter((row) => row.errors.length > 0).length,
    skippedRows: rows.filter((row) => !row.importable).length,
  };

  return {
    headers: parsed.headers,
    rows,
    importableRows: rows.filter((row) => row.importable),
    summary,
  };
}

export function importedLeadPayload(row, leadImportBatchId) {
  return {
    ...row.lead,
    leadImportBatchId,
    customFields: {
      ...(row.lead.customFields || {}),
      source: 'frontend_csv_import',
      importRowNumber: row.rowNumber,
      consentPolicy: summarizeContactPolicy(row.lead),
    },
  };
}
