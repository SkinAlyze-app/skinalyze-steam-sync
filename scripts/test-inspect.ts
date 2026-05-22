/**
 * Inspect-metadata smoke tests (Node; no browser).
 * Run via `npm test` or `npx tsx scripts/test-inspect.ts`.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInspectLinkSafe, extractAssetProperties, resolveInspectLink } from '../src/lib/inspect-metadata';

function testResolvePlaceholders() {
  const props = extractAssetProperties(
    { asset_properties: [{ propertyid: 6, string_value: 'DEADBEEF' }] },
    {}
  );
  const tpl =
    'steam://rungame/730/76561202255233023/+csgo_econ_action_preview %owner_steamid% %assetid% %contextid% %appid% %propid:6%';
  const out = resolveInspectLink(tpl, {
    ownerSteamId64: '76561198000000000',
    assetId: '12345',
    contextId: 2,
    appId: 730,
    assetProperties: props,
  });
  assert.ok(out.includes('76561198000000000'));
  assert.ok(out.includes('12345'));
  assert.ok(out.includes('2'));
  assert.ok(out.includes('730'));
  assert.ok(out.includes('DEADBEEF'));
}

function testDecodeNeverThrows() {
  const r1 = decodeInspectLinkSafe('');
  assert.equal(r1.ok, false);
  const r2 = decodeInspectLinkSafe('not an inspect link');
  assert.equal(r2.ok, false);
}

function testAssetPropsFloatSeed() {
  const props = extractAssetProperties(
    {
      asset_properties: [
        { propertyid: 2, float_value: 0.15 },
        { propertyid: 1, int_value: 42 },
      ],
    },
    {}
  );
  const f = props.find((p) => p.propertyid === 2)?.float_value;
  const s = props.find((p) => p.propertyid === 1)?.int_value;
  assert.equal(f, 0.15);
  assert.equal(s, 42);
}

export function runInspectMetadataTests(): void {
  testResolvePlaceholders();
  testDecodeNeverThrows();
  testAssetPropsFloatSeed();
}

const thisFile = fileURLToPath(import.meta.url);
const ranAsMain = path.normalize(process.argv[1] ?? '') === path.normalize(thisFile);
if (ranAsMain) {
  runInspectMetadataTests();
  console.log('inspect-metadata tests: ok');
}
