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
  console.log("analyze-provider-risk: function invoked, method:", req.method);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    console.log("API key exists:", !!apiKey);
    console.log("API key length:", apiKey?.length || 0);

    if (!apiKey) {
      console.error("ANTHROPIC_API_KEY is not set!");
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured in secrets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { cnpjData } = body;
    console.log("Received cnpjData for CNPJ:", cnpjData?.cnpj);

    if (!cnpjData) {
      return new Response(
        JSON.stringify({ error: "cnpjData is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Calling Anthropic API...");
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `DADOS DA EMPRESA:\n${JSON.stringify(cnpjData, null, 2)}`,
          },
        ],
      }),
    });

    console.log("Anthropic API response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic API error body:", errorText);
      return new Response(
        JSON.stringify({
          error: `Anthropic API error: ${response.status}`,
          details: errorText,
        }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResult = await response.json();
    const content = aiResult.content?.[0]?.text || "";
    console.log("AI response length:", content.length);

    let parsed;
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      parsed = JSON.parse(jsonMatch[1]!.trim());
    } catch {
      try {
        parsed = JSON.parse(content.trim());
      } catch {
        console.error("Failed to parse AI response:", content);
        return new Response(
          JSON.stringify({ error: "Não foi possível interpretar a resposta da IA.", raw: content }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log("Successfully parsed risk analysis, score:", parsed.score);
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-provider-risk FULL error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Erro desconhecido",
        stack: e instanceof Error ? e.stack : undefined,
        type: typeof e,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
