import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

// ─── Status mapping ───────────────────────────────────────────────────────────
// Maps Pagar.me subscription event types to internal subscription_status values.
const EVENT_STATUS_MAP: Record<string, string | null> = {
  // Subscription lifecycle
  "subscription.created":          "active",
  "subscription.updated":          null, // handled via status field below
  "subscription.canceled":         "canceled",
  "subscription.ended":            "canceled",

  // Charge / invoice outcomes
  "charge.paid":                   "active",
  "charge.payment_failed":         "past_due",
  "charge.refunded":               null, // ignore

  // Invoice-level events
  "invoice.paid":                  "active",
  "invoice.payment_failed":        "past_due",
  "invoice.canceled":              "canceled",
};

// Pagar.me subscription status → internal status
const PAGARME_STATUS_MAP: Record<string, string> = {
  active:    "active",
  trialing:  "active",
  pending:   "active",   // first charge pending → optimistic
  past_due:  "past_due",
  canceled:  "canceled",
  ended:     "canceled",
};

// ─── HMAC validation ─────────────────────────────────────────────────────────

async function verifySignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;

  // Pagar.me V5 sends: "t=<timestamp>,v1=<hex_hmac>"
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => p.split("=")),
  );
  const timestamp = parts["t"];
  const receivedHex = parts["v1"];

  if (!timestamp || !receivedHex) return false;

  const payload = `${timestamp}.${rawBody}`;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(payload);

  const key = await crypto.subtle.importKey(
    "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, msgData);
  const computedHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computedHex === receivedHex;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

serve(async (req) => {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  if (req.method === "GET") {
    return json({ ok: true, message: "pagarme-webhook is live" });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const rawBody = await req.text();
    const WEBHOOK_SECRET = Deno.env.get("PAGARME_WEBHOOK_SECRET") ?? "";

    // Validate signature (skip if secret not configured — log warning)
    if (WEBHOOK_SECRET) {
      const signatureHeader = req.headers.get("x-hub-signature") ??
        req.headers.get("x-pagarme-signature") ?? null;
      const valid = await verifySignature(WEBHOOK_SECRET, rawBody, signatureHeader);
      if (!valid) {
        console.warn("[pagarme-webhook] Invalid signature — rejecting");
        return json({ error: "Invalid signature" }, 401);
      }
    } else {
      console.warn("[pagarme-webhook] PAGARME_WEBHOOK_SECRET not set — skipping signature check");
    }

    const event = JSON.parse(rawBody);
    const eventType: string = event.type ?? "";
    const eventData = event.data ?? {};

    console.log(`[pagarme-webhook] Received event: ${eventType}`);

    // ── Determine subscription ID and target status ────────────────────────
    let subscriptionId: string | null = null;
    let targetStatus: string | null = EVENT_STATUS_MAP[eventType] ?? null;

    // Events that carry a subscription object directly
    if (eventData.id?.startsWith("sub_")) {
      subscriptionId = eventData.id;
      // Prefer status from the subscription object when event is "updated"
      if (eventType === "subscription.updated" && eventData.status) {
        targetStatus = PAGARME_STATUS_MAP[eventData.status] ?? null;
      }
    }

    // Events that carry charge/invoice objects referencing a subscription
    if (!subscriptionId && eventData.subscription_id) {
      subscriptionId = eventData.subscription_id;
    }
    if (!subscriptionId && eventData.invoice?.subscription_id) {
      subscriptionId = eventData.invoice.subscription_id;
    }

    if (!subscriptionId || !targetStatus) {
      console.log(`[pagarme-webhook] Ignored event ${eventType} — no subscription_id or status mapping`);
      return json({ received: true, action: "ignored" });
    }

    // ── Update condo ──────────────────────────────────────────────────────
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { db: { schema: "nfe_vigia" } },
    );

    const updatePayload: Record<string, unknown> = {
      subscription_status: targetStatus,
    };

    // Update expiry if present in the event data
    const newExpiresAt = eventData.next_billing_at ??
      eventData.current_period?.end_at ??
      eventData.invoice?.due_at ?? null;
    if (newExpiresAt) {
      updatePayload.subscription_expires_at = newExpiresAt;
    }

    const { error, count } = await supabaseAdmin
      .from("condos")
      .update(updatePayload)
      .eq("subscription_id", subscriptionId)
      .select("id", { count: "exact", head: true });

    if (error) {
      console.error(`[pagarme-webhook] DB update error for sub ${subscriptionId}:`, error.message);
      return json({ error: "DB update failed" }, 500);
    }

    console.log(
      `[pagarme-webhook] Updated sub ${subscriptionId} → status=${targetStatus} (${count ?? 0} rows)`,
    );

    return json({ received: true, subscription_id: subscriptionId, status: targetStatus });
  } catch (e) {
    console.error("[pagarme-webhook] Unexpected error:", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});
