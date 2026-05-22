import { API_ORIGIN } from '@/shared/constants';
import {
  friendlyInventorySyncError,
  friendlyTradeOffersSyncError,
  isProgressSliceActiveInv,
  isProgressSliceActiveTo,
  isProgressSliceVisibleInv,
  isProgressSliceVisibleTo,
} from '@/lib/sync-progress';
import type { ExtensionResponse } from '@/shared/types';
import type { SyncProgressState } from '@/lib/sync-progress';

function send<T>(msg: object): Promise<T> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (r) => resolve(r as T));
  });
}

type ProgressSlice = SyncProgressState['inventory'] | SyncProgressState['tradeOffers'];

type SyncProgressPayload = SyncProgressState;

const pairSection = document.getElementById('pair-section')!;
const statusSection = document.getElementById('status-section')!;
const codeInput = document.getElementById('code') as HTMLInputElement;
const pairBtn = document.getElementById('pair-btn')!;
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

privacyLink.href = `${API_ORIGIN.replace(/\/$/, '')}/privacy`;

/** Bumps on each refreshUi so stale CHECK_EXTENSION_ME cannot overwrite newer status text. */
let connectivityCheckGeneration = 0;

/** Polling started when reopening the popup while a sync is in progress (or terminal grace). */
let resumePollId: ReturnType<typeof setInterval> | null = null;

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

function setActionBusy(busy: boolean): void {
  manualSyncBtn.disabled = busy;
  detectBtn.disabled = busy;
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
    return;
  }
  row.hidden = false;
  fill.style.width = `${Math.min(100, Math.max(0, slice.percent))}%`;
  labelEl.textContent = slice.label || slice.phase;
}

function refreshProgressVisibility(invActive: boolean, toActive: boolean): void {
  const any = invActive || toActive;
  progressPanel.hidden = !any;
}

function startProgressPolling(which: 'inv' | 'offers' | 'both'): ReturnType<typeof setInterval> {
  return window.setInterval(async () => {
    const res = await send<ExtensionResponse>({ type: 'GET_SYNC_PROGRESS' });
    if (!res.ok || !res.data) return;
    const d = res.data as SyncProgressPayload;
    const invOn = which === 'inv' || which === 'both';
    const toOn = which === 'offers' || which === 'both';
    applyProgressRow(invProgressRow, invProgressFill, invProgressLabel, d.inventory, invOn);
    applyProgressRow(toProgressRow, toProgressFill, toProgressLabel, d.tradeOffers, toOn);
    refreshProgressVisibility(
      invOn && isProgressSliceVisibleInv(d.inventory),
      toOn && isProgressSliceVisibleTo(d.tradeOffers)
    );
  }, 220);
}

async function hydrateProgressOnOpen(): Promise<void> {
  stopResumePoll();
  if (!pairSection.hidden) return;

  const res = await send<ExtensionResponse>({ type: 'GET_SYNC_PROGRESS' });
  if (!res.ok || !res.data) return;
  const d = res.data as SyncProgressPayload;

  const invVis = isProgressSliceVisibleInv(d.inventory);
  const toVis = isProgressSliceVisibleTo(d.tradeOffers);
  const invRun = isProgressSliceActiveInv(d.inventory);
  const toRun = isProgressSliceActiveTo(d.tradeOffers);

  applyProgressRow(invProgressRow, invProgressFill, invProgressLabel, d.inventory, true);
  applyProgressRow(toProgressRow, toProgressFill, toProgressLabel, d.tradeOffers, true);
  refreshProgressVisibility(invVis, toVis);
  setActionBusy(invRun || toRun);

  if (!invVis && !toVis) {
    hideAllProgress();
    return;
  }

  resumePollId = window.setInterval(async () => {
    const r = await send<ExtensionResponse>({ type: 'GET_SYNC_PROGRESS' });
    if (!r.ok || !r.data) return;
    const p = r.data as SyncProgressPayload;
    const iv = isProgressSliceVisibleInv(p.inventory);
    const tv = isProgressSliceVisibleTo(p.tradeOffers);
    const ir = isProgressSliceActiveInv(p.inventory);
    const tr = isProgressSliceActiveTo(p.tradeOffers);

    applyProgressRow(invProgressRow, invProgressFill, invProgressLabel, p.inventory, true);
    applyProgressRow(toProgressRow, toProgressFill, toProgressLabel, p.tradeOffers, true);
    refreshProgressVisibility(iv, tv);
    setActionBusy(ir || tr);

    if (!iv && !tv) {
      stopResumePoll();
      hideAllProgress();
      setActionBusy(false);
      await refreshUi();
    }
  }, 220);
}

function hideAllProgress(): void {
  invProgressRow.hidden = true;
  toProgressRow.hidden = true;
  progressPanel.hidden = true;
  invProgressFill.style.width = '0%';
  toProgressFill.style.width = '0%';
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
  };

  if (!d.paired) {
    pairSection.hidden = false;
    statusSection.hidden = true;
    return;
  }

  pairSection.hidden = true;
  statusSection.hidden = false;
  statusLine.textContent = `Paired${d.user_handle ? ` as ${d.user_handle}` : ''}`;
  let steamText = `Linked Steam ID: ${d.steam_expected ?? '—'}`;
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
  setMsg('Pairing…');
  const res = await send<ExtensionResponse>({ type: 'PAIR', code: codeInput.value });
  if (!res.ok) {
    setMsg(res.error || 'Pair failed', true);
    return;
  }
  codeInput.value = '';
  setMsg('Paired successfully.');
  await refreshUi();
  await hydrateProgressOnOpen();
});

detectBtn.addEventListener('click', async () => {
  setMsg('Checking…');
  const res = await send<ExtensionResponse>({ type: 'DETECT_STEAM' });
  if (!res.ok) {
    setMsg(res.error || 'Failed', true);
    return;
  }
  const d = res.data as { steam_id64?: string | null; match?: boolean | null };
  if (!d.steam_id64) {
    setMsg('Not logged into Steam in this browser.', true);
  } else if (d.match === false) {
    setMsg(`Wrong account (browser: ${d.steam_id64}).`, true);
  } else {
    setMsg(`Steam OK (${d.steam_id64}).`);
  }
  await refreshUi();
});

manualSyncBtn.addEventListener('click', async () => {
  stopResumePoll();
  hideAllProgress();
  setMsg('Starting manual sync (inventory, then trade offers)…');
  setActionBusy(true);
  const poll = startProgressPolling('both');
  try {
    const invRes = await send<ExtensionResponse>({ type: 'SYNC_INVENTORY' });
    if (!invRes.ok) {
      setMsg(friendlyInventorySyncError(invRes.error || 'Inventory sync failed'), true);
      return;
    }
    const invData = invRes.data as {
      total_items?: number;
      skipped_unchanged?: boolean;
      idempotent?: boolean;
    };
    const n = typeof invData.total_items === 'number' ? invData.total_items : null;
    let invSummary: string;
    if (invData.idempotent) {
      invSummary = 'Inventory: skipped (same request already processed).';
    } else if (invData.skipped_unchanged) {
      invSummary = n != null ? `Inventory: no changes (${n} items unchanged).` : 'Inventory: no changes since last sync.';
    } else {
      invSummary = n != null ? `Inventory: synced (${n} items).` : 'Inventory: synced.';
    }

    const toRes = await send<ExtensionResponse>({ type: 'SYNC_TRADE_OFFERS' });
    if (!toRes.ok) {
      setMsg(
        `${invSummary} Trade offers: ${friendlyTradeOffersSyncError((toRes as { error?: string }).error || 'Sync failed')}`,
        true
      );
      return;
    }
    const toData = toRes.data as { count?: number };
    setMsg(`${invSummary} Trade offers: synced (${toData.count ?? 0}).`);
  } finally {
    clearInterval(poll);
    hideAllProgress();
    setActionBusy(false);
    await refreshUi();
  }
});

void refreshUi().then(() => void hydrateProgressOnOpen());
