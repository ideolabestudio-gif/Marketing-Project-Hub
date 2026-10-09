import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider, AiRequest, AiResult } from "./index";

/** Precio por millón de tokens (USD). Si el modelo que respondió no está, se usa el más caro. */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
};
const FALLBACK_PRICE = { input: 5, output: 25 };
const MAX_TOKENS = 16000;
/** Tope del texto de entrada: el contexto de un proyecto cabe de sobra. */
const MAX_INPUT_TOKENS_ESTIMATE = 30000;

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICES[model] ?? FALLBACK_PRICE;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

/**
 * Claude a través del SDK oficial. Si el modelo rechaza la petición por sus filtros de
 * seguridad, el servidor reintenta con otro modelo (fallbacks: "default").
 */
export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  readonly model: string;
  readonly maxCostPerRequestUsd: number;
  private readonly client = new Anthropic();

  constructor(model = "claude-opus-5-5") {
    this.model = model;
    this.maxCostPerRequestUsd = costUsd(model, MAX_INPUT_TOKENS_ESTIMATE, MAX_TOKENS);
  }

  async generate(request: AiRequest): Promise<AiResult> {
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.request(request);
    } catch (err) {
      const none = { model: this.model, inputTokens: 0, outputTokens: 0, costUsd: 0 };
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        return { ok: false, error: "La clave de API de Anthropic no es válida", ...none };
      }
      if (err instanceof Anthropic.RateLimitError) {
        return { ok: false, error: "El proveedor de IA está saturado; prueba en unos minutos", ...none };
      }
      if (err instanceof Anthropic.APIConnectionError) {
        return { ok: false, error: "No se pudo conectar con el proveedor de IA", ...none };
      }
      if (err instanceof Anthropic.APIError) {
        return { ok: false, error: `Error del proveedor de IA (${err.status ?? "sin código"})`, ...none };
      }
      throw err;
    }
    return this.toResult(response);
  }

  private request(request: AiRequest) {
    return this.client.beta.messages.create({
      model: this.model,
      max_tokens: MAX_TOKENS,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: request.effort,
        ...(request.jsonSchema ? { format: { type: "json_schema" as const, schema: request.jsonSchema } } : {}),
      },
      system: request.system,
      messages: [{ role: "user", content: request.prompt }],
    });
  }

  private toResult(response: Anthropic.Beta.BetaMessage): AiResult {
    const usage = {
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      costUsd: costUsd(response.model, response.usage.input_tokens, response.usage.output_tokens),
    };
    if (response.stop_reason === "refusal") {
      return { ok: false, error: "El modelo no ha querido responder a esta petición", ...usage };
    }
    const text = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("")
      .trim();
    if (!text) return { ok: false, error: "El modelo no devolvió texto", ...usage };
    if (response.stop_reason === "max_tokens") {
      return { ok: false, error: "La respuesta se cortó por longitud", ...usage };
    }
    return { ok: true, text, ...usage };
  }
}
