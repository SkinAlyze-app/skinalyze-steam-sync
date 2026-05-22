import '@/content/skinalyze.css';
import { BANNER_HOST_ID } from '@/content/selectors';
import {
  clearBadges,
  collectItemElements,
  parseAssetIdFromItemEl,
  updateBadges,
} from '@/content/badges';
import { mutationsAreOnlySkinalyze, observeInventoryMutations } from '@/content/observer';
import type { ExtensionResponse } from '@/shared/types';

function sendMessage<T>(msg: object): Promise<T> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (r) => resolve(r as T));
  });
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Only one badge refresh at a time (avoids overlapping DOM updates). */
let refreshInFlight = false;
let lastRefreshAt = 0;
/** Sorted visible asset ids; used to skip redundant GET_STATUS / GET_BADGES. */
let lastAssetSignature = '';
/** Minimum time between mutation-driven refreshes (Steam DOM churn). */
const MUTATION_COOLDOWN_MS = 8000;

let inventoryMutationHandle: ReturnType<typeof observeInventoryMutations> | null = null;
let inventoriesObserver: MutationObserver | null = null;
let pageControlsEl: HTMLElement | null = null;
let pageControlsHandler: (() => void) | null = null;

function visibleAssetSignature(): string {
  const ids = collectItemElements()
    .map((el) => parseAssetIdFromItemEl(el))
    .filter((id): id is string => Boolean(id));
  ids.sort();
  return ids.join(',');
}

function showBanner(text: string, variant: 'info' | 'warn'): void {
  let el = document.getElementById(BANNER_HOST_ID);
  if (!el) {
    const host =
      document.querySelector('.inventory_header')?.parentElement ||
      document.querySelector('#inventory_root') ||
      document.body;
    el = document.createElement('div');
    el.id = BANNER_HOST_ID;
    host.insertAdjacentElement('afterbegin', el);
  }
  el.className = variant === 'warn' ? 'skinalyze-banner--warn' : 'skinalyze-banner--info';
  el.textContent = text;
}

function hideBanner(): void {
  document.getElementById(BANNER_HOST_ID)?.remove();
}

function cleanup(): void {
  inventoryMutationHandle?.disconnect();
  inventoryMutationHandle = null;
  inventoriesObserver?.disconnect();
  inventoriesObserver = null;
  if (pageControlsEl && pageControlsHandler) {
    pageControlsEl.removeEventListener('click', pageControlsHandler);
  }
  pageControlsEl = null;
  pageControlsHandler = null;
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

async function refreshBadges(options?: { bypassDedupe?: boolean }): Promise<void> {
  if (refreshInFlight) return;
  const sig = visibleAssetSignature();
  const now = Date.now();
  if (!options?.bypassDedupe) {
    if (now - lastRefreshAt < MUTATION_COOLDOWN_MS) return;
    if (sig === lastAssetSignature && sig !== '') return;
  }

  refreshInFlight = true;
  try {
    await runRefreshBadges();
  } finally {
    refreshInFlight = false;
    lastRefreshAt = Date.now();
    lastAssetSignature = visibleAssetSignature();
  }
}

async function runRefreshBadges(): Promise<void> {
  const status = await sendMessage<ExtensionResponse>({ type: 'GET_STATUS' });
  if (!status.ok || !(status.data as { paired?: boolean })?.paired) {
    clearBadges(document);
    showBanner('SkinAlyze: pair the extension in Settings → Integrations to see item status.', 'info');
    return;
  }

  const pageSteam = await sendMessage<{ ok: boolean; steam?: string }>({ type: 'EXECUTE_PAGE_STEAM' });
  const expected = (status.data as { steam_expected?: string | null })?.steam_expected;
  if (
    pageSteam.ok &&
    expected &&
    pageSteam.steam &&
    pageSteam.steam.length > 3 &&
    pageSteam.steam !== expected
  ) {
    clearBadges(document);
    showBanner(
      'SkinAlyze: wrong Steam account for this profile. Log in as your linked Steam account.',
      'warn',
    );
    return;
  }
  hideBanner();

  const els = collectItemElements();
  const assetToEl = new Map<string, HTMLElement>();
  for (const el of els) {
    const aid = parseAssetIdFromItemEl(el);
    if (aid) assetToEl.set(aid, el);
  }
  const ids = [...assetToEl.keys()];
  if (ids.length === 0) {
    updateBadges(assetToEl, {}, document);
    return;
  }

  const chunk = 120;
  const statuses: Record<string, string> = {};
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const res = await sendMessage<ExtensionResponse>({ type: 'GET_BADGES', assetIds: slice });
    if (!res.ok) break;
    Object.assign(statuses, (res.data as { statuses?: Record<string, string> })?.statuses ?? {});
  }

  updateBadges(assetToEl, statuses, document);
}

function scheduleRefresh(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void refreshBadges();
  }, 2500);
}

let inventoryInitialized = false;

function init(): void {
  if (inventoryInitialized) return;
  inventoryInitialized = true;

  window.addEventListener('pagehide', cleanup);

  void refreshBadges({ bypassDedupe: true });

  inventoryMutationHandle = observeInventoryMutations(() => scheduleRefresh());

  const invRoot = document.getElementById('inventories');
  if (invRoot) {
    inventoriesObserver = new MutationObserver((mutations) => {
      if (mutationsAreOnlySkinalyze(mutations)) return;
      scheduleRefresh();
    });
    inventoriesObserver.observe(invRoot, { attributes: true, subtree: false });
  }

  pageControlsEl = document.getElementById('inventory_pagecontrols');
  if (pageControlsEl) {
    pageControlsHandler = () => scheduleRefresh();
    pageControlsEl.addEventListener('click', pageControlsHandler);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
