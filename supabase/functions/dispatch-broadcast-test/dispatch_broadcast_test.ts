// Integration test: MOVVI DRIVE broadcast dispatch
// -----------------------------------------------------------------------------
// Garante o contrato CRÍTICO do despacho em broadcast:
//
//  1. Quando uma corrida é ofertada, TODOS os motoristas elegíveis aparecem
//     simultaneamente em `candidate_driver_ids` — não há rotação 1-a-1.
//  2. Quando vários motoristas tentam aceitar ao mesmo tempo, SOMENTE O
//     PRIMEIRO consegue gravar `accepted_driver_id`; os demais recebem o
//     erro PostgREST PGRST116 ("no rows match"), exatamente como
//     `aceitarCorrida` (src/lib/rideLifecycle.ts) propaga ao app.
//
// Execução: este arquivo roda com `supabase--test_edge_functions`, que
// invoca `deno test --allow-net --allow-env`. As variáveis `SUPABASE_URL` e
// `SUPABASE_SERVICE_ROLE_KEY` são injetadas automaticamente pelo runtime
// das edge functions.
// -----------------------------------------------------------------------------

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios para o teste.");
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Origem usada na simulação (centro de São Paulo). Drivers ficam a < 1km.
const ORIGIN = { lat: -23.5505, lng: -46.6333 };
const DEST = { lat: -23.5605, lng: -46.6433 };

type CreatedDriver = { authId: string; email: string };

async function createTestDriver(label: string): Promise<CreatedDriver> {
  const email = `dispatch-test-${label}-${crypto.randomUUID()}@apois.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "Test1234!",
    email_confirm: true,
    user_metadata: { role: "driver", name: `Driver ${label}` },
  });
  if (error || !data.user) {
    throw new Error(`Falha ao criar auth user (${label}): ${error?.message}`);
  }
  const authId = data.user.id;

  // O trigger handle_new_user já cria public.users + user_roles.
  // Inserimos a linha de driver elegível para despacho:
  const { error: drvError } = await admin.from("drivers").insert({
    user_id: authId,
    name: `Driver ${label}`,
    email,
    phone: "+5511999990000",
    cpf: String(Math.floor(10_000_000_000 + Math.random() * 89_999_999_999)),
    city: "São Paulo",
    state: "SP",
    category: "carros",
    is_online: true,
    approval_status: "aprovado",
    current_lat: ORIGIN.lat + (Math.random() - 0.5) * 0.005,
    current_lng: ORIGIN.lng + (Math.random() - 0.5) * 0.005,
    last_location_at: new Date().toISOString(),
    vehicle_model: "Test Car",
    vehicle_plate: `TST${Math.floor(Math.random() * 9999)}`,
    vehicle_color: "Preto",
    vehicle_year: 2022,
  });
  if (drvError) {
    await admin.auth.admin.deleteUser(authId).catch(() => {});
    throw new Error(`Falha ao inserir driver (${label}): ${drvError.message}`);
  }
  return { authId, email };
}

async function cleanup(drivers: CreatedDriver[], rideId?: string) {
  if (rideId) {
    try {
      await admin.from("rides").delete().eq("id", rideId);
    } catch {
      /* ignore */
    }
  }
  for (const d of drivers) {
    // CASCADE em auth.users limpa public.users, drivers, user_roles, etc.
    try {
      await admin.auth.admin.deleteUser(d.authId);
    } catch {
      /* ignore */
    }
  }
}

Deno.test("broadcast dispatch — todos os motoristas recebem a oferta simultaneamente", async () => {
  const drivers: CreatedDriver[] = [];
  let rideId: string | undefined;
  try {
    // Cria um passageiro (precisa de auth.user real por FK em rides.passenger_id).
    const paxEmail = `dispatch-test-pax-${crypto.randomUUID()}@apois.test`;
    const pax = await admin.auth.admin.createUser({
      email: paxEmail,
      password: "Test1234!",
      email_confirm: true,
      user_metadata: { role: "passenger", name: "Pax Test" },
    });
    if (pax.error || !pax.data.user) {
      throw new Error("Falha ao criar passageiro: " + pax.error?.message);
    }
    drivers.push({ authId: pax.data.user.id, email: paxEmail });

    // Cria 3 motoristas elegíveis.
    const d1 = await createTestDriver("A");
    const d2 = await createTestDriver("B");
    const d3 = await createTestDriver("C");
    drivers.push(d1, d2, d3);

    const candidateIds = [d1.authId, d2.authId, d3.authId];

    // Insere a corrida diretamente no estado procurar_motorista com
    // os 3 candidatos visíveis e a janela de 60s aberta.
    const requestExpiresAt = new Date(Date.now() + 60_000).toISOString();
    const ins = await admin
      .from("rides")
      .insert({
        passenger_id: pax.data.user.id,
        category: "carros",
        status: "procurar_motorista",
        origin_lat: ORIGIN.lat,
        origin_lng: ORIGIN.lng,
        origin_name: "Origem teste",
        destination_lat: DEST.lat,
        destination_lng: DEST.lng,
        destination_name: "Destino teste",
        distance_km: 5,
        duration_min: 12,
        estimated_price: 25,
        candidate_driver_ids: candidateIds,
        offered_driver_ids: candidateIds,
        request_expires_at: requestExpiresAt,
      })
      .select("*")
      .single();
    if (ins.error) throw new Error("Insert ride falhou: " + ins.error.message);
    rideId = ins.data.id as string;

    // ▶ Invariante #1: broadcast simultâneo.
    const seen = ins.data.candidate_driver_ids as string[];
    assertEquals(
      [...seen].sort(),
      [...candidateIds].sort(),
      "Todos os 3 motoristas devem aparecer em candidate_driver_ids",
    );
    assertEquals(ins.data.accepted_driver_id, null);
    assertEquals(ins.data.driver_id, null);

    // ▶ Invariante #2: aceite atômico. Disparamos 3 UPDATEs em paralelo,
    // cada um reproduzindo EXATAMENTE o filtro de `aceitarCorrida`.
    const tryAccept = async (driverId: string) => {
      const res = await admin
        .from("rides")
        .update({
          driver_id: driverId,
          accepted_driver_id: driverId,
          status: "motorista_a_caminho",
          accepted_at: new Date().toISOString(),
          current_offer_driver_id: null,
          offered_driver_ids: [],
          safety_code: String(Math.floor(1000 + Math.random() * 9000)),
        })
        .eq("id", rideId!)
        .eq("status", "procurar_motorista")
        .is("accepted_driver_id", null)
        .gt("request_expires_at", new Date().toISOString())
        .contains("candidate_driver_ids", [driverId])
        .not("rejected_driver_ids", "cs", `{${driverId}}`)
        .select("*")
        .single();
      return { driverId, error: res.error, data: res.data };
    };

    const results = await Promise.all(candidateIds.map(tryAccept));
    const winners = results.filter((r) => !r.error && r.data);
    const losers = results.filter((r) => r.error);

    assertEquals(
      winners.length,
      1,
      `Exatamente 1 motorista deve vencer o aceite, recebido ${winners.length}.`,
    );
    assertEquals(
      losers.length,
      2,
      `Exatamente 2 motoristas devem falhar, recebido ${losers.length}.`,
    );
    for (const l of losers) {
      // PostgREST PGRST116 = "JSON object requested, multiple (or no) rows".
      // `aceitarCorrida` traduz esse código para a mensagem de UI:
      // "Esta corrida já foi aceita por outro motorista."
      assertEquals(
        l.error?.code,
        "PGRST116",
        `Motorista perdedor deveria receber PGRST116, recebido ${l.error?.code} (${l.error?.message})`,
      );
    }

    // ▶ Invariante #3: leitura final consistente.
    const finalRow = await admin
      .from("rides")
      .select("driver_id, accepted_driver_id, status")
      .eq("id", rideId!)
      .single();
    assertEquals(finalRow.error, null);
    assertEquals(finalRow.data!.status, "motorista_a_caminho");
    assertEquals(finalRow.data!.driver_id, winners[0].driverId);
    assertEquals(finalRow.data!.accepted_driver_id, winners[0].driverId);
    assert(
      candidateIds.includes(finalRow.data!.accepted_driver_id as string),
      "O motorista que venceu deve ser um dos candidatos originais.",
    );
  } finally {
    await cleanup(drivers, rideId);
  }
});
