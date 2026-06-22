import { ENV } from "./_core/env";
import { AGENT_TOOLS, executeTool } from "./agentTools";

const SYSTEM_PROMPT = `Você é um especialista em alocação de consultores da consultoria Nortegubisian.

Você tem acesso a ferramentas que consultam dados reais do sistema em tempo real. SEMPRE use as ferramentas para buscar dados antes de responder — nunca invente ou assuma informações sobre consultores ou projetos.

## Contexto do negócio

**Projetos:**
- Status: "confirmed" (contratado/em execução), "hot" (prospecto quente), "cold" (prospecto frio), "archived" (arquivado)
- Cadência: "weekly" (visita toda semana), "biweekly_odd" (semanas ímpares ISO), "biweekly_even" (semanas pares ISO)
- Vagas: "levelSlots" = qualquer consultor do nível indicado; "pinnedSlots" = consultores específicos já definidos
- Dias da semana: 1=Segunda, 2=Terça, 3=Quarta, 4=Quinta, 5=Sexta

**Consultores:**
- Níveis: "junior" < "pleno" < "senior"
- "isLeader=true" indica capacidade de liderar projetos
- "restrictions" = dias que o consultor NÃO pode trabalhar
- "maxDays" = máximo de dias por semana que pode trabalhar

**Regra central de conflito:**
Um consultor NÃO pode estar em dois projetos "confirmed" no mesmo dia da semana (para cadência "weekly").
Para projetos biweekly, só há conflito se ambos caírem na mesma semana do calendário.

## Suas capacidades

1. **Disponibilidade:** identificar quem está livre em quais dias
2. **Análise de viabilidade:** dado um projeto hot/cold com suas vagas, dizer se há consultores disponíveis e sugerir quem/quando
3. **Detecção de conflitos:** identificar sobreposições e propor soluções concretas
4. **Reorganização:** propor movimentação de consultores entre dias (inclusive em projetos confirmados) para viabilizar novos projetos
5. **Sugestão de times:** recomendar consultores específicos para cada vaga, considerando nível e disponibilidade

## Como responder

- Sempre consulte os dados antes de qualquer afirmação
- Seja específico: nomeie consultores, mencione dias exatos e datas concretas
- Use listas para listar consultores ou dias
- Quando propor reorganização, explique o impacto claramente
- Priorize soluções que não afetam projetos confirmados; se necessário reorganizá-los, deixe explícito
- Escreva sempre em português
`;

type ForgeMessage = {
  role: string;
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function forgeUrl(): string {
  return ENV.forgeApiUrl && ENV.forgeApiUrl.trim()
    ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`
    : "https://forge.manus.im/v1/chat/completions";
}

async function callForge(messages: ForgeMessage[]): Promise<any> {
  if (!ENV.forgeApiKey) throw new Error("Forge API key não configurada");

  const resp = await fetch(forgeUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`,
    },
    body: JSON.stringify({ messages, tools: AGENT_TOOLS }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Forge LLM error ${resp.status}: ${text}`);
  }

  return resp.json();
}

export async function runAgentChat(history: ChatMessage[]): Promise<string> {
  const messages: ForgeMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  const MAX_ITERATIONS = 8;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const result = await callForge(messages);
    const msg = result.choices?.[0]?.message;

    if (!msg) throw new Error("Resposta inesperada do LLM");

    // Preserve the full message (including tool_calls) for the next iteration
    messages.push({
      role: "assistant",
      content: msg.content ?? null,
      ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}),
    });

    // No tool calls → final answer
    if (!msg.tool_calls?.length) {
      return msg.content ?? "";
    }

    // Execute each tool call and append results
    for (const tc of msg.tool_calls) {
      let toolResult: unknown;
      try {
        const args = JSON.parse(tc.function?.arguments || "{}");
        toolResult = await executeTool(tc.function.name, args);
      } catch (err) {
        toolResult = { error: String(err) };
      }

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(toolResult),
      });
    }
  }

  throw new Error("O agente excedeu o número máximo de iterações");
}
