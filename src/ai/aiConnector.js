const logger = require('../logger/logger');

class AIConnector {
  constructor() {
    this.openRouterEndpoint = 'https://openrouter.ai/api/v1/chat/completions';
    this.openRouterModel = 'openai/gpt-4o-mini';
    this.deepSeekEndpoint = 'https://api.deepseek.com/v1/chat/completions';
    this.deepSeekModel = 'deepseek-chat';
  }

  hasApiKey() {
    return !!process.env.OPENROUTER_API_KEY;
  }

  hasDeepSeekKey() {
    return !!process.env.DEEPSEEK_API_KEY;
  }

  async callOpenRouter(prompt, historial = []) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not configured');
    }

    const promptText = `${prompt}\n\n`.trim();

    const historialMessages = historial.map(h => ({
      role: h.rol === 'user' ? 'user' : 'assistant',
      content: h.texto
    }));

    const messages = [
      { role: 'system', content: 'You are an expert Bitcoin trading analyst. Always respond in English. Be concise. Max 50 words per response.' },
      ...historialMessages,
      { role: 'user', content: promptText }
    ];

    const response = await fetch(this.openRouterEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
      },
      body: JSON.stringify({
        model: this.openRouterModel,
        messages,
        max_tokens: 250
      })
    });

    if (!response.ok) {
      const text = await response.text();
      const error = new Error(`OpenRouter HTTP ${response.status}: ${text}`);
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenRouter returned no content');
    }
    return content.trim();
  }

  async callDeepSeek(prompt, historial = []) {
    if (!process.env.DEEPSEEK_API_KEY) {
      throw new Error('DEEPSEEK_API_KEY not configured');
    }

    const promptText = `${prompt}\n\n`.trim();

    const historialMessages = historial.map(h => ({
      role: h.rol === 'user' ? 'user' : 'assistant',
      content: h.texto
    }));

    const messages = [
      { role: 'system', content: 'You are an expert Bitcoin trading analyst. Always respond in English. Be concise. Max 50 words per response.' },
      ...historialMessages,
      { role: 'user', content: promptText }
    ];

    const response = await fetch(this.deepSeekEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: this.deepSeekModel,
        messages,
        max_tokens: 250
      })
    });

    if (!response.ok) {
      const text = await response.text();
      const error = new Error(`DeepSeek HTTP ${response.status}: ${text}`);
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('DeepSeek returned no content');
    }
    return content.trim();
  }

  async callAI(prompt, historial = []) {
    // Try OpenRouter first
    try {
      return await this.callOpenRouter(prompt, historial);
    } catch (error) {
      // If OpenRouter fails due to credits (402), try DeepSeek
      if (error.status === 402 && this.hasDeepSeekKey()) {
        logger.warn('ai', 'OpenRouter 402 - trying DeepSeek fallback');
        return await this.callDeepSeek(prompt, historial);
      }
      throw error;
    }
  }

  async investigate(tema, comunicacion) {
    logger.info('ai', `Investigating: ${(tema || '').substring(0, 80)}...`);

    if (!process.env.OPENROUTER_API_KEY && !process.env.DEEPSEEK_API_KEY) {
      return { success: false, respuesta: 'AI not configured (no API keys)' };
    }

    try {
      const respuesta = await this.callAI(tema, comunicacion);
      logger.info('ai', 'Investigation completed via AI');
      return { success: true, respuesta };
    } catch (error) {
      logger.warn('ai', `AI failed: ${error.message}`);
      return { success: false, respuesta: error.message };
    }
  }

  async askAgent(mensaje, historial = []) {
    if (!process.env.OPENROUTER_API_KEY && !process.env.DEEPSEEK_API_KEY) {
      return { success: false, respuesta: 'AI not configured (no API keys)', agente: 'none' };
    }

    try {
      const respuesta = await this.callAI(mensaje, historial);
      logger.info('ai', 'Agent responded via AI');
      return { success: true, respuesta, agente: 'openrouter-or-deepseek' };
    } catch (error) {
      return { success: false, respuesta: error.message, agente: 'openrouter-or-deepseek' };
    }
  }
}

module.exports = new AIConnector();
