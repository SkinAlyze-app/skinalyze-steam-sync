import { runInspectMetadataTests } from './test-inspect';
import { runApiUrlTests } from './test-url-config';
import { runMarketHistoryTests } from './test-market-history';
import { runPayloadShapeTests } from './test-message-shapes';
import { runTradeOfferMergeTests } from './test-trade-offer-merge';

runInspectMetadataTests();
runApiUrlTests();
runMarketHistoryTests();
runPayloadShapeTests();
runTradeOfferMergeTests();
console.log('extension unit tests: ok');
