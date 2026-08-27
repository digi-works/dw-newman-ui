#!/usr/bin/env node
// Warns about missing LLM vendor API keys and missing CopilotKit Intelligence
// configuration before `npm run dev`, then lets the dev server start anyway
// (chat/generations and Intelligence features fail until the values are set).
// Written by `copilotkit init`; safe to delete if you manage env validation
// yourself.
import { existsSync, readFileSync } from 'node:fs';

/** Vendor API keys this scaffold needs before chat and generations will work. */
const REQUIRED_ENV_KEYS = [
  {
    "key": "OPENAI_API_KEY",
    "note": "Required by the agent runtime.",
    "url": "https://platform.openai.com/api-keys",
    "example": "sk-..."
  }
];

/**
 * Mock-provider base-URL map baked at scaffold time, keyed by vendor API-key
 * var name. Used to detect the "real key but base URL still points at the mock"
 * mismatch. Derived from MOCK_PROVIDERS; expand by adding a row there.
 * Shape: { [keyVar]: { baseUrlVar: string, baseUrl: string } }
 */
const MOCK_PROVIDER_BASE_URLS = {
  "OPENAI_API_KEY": {
    "baseUrlVar": "OPENAI_BASE_URL",
    "baseUrl": "http://127.0.0.1:4010/v1"
  }
};

/**
 * Hosted CopilotKit Intelligence env var NAMES this scaffold was generated with
 * (no values — those live only in .env). Empty for a non-hosted build. A
 * missing/blank value means the generated .env was overwritten.
 */
const REQUIRED_INTELLIGENCE_KEYS = [
  {
    "key": "INTELLIGENCE_API_URL"
  },
  {
    "key": "INTELLIGENCE_GATEWAY_WS_URL"
  },
  {
    "key": "INTELLIGENCE_API_KEY"
  }
];

const envFileExists = existsSync('.env');
const envFileContent = envFileExists ? readFileSync('.env', 'utf8') : '';

// Shared detection predicate — authored once in vendor-key-predicate.ts and
// spliced here verbatim so the CLI pre-check (ENT-677) and this gate cannot
// drift. Defines readDotenvValue / isPlaceholderValue / resolveVendorKeyValue /
// findUnsatisfiedVendorKeys.

function readDotenvValue(envFileContent, key) {
  const re = new RegExp('^\\s*(?:export\\s+)?' + key + '=(.*)$', 'gm');
  let match;
  let last = null;
  while ((match = re.exec(envFileContent)) !== null) {
    last = match;
  }
  if (!last) {
    return '';
  }
  const raw = last[1].trim();
  if (
    raw.length >= 2 &&
    ((raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'")))
  ) {
    return raw.slice(1, -1).trim();
  }
  if (raw.startsWith('#')) {
    return '';
  }
  return raw.replace(/\s+#.*$/, '').trim();
}

function isPlaceholderValue(value) {
  return /^<.*>$/.test(value) || /^your[-_]/i.test(value) || /\.\.\.$/.test(value);
}

function resolveVendorKeyValue(processEnv, envFileContent, key) {
  const fromProcess = ((processEnv && processEnv[key]) || '').trim();
  return fromProcess !== '' ? fromProcess : readDotenvValue(envFileContent, key);
}

function findUnsatisfiedVendorKeys(processEnv, envFileContent, requirements) {
  return requirements
    .map((requirement) => ({
      requirement,
      value: resolveVendorKeyValue(processEnv, envFileContent, requirement.key),
    }))
    .filter(({ value }) => value === '' || isPlaceholderValue(value));
}


const failedKeys = findUnsatisfiedVendorKeys(process.env, envFileContent, REQUIRED_ENV_KEYS)
  .map(({ requirement, value }) => ({ entry: requirement, value }));

if (failedKeys.length > 0) {
  for (const { entry, value } of failedKeys) {
    if (value === '') {
      console.warn(
        `⚠ Missing API key: ${entry.key} — chat and generations will not work until you set it.`,
      );
    } else {
      console.warn(
        `⚠ Placeholder value for API key: ${entry.key} — chat and generations will not work until you replace it with your real key.`,
      );
    }
    console.warn(`  ${entry.note}`);
    console.warn(`  Get a key:  ${entry.url}`);
    console.warn(`  Add to .env:  ${entry.key}=${entry.example}`);
    console.warn('');
  }
  if (!envFileExists) {
    console.warn(
      'No .env file found in this directory; create one containing the line(s) above.',
    );
  }
  console.warn(
    'Starting the dev server anyway — set the key(s) above and restart to enable chat.',
  );
}

// Mock-provider base-URL mismatch check (ENT-726). For each vendor key whose
// resolved value looks real (non-empty, not a placeholder, not the literal
// "mock"), warn when the corresponding base-URL var still points at the local
// mock server — the user set a real key but forgot to remove the mock base URL.
// Non-blocking: does not change exit code or prevent the dev server from starting.
for (const entry of REQUIRED_ENV_KEYS) {
  const mockProvider = MOCK_PROVIDER_BASE_URLS[entry.key];
  if (!mockProvider) {
    continue;
  }
  const keyValue = resolveVendorKeyValue(process.env, envFileContent, entry.key);
  if (
    keyValue === '' ||
    keyValue === 'mock' ||
    isPlaceholderValue(keyValue)
  ) {
    continue;
  }
  const baseUrlValue = readDotenvValue(envFileContent, mockProvider.baseUrlVar);
  if (baseUrlValue === mockProvider.baseUrl) {
    console.warn(
      `⚠ ${entry.key} looks like a real key, but ${mockProvider.baseUrlVar} still points at the local mock (${mockProvider.baseUrl}); requests go to the mock. Run copilotkit mock disable (or remove ${mockProvider.baseUrlVar}), then restart npm run dev.`,
    );
  }
}

// Hosted Intelligence config check (ENT-949). Reuses the shared predicate above:
// a key is unsatisfied when missing/blank in both process.env and .env — the
// symptom of an overwritten generated .env. Names the missing keys only; the
// values belong solely in .env, so the fix is to restore it or re-run init.
const intelligenceFailures = findUnsatisfiedVendorKeys(
  process.env,
  envFileContent,
  REQUIRED_INTELLIGENCE_KEYS,
).map(({ requirement }) => requirement);

if (intelligenceFailures.length > 0) {
  console.warn(
    '⚠ CopilotKit Intelligence is not configured — your .env may have been overwritten.',
  );
  for (const entry of intelligenceFailures) {
    console.warn(`  Missing:  ${entry.key}`);
  }
  console.warn(
    'Restore the value(s) in .env, or re-run `copilotkit init` to reconfigure.',
  );
  console.warn(
    'Starting the dev server anyway — Intelligence features will not work until these are set.',
  );
}

process.exit(0);
