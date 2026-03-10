import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é um especialista em leitura de notas fiscais brasileiras (NF-e e NFS-e).
Analise esta nota fiscal e extraia as seguintes informações em JSON:
{
  "numero_nf": "número da nota fiscal",
  "data_emissao": "data no formato YYYY-MM-DD",
  "fornecedor": "nome do fornecedor/empresa emitente",
  "cnpj_fornecedor": "CNPJ do fornecedor",
  "valor_total": número decimal,
  "descricao_servico": "descrição do serviço ou produtos",
  "itens": [
    {"descricao": "nome do item", "quantidade": número, "valor_unitario": número, "valor_total": número}
  ]
}
Se não conseguir identificar algum campo, use string vazia ou 0. Responda APENAS com o JSON, sem texto adicional.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileBase64, mediaType } = await req.json();
    if (!fileBase64 || !mediaType) {
      return new Response(
        JSON.stringify({ error: "fileBase64 and mediaType are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get("VITE_ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("VITE_ANTHROPIC_API_KEY is not configured");
    }

    // Build content based on media type
    const isPdf = mediaType === "application/pdf";
    const contentBlock = isPdf
      ? {
          type: "document" as const,
          source: { type: "base64" as const, media_type: "application/pdf" as const, data: fileBase64 },
        }
      : {
          type: "image" as const,
          source: { type: "base64" as const, media_type: mediaType, data: fileBase64 },
        };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              contentBlock,
              { type: "text", text: SYSTEM_PROMPT },
            ],
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
          JSON.stringify({ error: "Créditos insuficientes na API." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const text = await response.text();
      console.error("Claude API error:", response.status, text);
      throw new Error(`Claude API error: ${response.status}`);
    }

    const aiResult = await response.json();
    const content = aiResult.content?.[0]?.text || "";

    // Parse JSON from the response
    let parsed;
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      parsed = JSON.parse(jsonMatch[1]!.trim());
    } catch {
      try {
        parsed = JSON.parse(content.trim());
      } catch {
        console.error("Failed to parse AI response:", content);
        parsed = {
          numero_nf: "",
          data_emissao: "",
          fornecedor: "",
          cnpj_fornecedor: "",
          valor_total: 0,
          descricao_servico: "",
          itens: [],
        };
      }
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-nf error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
