import { buildExtensionApiUrl } from '@/shared/api-url';

declare const __SKINALYZE_API_ORIGIN__: string;

export const API_ORIGIN =
  typeof __SKINALYZE_API_ORIGIN__ !== 'undefined' && __SKINALYZE_API_ORIGIN__
    ? __SKINALYZE_API_ORIGIN__
    : 'http://localhost:3000';

export const CS2_APP_ID = 730;
export const CS2_CONTEXT_ID = 2;

export function extensionApiUrl(path: string): string {
  return buildExtensionApiUrl(API_ORIGIN, path);
}
