const db = require('../config/database');

const PESO_RISCO = {
  ESTOURADO: 4,
  CRITICO: 3,
  ALERTA: 2,
  NORMAL: 1,
  CONCLUIDA: 0
};

/**
 * Calcula métricas em tempo real e classifica o nível de risco de uma OS.
 */
function enriquecerOrdemComSla(ordem, referenciaMs = Date.now()) {
  const criadoMs = new Date(ordem.criado_em).getTime();
  const fimMs = ordem.status === 'CONCLUIDA' && ordem.concluido_em
    ? new Date(ordem.concluido_em).getTime()
    : referenciaMs;

  const minutosDecorridos = Math.max(0, Math.round((fimMs - criadoMs) / 60000));
  const percentualRaw = (minutosDecorridos / ordem.prazo_sla_minutos) * 100;
  const percentualSlaConsumido = Number(percentualRaw.toFixed(1));

  let nivelRisco = 'NORMAL';

  if (ordem.status === 'CONCLUIDA') {
    nivelRisco = 'CONCLUIDA';
  } else if (percentualSlaConsumido > 100) {
    nivelRisco = 'ESTOURADO';
  } else if (
    percentualSlaConsumido >= 85 ||
    (ordem.criticidade === 3 && percentualSlaConsumido >= 60)
  ) {
    nivelRisco = 'CRITICO';
  } else if (percentualSlaConsumido >= 60) {
    nivelRisco = 'ALERTA';
  }

  return {
    ...ordem,
    minutos_decorridos: minutosDecorridos,
    percentual_sla_consumido: percentualSlaConsumido,
    nivel_risco: nivelRisco
  };
}

/**
 * Gera o próximo protocolo sequencial no formato OS-2026-XXXX.
 */
function gerarProximoProtocolo() {
  const row = db.prepare('SELECT MAX(id) AS maxId FROM ordens_servico').get();
  const proximoNumero = (row?.maxId || 0) + 1;
  return `OS-2026-${String(proximoNumero).padStart(4, '0')}`;
}

/**
 * Lista ordens com filtros opcionais, calcula KPIs operacionais e ordena por prioridade de risco.
 */
function listarOrdens(filtros = {}) {
  const todasBrutas = db.prepare('SELECT * FROM ordens_servico').all();
  const agoraMs = Date.now();
  const todasEnriquecidas = todasBrutas.map((o) => enriquecerOrdemComSla(o, agoraMs));

  const abertas = todasEnriquecidas.filter((o) => o.status !== 'CONCLUIDA');
  const criticasOuEstouradas = abertas.filter(
    (o) => o.nivel_risco === 'CRITICO' || o.nivel_risco === 'ESTOURADO'
  );
  const concluidas = todasEnriquecidas.filter((o) => o.status === 'CONCLUIDA');
  const concluidasNoPrazo = concluidas.filter((o) => o.percentual_sla_consumido <= 100);

  const concluidasNoPrazoPct = concluidas.length > 0
    ? Number(((concluidasNoPrazo.length / concluidas.length) * 100).toFixed(1))
    : 100.0;

  let filtradas = todasEnriquecidas;

  if (filtros.status) {
    const statusUpper = filtros.status.toUpperCase();
    filtradas = filtradas.filter((o) => o.status === statusUpper);
  }

  if (filtros.risco) {
    const riscoUpper = filtros.risco.toUpperCase();
    filtradas = filtradas.filter((o) => o.nivel_risco === riscoUpper);
  }

  if (filtros.bairro) {
    const bairroLower = filtros.bairro.toLowerCase();
    filtradas = filtradas.filter((o) => o.bairro.toLowerCase().includes(bairroLower));
  }

  filtradas.sort((a, b) => {
    const diffRisco = (PESO_RISCO[b.nivel_risco] || 0) - (PESO_RISCO[a.nivel_risco] || 0);
    if (diffRisco !== 0) return diffRisco;
    return b.percentual_sla_consumido - a.percentual_sla_consumido;
  });

  return {
    resumo: {
      total_abertas: abertas.length,
      criticas_ou_estouradas: criticasOuEstouradas.length,
      concluidas_no_prazo_pct: concluidasNoPrazoPct
    },
    dados: filtradas
  };
}

/**
 * Cria uma nova Ordem de Serviço.
 */
function criarOrdem({ ativo_codigo, bairro, tipo_falha, criticidade, prazo_sla_minutos }) {
  const protocolo = gerarProximoProtocolo();
  const criadoEm = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO ordens_servico (
      protocolo, ativo_codigo, bairro, tipo_falha,
      criticidade, status, prazo_sla_minutos, criado_em
    ) VALUES (?, ?, ?, ?, ?, 'ABERTA', ?, ?)
  `);

  const info = stmt.run(
    protocolo,
    ativo_codigo,
    bairro,
    tipo_falha,
    Number(criticidade),
    Number(prazo_sla_minutos),
    criadoEm
  );

  const criada = db.prepare('SELECT * FROM ordens_servico WHERE id = ?').get(info.lastInsertRowid);
  return enriquecerOrdemComSla(criada);
}

/**
 * Atualiza o status de uma Ordem de Serviço (EM_ANDAMENTO ou CONCLUIDA).
 */
function atualizarStatusOrdem(id, { status, concluido_em }) {
  const existente = db.prepare('SELECT * FROM ordens_servico WHERE id = ?').get(id);
  if (!existente) return null;

  const statusUpper = status.toUpperCase();
  const timestampConclusao =
    statusUpper === 'CONCLUIDA' ? (concluido_em || new Date().toISOString()) : null;

  db.prepare(`
    UPDATE ordens_servico
    SET status = ?, concluido_em = ?
    WHERE id = ?
  `).run(statusUpper, timestampConclusao, id);

  const atualizada = db.prepare('SELECT * FROM ordens_servico WHERE id = ?').get(id);
  return enriquecerOrdemComSla(atualizada);
}

module.exports = {
  enriquecerOrdemComSla,
  listarOrdens,
  criarOrdem,
  atualizarStatusOrdem
};
