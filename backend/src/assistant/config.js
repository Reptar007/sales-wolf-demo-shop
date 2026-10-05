/**
 * Every knob that bounds what the public assistant can spend. The endpoint is
 * unauthenticated and costs real money per message, so the limits live in one
 * place a reviewer can read top to bottom.
 */

/** Claude Opus 5, the default per the claude-api skill. Override with ASSISTANT_MODEL. */
export const DEFAULT_MODEL = 'claude-opus-5';

export const LIMITS = Object.freeze({
  /** Characters of shopper input per message. */
  maxInputChars: 500,
  /** Shopper messages per conversation before they must start over. */
  maxMessagesPerConversation: 20,
  /** Shopper messages per IP address per hour, across conversations. */
  maxMessagesPerIpPerHour: 30,
  /** Conversation resets per IP per hour, so "start over" can't dodge the cap forever. */
  maxResetsPerIpPerHour: 10,
  /** Earlier transcript messages (user + assistant) sent back to the model. */
  historyMessages: 12,
  /** Per model call. Covers adaptive thinking at low effort plus a short reply. */
  maxTokens: 2048,
  /** Model calls per shopper message (tool round-trips). */
  maxIterations: 5,
});

export const DEFAULT_MONTHLY_BUDGET_USD = 25;

export function assistantModel() {
  return process.env.ASSISTANT_MODEL?.trim() || DEFAULT_MODEL;
}

/** The monthly ceiling in micro-dollars. Bad or negative values fall back to the default. */
export function monthlyBudgetMicros() {
  const raw = Number.parseFloat(process.env.ASSISTANT_MONTHLY_BUDGET_USD);
  const usd = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_MONTHLY_BUDGET_USD;
  return Math.round(usd * 1_000_000);
}

/**
 * USD per million tokens, from the claude-api skill's model table (cached
 * 2026-06-24). Cache writes bill at 1.25x input (5-minute TTL) and cache reads
 * at 0.1x input, per the same skill's prompt-caching notes.
 */
export const PRICING = Object.freeze({
  'claude-fable-5-1': { input: 10, output: 50 },
  'claude-fable-5': { input: 10, output: 50 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
});

/** An unknown model is priced like the most expensive one, so the budget errs safe. */
const UNKNOWN_MODEL_PRICE = { input: 10, output: 50 };

export function priceFor(model) {
  return PRICING[model] ?? UNKNOWN_MODEL_PRICE;
}

/**
 * Cost of one model call in micro-dollars (millionths of a USD). At $N per
 * million tokens, one token costs exactly N micro-dollars.
 */
export function costMicros(model, usage = {}) {
  const price = priceFor(model);
  const input = usage.input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  return Math.ceil(
    input * price.input +
      cacheWrite * price.input * 1.25 +
      cacheRead * price.input * 0.1 +
      output * price.output,
  );
}
