const iotService = require('../services/iotService');

function postTelemetria(req, res, next) {
  try {
    const { ativo_codigo, tipo_evento } = req.body;

    if (!ativo_codigo || !tipo_evento) {
      return res.status(400).json({
        erro: 'Campos obrigatórios: ativo_codigo e tipo_evento.'
      });
    }

    const resultado = iotService.processarTelemetria({
      ativo_codigo: String(ativo_codigo).trim(),
      tipo_evento: String(tipo_evento).trim()
    });

    return res.status(resultado.statusCode).json(resultado.payload);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  postTelemetria
};
