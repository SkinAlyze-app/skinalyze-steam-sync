import { API_ORIGIN } from '@/shared/constants';
import {
  friendlyInventorySyncError,
  isProgressSliceActiveInv,
  isProgressSliceActiveMh,
  isProgressSliceActiveTo,
  isProgressSliceVisibleInv,
  isProgressSliceVisibleMh,
  isProgressSliceVisibleTo,
} from '@/lib/sync-progress';
import { browser } from '@/shared/browser-api';
import type { ExtensionResponse } from '@/shared/types';
import type { SyncProgressState } from '@/lib/sync-progress';

async function send<T>(msg: object): Promise<T> {
  return await browser.runtime.sendMessage(msg) as T;
}

type ProgressSlice = SyncProgressState['inventory'] | SyncProgressState['tradeOffers'] | SyncProgressState['marketHistory'];
type SyncProgressPayload = SyncProgressState;
type ExtensionMePayload = {
  workspace_name?: string | null;
  workspace_type?: string | null;
  inventory_assets_count?: number | null;
  last_inventory_total?: number | null;
  trade_offers_count?: number | null;
  active_trade_offers_count?: number | null;
  market_history_rows_count?: number | null;
  pending_market_history_rows_count?: number | null;
};

const pairSection = document.getElementById('pair-section')!;
const statusSection = document.getElementById('status-section')!;
const codeInput = document.getElementById('code') as HTMLInputElement;
const pairBtn = document.getElementById('pair-btn') as HTMLButtonElement;
const statusLine = document.getElementById('status-line')!;
const steamLine = document.getElementById('steam-line')!;
const healthGrid = document.getElementById('health-grid')!;
const healthWorkspace = document.getElementById('health-workspace')!;
const healthInventory = document.getElementById('health-inventory')!;
const healthOffers = document.getElementById('health-offers')!;
const healthMarket = document.getElementById('health-market')!;
const detectBtn = document.getElementById('detect-btn') as HTMLButtonElement;
const manualSyncBtn = document.getElementById('manual-sync-btn') as HTMLButtonElement;
const steamSyncToggle = document.getElementById('steam-sync-toggle') as HTMLInputElement;
const msg = document.getElementById('msg')!;
const privacyLink = document.getElementById('privacy-link') as HTMLAnchorElement;

const progressPanel = document.getElementById('progress-panel')!;
const invProgressRow = document.getElementById('inv-progress-row')!;
const invProgressFill = document.getElementById('inv-progress-fill')!;
const invProgressLabel = document.getElementById('inv-progress-label')!;
const toProgressRow = document.getElementById('to-progress-row')!;
const toProgressFill = document.getElementById('to-progress-fill')!;
const toProgressLabel = document.getElementById('to-progress-label')!;
const mhProgressRow = document.getElementById('mh-progress-row')!;
const mhProgressFill = document.getElementById('mh-progress-fill')!;
const mhProgressLabel = document.getElementById('mh-progress-label')!;

const DETECT_DEFAULT_LABEL = 'Check Steam login';
const MANUAL_DEFAULT_LABEL = 'Manual sync';

privacyLink.href = `${API_ORIGIN.replace(/\/$/, '')}/privacy`;

/** Bumps on each refreshUi so stale CHECK_EXTENSION_ME cannot overwrite newer status text. */
let connectivityCheckGeneration = 0;

/** Polling started when reopening the popup while a sync is in progress (or terminal grace). */
let resumePollId: ReturnType<typeof setInterval> | null = null;
let syncBusy = false;
let detectBusy = false;
let steamSyncEnabled = true;
let steamSyncSaving = false;
let activeSteamId64: string | null = null;

function stopResumePoll(): void {
  if (resumePollId != null) {
    clearInterval(resumePollId);
    resumePollId = null;
  }
}

function setMsg(text: string, err = false, warn = false): void {
  const normalized = text == null ? '' : String(text);
  msg.textContent = normalized === 'undefined' ? 'Something went wrong. Try again.' : normalized;
  msg.className = 'small';
  if (err) msg.classList.add('err');
  else if (warn) msg.classList.add('warn');
}

function formatCompactCount(value: number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}

function renderExtensionHealth(data: ExtensionMePayload | null): void {
  if (!data) {
    healthGrid.hidden = true;
    return;
  }

  const workspaceName = data.workspace_name?.trim() || 'Workspace';
  const workspaceType = data.workspace_type ? ` · ${data.workspace_type.replace('_', ' ')}` : '';
  const inventoryCount = data.inventory_assets_count ?? data.last_inventory_total ?? null;
  const offerCount = data.trade_offers_count ?? null;
  const activeOffers = Number(data.active_trade_offers_count) || 0;
  const marketRows = data.market_history_rows_count ?? null;
  const pendingMarketRows = Number(data.pending_market_history_rows_count) || 0;

  healthWorkspace.textContent = `${workspaceName}${workspaceType}`;
  healthInventory.textContent = `${formatCompactCount(inventoryCount)} items`;
  healthOffers.textContent = activeOffers > 0
    ? `${formatCompactCount(offerCount)} total · ${formatCompactCount(activeOffers)} active`
    : `${formatCompactCount(offerCount)} total`;
  healthMarket.textContent = pendingMarketRows > 0
    ? `${formatCompactCount(marketRows)} rows · ${formatCompactCount(pendingMarketRows)} pending`
    : `${formatCompactCount(marketRows)} rows`;
  healthGrid.hidden = false;
}

function updateActionButtons(): void {
  const busy = syncBusy || detectBusy;
  detectBtn.disabled = busy || steamSyncSaving;
  manualSyncBtn.disabled = busy || steamSyncSaving || !steamSyncEnabled;
  steamSyncToggle.disabled = syncBusy || steamSyncSaving;
  detectBtn.textContent = detectBusy ? 'Checking...' : DETECT_DEFAULT_LABEL;
  manualSyncBtn.textContent = syncBusy ? 'Syncing...' : steamSyncEnabled ? MANUAL_DEFAULT_LABEL : 'Steam sync off';
  detectBtn.classList.toggle('is-loading', detectBusy);
  manualSyncBtn.classList.toggle('is-loading', syncBusy);
  detectBtn.setAttribute('aria-busy', detectBusy ? 'true' : 'false');
  manualSyncBtn.setAttribute('aria-busy', syncBusy ? 'true' : 'false');
  steamSyncToggle.setAttribute('aria-busy', steamSyncSaving ? 'true' : 'false');
}

function setSyncBusy(busy: boolean): void {
  syncBusy = busy;
  statusSection.classList.toggle('is-syncing', busy);
  updateActionButtons();
}

function setDetectBusy(busy: boolean): void {
  detectBusy = busy;
  updateActionButtons();
}

function applyProgressRow(
  row: HTMLElement,
  fill: HTMLElement,
  labelEl: HTMLElement,
  slice: ProgressSlice,
  active: boolean
): void {
  if (!active || slice.phase === 'idle') {
    row.hidden = true;
    row.classList.remove('is-terminal', 'is-failed');
    return;
  }
  row.hidden = false;
  row.classList.toggle('is-terminal', slice.phase === 'completed' || slice.phase === 'failed');
  row.classList.toggle('is-failed', slice.phase === 'failed');
  fill.style.width = `${Math.min(100, Math.max(0, slice.percent))}%`;
  labelEl.textContent = slice.label || slice.phase;
}

function refreshProgressVisibility(invVisible: boolean, toVisible: boolean, mhVisible: boolean, active: boolean): void {
  const any = invVisible || toVisible || mhVisible;
  progressPanel.hidden = !any;
  progressPanel.classList.toggle('is-active', active);
}

function hideAllProgress(): void {
  invProgressRow.hidden = true;
  toProgressRow.hidden = true;
  mhProgressRow.hidden = true;
  progressPanel.hidden = true;
  progressPanel.classList.remove('is-active');
  invProgressFill.style.width = '0%';
  toProgressFill.style.width = '0%';
  mhProgressFill.style.width = '0%';
}

async function renderProgressFromBackground(): Promise<{ visible: boolean; active: boolean } | null> {
  const res = await send<ExtensionResponse>({ type: 'GET_SYNC_PROGRESS' });
  if (!res.ok || !res.data) return null;

  const d = res.data as SyncProgressPayload;
  const invVisible = isProgressSliceVisibleInv(d.inventory);
  const toVisible = isProgressSliceVisibleTo(d.tradeOffers);
  const mhVisible = isProgressSliceVisibleMh(d.marketHistory);
  const invActive = isProgressSliceActiveInv(d.inventory);
  const toActive = isProgressSliceActiveTo(d.tradeOffers);
  const mhActive = isProgressSliceActiveMh(d.marketHistory);
  const active = invActive || toActive || mhActive;

  applyProgressRow(invProgressRow, invProgressFill, invProgressLabel, d.inventory, true);
  applyProgressRow(toProgressRow, toProgressFill, toProgressLabel, d.tradeOffers, true);
  applyProgressRow(mhProgressRow, mhProgressFill, mhProgressLabel, d.marketHistory, true);
  refreshProgressVisibility(invVisible, toVisible, mhVisible, active);

  return { visible: invVisible || toVisible || mhVisible, active };
}

function startProgressMonitor(startupGraceMs = 0): void {
  stopResumePoll();
  const startedAt = Date.now();

  void renderProgressFromBackground();
  resumePollId = window.setInterval(async () => {
    const progress = await renderProgressFromBackground();
    if (!progress) return;

    const insideStartupGrace = Date.now() - startedAt < startupGraceMs;
    setSyncBusy(progress.active || (insideStartupGrace && syncBusy));
    if (!progress.visible && !insideStartupGrace) {
      stopResumePoll();
      hideAllProgress();
      setSyncBusy(false);
      await refreshUi();
    }
  }, 220);
}

async function hydrateProgressOnOpen(): Promise<void> {
  stopResumePoll();
  if (!pairSection.hidden) return;

  const progress = await renderProgressFromBackground();
  if (!progress?.visible) {
    hideAllProgress();
    setSyncBusy(false);
    return;
  }

  setSyncBusy(progress.active);
  startProgressMonitor();
}

async function refreshUi(): Promise<void> {
  connectivityCheckGeneration += 1;
  const thisRefreshGen = connectivityCheckGeneration;
  const res = await send<ExtensionResponse>({ type: 'GET_STATUS' });

  if (!res.ok) {
    pairSection.hidden = false;
    statusSection.hidden = true;
    activeSteamId64 = null;
    steamSyncEnabled = true;
    renderExtensionHealth(null);
    updateActionButtons();
    return;
  }
  const d = res.data as {
    paired?: boolean;
    user_handle?: string | null;
    steam_expected?: string | null;
    last_sync_at?: string | null;
    last_steam_detected?: string | null;
    steam_match?: boolean | null;
    last_error?: string | null;
    paired_steam_ids?: string[];
    pairing_count?: number;
    steam_sync_enabled?: boolean;
  };

  if (!d.paired) {
    pairSection.hidden = false;
    statusSection.hidden = true;
    activeSteamId64 = null;
    steamSyncEnabled = true;
    renderExtensionHealth(null);
    updateActionButtons();
    return;
  }

  pairSection.hidden = true;
  statusSection.hidden = false;
  statusLine.textContent = `Paired${d.user_handle ? ` as ${d.user_handle}` : ''}`;
  const pairedSteamIds = d.paired_steam_ids ?? [];
  activeSteamId64 = d.steam_expected ?? pairedSteamIds[0] ?? null;
  const statusSteamSyncEnabled = d.steam_sync_enabled !== false;
  if (!steamSyncSaving) {
    steamSyncEnabled = statusSteamSyncEnabled;
    steamSyncToggle.checked = statusSteamSyncEnabled;
  }
  updateActionButtons();

  let steamText =
    pairedSteamIds.length > 1
      ? `Linked Steam accounts: ${pairedSteamIds.join(', ')}`
      : `Linked Steam account: ${d.steam_expected ?? pairedSteamIds[0] ?? '-'}`;
  if (d.last_sync_at) {
    steamText += ` · Last sync: ${new Date(d.last_sync_at).toLocaleString()}`;
  }
  if (d.steam_match === false) {
    steamText += ' · Steam session may not match (use Check Steam login).';
  }
  steamLine.textContent = steamText;

  void send<ExtensionResponse>({ type: 'CHECK_EXTENSION_ME' }).then((ping) => {
    if (thisRefreshGen !== connectivityCheckGeneration) return;
    const pingData = ping.ok ? (ping.data as { me_ok?: boolean; data?: ExtensionMePayload } | undefined) : undefined;
    if (!ping.ok || !pingData?.me_ok) {
      renderExtensionHealth(null);
      if (steamSyncEnabled && !d.last_error) {
        setMsg('Could not reach SkinAlyze. Check the server address used when building the extension.', true);
      }
      return;
    }
    renderExtensionHealth(pingData.data ?? null);
  });

  if (!steamSyncEnabled) {
    setMsg('Steam sync is off. Manual and automatic sync are paused.', false, true);
  } else if (d.last_error) {
    setMsg(friendlyInventorySyncError(d.last_error), true);
  } else {
    setMsg('');
  }
}

steamSyncToggle.addEventListener('change', async () => {
  if (syncBusy) {
    steamSyncToggle.checked = steamSyncEnabled;
    return;
  }

  const previous = steamSyncEnabled;
  const next = steamSyncToggle.checked;
  steamSyncSaving = true;
  steamSyncEnabled = next;
  updateActionButtons();
  setMsg(next ? 'Enabling Steam sync...' : 'Disabling Steam sync...', false, !next);

  try {
    const res = await send<ExtensionResponse>({
      type: 'SET_STEAM_SYNC_ENABLED',
      enabled: next,
      steamId64: activeSteamId64,
    });
    if (!res.ok) {
      steamSyncEnabled = previous;
      steamSyncToggle.checked = previous;
      setMsg(res.error || 'Could not save Steam sync setting.', true);
      return;
    }

    const data = res.data as { steam_sync_enabled?: boolean } | undefined;
    steamSyncEnabled = data?.steam_sync_enabled !== false;
    steamSyncToggle.checked = steamSyncEnabled;
    setMsg(
      steamSyncEnabled ? 'Steam sync enabled.' : 'Steam sync is off. Manual and automatic sync are paused.',
      false,
      !steamSyncEnabled
    );
  } finally {
    steamSyncSaving = false;
    updateActionButtons();
  }
});

pairBtn.addEventListener('click', async () => {
  if (pairBtn.disabled) return;
  const originalLabel = pairBtn.textContent || 'Pair';
  pairBtn.disabled = true;
  pairBtn.classList.add('is-loading');
  pairBtn.textContent = 'Pairing...';
  setMsg('Pairing...');
  try {
    const res = await send<ExtensionResponse>({ type: 'PAIR', code: codeInput.value });
    if (!res.ok) {
      setMsg(res.error || 'Pair failed', true);
      return;
    }
    codeInput.value = '';
    setMsg('Paired successfully.');
    await refreshUi();
    await hydrateProgressOnOpen();
  } finally {
    pairBtn.disabled = false;
    pairBtn.classList.remove('is-loading');
    pairBtn.textContent = originalLabel;
  }
});

detectBtn.addEventListener('click', async () => {
  if (detectBusy || syncBusy) return;

  setDetectBusy(true);
  setMsg('Checking...');
  let outcome = '';
  let isError = false;

  try {
    const res = await send<ExtensionResponse>({ type: 'DETECT_STEAM' });
    if (!res.ok) {
      outcome = res.error || 'Failed';
      isError = true;
      return;
    }

    const d = res.data as { steam_id64?: string | null; match?: boolean | null };
    if (!d.steam_id64) {
      outcome = 'Not logged into Steam in this browser.';
      isError = true;
    } else if (d.match === false) {
      outcome = `Wrong account (browser: ${d.steam_id64}).`;
      isError = true;
    } else {
      outcome = `Steam OK (${d.steam_id64}).`;
    }
  } finally {
    setDetectBusy(false);
    await refreshUi();
    if (outcome) setMsg(outcome, isError);
  }
});

manualSyncBtn.addEventListener('click', async () => {
  if (syncBusy || detectBusy) return;
  if (!steamSyncEnabled) {
    setMsg('Turn on Steam sync to run a manual sync.', false, true);
    return;
  }

  setMsg('Starting manual sync in the background. A temporary inactive Steam tab is used only if needed...');
  setSyncBusy(true);

  const res = await send<ExtensionResponse>({ type: 'SYNC_ALL' });
  if (!res.ok) {
    setSyncBusy(false);
    setMsg(res.error || 'Sync failed', true);
    return;
  }

  const data = res.data as { started?: boolean; already_running?: boolean } | undefined;
  setMsg(data?.already_running ? 'Manual sync already running.' : 'Manual sync running...');
  startProgressMonitor(1200);
});

updateActionButtons();
void refreshUi().then(() => void hydrateProgressOnOpen());
