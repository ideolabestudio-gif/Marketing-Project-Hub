import { AnthropicProvider } from "./anthropic";

/**
 * Proveedor de IA (puerto + adaptadores). Solo lo usa el módulo `ai`, que ya ha
 * construido el contexto de un único proyecto. El proveedor recibe texto y devuelve
 * texto: no puede leer ni escribir datos del Hub.
 *
 * - disabled: el valor por defecto. Cualquier petición falla con AiUnavailableError.
 * - anthropic: Claude, si AI_PROVIDER=anthropic y hay ANTHROPIC_API_KEY.
 */
export type AiRequest = {
  system: string;
  prompt: string;
  /** Profundidad del razonamiento: low para tareas simples, medium para análisis. */
  effort: "low" | "medium";
};

export type AiResult =
  | { ok: true; text: string; model: string; inputTokens: number; outputTokens: number; costUsd: number }
  | { ok: false; error: string; model: string; inputTokens: number; outputTokens: number; costUsd: number };

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  /** Coste máximo de una petición (para no superar el límite mensual). */
  readonly maxCostPerRequestUsd: number;
  generate(request: AiRequest): Promise<AiResult>;
}

export class AiUnavailableError extends Error {
  constructor() {
    super("La IA no está configurada en el servidor (AI_PROVIDER y ANTHROPIC_API_KEY)");
  }
}

class DisabledProvider implements AiProvider {
  readonly name = "disabled";
  readonly model = "none";
  readonly maxCostPerRequestUsd = 0;
  async generate(): Promise<AiResult> {
    throw new AiUnavailableError();
  }
}

let override: AiProvider | null = null;

export function getAiProvider(): AiProvider {
  if (override) return override;
  if (process.env.AI_PROVIDER === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    return new AnthropicProvider(process.env.AI_MODEL || undefined);
  }
  return new DisabledProvider();
}

export function isAiConfigured(): boolean {
  return getAiProvider().name !== "disabled";
}

/** Solo para pruebas: sustituye el proveedor (p. ej. uno que captura el prompt). */
export function setAiProviderForTests(provider: AiProvider | null): void {
  override = provider;
}
