import { INVENTORY_ITEM } from '@/content/selectors';

export const DATA_SKINALYZE_BADGE = 'data-skinalyze-badge';
export const DATA_SKINALYZE_ASSET = 'data-skinalyze-asset';

const PROCESSED = DATA_SKINALYZE_BADGE;

export function parseAssetIdFromItemEl(el: Element): string | null {
  const id = el.id || '';
  const m = id.match(/^(\d+)_(\d+)_(\d+)$/);
  if (!m) return null;
  if (m[1] !== '730') return null;
  return m[3] ?? null;
}

export function clearBadges(root: ParentNode = document): void {
  root.querySelectorAll('.skinalyze-badge').forEach((n) => n.remove());
  root.querySelectorAll(`[${PROCESSED}]`).forEach((n) => n.removeAttribute(PROCESSED));
}

const LABEL: Record<string, string> = {
  linked: 'Synced',
  unlinked: 'Not synced',
  pending_review: 'Review',
  conflict: 'Conflict',
};

function badgeClassForStatus(status: string): string {
  const sanitized = status.replace(/[^a-z_]/g, '') || 'unknown';
  return `skinalyze-badge skinalyze-badge--${sanitized}`;
}

/** Create and append a badge; caller must ensure no duplicate for this item. */
export function applyBadge(el: Element, status: string, assetId: string): void {
  const slot = el as HTMLElement;
  const b = document.createElement('div');
  b.className = badgeClassForStatus(status);
  b.setAttribute(DATA_SKINALYZE_ASSET, assetId);
  b.title = LABEL[status] || status;
  b.setAttribute('aria-label', LABEL[status] || status);
  const short =
    status === 'linked'
      ? 'L'
      : status === 'unlinked'
        ? 'U'
        : status === 'pending_review'
          ? '!'
          : status === 'conflict'
            ? '×'
            : '?';
  b.textContent = short;
  slot.appendChild(b);
  el.setAttribute(PROCESSED, '1');
}

/**
 * Incremental badge sync: add/update/remove only what changed vs current visible items.
 * Does not clear all badges first (avoids unnecessary full DOM rewrites).
 */
export function updateBadges(
  assetToEl: Map<string, HTMLElement>,
  statuses: Record<string, string>,
  root: ParentNode = document,
): void {
  const visible = new Set(assetToEl.keys());

  root.querySelectorAll('.skinalyze-badge').forEach((node) => {
    const parent = node.parentElement;
    const aid =
      node.getAttribute(DATA_SKINALYZE_ASSET) ??
      (parent ? parseAssetIdFromItemEl(parent) : null);
    if (!aid || !visible.has(aid)) {
      node.remove();
      if (parent) parent.removeAttribute(PROCESSED);
    }
  });

  for (const [aid, el] of assetToEl) {
    const st = statuses[aid] ?? 'unlinked';
    const expectedClass = badgeClassForStatus(st);
    const existing = el.querySelector('.skinalyze-badge') as HTMLElement | null;

    if (existing) {
      const currentAid = existing.getAttribute(DATA_SKINALYZE_ASSET);
      if (currentAid === aid && existing.className === expectedClass) {
        continue;
      }
      existing.remove();
      el.removeAttribute(PROCESSED);
    }

    applyBadge(el, st, aid);
  }
}

export function collectItemElements(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll(INVENTORY_ITEM)) as HTMLElement[];
}
