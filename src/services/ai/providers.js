'use strict';
// Fournisseurs de modèle pour la réceptionniste IA. Chacun garde l'historique dans son propre format
// (ajout seulement, blocs de réflexion compris) et expose le même contrat :
//   start(context)            -> historique initial
//   addUser(history, text)     ajoute un message du client
//   step(history)             -> { texts, calls: [{ id, name, input }], refusal }  (ajoute la réponse du modèle)
//   addResults(history, rs)    ajoute les résultats d'outils [{ id, name, result, error }]
//
// Gemini (Google, offre gratuite) : Interactions API, mode sans état (store=false).
// Claude (Anthropic) : SDK officiel @anthropic-ai/sdk.

const config = require('../../config');

// ---------- Claude ----------
let claudeClient = null;
let claudeOverride = null;
function claudeSdk() {
  if (claudeOverride) return claudeOverride;
  if (!claudeClient) {
    const mod = require('@anthropic-ai/sdk');
    const Anthropic = mod.Anthropic || mod.default || mod;
    claudeClient = new Anthropic({ apiKey: config.ai.apiKey, maxRetries: 2, timeout: 45000 });
  }
  return claudeClient;
}
const CLAUDE_FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5']);

function claude({ systemPrompt, tools }) {
  return {
    name: 'claude',
    label: 'Anthropic Claude',
    start: (context) => [{ role: 'user', content: context }],
    addUser(history, text) { history.push({ role: 'user', content: text }); },
    async step(history) {
      const params = {
        model: config.ai.model,
        max_tokens: 4096,
        output_config: { effort: config.ai.effort },
        cache_control: { type: 'ephemeral' },
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        tools,
        messages: history,
      };
      if (CLAUDE_FALLBACK_MODELS.has(config.ai.model)) {
        params.betas = ['server-side-fallback-2026-07-01'];
        params.fallbacks = 'default';
      }
      const resp = await claudeSdk().beta.messages.create(params);
      history.push({ role: 'assistant', content: resp.content });
      return {
        texts: resp.content.filter((b) => b.type === 'text' && b.text.trim()).map((b) => b.text.trim()),
        calls: resp.stop_reason === 'tool_use' ? resp.content.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, input: b.input })) : [],
        refusal: resp.stop_reason === 'refusal',
      };
    },
    addResults(history, results) {
      history.push({
        role: 'user',
        content: results.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: JSON.stringify(r.result), ...(r.error ? { is_error: true } : {}) })),
      });
    },
  };
}

// ---------- Gemini ----------
let geminiFetch = null;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

// Schéma JSON des outils : sous-ensemble accepté par Gemini (sans additionalProperties).
function toGeminiSchema(s) {
  if (!s || typeof s !== 'object') return s;
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === 'additionalProperties') continue;
    if (k === 'properties') out.properties = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, toGeminiSchema(pv)]));
    else if (k === 'items') out.items = toGeminiSchema(v);
    else out[k] = v;
  }
  return out;
}

function geminiThinking(model) {
  if (config.ai.geminiThinking) return config.ai.geminiThinking;
  return /^gemini-3\.8/.test(model) ? 'low' : 'minimal'; // le plus rapide autorisé par modèle
}

function gemini({ systemPrompt, tools }) {
  const geminiTools = tools.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: toGeminiSchema(t.input_schema) }));
  return {
    name: 'gemini',
    label: 'Google Gemini',
    start: (context) => [{ type: 'user_input', content: [{ type: 'text', text: context }] }],
    addUser(history, text) { history.push({ type: 'user_input', content: [{ type: 'text', text }] }); },
    async step(history) {
      const model = config.ai.geminiModel;
      const body = {
        model,
        system_instruction: systemPrompt,
        input: history,
        tools: geminiTools,
        generation_config: { thinking_level: geminiThinking(model), max_output_tokens: 2048, tool_choice: 'auto' },
        store: false,
      };
      const res = await (geminiFetch || fetch)(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.ai.geminiKey, 'Api-Revision': '2026-05-20' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });
      const text = await res.text();
      if (!res.ok) {
        const err = new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`);
        err.status = res.status;
        throw err;
      }
      const data = JSON.parse(text);
      if (data.status && !['completed', 'requires_action'].includes(data.status)) {
        const err = new Error(`Gemini statut ${data.status}`);
        err.status = 502;
        throw err;
      }
      // Les étapes du modèle sont renvoyées telles quelles (signatures de réflexion comprises).
      const steps = (data.steps || []).filter((s) => s && !['user_input', 'function_result'].includes(s.type));
      history.push(...steps);
      const texts = [];
      const calls = [];
      for (const s of steps) {
        if (s.type === 'model_output') {
          for (const c of s.content || []) if (c.type === 'text' && c.text && c.text.trim()) texts.push(c.text.trim());
        } else if (s.type === 'function_call') {
          calls.push({ id: s.id, name: s.name, input: s.arguments || {} });
        }
      }
      return { texts, calls, refusal: false };
    },
    addResults(history, results) {
      for (const r of results) {
        history.push({ type: 'function_result', name: r.name, call_id: r.id, result: [{ type: 'text', text: JSON.stringify(r.result) }], ...(r.error ? { is_error: true } : {}) });
      }
    },
  };
}

// ---------- Choix du fournisseur ----------
const ready = {
  gemini: () => Boolean(config.ai.geminiKey || geminiFetch),
  claude: () => Boolean(config.ai.apiKey || claudeOverride),
};

// AI_PROVIDER force un fournisseur ; sinon Gemini (gratuit) s'il a une clé, puis Claude.
function activeName() {
  const want = config.ai.provider;
  if (want === 'gemini' || want === 'claude') return ready[want]() ? want : null;
  if (ready.gemini()) return 'gemini';
  if (ready.claude()) return 'claude';
  return null;
}

const FACTORIES = { gemini, claude };
function create(name, opts) {
  if (!FACTORIES[name] || !ready[name]()) return null;
  return FACTORIES[name](opts);
}

// Pour les tests uniquement.
function setClaudeClient(c) { claudeOverride = c; }
function setGeminiFetch(f) { geminiFetch = f; }

module.exports = { activeName, create, setClaudeClient, setGeminiFetch, toGeminiSchema, labels: { gemini: 'Google Gemini', claude: 'Anthropic Claude' } };
