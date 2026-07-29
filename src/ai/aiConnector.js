const logger = require('../logger/logger');

class AIConnector {
  constructor() {
    this.apiEndpoint = 'https://openrouter.ai/api/v1/chat/completions';
    this.model = 'openai/gpt-4o-mini';
  }

  hasApiKey() {
    return !!process.env.OPENROUTER_API_KEY;
  }

  async callAI(tema, comunicacion, historial = []) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not configured');
    }

    const prompt = `${tema}\n\n${comunicacion || ''}`.trim();

    const historialMessages = historial.map(h => ({
      role: h.rol === 'user' ? 'user' : 'assistant',
      content: h.texto
    }));

    const messages = [
      { role: 'system', content: 'Eres un analista de trading experto en Bitcoin. Respondes en español.' },
      ...historialMessages,
      { role: 'user', content: prompt }
    ];

    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenRouter HTTP ${response.status}: ${text}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenRouter returned no content');
    }
    return content.trim();
  }

  async investigate(tema, comunicacion) {
    logger.info('ai', `Investigating: ${(tema || '').substring(0, 80)}...`);

    if (!process.env.OPENROUTER_API_KEY) {
      return { success: false, respuesta: 'AI not configured (OPENROUTER_API_KEY missing)' };
    }

    try {
      const respuesta = await this.callAI(tema, comunicacion);
      logger.info('ai', 'Investigation completed via OpenRouter');
      return { success: true, respuesta };
    } catch (error) {
      logger.warn('ai', `OpenRouter failed: ${error.message}`);
      return { success: false, respuesta: error.message };
    }
  }

  async askAgent(mensaje, historial = []) {
    if (!process.env.OPENROUTER_API_KEY) {
      return { success: false, respuesta: 'AI not configured (OPENROUTER_API_KEY missing)', agente: 'none' };
    }

    try {
      const respuesta = await this.callAI(mensaje, '', historial);
      logger.info('ai', 'Agent responded via OpenRouter');
      return { success: true, respuesta, agente: 'openrouter' };
    } catch (error) {
      return { success: false, respuesta: error.message, agente: 'openrouter' };
    }
  }
}

module.exports = new AIConnector();
