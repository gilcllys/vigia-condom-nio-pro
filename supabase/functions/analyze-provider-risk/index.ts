import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é um especialista em análise de risco empresarial brasileiro.
Analise a empresa com os dados fornecidos e gere um relatório de risco.

Considere para a análise:
1. Situação cadastral na Receita Federal (Ativa/Baixada/Inapta/Suspensa)
2. Data de abertura da empresa (menos de 1 ano = risco maior)
3. Capital social (muito baixo = risco)
4. Porte da empresa
5. Natureza jurídica
6. CNAEs — verificar se são compatíveis com serviços condominiais
7. Quantidade de sócios e situação deles

Responda APENAS com JSON válido, sem markdown:
{
  "score": número de 0 a 100,
  "nivel_risco": "BAIXO" | "MEDIO" | "ALTO" | "CRITICO",
  "situacao_receita": "texto",
  "recomendacao": "APROVADO" | "ATENCAO" | "REPROVADO",
  "pontos_positivos": ["item1", "item2"],
  "pontos_atencao": ["item1", "item2"],
  "relatorio_resumido": "texto de 3-4 linhas explicando o risco",
  "relatorio_completo": "análise detalhada"
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cnpjData } = await req.json();
    if (!cnpjData) {
      return new Response(
        JSON.stringify({ error: "cnpjData is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `DADOS DA EMPRESA:\n${JSON.stringify(cnpjData, null, 2)}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao seu workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "";

    let parsed;
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      parsed = JSON.parse(jsonMatch[1]!.trim());
    } catch {
      try {
        parsed = JSON.parse(content.trim());
      } catch {
        console.error("Failed to parse AI response:", content);
        throw new Error("Não foi possível interpretar a resposta da IA.");
      }
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-provider-risk error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
