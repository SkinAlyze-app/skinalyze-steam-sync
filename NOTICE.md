# Third-party notices

This extension bundles the following **runtime** dependencies (direct or via webpack). License texts are in each package under `node_modules/` after `npm install`.

| Package | Role in this extension | License (SPDX) |
| --- | --- | --- |
| [@csfloat/cs2-inspect-serializer](https://www.npmjs.com/package/@csfloat/cs2-inspect-serializer) | Decode CS2 inspect links for item metadata | MIT |
| [buffer](https://www.npmjs.com/package/buffer) | Webpack polyfill for Node `Buffer` in the bundle | MIT |
| [base64-js](https://www.npmjs.com/package/base64-js) | Used by `buffer` | MIT |
| [ieee754](https://www.npmjs.com/package/ieee754) | Used by `buffer` | BSD-3-Clause |
| [crc-32](https://www.npmjs.com/package/crc-32) | Used by `@csfloat/cs2-inspect-serializer` | Apache-2.0 |
| [webextension-polyfill](https://www.npmjs.com/package/webextension-polyfill) | Shared Promise-based browser API for Chrome and Firefox | MPL-2.0 |

Development-only tools (TypeScript, webpack, `web-ext`, etc.) are not shipped in either browser extension package.

For security reports, see [SECURITY.md](./SECURITY.md).
