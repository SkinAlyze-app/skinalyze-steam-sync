import browserPolyfillImport from 'webextension-polyfill';

/**
 * Promise-based WebExtension API shared by Chrome and Firefox.
 *
 * Firefox exposes this API natively. Chrome is wrapped by Mozilla's
 * webextension-polyfill so callers can use one async contract everywhere.
 */
type BrowserApi = typeof browserPolyfillImport;

const imported = browserPolyfillImport as BrowserApi & { default?: BrowserApi };

export const browser: BrowserApi = imported.runtime ? imported : imported.default ?? imported;
