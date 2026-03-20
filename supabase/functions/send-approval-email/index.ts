import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type EmailType = "NF" | "OS_ORCAMENTO" | "OS_FINAL" | "CONTRATO";

interface EmailContext {
  title: string;
  amount?: number;
  condo_name: string;
}

interface RequestPayload {
  type: EmailType;
  approver_user_ids: string[];
  context: EmailContext;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount);
}

function buildHtml(heading: string, intro: string, rows: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
        <!-- Header -->
        <tr>
          <td style="background:#6366f1;padding:24px 32px">
            <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px">NFe Vigia</h1>
            <p style="margin:4px 0 0;color:#e0e7ff;font-size:12px">Gestão inteligente de condomínios</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px">
            <h2 style="margin:0 0 10px;font-size:17px;color:#111827;font-weight:700">${heading}</h2>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.65">${intro}</p>
            <!-- Details table -->
            <table cellpadding="0" cellspacing="0"
              style="width:100%;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;font-size:14px">
              ${rows}
            </table>
            <!-- CTA -->
            <div style="margin-top:28px;text-align:center">
              <a href="https://www.nfevigia.com.br/aprovacoes"
                 style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;
                        padding:13px 32px;border-radius:8px;font-size:14px;font-weight:600;
                        letter-spacing:0.1px">
                Ver e Aprovar →
              </a>
            </div>
            <p style="margin-top:28px;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6">
              Você recebe este e-mail por ser aprovador neste condomínio.<br/>
              Dúvidas? Entre em contato com o síndico.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildRow(label: string, value: string): string {
  return `<tr>
    <td style="color:#6b7280;padding:5px 0;vertical-align:top;white-space:nowrap;padding-right:16px">${label}</td>
    <td style="color:#111827;font-weight:600;padding:5px 0">${value}</td>
  </tr>`;
}

function buildEmailContent(
  type: EmailType,
  ctx: EmailContext,
): { subject: string; html: string } {
  const amountRow = ctx.amount != null
    ? buildRow("Valor:", formatCurrency(ctx.amount))
    : "";

  switch (type) {
    case "NF":
      return {
        subject: `[NFe Vigia] Nova NF aguarda sua aprovação — ${ctx.condo_name}`,
        html: buildHtml(
          "Nova Nota Fiscal aguarda sua aprovação",
          `Uma nota fiscal de <strong>${ctx.condo_name}</strong> foi registrada e aguarda a sua decisão.`,
          buildRow("Documento:", ctx.title) + amountRow,
        ),
      };

    case "OS_ORCAMENTO":
      return {
        subject: `[NFe Vigia] Orçamentos de OS aguardam aprovação — ${ctx.condo_name}`,
        html: buildHtml(
          "Orçamentos de Ordem de Serviço aguardam aprovação",
          `Os orçamentos da OS abaixo foram enviados para aprovação em <strong>${ctx.condo_name}</strong>. Analise os orçamentos e registre sua decisão.`,
          buildRow("Ordem de Serviço:", ctx.title),
        ),
      };

    case "OS_FINAL":
      return {
        subject: `[NFe Vigia] Aprovação final de OS solicitada — ${ctx.condo_name}`,
        html: buildHtml(
          "Aprovação final de Ordem de Serviço",
          `A ordem de serviço abaixo foi concluída e aguarda aprovação final em <strong>${ctx.condo_name}</strong>. Verifique a execução e registre sua decisão.`,
          buildRow("Ordem de Serviço:", ctx.title),
        ),
      };

    case "CONTRATO":
      return {
        subject: `[NFe Vigia] Contrato aguarda sua aprovação — ${ctx.condo_name}`,
        html: buildHtml(
          "Contrato aguarda sua aprovação",
          `Um contrato de <strong>${ctx.condo_name}</strong> foi enviado para aprovação. Analise o documento e registre sua decisão.`,
          buildRow("Contrato:", ctx.title) + amountRow,
        ),
      };
  }
}

// ─── Main handler ────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("[send-approval-email] RESEND_API_KEY não configurado");
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY não configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ??
      "NFe Vigia <notificacoes@nfevigia.com.br>";

    // Admin client — required for auth.admin and service-role queries
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { db: { schema: "nfe_vigia" } },
    );

    const body: RequestPayload = await req.json();
    const { type, approver_user_ids, context } = body;

    if (!type || !approver_user_ids?.length || !context?.title || !context?.condo_name) {
      return new Response(
        JSON.stringify({ error: "Payload inválido: type, approver_user_ids e context são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[send-approval-email] type=${type} approvers=${approver_user_ids.length} condo="${context.condo_name}"`);

    // Step 1: Resolve auth_user_ids from nfe_vigia.users
    const { data: userRows, error: userErr } = await supabaseAdmin
      .from("users")
      .select("auth_user_id")
      .in("id", approver_user_ids);

    if (userErr) {
      console.error("[send-approval-email] Error fetching users:", userErr.message);
      return new Response(
        JSON.stringify({ error: "Erro ao resolver aprovadores", detail: userErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!userRows?.length) {
      console.warn("[send-approval-email] No users found for IDs:", approver_user_ids);
      return new Response(
        JSON.stringify({ sent: 0, message: "Nenhum usuário encontrado para os IDs fornecidos" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 2: Resolve emails via auth admin API
    const emails: string[] = [];
    for (const { auth_user_id } of userRows) {
      if (!auth_user_id) continue;
      const { data: { user }, error: authErr } = await supabaseAdmin.auth.admin.getUserById(auth_user_id);
      if (authErr) {
        console.warn(`[send-approval-email] Could not get user ${auth_user_id}:`, authErr.message);
        continue;
      }
      if (user?.email) {
        emails.push(user.email);
      }
    }

    if (emails.length === 0) {
      console.warn("[send-approval-email] No emails resolved");
      return new Response(
        JSON.stringify({ sent: 0, message: "Nenhum e-mail encontrado para os aprovadores" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 3: Build email content
    const { subject, html } = buildEmailContent(type, context);

    // Step 4: Send individually via Resend (avoid exposing recipients to each other)
    const results: { email: string; ok: boolean }[] = [];
    for (const email of emails) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [email],
          subject,
          html,
        }),
      });

      const ok = res.ok;
      results.push({ email, ok });

      if (!ok) {
        const errBody = await res.text();
        console.error(`[send-approval-email] Failed for ${email} (${res.status}):`, errBody);
      }
    }

    const sent = results.filter((r) => r.ok).length;
    console.log(`[send-approval-email] Done — sent=${sent}/${emails.length}`);

    return new Response(
      JSON.stringify({ sent, total: emails.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[send-approval-email] Unexpected error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
