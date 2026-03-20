import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Pagar.me V5 — monthly plan price in cents (R$ 365,00)
const PLAN_AMOUNT_CENTS = 36500;
const PLAN_INTERVAL = "month";
const PLAN_INTERVAL_COUNT = 1;
const PLAN_DESCRIPTION = "NFe Vigia — Assinatura Mensal";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Basic auth header for Pagar.me: base64("sk_...:") */
function pagarmeAuth(apiKey: string): string {
  return "Basic " + btoa(apiKey + ":");
}

/** Format phone to Pagar.me format: { country_code, number } */
function formatPhone(raw: string): { country_code: string; number: string } {
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 11) {
    return { country_code: "55", number: digits.slice(-11) };
  }
  return { country_code: "55", number: digits };
}

/** Remove punctuation from CPF/CNPJ */
function cleanDocument(doc: string): string {
  return doc.replace(/\D/g, "");
}

// ─── Main ────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const PAGARME_API_KEY = Deno.env.get("PAGARME_API_KEY");
    if (!PAGARME_API_KEY) {
      return json({ error: "PAGARME_API_KEY não configurado" }, 500);
    }

    // ── Authenticate Supabase user ──────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data: { user }, error: authErr } =
      await supabaseUser.auth.getUser(authHeader.replace("Bearer ", ""));

    if (authErr || !user) {
      return json({ error: "Não autorizado" }, 401);
    }

    // ── Parse body ─────────────────────────────────────────────────────────
    const body = await req.json();
    const {
      card_token,
      condo_id,
      customer,
    }: {
      card_token: string;
      condo_id: string;
      customer: {
        name: string;
        email: string;
        document: string;
        phone: string;
      };
    } = body;

    if (!card_token || !condo_id || !customer?.name || !customer?.email || !customer?.document) {
      return json({ error: "Campos obrigatórios: card_token, condo_id, customer (name, email, document)" }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { db: { schema: "nfe_vigia" } },
    );

    // ── Verify user owns/manages this condo ────────────────────────────────
    const { data: userRow } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (!userRow) {
      return json({ error: "Usuário não encontrado" }, 403);
    }

    const { data: ucRow } = await supabaseAdmin
      .from("user_condos")
      .select("role")
      .eq("user_id", userRow.id)
      .eq("condo_id", condo_id)
      .in("role", ["ADMIN", "SINDICO"])
      .eq("status", "ativo")
      .maybeSingle();

    if (!ucRow) {
      return json({ error: "Sem permissão para gerenciar assinatura deste condomínio" }, 403);
    }

    // ── Fetch condo info ───────────────────────────────────────────────────
    const { data: condo } = await supabaseAdmin
      .from("condos")
      .select("name, subscription_id, pagarme_customer_id")
      .eq("id", condo_id)
      .maybeSingle();

    if (!condo) {
      return json({ error: "Condomínio não encontrado" }, 404);
    }

    // ── Already subscribed? ────────────────────────────────────────────────
    if (condo.subscription_id) {
      return json({ error: "Este condomínio já possui uma assinatura ativa. Para trocar o cartão, cancele primeiro." }, 409);
    }

    const phone = formatPhone(customer.phone || "");
    const document = cleanDocument(customer.document);

    // ── Create/reuse Pagar.me customer ────────────────────────────────────
    let customerId = condo.pagarme_customer_id ?? null;

    if (!customerId) {
      const customerPayload = {
        name: customer.name.trim(),
        email: customer.email.trim().toLowerCase(),
        type: document.length === 14 ? "company" : "individual",
        document,
        phones: {
          mobile_phone: {
            country_code: phone.country_code,
            area_code: phone.number.slice(0, 2),
            number: phone.number.slice(2),
          },
        },
      };

      const custRes = await fetch("https://api.pagar.me/core/v5/customers", {
        method: "POST",
        headers: {
          Authorization: pagarmeAuth(PAGARME_API_KEY),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(customerPayload),
      });

      const custData = await custRes.json();

      if (!custRes.ok) {
        console.error("[create-subscription] Customer creation failed:", JSON.stringify(custData));
        return json({
          error: "Erro ao criar cliente no Pagar.me",
          detail: custData?.message ?? custData?.errors ?? custData,
        }, 502);
      }

      customerId = custData.id;

      // Persist customer id immediately
      await supabaseAdmin
        .from("condos")
        .update({ pagarme_customer_id: customerId })
        .eq("id", condo_id);
    }

    // ── Create subscription ───────────────────────────────────────────────
    const now = new Date();
    const billingDate = now.getDate(); // same day each month

    const subscriptionPayload = {
      payment_method: "credit_card",
      interval: PLAN_INTERVAL,
      interval_count: PLAN_INTERVAL_COUNT,
      billing_type: "prepaid",
      installments: 1,
      currency: "BRL",
      customer_id: customerId,
      card_token,
      items: [
        {
          description: PLAN_DESCRIPTION,
          amount: PLAN_AMOUNT_CENTS,
          quantity: 1,
          cycles: 0, // 0 = unlimited
        },
      ],
      metadata: {
        condo_id,
        condo_name: condo.name,
      },
    };

    const subRes = await fetch("https://api.pagar.me/core/v5/subscriptions", {
      method: "POST",
      headers: {
        Authorization: pagarmeAuth(PAGARME_API_KEY),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(subscriptionPayload),
    });

    const subData = await subRes.json();

    if (!subRes.ok) {
      console.error("[create-subscription] Subscription creation failed:", JSON.stringify(subData));
      return json({
        error: "Erro ao criar assinatura no Pagar.me",
        detail: subData?.message ?? subData?.errors ?? subData,
      }, 502);
    }

    console.log(`[create-subscription] Created subscription ${subData.id} for condo ${condo_id}`);

    // ── Determine initial status ──────────────────────────────────────────
    // Pagar.me: active, trialing, pending, past_due, canceled, ended
    const pagarmeStatus: string = subData.status ?? "pending";
    const internalStatus = pagarmeStatus === "active" || pagarmeStatus === "trialing"
      ? "active"
      : pagarmeStatus === "past_due"
      ? "past_due"
      : pagarmeStatus === "canceled" || pagarmeStatus === "ended"
      ? "canceled"
      : "active"; // treat pending/unknown as active (first charge in progress)

    // Next billing date
    const expiresAt = subData.next_billing_at
      ?? subData.current_period?.end_at
      ?? new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString();

    // ── Update condo ──────────────────────────────────────────────────────
    const { error: updateErr } = await supabaseAdmin
      .from("condos")
      .update({
        subscription_id: subData.id,
        subscription_status: internalStatus,
        subscription_expires_at: expiresAt,
        pagarme_customer_id: customerId,
      })
      .eq("id", condo_id);

    if (updateErr) {
      console.error("[create-subscription] Failed to update condo:", updateErr.message);
      // Subscription was created in Pagar.me — return partial success
      return json({
        warning: "Assinatura criada mas houve erro ao salvar no banco. Contate o suporte.",
        subscription_id: subData.id,
      }, 207);
    }

    return json({
      success: true,
      subscription_id: subData.id,
      status: internalStatus,
      next_billing_at: expiresAt,
    });
  } catch (e) {
    console.error("[create-subscription] Unexpected error:", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});
