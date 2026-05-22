const MAX_INVENTORY_CTN_RETRIES = 10;
const INVENTORY_CTN_RETRY_MS = 500;

function isSkinalyzeOwnedElement(el: Element): boolean {
  const id = el.id || '';
  if (id.startsWith('skinalyze')) return true;
  if (el.classList) {
    for (const c of Array.from(el.classList)) {
      if (c.startsWith('skinalyze')) return true;
    }
  }
  return false;
}

/** True if every mutation in the batch is caused only by SkinAlyze DOM (ignore → no refresh). */
export function mutationsAreOnlySkinalyze(mutations: readonly MutationRecord[]): boolean {
  if (mutations.length === 0) return true;
  return mutations.every((m) => {
    if (m.type === 'attributes') {
      return m.target instanceof Element && isSkinalyzeOwnedElement(m.target);
    }
    if (m.type === 'childList') {
      const elems: Element[] = [];
      m.addedNodes.forEach((n) => {
        if (n.nodeType === Node.ELEMENT_NODE) elems.push(n as Element);
      });
      m.removedNodes.forEach((n) => {
        if (n.nodeType === Node.ELEMENT_NODE) elems.push(n as Element);
      });
      if (elems.length === 0) return false;
      return elems.every(isSkinalyzeOwnedElement);
    }
    return false;
  });
}

export type InventoryMutationHandle = {
  disconnect: () => void;
};

/**
 * Observes inventory DOM changes. Retries if `.inventory_ctn` is not ready.
 * Ignores mutations caused only by SkinAlyze nodes to avoid self-amplification.
 */
export function observeInventoryMutations(onChange: () => void): InventoryMutationHandle {
  let observer: MutationObserver | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retries = 0;

  const disconnect = (): void => {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    observer?.disconnect();
    observer = null;
  };

  const tryAttach = (): void => {
    retryTimer = null;
    const root = document.querySelector('.inventory_ctn');
    if (!root) {
      retries += 1;
      if (retries < MAX_INVENTORY_CTN_RETRIES) {
        retryTimer = setTimeout(tryAttach, INVENTORY_CTN_RETRY_MS);
      }
      return;
    }

    observer = new MutationObserver((mutations) => {
      if (mutationsAreOnlySkinalyze(mutations)) return;
      onChange();
    });
    observer.observe(root, { childList: true, subtree: true });
  };

  tryAttach();

  return { disconnect };
}
