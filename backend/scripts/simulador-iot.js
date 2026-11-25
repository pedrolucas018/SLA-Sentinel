/**
 * Passo 5: Simulador CLI de Telemetria IoT
 * Dispara 3 alertas consecutivos de um sensor para demonstrar a deduplicação
 * e a abertura automática de Ordem de Serviço na 3ª ocorrência.
 *
 * Uso: node backend/scripts/simulador-iot.js [CODIGO_POSTE]
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3000/api';
const ativoCodigo = process.argv[2] || `POSTE-IOT-${Math.floor(1000 + Math.random() * 9000)}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function executarSimulacao() {
  console.log('====================================================');
  console.log(`📡 Iniciando simulação IoT para o ativo: ${ativoCodigo}`);
  console.log('====================================================\n');

  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    console.log(`[Pulso ${tentativa}/3] Enviando alerta FALHA_TENSAO...`);

    try {
      const response = await fetch(`${BASE_URL}/telemetria`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ativo_codigo: ativoCodigo,
          tipo_evento: 'FALHA_TENSAO'
        })
      });

      const data = await response.json();
      console.log(`  ↳ HTTP ${response.status} | Ação: ${data.acao}`);
      console.log(`  ↳ Mensagem: ${data.mensagem}`);
      if (data.os_gerada) {
        console.log(`  ✅ OS Criada: ${data.os_gerada.protocolo} (ID #${data.os_gerada.id})`);
      }
    } catch (error) {
      console.error(`  ❌ Falha ao conectar em ${BASE_URL}. Certifique-se de que o servidor está rodando.`);
      process.exit(1);
    }

    console.log('');
    if (tentativa < 3) await sleep(800);
  }

  console.log('Simulação concluída! Atualize o painel web para visualizar a nova OS.');
}

executarSimulacao();
