import { browser } from '@/shared/browser-api';

export type BrowserTarget = 'chrome' | 'firefox';

declare const __TARGET_BROWSER__: BrowserTarget | undefined;

export function getBrowserTarget(): BrowserTarget {
  return typeof __TARGET_BROWSER__ === 'string' && __TARGET_BROWSER__ === 'firefox'
    ? 'firefox'
    : 'chrome';
}
export function hasTechnicalDataPermission(dataCollection: readonly string[] | undefined): boolean {
  return dataCollection?.includes('technicalAndInteraction') === true;
}

export async function canTransmitTechnicalData(options?: {
  target?: BrowserTarget;
  getAllPermissions?: () => Promise<{ data_collection?: string[] }>;
}): Promise<boolean> {
  const target = options?.target ?? getBrowserTarget();
  if (target !== 'firefox') return true;

  try {
    const permissions = options?.getAllPermissions
      ? await options.getAllPermissions()
      : await browser.permissions.getAll();
    return hasTechnicalDataPermission(permissions.data_collection);
  } catch {
    // Firefox privacy consent is fail-closed: diagnostics are optional.
    return false;
  }
}
