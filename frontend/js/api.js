const API_BASE = '/api';

let simulatedOffline = false;

export function isSimulatedOffline() {
  return simulatedOffline;
}

export function setSimulatedOffline(value) {
  simulatedOffline = Boolean(value);
}

async function request(endpoint, options = {}) {
  if (simulatedOffline) {
    throw new Error('NETWORK_SIMULATED_OFFLINE');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.erro || `Erro HTTP ${response.status}`);
  }

  return { status: response.status, data };
}

export async function checkHealth() {
  return request('/health');
}

export async function fetchOrdens(filtros = {}) {
  const params = new URLSearchParams();
  if (filtros.status) params.set('status', filtros.status);
  if (filtros.risco) params.set('risco', filtros.risco);
  if (filtros.bairro) params.set('bairro', filtros.bairro);

  const query = params.toString();
  const res = await request(`/ordens${query ? `?${query}` : ''}`);
  return res.data;
}

export async function createOrdem(payload) {
  const res = await request('/ordens', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return res.data;
}

export async function updateStatusOrdem(id, payload) {
  const res = await request(`/ordens/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  return res.data;
}

export async function sendTelemetria(payload) {
  return request('/telemetria', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
