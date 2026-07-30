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

function calcularSemaforo(score, confidence) {
  const nivel = Math.min(score, confidence);
  if (score >= 8 && confidence >= 8) return 'VERDE';
  if (nivel >= 7) return 'AMARILLO';
  return 'ROJO';
}

function construirDatos(signal) {
  const tipo = signal.strategyType === 'long' ? 'LONG (COMPRA)' : 'SHORT (VENTA)';
  const zona = signal.zone_type
    ? `Zona ${signal.zone_type}${signal.zone_mid ? ` media: $${signal.zone_mid}` : ''}${signal.zone_strength ? ` (fuerza ${signal.zone_strength}/10)` : ''}`
    : null;
  const soporte = signal.support_zone ? `Soporte: $${signal.support_zone}` : null;
  const resistencia = signal.resistance_zone ? `Resistencia: $${signal.resistance_zone}` : null;
  const partes = [
    `Activo: ${signal.asset}`,
    `Tipo: ${tipo}`,
    `Precio actual: $${signal.currentPrice}`,
    `Entrada: ${signal.entryZone}`,
    `Objetivo: $${signal.target}`,
    signal.stopLoss ? `Stop Loss: $${signal.stopLoss}` : null,
    signal.rsi ? `RSI: ${signal.rsi}` : null,
    signal.sma_20 ? `SMA20: ${signal.sma_20}` : null,
    signal.sma_50 ? `SMA50: ${signal.sma_50}` : null,
    signal.ema_50 ? `EMA50: ${signal.ema_50}` : null,
    signal.atr ? `ATR: ${signal.atr}` : null,
    signal.distance_pct ? `Distancia: ${signal.distance_pct}%` : null,
    soporte,
    resistencia,
    zona,
    signal.fib_levels ? `Nivel Fib: ${signal.fib_levels}` : null,
  ].filter(Boolean);
  return partes.join('\n');
}

function fallbackInteligente(signal, semaforo) {
  const tipo = signal.strategyType === 'long' ? 'compra' : 'venta';
  const indicadores = [];
  if (signal.rsi) indicadores.push(`RSI en ${signal.rsi}`);
  if (signal.support_zone) indicadores.push(`soporte en $${signal.support_zone}`);
  if (signal.resistance_zone) indicadores.push(`resistencia en $${signal.resistance_zone}`);
  if (signal.zone_type) indicadores.push(`zona ${signal.zone_type}`);
  const textoIndicadores = indicadores.length ? ` Los indicadores muestran: ${indicadores.join(', ')}.` : '';

  if (semaforo === 'ROJO') {
    return {
      veredicto: `Operación de ${tipo} con señales débiles. Score y confianza bajos.${textoIndicadores} No se recomienda operar en este nivel.`,
      zona_actual: signal.zone_type ? `El precio se encuentra en zona ${signal.zone_type}${signal.zone_mid ? ` (media $${signal.zone_mid})` : ''}.` : null,
    };
  }
  if (semaforo === 'AMARILLO') {
    return {
      veredicto: `Señal moderada de ${tipo} con potencial pero requiere precaución.${textoIndicadores} Evaluar gestión de riesgo antes de entrar.`,
      zona_actual: signal.zone_type ? `El precio se encuentra en zona ${signal.zone_type}${signal.zone_mid ? ` (media $${signal.zone_mid})` : ''}.` : null,
    };
  }
  return {
    veredicto: `Oportunidad de ${tipo} con señales favorables.${textoIndicadores} Mantener stop loss y tomar ganancias parciales.`,
    zona_actual: signal.zone_type ? `El precio se encuentra en zona ${signal.zone_type}${signal.zone_mid ? ` (media $${signal.zone_mid})` : ''}.` : null,
  };
}

async function analyze(signal) {
  const score = signal.score || 5;
  const confidence = signal.confidence || 5;
  const semaforo = calcularSemaforo(score, confidence);
  const datos = construirDatos(signal);
  const advertencias = semaforo === 'VERDE' ? 'Incluir advertencias o cautelas aunque sea una buena oportunidad.' : '';

  // Solo usar IA para oportunidades de alta calidad (score >= 7 Y confidence >= 7)
  const usarIA = score >= 5 && confidence >= 4;

  if (usarIA) {
    const datos = construirDatos(signal);
    const advertencias = semaforo === 'VERDE' ? 'Incluir advertencias o cautelas aunque sea una buena oportunidad.' : '';

    const prompt = `
Eres un analista financiero profesional en trading de Bitcoin.
Analiza esta oportunidad y genera un veredicto claro y profesional, fácil de entender.

DATOS DE LA OPERACIÓN:
${datos}

SEMÁFORO: ${semaforo}

INSTRUCCIONES:
- Si el semáforo es ROJO: explica POR QUÉ la operación es débil o riesgosa. Sé claro y directo.
- Si el semáforo es AMARILLO: explica por qué hay que tener precaución, qué factores son favorables y cuáles no.
- Si el semáforo es VERDE: explica por qué es una buena oportunidad, pero incluye advertencias o cautelas.
${advertencias}
- Describe en qué zona del gráfico se encuentra el precio (soporte, resistencia, zona de acumulación, etc.).
- El veredicto debe ser 1-2 oraciones, profesional pero no excesivamente técnico.

Responde ÚNICAMENTE con un JSON válido:
{
  "veredicto": "Texto del veredicto profesional",
  "zona_actual": "Descripción de la zona del gráfico donde está el precio",
  "factores": ["factor1", "factor2"],
  "riesgos": ["riesgo1", "riesgo2"],
  "confianza": 8,
  "horizonte": "horas"
}

Donde confianza es un número del 0 al 10.
Donde horizonte es "minutos", "horas" o "dias".
  `.trim();

    try {
      const response = await aiConnector.callAI(prompt);
      if (response) {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const horizonte = HORIZONTE_VALORES[parsed.horizonte] || inferHorizonte(signal);
          return {
            explanation: parsed.veredicto || parsed.explicacion || '',
            zona_actual: parsed.zona_actual || null,
            factors: parsed.factores || [],
            risks: parsed.riesgos || [],
            confidence: typeof parsed.confianza === 'number' ? parsed.confianza : Math.min(10, Math.max(0, Math.round((signal.score || 5) * 0.8 + 1))),
            horizonte
          };
        }
        logger.warn('trading-ai', `AI response no JSON: ${response.substring(0, 100)}`);
      } else {
        logger.warn('trading-ai', 'AI returned empty response');
      }
    } catch (error) {
      logger.error('trading-ai', `AI analysis error: ${error.message}`);
    }

    logger.warn('trading-ai', 'AI failed, using intelligent fallback');
  }

  // Fallback inteligente para oportunidades < 7/7 o si IA falla
  logger.warn('trading-ai', 'Using intelligent fallback');
  const fallback = fallbackInteligente(signal, semaforo);
  return {
    explanation: fallback.veredicto,
    zona_actual: fallback.zona_actual,
    factors: [],
    risks: [],
    confidence: Math.min(10, Math.max(0, Math.round((signal.score || 5) * 0.8))),
    horizonte: inferHorizonte(signal)
  };
}

module.exports = { analyze };