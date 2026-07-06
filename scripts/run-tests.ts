import { runInspectMetadataTests } from './test-inspect';
import { runApiUrlTests } from './test-url-config';
import { runMarketHistoryTests } from './test-market-history';
import { runPayloadShapeTests } from './test-message-shapes';
import { runSingleFlightTests } from './test-single-flight';
import { runSteamTradeHistoryPaginationTests } from './test-steam-trade-history-pagination';
import { runStorageTests } from './test-storage';
import { runSyncProgressVisibilityTests } from './test-sync-progress-visibility';
import { runTradeOfferMergeTests } from './test-trade-offer-merge';

void (async () => {
  runInspectMetadataTests();
  runApiUrlTests();
  runMarketHistoryTests();
  runPayloadShapeTests();
  await runSingleFlightTests();
  await runSteamTradeHistoryPaginationTests();
  await runStorageTests();
  runSyncProgressVisibilityTests();
  runTradeOfferMergeTests();
  console.log('extension unit tests: ok');
})();
