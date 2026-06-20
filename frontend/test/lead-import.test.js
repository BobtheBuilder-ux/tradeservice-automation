import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLeadImportPreview,
  contactPolicyForLead,
  normalizeEmail,
  normalizePhone,
  parseCsv,
} from '../lib/lead-import.js';

test('parseCsv handles quoted commas', () => {
  const parsed = parseCsv('email,full_name,notes\njane@example.com,"Jane, Inc","Needs ""fast"" follow-up"');

  assert.deepEqual(parsed.headers, ['email', 'full_name', 'notes']);
  assert.equal(parsed.rows[0].cells[1], 'Jane, Inc');
  assert.equal(parsed.rows[0].cells[2], 'Needs "fast" follow-up');
});

test('normalizers produce duplicate-safe keys', () => {
  assert.equal(normalizeEmail('  JANE@Example.COM '), 'jane@example.com');
  assert.equal(normalizePhone('+1 (555) 123-4567'), '15551234567');
});

test('buildLeadImportPreview skips existing and in-file duplicates', () => {
  const csv = [
    'email,phone,full_name,sms_consent',
    'new@example.com,+15550001111,New Lead,yes',
    'old@example.com,+15550002222,Old Lead,yes',
    'new@example.com,+15550003333,Duplicate Lead,yes',
    'bad-email,+1555,Bad Lead,yes',
  ].join('\n');

  const preview = buildLeadImportPreview(csv, [
    { email: 'old@example.com', phone: '+15559998888' },
  ]);

  assert.equal(preview.summary.totalRows, 4);
  assert.equal(preview.summary.validRows, 1);
  assert.equal(preview.summary.duplicateRows, 2);
  assert.equal(preview.summary.errorRows, 1);
  assert.equal(preview.importableRows[0].lead.email, 'new@example.com');
});

test('buildLeadImportPreview preserves unknown CSV columns as imported lead data', () => {
  const csv = [
    'email,full_name,sms_consent,Roof Age,Insurance Provider,Last Claim Notes',
    'roofer@example.com,Roofer Lead,yes,12 years,Acme Insurance,"Asked about hail damage"',
  ].join('\n');

  const preview = buildLeadImportPreview(csv, []);
  const lead = preview.importableRows[0].lead;

  assert.deepEqual(lead.customFields.importedLeadData, {
    'Roof Age': '12 years',
    'Insurance Provider': 'Acme Insurance',
    'Last Claim Notes': 'Asked about hail damage',
  });
});

test('buildLeadImportPreview defaults missing channel consent to approved', () => {
  const preview = buildLeadImportPreview('email,full_name\napproved@example.com,Approved Lead', []);
  const lead = preview.importableRows[0].lead;

  assert.equal(lead.callConsent, true);
  assert.equal(lead.smsConsent, true);
  assert.equal(lead.whatsappConsent, true);
  assert.equal(lead.emailConsent, true);
});

test('buildLeadImportPreview respects explicit denied consent values', () => {
  const csv = 'email,full_name,call_consent,sms_consent,whatsapp_consent,email_consent\ndenied@example.com,Denied Lead,no,false,0,opted out';
  const lead = buildLeadImportPreview(csv, []).importableRows[0].lead;

  assert.equal(lead.callConsent, false);
  assert.equal(lead.smsConsent, false);
  assert.equal(lead.whatsappConsent, false);
  assert.equal(lead.emailConsent, false);
});

test('contactPolicyForLead fails closed without consent or after opt-out', () => {
  assert.deepEqual(
    contactPolicyForLead({ smsConsent: false }, 'sms'),
    { allowed: false, reason: 'Missing channel consent' }
  );

  assert.deepEqual(
    contactPolicyForLead({ smsConsent: true, optedOutAt: '2026-06-20T00:00:00Z', optOutChannel: 'sms' }, 'sms'),
    { allowed: false, reason: 'Lead has opted out of this channel' }
  );

  assert.deepEqual(
    contactPolicyForLead({ smsConsent: true }, 'sms'),
    { allowed: true, reason: 'Consent is present' }
  );
});
