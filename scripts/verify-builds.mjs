import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const expectedOrigin = (process.env.SKINALYZE_API_ORIGIN || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000')
  .replace(/\/$/, '');
const { version: expectedVersion } = JSON.parse(readFileSync('package.json', 'utf8'));

const chrome = JSON.parse(readFileSync('dist/chrome/manifest.json', 'utf8'));
const firefox = JSON.parse(readFileSync('dist/firefox/manifest.json', 'utf8'));
const expectedBasePermissions = ['storage', 'alarms', 'scripting', 'tabs'];
const expectedHosts = [
  'https://steamcommunity.com/*',
  'https://api.steampowered.com/*',
  `${expectedOrigin}/*`,
];
const proprietaryPaths = [
  'src/content/rapidskins-probe.ts',
  'src/content/skinalyze-bridge.ts',
  'src/lib/instant-quotes',
  'src/lib/instant-sell',
  'src/lib/remote-instant-quote-jobs.ts',
  'src/lib/bridge/handlers/fetch_instant_quotes.ts',
  'src/lib/bridge/handlers/instant_sell_marketplaces.ts',
];

for (const path of proprietaryPaths) {
  assert.equal(existsSync(path), false, `public Steam-sync source must not include ${path}`);
}

assert.deepEqual(chrome.background, { service_worker: 'background.js' });
assert.equal(chrome.browser_specific_settings, undefined);
assert.equal(chrome.incognito, undefined);
assert.deepEqual(chrome.permissions, [...expectedBasePermissions, 'offscreen']);
assert.equal(existsSync('dist/chrome/offscreen/steam-market.html'), true);
assert.equal(existsSync('dist/chrome/offscreen/steam-market.js'), true);

assert.deepEqual(firefox.background, { scripts: ['background.js'] });
assert.equal(firefox.background.service_worker, undefined);
assert.equal(firefox.incognito, 'not_allowed');
assert.equal(firefox.browser_specific_settings?.gecko?.id, 'skinalyze-sync@skinalyze.app');
assert.equal(firefox.browser_specific_settings?.gecko?.strict_min_version, '140.0');
assert.deepEqual(firefox.browser_specific_settings?.gecko?.data_collection_permissions, {
  required: [
    'authenticationInfo',
    'personallyIdentifyingInfo',
    'websiteContent',
    'financialAndPaymentInfo',
  ],
  optional: ['technicalAndInteraction'],
});
assert.deepEqual(firefox.permissions, expectedBasePermissions);
assert.equal(firefox.permissions.includes('offscreen'), false);

for (const manifest of [chrome, firefox]) {
  assert.equal(manifest.version, expectedVersion);
  assert.deepEqual(manifest.host_permissions, expectedHosts);
  assert.equal(manifest.optional_host_permissions, undefined);
  assert.equal(manifest.content_scripts.length, 1);
  assert.deepEqual(manifest.content_scripts[0].js, ['content/inventory.js']);
  assert.deepEqual(manifest.content_scripts[0].matches, [
    'https://steamcommunity.com/id/*/inventory*',
    'https://steamcommunity.com/profiles/*/inventory*',
  ]);
  assert(!JSON.stringify(manifest).includes('__API_ORIGIN__'));
}

console.log('browser-specific manifests: ok');
