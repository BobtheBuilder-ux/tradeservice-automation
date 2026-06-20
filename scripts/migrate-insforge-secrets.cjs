const fs = require('fs');
const { execFileSync } = require('child_process');

const envPath = 'backend/.env';
const wanted = new Set([
  'ADMIN_EMAILS',
  'FRONTEND_URL',
  'BACKEND_URL',
  'INSFORGE_FUNCTION_BASE_URL',
  'HUBSPOT_ENABLED',
  'HUBSPOT_ACCESS_TOKEN',
  'AUTOMATED_EMAIL_WORKFLOW_ENABLED',
  'CALENDLY_CLIENT_ID',
  'CALENDLY_CLIENT_SECRET',
  'CALENDLY_WEBHOOK_SECRET',
  'CALENDLY_API_TOKEN',
  'CALENDLY_PERSONAL_ACCESS_TOKEN',
  'CALENDLY_ORGANIZATION_URI',
  'CALENDLY_WEBHOOK_SIGNING_KEY',
  'CALENDLY_SCHEDULING_URL',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'EMAIL_FROM_NAME',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
  'TWILIO_API_KEY',
  'TWILIO_API_SECRET',
  'VOICE_CALLING_ENABLED',
  'MAX_CONCURRENT_CALLS',
  'CALL_RETRY_LIMIT',
  'CALL_RETRY_DELAY_MINUTES',
  'VOICE_AI_ENABLED',
  'VOICE_AI_MODEL',
  'OUTREACH_AI_ENABLED',
  'OPENAI_API_KEY',
]);

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2] || '';
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (wanted.has(match[1]) && value && !value.endsWith('_FILE')) out[match[1]] = value;
  }
  return out;
}

const values = parseEnv(fs.readFileSync(envPath, 'utf8'));
const listOutput = execFileSync('npx', ['@insforge/cli', 'secrets', 'list'], { encoding: 'utf8' });
const added = [];
const skippedExisting = [];
const failed = [];

for (const [key, value] of Object.entries(values)) {
  if (listOutput.includes(key)) {
    skippedExisting.push(key);
    continue;
  }
  try {
    execFileSync('npx', ['@insforge/cli', 'secrets', 'add', key, value], { stdio: ['ignore', 'pipe', 'pipe'] });
    added.push(key);
  } catch {
    failed.push(key);
  }
}

console.log(JSON.stringify({
  added,
  skippedExisting,
  failed,
  missingOrEmpty: [...wanted].filter((key) => !(key in values)),
}, null, 2));
