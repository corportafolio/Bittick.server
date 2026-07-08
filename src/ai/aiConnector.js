const logger = require('../logger/logger');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class AIConnector {
  constructor() {
    this.hermesPath = path.join(process.env.HOME || '/home/candela', '.hermes/hermes-agent/venv/bin/hermes');
    this.hermesAvailable = fs.existsSync(this.hermesPath) && this.hasApiKey();
    this.opencodePath = path.join(process.env.HOME || '/home/candela', '.opencode/bin/opencode');
    this.opencodeAvailable = fs.existsSync(this.opencodePath);
  }

  hasApiKey() {
    const keys = ['OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY',
                  'GOOGLE_API_KEY', 'GEMINI_API_KEY', 'NOUS_API_KEY',
                  'KIMI_API_KEY', 'HF_TOKEN', 'NVIDIA_API_KEY',
                  'OLLAMA_API_KEY', 'KILOCODE_API_KEY', 'GITHUB_TOKEN',
                  'MINIMAX_API_KEY', 'GLM_API_KEY', 'ARCEEAI_API_KEY',
                  'XIAOMI_API_KEY'];
    return keys.some(k => process.env[k]);
  }

  async investigate(tema, comunicacion) {
    logger.info('ai', `Investigating: ${(tema || '').substring(0, 80)}...`);

    if (process.env.GITHUB_TOKEN) {
      try {
        const respuesta = await this.callGitHubModels(tema, comunicacion);
        logger.info('ai', 'Investigation completed via GitHub Models');
        return { success: true, respuesta };
      } catch (error) {
        logger.warn('ai', `GitHub Models failed: ${error.message}`);
      }
    }

    try {
      const respuesta = await this.callHermes(tema, comunicacion);
      if (this.isErrorResponse(respuesta)) {
        logger.warn('ai', `Hermes returned error: ${respuesta.substring(0, 120)}`);
        return { success: false, respuesta };
      }
      logger.info('ai', 'Investigation completed via Hermes');
      return { success: true, respuesta };
    } catch (error) {
      logger.warn('ai', `Hermes unavailable: ${error.message}`);
      return { success: false, respuesta: error.message };
    }
  }

  async callGitHubModels(tema, comunicacion, historial = []) {
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

    const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 2048
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub Models HTTP ${response.status}: ${text}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('GitHub Models returned no content');
    }
    return content.trim();
  }

  getModelFlags() {
    if (process.env.GITHUB_TOKEN) {
      return '--provider copilot --model gpt-4o-mini';
    }
    if (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) {
      return '--provider gemini --model gemini-2.0-flash';
    }
    return '';
  }

  async callHermes(tema, comunicacion, historial = []) {
    if (!this.hermesAvailable) {
      throw new Error('Hermes not configured (missing API key)');
    }

    const modelFlags = this.getModelFlags();
    const historialStr = historial.length > 0
      ? `Historial:\n${historial.map(h => `${h.rol}: ${h.texto}`).join('\n')}\n\n`
      : '';

    const prompt = `${historialStr}Mensaje actual:\n${tema}\n\n${comunicacion || ''}\n\n`;
    const escaped = prompt.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
    const cmd = `"${this.hermesPath}" ${modelFlags} -z "${escaped}"`.trim().replace(/\s+/g, ' ');

    return new Promise((resolve, reject) => {
      const child = exec(
        cmd,
        {
          timeout: 60000,
          env: { ...process.env, HERMES_QUIET: '1' },
          maxBuffer: 1024 * 1024
        },
        (error, stdout) => {
          if (error) reject(new Error(`Hermes error: ${error.message}`));
          else resolve(stdout.toString().trim());
        }
      );
      setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('Hermes timeout'));
      }, 65000);
    });
  }

  async askOpenCode(mensaje) {
    if (!this.opencodeAvailable) {
      return { success: false, respuesta: 'OpenCode not installed on this server.' };
    }

    logger.info('ai', `Running OpenCode: ${mensaje.substring(0, 80)}...`);

    return new Promise((resolve) => {
      const child = require('child_process').spawn(
        this.opencodePath,
        ['run', '--dangerously-skip-permissions', mensaje],
        {
          cwd: process.env.HOME || '/home/candela',
          env: { ...process.env, OPENCODE_PURE: '1' },
          stdio: ['pipe', 'pipe', 'pipe']
        }
      );

      child.stdin.end();

      let salida = '';
      let errores = '';

      child.stdout.on('data', (d) => { salida += d.toString(); });
      child.stderr.on('data', (d) => { errores += d.toString(); });

      child.on('close', (code) => {
        const respuesta = salida.trim() || errores.trim() || '(sin respuesta)';
        if (code !== 0) {
          logger.warn('ai', `OpenCode exit code: ${code}`);
        }
        resolve({ success: true, respuesta });
      });
    });
  }

  async askAgent(mensaje, historial = []) {
    const lower = mensaje?.toLowerCase() || '';
    const opencodeKeywords = ['crea', 'archivo', 'modifica', 'edita', 'código', 'codigo', 'carpeta', 'bash', 'terminal', 'ejecuta', 'elimina', 'borra', 'renombra', 'mueve', 'copia', 'permiso', 'script', 'comando', 'mkdir', 'touch', 'chmod'];

    const usarOpenCode = opencodeKeywords.some(k => lower.includes(k));

    if (usarOpenCode && this.opencodeAvailable) {
      logger.info('ai', `Routing to OpenCode (contains code/file keywords): ${mensaje.substring(0, 80)}...`);
      const result = await this.askOpenCode(mensaje);
      return { ...result, agente: 'opencode' };
    }

    let respuesta = '';

    if (process.env.GITHUB_TOKEN) {
      try {
        respuesta = await this.callGitHubModels(mensaje, '', historial);
        logger.info('ai', 'Agent responded via GitHub Models');
      } catch (error) {
        logger.warn('ai', `GitHub Models failed: ${error.message}`);
      }
    }

    if (!respuesta) {
      try {
        respuesta = await this.callHermes(mensaje, '', historial);
        if (this.isErrorResponse(respuesta)) {
          return { success: false, respuesta, agente: 'hermes' };
        }
        logger.info('ai', 'Agent responded via Hermes');
      } catch (error) {
        return { success: false, respuesta: error.message, agente: 'hermes' };
      }
    }

    return { success: true, respuesta, agente: respuesta ? 'github-models' : 'hermes' };
  }

  isErrorResponse(text) {
    const lower = text.toLowerCase();
    return lower.startsWith('api call failed')
      || lower.includes('http 4')
      || lower.includes('http 5')
      || lower.includes('error:')
      || lower.includes('internal server error');
  }
}

module.exports = new AIConnector();
