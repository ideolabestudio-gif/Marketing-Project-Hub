import { setAiProviderForTests, type AiProvider, type AiRequest, type AiResult } from "@/lib/ai";

/**
 * Proveedor de IA de pruebas: no sale a la red, guarda cada petición (para comprobar
 * qué datos recibió la IA) y responde un texto fijo o el que se le indique.
 */
export class FakeAiProvider implements AiProvider {
  readonly name = "fake";
  readonly model = "fake-model";
  readonly maxCostPerRequestUsd = 0.01;
  requests: AiRequest[] = [];
  reply = "Texto propuesto por la IA.";
  fail: string | null = null;

  async generate(request: AiRequest): Promise<AiResult> {
    this.requests.push(request);
    const usage = { model: this.model, inputTokens: 100, outputTokens: 50, costUsd: 0.002 };
    if (this.fail) return { ok: false, error: this.fail, ...usage };
    return { ok: true, text: this.reply, ...usage };
  }

  reset() {
    this.requests = [];
    this.reply = "Texto propuesto por la IA.";
    this.fail = null;
  }
}

export const fakeAi = new FakeAiProvider();

export function installFakeAi() {
  setAiProviderForTests(fakeAi);
}
