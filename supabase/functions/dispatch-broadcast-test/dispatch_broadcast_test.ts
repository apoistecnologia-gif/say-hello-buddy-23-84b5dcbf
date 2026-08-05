import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// Integration test: APOIS broadcast dispatch
//  1. Quando uma corrida é ofertada, TODOS os motoristas elegíveis aparecem
//  2. O sistema respeita raio de busca e status "online"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function cleanupTestUser(email: string) {
  const { data: users } = await admin.auth.admin.listUsers();
  const user = users.users.find((u) => u.email === email);
  if (user) {
    await admin.auth.admin.deleteUser(user.id);
  }
}

async function createTestDriver(label: string, lat: number, lng: number) {
  const email = `dispatch-test-${label}-${crypto.randomUUID()}@apois.test`;
  const password = "password123";

  const { data: auth, error: signUpError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (signUpError || !auth.user) throw signUpError || new Error("Auth failed");

  // Initial data via trigger/Architecture A
  await admin
    .from("drivers")
    .update({
      name: `Test Driver ${label}`,
      status: "online",
      approval_status: "aprovado",
      current_lat: lat,
      current_lng: lng,
      last_location_update: new Date().toISOString(),
    })
    .eq("user_id", auth.user.id);

  return { id: auth.user.id, email };
}

Deno.test("broadcast dispatch — todos os motoristas recebem a oferta simultaneamente", async () => {
  const drivers = [];
  try {
    // 3 motoristas no raio de 5km
    drivers.push(await createTestDriver("A", -23.5505, -46.6333));
    drivers.push(await createTestDriver("B", -23.5510, -46.6340));
    drivers.push(await createTestDriver("C", -23.5520, -46.6350));

    const paxEmail = `dispatch-test-pax-${crypto.randomUUID()}@apois.test`;
    const { data: paxAuth } = await admin.auth.admin.createUser({
      email: paxEmail,
      password: "password123",
      email_confirm: true,
    });

    if (!paxAuth.user) throw new Error("Pax auth failed");

    // Solicitar corrida
    const { data: ride, error: rideError } = await admin
      .from("rides")
      .insert({
        passenger_id: paxAuth.user.id,
        origin_lat: -23.5500,
        origin_lng: -46.6330,
        destination_lat: -23.5590,
        destination_lng: -46.6390,
        status: "searching",
        category_id: "7b47b47b-47b4-47b4-47b4-7b47b47b47b4", // Default/Standard
      })
      .select()
      .single();

    if (rideError) throw rideError;

    // Verificar se os 3 foram notificados no candidate_driver_ids
    // (Assume que o trigger de dispatch povoa isso imediatamente no insert da ride)
    const { data: updatedRide } = await admin
      .from("rides")
      .select("candidate_driver_ids")
      .eq("id", ride.id)
      .single();

    const candidates = updatedRide?.candidate_driver_ids || [];
    
    if (candidates.length !== 3) {
      console.error("Candidates found:", candidates);
      throw new Error(`Expected 3 drivers, found ${candidates.length}`);
    }

  } finally {
    for (const d of drivers) {
      await cleanupTestUser(d.email);
    }
  }
});
