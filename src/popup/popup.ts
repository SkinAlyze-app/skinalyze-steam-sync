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
import type { ExtensionResponse } from '@/shared/types';
import type { SyncProgressState } from '@/lib/sync-progress';

function send<T>(msg: object): Promise<T> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (r) => resolve(r as T));
  });
}

type ProgressSlice = SyncProgressState['inventory'] | SyncProgressState['tradeOffers'] | SyncProgressState['marketHistory'];
type SyncProgressPayload = SyncProgressState;

const pairSection = document.getElementById('pair-section')!;
const statusSection = document.getElementById('status-section')!;
const codeInput = document.getElementById('code') as HTMLInputElement;
const pairBtn = document.getElementById('pair-btn') as HTMLButtonElement;
const statusLine = document.getElementById('status-line')!;
const steamLine = document.getElementById('steam-line')!;
const detectBtn = document.getElementById('detect-btn') as HTMLButtonElement;
const manualSyncBtn = document.getElementById('manual-sync-btn') as HTMLButtonElement;
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

function updateActionButtons(): void {
  const busy = syncBusy || detectBusy;
  detectBtn.disabled = busy;
  manualSyncBtn.disabled = busy;
  detectBtn.textContent = detectBusy ? 'Checking...' : DETECT_DEFAULT_LABEL;
  manualSyncBtn.textContent = syncBusy ? 'Syncing...' : MANUAL_DEFAULT_LABEL;
  detectBtn.classList.toggle('is-loading', detectBusy);
  manualSyncBtn.classList.toggle('is-loading', syncBusy);
  detectBtn.setAttribute('aria-busy', detectBusy ? 'true' : 'false');
  manualSyncBtn.setAttribute('aria-busy', syncBusy ? 'true' : 'false');
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
  };

  if (!d.paired) {
    pairSection.hidden = false;
    statusSection.hidden = true;
    return;
  }

  pairSection.hidden = true;
  statusSection.hidden = false;
  statusLine.textContent = `Paired${d.user_handle ? ` as ${d.user_handle}` : ''}`;
  const pairedSteamIds = d.paired_steam_ids ?? [];
  let steamText =
    pairedSteamIds.length > 1
      ? `Linked Steam IDs: ${pairedSteamIds.join(', ')}`
      : `Linked Steam ID: ${d.steam_expected ?? pairedSteamIds[0] ?? '-'}`;
  if (d.last_sync_at) {
    steamText += ` · Last sync: ${new Date(d.last_sync_at).toLocaleString()}`;
  }
  if (d.steam_match === false) {
    steamText += ' · Steam session may not match (use Check Steam login).';
  }
  steamLine.textContent = steamText;

  if (d.last_error) {
    setMsg(friendlyInventorySyncError(d.last_error), true);
  } else {
    setMsg('');
    void send<ExtensionResponse>({ type: 'CHECK_EXTENSION_ME' }).then((ping) => {
      if (thisRefreshGen !== connectivityCheckGeneration) return;
      if (!ping.ok || !(ping.data as { me_ok?: boolean })?.me_ok) {
        setMsg('Could not reach SkinAlyze (check API URL used when building the extension).', true);
      }
    });
  }
}

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

  setMsg('Starting manual sync...');
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
