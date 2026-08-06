const aiConnector = require('../ai/aiConnector');
const logger = require('../logger/logger');

const TRAFFIC_LIGHT_EN = { VERDE: 'GREEN', AMARILLO: 'YELLOW', ROJO: 'RED' };
const HORIZONTE_VALORES = { minutos: 'minutos', horas: 'horas', dias: 'dias', minutes: 'minutos', hours: 'horas', days: 'dias' };

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
  const tipo = signal.strategyType === 'long' ? 'LONG (BUY)' : 'SHORT (SELL)';
  const zona = signal.zone_type
    ? `Zone ${signal.zone_type}${signal.zone_mid ? ` mid: $${signal.zone_mid}` : ''}${signal.zone_strength ? ` (strength ${signal.zone_strength}/10)` : ''}`
    : null;
  const soporte = signal.support_zone ? `Support: $${signal.support_zone}` : null;
  const resistencia = signal.resistance_zone ? `Resistance: $${signal.resistance_zone}` : null;
  const partes = [
    `Asset: ${signal.asset}`,
    `Type: ${tipo}`,
    `Current price: $${signal.currentPrice}`,
    `Entry: ${signal.entryZone}`,
    `Target: $${signal.target}`,
    signal.stopLoss ? `Stop Loss: $${signal.stopLoss}` : null,
    signal.rsi ? `RSI: ${signal.rsi}` : null,
    signal.sma_20 ? `SMA20: ${signal.sma_20}` : null,
    signal.sma_50 ? `SMA50: ${signal.sma_50}` : null,
    signal.ema_50 ? `EMA50: ${signal.ema_50}` : null,
    signal.atr ? `ATR: ${signal.atr}` : null,
    signal.distance_pct ? `Distance: ${signal.distance_pct}%` : null,
    soporte,
    resistencia,
    zona,
    signal.fib_levels ? `Fib level: ${signal.fib_levels}` : null,
  ].filter(Boolean);
  return partes.join('\n');
}

function fallbackInteligente(signal, semaforo) {
  const tipo = signal.strategyType === 'long' ? 'long' : 'short';
  const zoneName = signal.zone_type === 'soporte' ? 'support' : signal.zone_type === 'resistencia' ? 'resistance' : (signal.zone_type || '');
  const indicadores = [];
  if (signal.rsi) indicadores.push(`RSI ${signal.rsi}`);
  if (signal.support_zone) indicadores.push(`support $${signal.support_zone}`);
  if (signal.resistance_zone) indicadores.push(`resistance $${signal.resistance_zone}`);
  if (zoneName) indicadores.push(`${zoneName} zone`);
  const textoIndicadores = indicadores.length ? ` Indicators: ${indicadores.join(', ')}.` : '';

  if (semaforo === 'ROJO') {
    return {
      veredicto: `Weak ${tipo} signal, low score.${textoIndicadores} Not recommended at this level.`,
      zona_actual: zoneName ? `Price in ${zoneName} zone${signal.zone_mid ? ` (mid $${signal.zone_mid})` : ''}.` : null,
    };
  }
  if (semaforo === 'AMARILLO') {
    return {
      veredicto: `Moderate ${tipo} signal, needs caution.${textoIndicadores} Manage risk before entry.`,
      zona_actual: zoneName ? `Price in ${zoneName} zone${signal.zone_mid ? ` (mid $${signal.zone_mid})` : ''}.` : null,
    };
  }
  return {
    veredicto: `Good ${tipo} opportunity.${textoIndicadores} Keep stop loss, take partial profits.`,
    zona_actual: zoneName ? `Price in ${zoneName} zone${signal.zone_mid ? ` (mid $${signal.zone_mid})` : ''}.` : null,
  };
}

async function analyze(signal) {
  const score = signal.score || 5;
  const confidence = signal.confidence || 5;
  const semaforo = calcularSemaforo(score, confidence);
  const datos = construirDatos(signal);

  // Solo usar IA para oportunidades de alta calidad (score >= 6 Y confidence >= 6)
  const usarIA = score >= 6 && confidence >= 6;

  if (usarIA) {
    const datos = construirDatos(signal);

    const prompt = `
You are a professional Bitcoin trading analyst.
Analyze this trade and give a clear, concise professional verdict.

TRADE DATA:
${datos}

TRAFFIC LIGHT: ${TRAFFIC_LIGHT_EN[semaforo] || semaforo}

INSTRUCTIONS:
- ALWAYS respond in English. Never use Spanish.
- RED light: explain WHY the trade is weak or risky. Max 50 characters.
- YELLOW light: explain the caution needed and key positives/negatives. Max 50 characters.
- GREEN light: explain why it is a good opportunity, include one warning. Max 50 characters.
- Describe the current price zone in max 30 characters.
- The verdict must be max 50 characters. Short and professional.

Respond ONLY with valid JSON (field names in English):
{
  "verdict": "Professional verdict (max 50 characters)",
  "zone": "Price zone (max 30 characters)",
  "factors": ["factor1", "factor2"],
  "risks": ["risk1", "risk2"],
  "confidence": 8,
  "horizon": "hours"
}

Rules:
- "verdict" must be max 50 characters.
- "zone" must be max 30 characters.
- "factors" and "risks": max 2 items each, max 35 characters per item.
- "confidence" is a number from 0 to 10.
- "horizon" is "minutes", "hours" or "days".
  `.trim();

    try {
      const response = await aiConnector.callAI(prompt);
      if (response) {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const horizonte = HORIZONTE_VALORES[parsed.horizon] || HORIZONTE_VALORES[parsed.horizonte] || inferHorizonte(signal);
          const trim = (str, max) => typeof str === 'string' ? (str.trim().length > max ? str.trim().slice(0, max - 1).trimEnd() + '…' : str.trim()) : '';
          const capItems = (arr, max, maxItem) => Array.isArray(arr) ? arr.slice(0, max).map(i => typeof i === 'string' ? (i.length > maxItem ? i.slice(0, maxItem - 1) + '…' : i) : String(i)) : [];
          return {
            explanation: trim(parsed.verdict || parsed.veredicto || parsed.explicacion || '', 50),
            zona_actual: trim(parsed.zone || parsed.zona_actual || '', 30) || null,
            factors: capItems(parsed.factors || parsed.factores, 2, 35),
            risks: capItems(parsed.risks || parsed.riesgos, 2, 35),
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : typeof parsed.confianza === 'number' ? parsed.confianza : Math.min(10, Math.max(0, Math.round((signal.score || 5) * 0.8 + 1))),
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