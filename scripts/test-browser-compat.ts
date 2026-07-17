import assert from 'node:assert/strict';

import {
  canTransmitTechnicalData,
  hasTechnicalDataPermission,
} from '../src/shared/data-collection';

export async function runBrowserCompatibilityTests(): Promise<void> {
  assert.equal(hasTechnicalDataPermission(['technicalAndInteraction']), true);
  assert.equal(hasTechnicalDataPermission([]), false);
  assert.equal(await canTransmitTechnicalData({ target: 'chrome' }), true);
  assert.equal(await canTransmitTechnicalData({
    target: 'firefox',
    getAllPermissions: async () => ({ data_collection: ['technicalAndInteraction'] }),
  }), true);
  assert.equal(await canTransmitTechnicalData({
    target: 'firefox',
    getAllPermissions: async () => ({ data_collection: [] }),
  }), false);
  assert.equal(await canTransmitTechnicalData({
    target: 'firefox',
    getAllPermissions: async () => { throw new Error('permission read failed'); },
  }), false);
}
