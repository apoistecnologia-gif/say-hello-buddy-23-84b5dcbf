import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_TOKEN = Deno.env.get("ASAAS_WEBHOOK_TOKEN")?.trim() ?? "";
const MONTHLY_FEE_CENTS = 4990;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function paidThroughForDueDate(dueDate: unknown): string {
  const raw = String(dueDate ?? "");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T23:59:59.999Z`)
    : new Date();
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString();
}

function mapAccountApprovalStatus(
  value: unknown,
): "approved" | "pending" | "rejected" | null {
  const status = String(value ?? "").trim().toUpperCase();
  if (status === "APPROVED") return "approved";
  if (status === "REJECTED") return "rejected";
  if (status === "PENDING" || status === "AWAITING_APPROVAL") return "pending";
  return null;
}

async function dispatchPaidPix(rideId: string): Promise<void> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/passenger-ride-request`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
      "content-type": "application/json",
    },
    body: JSON.stringify({ action: "dispatch_paid_pix", ride_id: rideId }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`prepaid_pix_dispatch_failed:${response.status}:${detail.slice(0, 200)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!WEBHOOK_TOKEN) return json({ error: "webhook_not_configured" }, 503);

  const incomingToken = req.headers.get("asaas-access-token") ?? "";
  if (incomingToken !== WEBHOOK_TOKEN) return json({ error: "unauthorized" }, 401);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const eventId = String(payload?.id ?? "").trim();
  const eventType = String(payload?.event ?? "").trim().toUpperCase();
  const payment = payload?.payment ?? null;
  const paymentId = String(payment?.id ?? "").trim();
  const transfer = payload?.transfer ?? null;
  const transferId = String(transfer?.id ?? "").trim();
  const account = payload?.account ?? null;
  const accountId = String(account?.id ?? "").trim();
  if (!eventId || !eventType) return json({ error: "invalid_event" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existing } = await admin
    .from("asaas_webhook_events")
    .select("status")
    .eq("event_id", eventId)
    .maybeSingle();
  if (existing?.status === "processed" || existing?.status === "ignored") {
    return json({ ok: true, duplicate: true });
  }

  const { error: eventWriteError } = await admin.from("asaas_webhook_events").upsert(
    {
      event_id: eventId,
      event_type: eventType,
      provider_payment_id: paymentId || transferId || accountId || null,
      payload,
      status: "received",
      error: null,
      received_at: new Date().toISOString(),
    },
    { onConflict: "event_id" },
  );
  if (eventWriteError) return json({ error: "event_persist_failed" }, 500);

  try {
    if (eventType.startsWith("ACCOUNT_STATUS_")) {
      if (!accountId) throw new Error("asaas_account_id_missing");
      const generalStatus = mapAccountApprovalStatus(payload?.accountStatus?.general);
      const { data: driverAccount } = await admin
        .from("driver_asaas_accounts")
        .select("driver_id,status")
        .eq("subaccount_id", accountId)
        .maybeSingle();
      if (!driverAccount) {
        await admin
          .from("asaas_webhook_events")
          .update({ status: "ignored", processed_at: new Date().toISOString() })
          .eq("event_id", eventId);
        return json({ ok: true, ignored: true, kind: "account_status" });
      }

      const nowIso = new Date().toISOString();
      const rejected = generalStatus === "rejected" || eventType.endsWith("_REJECTED");
      const updatePayload: Record<string, unknown> = {
        updated_at: nowIso,
        last_error: rejected ? `asaas_account_status:${eventType}` : null,
      };
      if (generalStatus) updatePayload.status = generalStatus;
      const { error: accountUpdateError } = await admin
        .from("driver_asaas_accounts")
        .update(updatePayload)
        .eq("driver_id", driverAccount.driver_id);
      if (accountUpdateError) throw accountUpdateError;

      await admin
        .from("asaas_webhook_events")
        .update({ status: "processed", processed_at: nowIso })
        .eq("event_id", eventId);
      return json({
        ok: true,
        kind: "driver_account_status",
        status: generalStatus ?? driverAccount.status,
      });
    }

    const transferEvents = new Set([
      "TRANSFER_CREATED",
      "TRANSFER_PENDING",
      "TRANSFER_IN_BANK_PROCESSING",
      "TRANSFER_BLOCKED",
      "TRANSFER_DONE",
      "TRANSFER_FAILED",
      "TRANSFER_CANCELLED",
    ]);
    if (transferEvents.has(eventType)) {
      if (!transferId) throw new Error("asaas_transfer_id_missing");
      const { data: withdrawal } = await admin
        .from("driver_withdrawals")
        .select("id,status,provider_transfer_id")
        .eq("provider", "asaas")
        .eq("provider_transfer_id", transferId)
        .maybeSingle();
      if (!withdrawal) {
        await admin
          .from("asaas_webhook_events")
          .update({ status: "ignored", processed_at: new Date().toISOString() })
          .eq("event_id", eventId);
        return json({ ok: true, ignored: true, kind: "transfer" });
      }

      const nowIso = new Date().toISOString();
      const endToEndId = transfer?.endToEndIdentifier
        ? String(transfer.endToEndIdentifier)
        : null;
      if (eventType === "TRANSFER_DONE") {
        const { error } = await admin.rpc("mark_driver_withdrawal_paid", {
          _withdrawal_id: withdrawal.id,
          _transfer_id: transferId,
          _end_to_end_id: endToEndId,
          _response: transfer,
        });
        if (error) throw error;
      } else if (eventType === "TRANSFER_FAILED" || eventType === "TRANSFER_CANCELLED") {
        const reason = String(
          transfer?.failReason ?? `asaas_${eventType.toLowerCase()}`,
        ).slice(0, 1000);
        const { error } = await admin.rpc("mark_driver_withdrawal_failed", {
          _withdrawal_id: withdrawal.id,
          _reason: reason,
          _response: transfer,
        });
        if (error) throw error;
      } else {
        await admin
          .from("driver_withdrawals")
          .update({
            status: "processing",
            provider_end_to_end_id: endToEndId,
            provider_response: transfer,
            failure_reason: eventType === "TRANSFER_BLOCKED" ? "asaas_transfer_blocked" : null,
            processed_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", withdrawal.id)
          .in("status", ["pending", "processing"]);
      }

      await admin
        .from("asaas_webhook_events")
        .update({ status: "processed", processed_at: nowIso })
        .eq("event_id", eventId);
      return json({ ok: true, kind: "driver_payout", transferId });
    }

    const paymentEvents = new Set([
      "PAYMENT_CREATED",
      "PAYMENT_CONFIRMED",
      "PAYMENT_RECEIVED",
      "PAYMENT_OVERDUE",
      "PAYMENT_REFUNDED",
      "PAYMENT_DELETED",
    ]);
    if (!paymentEvents.has(eventType) || !paymentId) {
      await admin
        .from("asaas_webhook_events")
        .update({ status: "ignored", processed_at: new Date().toISOString() })
        .eq("event_id", eventId);
      return json({ ok: true, ignored: true });
    }

    let { data: membershipCharge } = await admin
      .from("driver_membership_charges")
      .select("id,driver_id,provider_payment_id,provider_subscription_id,due_date")
      .eq("provider_payment_id", paymentId)
      .maybeSingle();

    if (!membershipCharge && payment?.subscription) {
      const { data: membership } = await admin
        .from("driver_memberships")
        .select("driver_id,provider_subscription_id")
        .eq("provider_subscription_id", String(payment.subscription))
        .maybeSingle();
      const valueCents = Math.round(Number(payment?.value ?? 0) * 100);
      if (membership && valueCents === MONTHLY_FEE_CENTS) {
        const { data: createdCharge, error: chargeInsertError } = await admin
          .from("driver_membership_charges")
          .upsert(
            {
              driver_id: membership.driver_id,
              provider_payment_id: paymentId,
              provider_subscription_id: membership.provider_subscription_id,
              amount_cents: MONTHLY_FEE_CENTS,
              due_date: payment?.dueDate ?? new Date().toISOString().slice(0, 10),
              status: eventType === "PAYMENT_OVERDUE" ? "overdue" : "pending",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "provider_payment_id" },
          )
          .select("id,driver_id,provider_payment_id,provider_subscription_id,due_date")
          .single();
        if (chargeInsertError) throw chargeInsertError;
        membershipCharge = createdCharge;
      }
    }

    if (membershipCharge) {
      const nowIso = new Date().toISOString();
      if (eventType === "PAYMENT_RECEIVED") {
        const paidThrough = paidThroughForDueDate(membershipCharge.due_date);
        await admin
          .from("driver_membership_charges")
          .update({ status: "received", paid_at: nowIso, updated_at: nowIso })
          .eq("id", membershipCharge.id);
        await admin
          .from("driver_memberships")
          .update({
            current_payment_id: paymentId,
            status: "active",
            paid_through: paidThrough,
            last_payment_status: "RECEIVED",
            last_payment_at: nowIso,
            next_due_date: paidThrough.slice(0, 10),
            updated_at: nowIso,
          })
          .eq("driver_id", membershipCharge.driver_id);
        await admin
          .from("drivers")
          .update({ subscription_status: "active", updated_at: nowIso })
          .eq("id", membershipCharge.driver_id);
      } else if (eventType === "PAYMENT_CONFIRMED") {
        await admin
          .from("driver_membership_charges")
          .update({ status: "confirmed", updated_at: nowIso })
          .eq("id", membershipCharge.id);
        await admin
          .from("driver_memberships")
          .update({ last_payment_status: "CONFIRMED", updated_at: nowIso })
          .eq("driver_id", membershipCharge.driver_id);
      } else if (eventType === "PAYMENT_OVERDUE") {
        await admin
          .from("driver_membership_charges")
          .update({ status: "overdue", updated_at: nowIso })
          .eq("id", membershipCharge.id);
        const { data: membership } = await admin
          .from("driver_memberships")
          .select("paid_through")
          .eq("driver_id", membershipCharge.driver_id)
          .single();
        if (!membership?.paid_through || new Date(membership.paid_through) <= new Date()) {
          await admin
            .from("driver_memberships")
            .update({ status: "overdue", last_payment_status: "OVERDUE", updated_at: nowIso })
            .eq("driver_id", membershipCharge.driver_id);
          await admin
            .from("drivers")
            .update({ subscription_status: "inactive", is_online: false, updated_at: nowIso })
            .eq("id", membershipCharge.driver_id);
        }
      } else if (eventType === "PAYMENT_REFUNDED" || eventType === "PAYMENT_DELETED") {
        const chargeStatus = eventType === "PAYMENT_REFUNDED" ? "refunded" : "cancelled";
        await admin
          .from("driver_membership_charges")
          .update({ status: chargeStatus, updated_at: nowIso })
          .eq("id", membershipCharge.id);
        await admin
          .from("driver_memberships")
          .update({
            status: "inactive",
            last_payment_status: eventType.replace("PAYMENT_", ""),
            updated_at: nowIso,
          })
          .eq("driver_id", membershipCharge.driver_id);
        await admin
          .from("drivers")
          .update({ subscription_status: "inactive", is_online: false, updated_at: nowIso })
          .eq("id", membershipCharge.driver_id);
      }

      await admin
        .from("asaas_webhook_events")
        .update({ status: "processed", processed_at: nowIso })
        .eq("event_id", eventId);
      return json({ ok: true, kind: "driver_membership" });
    }

    const { data: ridePayment } = await admin
      .from("ride_pix_payments")
      .select("id,ride_id,amount_cents,status,provider,provider_payment_id")
      .eq("provider_payment_id", paymentId)
      .maybeSingle();

    if (ridePayment) {
      const nowIso = new Date().toISOString();
      const grossCents = Math.round(Number(payment?.value ?? 0) * 100);
      if (grossCents <= 0 || grossCents !== Number(ridePayment.amount_cents)) {
        throw new Error("asaas_ride_payment_amount_mismatch");
      }
      const netCents = Math.max(
        0,
        Math.round(Number(payment?.netValue ?? payment?.value ?? 0) * 100),
      );
      const feeCents = Math.max(0, grossCents - netCents);
      const mappedStatus =
        eventType === "PAYMENT_RECEIVED"
          ? "received"
          : eventType === "PAYMENT_CONFIRMED"
            ? "confirmed"
            : eventType === "PAYMENT_OVERDUE"
              ? "overdue"
              : eventType === "PAYMENT_REFUNDED"
                ? "refunded"
                : eventType === "PAYMENT_DELETED"
                  ? "cancelled"
                  : "pending";

      const paymentUpdate: Record<string, unknown> = {
        status: mappedStatus,
        updated_at: nowIso,
      };
      if (eventType === "PAYMENT_RECEIVED") {
        paymentUpdate.paid_at = nowIso;
        paymentUpdate.provider_net_amount_cents = netCents;
        paymentUpdate.provider_fee_cents = feeCents;
      }
      const { error: ridePaymentUpdateError } = await admin
        .from("ride_pix_payments")
        .update(paymentUpdate)
        .eq("id", ridePayment.id);
      if (ridePaymentUpdateError) throw ridePaymentUpdateError;

      if (eventType === "PAYMENT_RECEIVED") {
        const { data: activation, error: activationError } = await admin.rpc(
          "activate_prepaid_pix_ride",
          {
            _ride_id: ridePayment.ride_id,
            _provider_payment_id: paymentId,
          },
        );
        if (activationError) throw activationError;
        if (activation?.stale_payment) {
          await admin
            .from("asaas_webhook_events")
            .update({ status: "processed", processed_at: nowIso })
            .eq("event_id", eventId);
          return json({ ok: true, kind: "ride_payment", stale: true, dispatch: false });
        }
        if (activation?.should_dispatch) await dispatchPaidPix(ridePayment.ride_id);
      } else if (eventType === "PAYMENT_OVERDUE" || eventType === "PAYMENT_DELETED") {
        const nextPaymentStatus = eventType === "PAYMENT_OVERDUE" ? "expired" : "failed";
        await admin
          .from("rides")
          .update({ payment_status: nextPaymentStatus, updated_at: nowIso })
          .eq("id", ridePayment.ride_id)
          .eq("status", "aguardando_pagamento")
          .eq("provider_payment_id", paymentId)
          .neq("payment_status", "paid");
      } else if (eventType === "PAYMENT_REFUNDED") {
        const { error: reversalError } = await admin.rpc("reverse_refunded_ride_payment", {
          _ride_id: ridePayment.ride_id,
          _provider: String(ridePayment.provider ?? "asaas"),
          _provider_payment_id: paymentId,
          _refunded_amount: Number(payment?.value ?? 0),
        });
        if (reversalError) throw reversalError;
      }

      await admin
        .from("asaas_webhook_events")
        .update({ status: "processed", processed_at: nowIso })
        .eq("event_id", eventId);
      return json({
        ok: true,
        kind: "ride_payment",
        status: mappedStatus,
        dispatch: eventType === "PAYMENT_RECEIVED",
      });
    }

    await admin
      .from("asaas_webhook_events")
      .update({ status: "ignored", processed_at: new Date().toISOString() })
      .eq("event_id", eventId);
    return json({ ok: true, ignored: true });
  } catch (error) {
    const message = String(error).slice(0, 500);
    console.error("[asaas-webhook] processing failed", message);
    await admin
      .from("asaas_webhook_events")
      .update({ status: "failed", error: message })
      .eq("event_id", eventId);
    return json({ error: "processing_failed" }, 500);
  }
});
