import { checkHealth, updateStatusOrdem } from './api.js';

const STORAGE_KEY = 'sla_sentinel_offline_queue';

export function getOfflineQueue() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function saveOfflineQueue(queue) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export function enqueueStatusUpdate(item) {
  const queue = getOfflineQueue().filter((entry) => entry.id !== item.id);
  queue.push(item);
  saveOfflineQueue(queue);
  return queue.length;
}

export function getPendingMap() {
  const map = new Map();
  for (const item of getOfflineQueue()) {
    map.set(item.id, item);
  }
  return map;
}

/**
 * Tenta sincronizar todos os itens pendentes com a API quando o servidor estiver acessível.
 */
export async function syncOfflineQueue(onSyncedCallback) {
  const queue = getOfflineQueue();
  if (queue.length === 0) return { online: true, syncedCount: 0 };

  try {
    await checkHealth();
  } catch (_) {
    return { online: false, syncedCount: 0 };
  }

  let syncedCount = 0;
  const remaining = [];

  for (const item of queue) {
    try {
      await updateStatusOrdem(item.id, {
        status: item.status,
        concluido_em: item.concluido_em
      });
      syncedCount += 1;
    } catch (_) {
      remaining.push(item);
    }
  }

  saveOfflineQueue(remaining);

  if (syncedCount > 0 && typeof onSyncedCallback === 'function') {
    onSyncedCallback(syncedCount);
  }

  return { online: true, syncedCount };
}
