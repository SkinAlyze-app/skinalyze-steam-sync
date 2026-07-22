import { createRequire } from 'node:module';
import { installBrowserTestEnvironment } from './test-browser-bootstrap';

installBrowserTestEnvironment();

const require = createRequire(`${process.cwd()}/scripts/run-tests.js`);
const { runBrowserCompatibilityTests } = require('./test-browser-compat.ts');
const { runInspectMetadataTests } = require('./test-inspect.ts');
const { runApiUrlTests } = require('./test-url-config.ts');
const { runHeadlessSteamTests } = require('./test-headless-steam.ts');
const { runMarketHistoryTests } = require('./test-market-history.ts');
const { runPayloadShapeTests } = require('./test-message-shapes.ts');
const { runPromiseTimeoutTests } = require('./test-promise-timeout.ts');
const { runSingleFlightTests } = require('./test-single-flight.ts');
const { runSteamTradeHistoryPaginationTests } = require('./test-steam-trade-history-pagination.ts');
const { runStorageTests } = require('./test-storage.ts');
const { runSyncProgressVisibilityTests } = require('./test-sync-progress-visibility.ts');
const { runTradeOfferMergeTests } = require('./test-trade-offer-merge.ts');

void (async () => {
  await runBrowserCompatibilityTests();
  runInspectMetadataTests();
  runApiUrlTests();
  await runHeadlessSteamTests();
  runMarketHistoryTests();
  runPayloadShapeTests();
  await runPromiseTimeoutTests();
  await runSingleFlightTests();
  await runSteamTradeHistoryPaginationTests();
  await runStorageTests();
  runSyncProgressVisibilityTests();
  runTradeOfferMergeTests();
  console.log('extension unit tests: ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
