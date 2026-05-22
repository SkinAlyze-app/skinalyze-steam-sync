import assert from 'node:assert/strict';

import { buildExtensionApiUrl } from '../src/shared/api-url';

export function runApiUrlTests(): void {
  assert.equal(buildExtensionApiUrl('https://skinalyze.app', '/api/x'), 'https://skinalyze.app/api/x');
  assert.equal(buildExtensionApiUrl('https://skinalyze.app/', '/api/x'), 'https://skinalyze.app/api/x');
  assert.equal(buildExtensionApiUrl('https://skinalyze.app/', 'api/x'), 'https://skinalyze.app/api/x');
  assert.equal(buildExtensionApiUrl('http://localhost:3000', 'foo'), 'http://localhost:3000/foo');
  assert.equal(buildExtensionApiUrl('http://localhost:3000/', '/bar'), 'http://localhost:3000/bar');
}
