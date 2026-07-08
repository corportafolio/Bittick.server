# AI Signals with Hermes/OpenCode

## AI Pipeline (aiConnector.js)
1. **GitHub Models** (primary): `gpt-4o-mini` via Azure
   - Requires GITHUB_TOKEN in .env
2. **Hermes Agent** (fallback): Nous Research Hermes CLI
   - Binary: ~/.hermes/hermes-agent/venv/bin/hermes
   - Supports multiple providers (Gemini, Copilot, etc.)
3. **OpenCode** (code tasks only): ~/.opencode/bin/opencode
   - Used when message contains code/file keywords

## AI Analysis (aiAnalyzer.js)
- Takes signal from strategy
- Sends prompt asking for structured JSON analysis
- Returns: explanation, factors, risks, confidence (0-10), horizonte
- Falls back to heuristic if AI unavailable

## Endpoints
- POST /api/agent (if needed for app-side AI queries)
