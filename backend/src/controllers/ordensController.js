const slaService = require('../services/slaService');

function getOrdens(req, res, next) {
  try {
    const { status, risco, bairro } = req.query;
    const resultado = slaService.listarOrdens({ status, risco, bairro });
    return res.status(200).json(resultado);
  } catch (error) {
    next(error);
  }
}

function postOrdem(req, res, next) {
  try {
    const { ativo_codigo, bairro, tipo_falha, criticidade, prazo_sla_minutos } = req.body;

    if (!ativo_codigo || !bairro || !tipo_falha || criticidade === undefined || !prazo_sla_minutos) {
      return res.status(400).json({
        erro: 'Campos obrigatórios: ativo_codigo, bairro, tipo_falha, criticidade, prazo_sla_minutos.'
      });
    }

    const critNum = Number(criticidade);
    if (!Number.isInteger(critNum) || critNum < 1 || critNum > 3) {
      return res.status(400).json({
        erro: 'O campo criticidade deve ser um número inteiro entre 1 e 3.'
      });
    }

    if (Number(prazo_sla_minutos) <= 0) {
      return res.status(400).json({
        erro: 'O campo prazo_sla_minutos deve ser maior que zero.'
      });
    }

    const novaOrdem = slaService.criarOrdem({
      ativo_codigo: String(ativo_codigo).trim(),
      bairro: String(bairro).trim(),
      tipo_falha: String(tipo_falha).trim(),
      criticidade: critNum,
      prazo_sla_minutos: Number(prazo_sla_minutos)
    });

    return res.status(201).json(novaOrdem);
  } catch (error) {
    next(error);
  }
}

function patchStatusOrdem(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { status, concluido_em } = req.body;

    const statusPermitidos = ['ABERTA', 'EM_ANDAMENTO', 'CONCLUIDA'];
    if (!status || !statusPermitidos.includes(String(status).toUpperCase())) {
      return res.status(400).json({
        erro: `Status inválido. Valores aceitos: ${statusPermitidos.join(', ')}.`
      });
    }

    const ordemAtualizada = slaService.atualizarStatusOrdem(id, { status, concluido_em });
    if (!ordemAtualizada) {
      return res.status(404).json({ erro: `Ordem de Serviço com ID ${id} não encontrada.` });
    }

    return res.status(200).json(ordemAtualizada);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getOrdens,
  postOrdem,
  patchStatusOrdem
};
