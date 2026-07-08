const aiConnector = require('../ai/aiConnector');
const logger = require('../logger/logger');

const HORIZONTE_VALORES = { minutos: 'minutos', horas: 'horas', dias: 'dias' };

function inferHorizonte(signal) {
  if (signal.signals?.type === 'range_long' || signal.signals?.type === 'range_short') return 'minutos';
  if (signal.strategyType === 'long' && signal.score >= 7) return 'horas';
  if (signal.strategyType === 'short' && signal.score >= 7) return 'horas';
  if (signal.score >= 8) return 'dias';
  return 'horas';
}

async function analyze(signal) {
  const prompt = `
Eres un analista financiero experto en trading de Bitcoin.
Analiza la siguiente oportunidad de trading y genera un análisis estructurado.

Activo: ${signal.asset}
Tipo: ${signal.strategyType === 'long' ? 'LONG (COMPRA)' : 'SHORT (VENTA)'}
Precio actual: $${signal.currentPrice}
Zona de entrada sugerida: ${signal.entryZone}
Objetivo: $${signal.target}
Stop Loss sugerido: $${signal.stopLoss}
Señales técnicas: ${JSON.stringify(signal.signals)}

Responde ÚNICAMENTE con un JSON válido en este formato exacto:
{
  "explicacion": "Explica por qué apareció esta oportunidad, qué factores la apoyan y qué riesgos existen. Máximo 3 oraciones.",
  "factores": ["factor1", "factor2", "factor3"],
  "riesgos": ["riesgo1", "riesgo2"],
  "confianza": 8,
  "horizonte": "horas"
}

Donde confianza es un número del 0 al 10.
Donde horizonte es el tiempo estimado de la operación: "minutos", "horas" o "dias".
  `.trim();

  try {
    const response = await aiConnector.askAgent(prompt);
    if (response && response.success) {
      const jsonMatch = response.respuesta.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const horizonte = HORIZONTE_VALORES[parsed.horizonte] || inferHorizonte(signal);
        return {
          explanation: parsed.explicacion || response.respuesta,
          factors: parsed.factores || [],
          risks: parsed.riesgos || [],
          confidence: typeof parsed.confianza === 'number' ? parsed.confianza : Math.min(10, Math.max(0, Math.round((signal.score || 5) * 0.8 + 1))),
          horizonte
        };
      }
    }
  } catch (error) {
    logger.error('trading-ai', `AI analysis failed: ${error.message}`);
  }

  return {
    explanation: `Oportunidad de ${signal.strategyType === 'long' ? 'compra' : 'venta'} detectada en ${signal.asset} basada en análisis técnico.`,
    factors: [],
    risks: [],
    confidence: Math.min(10, Math.max(0, Math.round((signal.score || 5) * 0.8))),
    horizonte: inferHorizonte(signal)
  };
}

module.exports = { analyze };
