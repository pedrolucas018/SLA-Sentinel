import {
  checkHealth,
  fetchOrdens,
  createOrdem,
  updateStatusOrdem,
  sendTelemetria,
  isSimulatedOffline,
  setSimulatedOffline
} from './api.js';
import {
  getOfflineQueue,
  enqueueStatusUpdate,
  getPendingMap,
  syncOfflineQueue
} from './offlineQueue.js';

let cachedData = {
  resumo: { total_abertas: 0, criticas_ou_estouradas: 0, concluidas_no_prazo_pct: 100 },
  dados: []
};
let isOnline = true;

// Elementos do DOM
const tbody = document.getElementById('ordens-tbody');
const kpiAbertas = document.getElementById('kpi-abertas');
const kpiCriticas = document.getElementById('kpi-criticas');
const kpiSlaPct = document.getElementById('kpi-sla-pct');
const connectionBadge = document.getElementById('connection-badge');
const connectionText = document.getElementById('connection-text');
const btnToggleOffline = document.getElementById('btn-toggle-offline');

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const colors = {
    info: 'bg-slate-800 border-slate-700 text-slate-100',
    success: 'bg-emerald-950 border-emerald-500/50 text-emerald-200',
    warning: 'bg-amber-950 border-amber-500/50 text-amber-200',
    error: 'bg-red-950 border-red-500/50 text-red-200'
  };

  const el = document.createElement('div');
  el.className = `toast-enter border px-4 py-3 rounded-lg shadow-lg text-xs font-medium ${colors[type] || colors.info}`;
  el.textContent = message;
  container.appendChild(el);

  setTimeout(() => {
    el.remove();
  }, 4500);
}

function updateConnectionUI() {
  const pendingCount = getOfflineQueue().length;

  if (isOnline && !isSimulatedOffline()) {
    connectionBadge.className =
      'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
    connectionText.textContent =
      pendingCount > 0 ? `Online (Sincronizando ${pendingCount}...)` : 'Sistema Online';
    btnToggleOffline.textContent = 'Simular Queda de Rede';
  } else {
    connectionBadge.className =
      'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/30';
    connectionText.textContent = `Modo Offline (${pendingCount} na fila local)`;
    btnToggleOffline.textContent = 'Restaurar Conexão';
  }
}

function getRiskBadge(nivel) {
  const map = {
    ESTOURADO: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    CRITICO: 'bg-red-500/20 text-red-300 border-red-500/40',
    ALERTA: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    NORMAL: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    CONCLUIDA: 'bg-slate-800 text-slate-400 border-slate-700'
  };
  return `<span class="px-2 py-0.5 rounded text-[11px] font-semibold border ${map[nivel] || map.NORMAL}">${nivel}</span>`;
}

function getProgressBarColor(nivel) {
  if (nivel === 'ESTOURADO') return 'bg-purple-500';
  if (nivel === 'CRITICO') return 'bg-red-500';
  if (nivel === 'ALERTA') return 'bg-amber-400';
  if (nivel === 'CONCLUIDA') return 'bg-slate-500';
  return 'bg-emerald-500';
}

function renderDashboard() {
  const pendingMap = getPendingMap();

  // Aplica atualizações otimistas da fila offline sobre os dados em cache
  const mergedDados = cachedData.dados.map((os) => {
    const pending = pendingMap.get(os.id);
    if (!pending) return os;
    return {
      ...os,
      status: pending.status,
      nivel_risco: pending.status === 'CONCLUIDA' ? 'CONCLUIDA' : os.nivel_risco,
      _pendingSync: true
    };
  });

  kpiAbertas.textContent = cachedData.resumo.total_abertas;
  kpiCriticas.textContent = cachedData.resumo.criticas_ou_estouradas;
  kpiSlaPct.textContent = `${cachedData.resumo.concluidas_no_prazo_pct}%`;

  if (mergedDados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-500 text-xs">Nenhuma Ordem de Serviço encontrada com os filtros atuais.</td></tr>`;
    return;
  }

  tbody.innerHTML = mergedDados
    .map((os) => {
      const pctClamped = Math.min(100, os.percentual_sla_consumido);
      const barColor = getProgressBarColor(os.nivel_risco);

      const syncTag = os._pendingSync
        ? `<span class="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40">⏳ Aguardando Sincronização</span>`
        : '';

      const actionsHtml =
        os.status === 'CONCLUIDA'
          ? `<span class="text-xs text-slate-500">Finalizada</span>`
          : `
            <div class="flex items-center justify-end gap-2">
              ${
                os.status === 'ABERTA'
                  ? `<button data-action="despachar" data-id="${os.id}" class="px-2.5 py-1 rounded bg-sky-600/20 hover:bg-sky-600/40 text-sky-300 border border-sky-500/30 text-xs cursor-pointer">Despachar</button>`
                  : ''
              }
              <button data-action="concluir" data-id="${os.id}" class="px-2.5 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/30 text-xs cursor-pointer">Concluir OS</button>
            </div>
          `;

      return `
        <tr class="hover:bg-slate-800/40 transition">
          <td class="py-3.5 px-4">
            <div class="font-semibold text-white text-xs">${os.protocolo}</div>
            <div class="text-xs text-slate-400 font-mono">${os.ativo_codigo}</div>
          </td>
          <td class="py-3.5 px-4">
            <div class="text-xs text-slate-200 font-medium">${os.bairro}</div>
            <div class="text-[11px] text-slate-400">${os.tipo_falha} • Crit. ${os.criticidade}</div>
          </td>
          <td class="py-3.5 px-4">
            ${getRiskBadge(os.nivel_risco)}
          </td>
          <td class="py-3.5 px-4">
            <div class="flex justify-between text-[11px] mb-1">
              <span class="text-slate-300 font-medium">${os.percentual_sla_consumido}%</span>
              <span class="text-slate-500">${os.minutos_decorridos}/${os.prazo_sla_minutos} min</span>
            </div>
            <div class="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div class="h-full ${barColor} sla-bar-transition" style="width: ${pctClamped}%"></div>
            </div>
          </td>
          <td class="py-3.5 px-4 text-xs">
            <span class="text-slate-300">${os.status}</span>
            ${syncTag}
          </td>
          <td class="py-3.5 px-4 text-right">
            ${actionsHtml}
          </td>
        </tr>
      `;
    })
    .join('');
}

async function loadData() {
  const filtros = {
    status: document.getElementById('filter-status').value,
    risco: document.getElementById('filter-risco').value,
    bairro: document.getElementById('filter-bairro').value.trim()
  };

  try {
    const data = await fetchOrdens(filtros);
    cachedData = data;
    isOnline = true;
  } catch (_) {
    isOnline = false;
  }

  updateConnectionUI();
  renderDashboard();
}

async function handleStatusAction(id, novoStatus) {
  const payload = {
    status: novoStatus,
    concluido_em: novoStatus === 'CONCLUIDA' ? new Date().toISOString() : null
  };

  try {
    await updateStatusOrdem(id, payload);
    showToast(`Ordem #${id} atualizada para ${novoStatus}.`, 'success');
    await loadData();
  } catch (_) {
    // Fallback Offline-First: salva no localStorage e atualiza otimisticamente
    isOnline = false;
    enqueueStatusUpdate({ id, ...payload });
    updateConnectionUI();
    renderDashboard();
    showToast('Sem conexão! Ação salva na fila offline e será sincronizada automaticamente.', 'warning');
  }
}

// Eventos da Tabela
tbody.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const action = btn.dataset.action;

  if (action === 'despachar') handleStatusAction(id, 'EM_ANDAMENTO');
  if (action === 'concluir') handleStatusAction(id, 'CONCLUIDA');
});

// Filtros
['filter-status', 'filter-risco'].forEach((id) => {
  document.getElementById(id).addEventListener('change', loadData);
});
document.getElementById('filter-bairro').addEventListener('input', loadData);

// Toggle Simulação Offline
btnToggleOffline.addEventListener('click', async () => {
  const nextState = !isSimulatedOffline();
  setSimulatedOffline(nextState);

  if (nextState) {
    isOnline = false;
    updateConnectionUI();
    showToast('Modo Offline simulado ativado. Ações em campo irão para o localStorage.', 'warning');
  } else {
    showToast('Reconectando ao servidor...', 'info');
    await syncOfflineQueue((count) => {
      showToast(`${count} operação(ões) offline sincronizada(s) com sucesso!`, 'success');
    });
    await loadData();
  }
});

// Botão Simulador IoT
document.getElementById('btn-simular-iot').addEventListener('click', async () => {
  try {
    const res = await sendTelemetria({
      ativo_codigo: 'POSTE-TESTE-01',
      tipo_evento: 'FALHA_TENSAO'
    });
    const isCreated = res.status === 201;
    showToast(res.data.mensagem, isCreated ? 'success' : 'info');
    if (isCreated) await loadData();
  } catch (err) {
    showToast(`Falha ao enviar telemetria: ${err.message}`, 'error');
  }
});

// Modal Nova OS
const modal = document.getElementById('modal-nova-os');
const toggleModal = (open) => {
  modal.classList.toggle('hidden', !open);
  modal.classList.toggle('flex', open);
};

document.getElementById('btn-open-modal').addEventListener('click', () => toggleModal(true));
document.getElementById('btn-close-modal').addEventListener('click', () => toggleModal(false));
document.getElementById('btn-cancel-modal').addEventListener('click', () => toggleModal(false));

document.getElementById('form-nova-os').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const payload = {
    ativo_codigo: formData.get('ativo_codigo'),
    bairro: formData.get('bairro'),
    tipo_falha: formData.get('tipo_falha'),
    criticidade: Number(formData.get('criticidade')),
    prazo_sla_minutos: Number(formData.get('prazo_sla_minutos'))
  };

  try {
    const criada = await createOrdem(payload);
    showToast(`Ordem ${criada.protocolo} registrada com sucesso!`, 'success');
    e.target.reset();
    toggleModal(false);
    await loadData();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Polling leve a cada 5s para sincronização automática e atualização de SLA
setInterval(async () => {
  if (isSimulatedOffline()) return;

  const { online } = await syncOfflineQueue((count) => {
    showToast(`Conexão restabelecida! ${count} ação(ões) offline sincronizada(s).`, 'success');
  });

  if (online) {
    await loadData();
  } else {
    isOnline = false;
    updateConnectionUI();
  }
}, 5000);

// Inicialização
loadData();
