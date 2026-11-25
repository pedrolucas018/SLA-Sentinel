const db = require('../config/database');
const { criarOrdem } = require('./slaService');

/**
 * Processa eventos de telemetria IoT aplicando janela temporal de 10 minutos
 * e deduplicação contra Ordens de Serviço já ativas para o mesmo ativo.
 */
function processarTelemetria({ ativo_codigo, tipo_evento }) {
  const agora = new Date();
  const agoraIso = agora.toISOString();
  const dezMinutosAtrasIso = new Date(agora.getTime() - 10 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO logs_telemetria (ativo_codigo, tipo_evento, recebido_em)
    VALUES (?, ?, ?)
  `).run(ativo_codigo, tipo_evento, agoraIso);

  const { totalEventos } = db.prepare(`
    SELECT COUNT(*) AS totalEventos
    FROM logs_telemetria
    WHERE ativo_codigo = ?
      AND recebido_em >= ?
  `).get(ativo_codigo, dezMinutosAtrasIso);

  const osAtiva = db.prepare(`
    SELECT id, protocolo
    FROM ordens_servico
    WHERE ativo_codigo = ?
      AND status IN ('ABERTA', 'EM_ANDAMENTO')
    LIMIT 1
  `).get(ativo_codigo);

  if (totalEventos >= 3 && !osAtiva) {
    const novaOs = criarOrdem({
      ativo_codigo,
      bairro: 'Setor Monitorado IoT',
      tipo_falha: tipo_evento,
      criticidade: 2,
      prazo_sla_minutos: 180
    });

    return {
      statusCode: 201,
      payload: {
        acao: 'OS_CRIADA',
        mensagem: 'Falha recorrente confirmada. Ordem de Serviço aberta automaticamente.',
        os_gerada: {
          id: novaOs.id,
          protocolo: novaOs.protocolo,
          ativo_codigo: novaOs.ativo_codigo
        }
      }
    };
  }

  const motivo = osAtiva
    ? `Já existe OS ativa (${osAtiva.protocolo}) para este sensor. Evento anexado ao histórico.`
    : `Alerta registrado (${totalEventos}/3 nos últimos 10 min). Aguardando confirmação para evitar falso positivo.`;

  return {
    statusCode: 200,
    payload: {
      acao: 'OBSERVACAO',
      mensagem: motivo,
      os_gerada: null
    }
  };
}

module.exports = {
  processarTelemetria
};
