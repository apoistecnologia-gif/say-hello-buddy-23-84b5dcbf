import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { getCorsHeaders } from '../_shared/cors.ts'
import { calculateServerFare } from '../_shared/pricing.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: getCorsHeaders(req) });

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: getCorsHeaders(req) });

    // Use service role for database queries as it needs to read all rules
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const input = await req.json();
    const { distanceMeters, durationSeconds, categoryIds, serviceDetails } = input;

    const { data: categories, error: catError } = await supabaseAdmin
      .from("ride_categories")
      .select("id, code, name")
      .eq("is_active", true);

    if (catError) throw catError;

    const { data: rules, error: ruleError } = await supabaseAdmin
      .from("tariff_rules")
      .select("*");

    if (ruleError) throw ruleError;

    const km = distanceMeters / 1000;
    const min = durationSeconds / 60;

    const estimates = (categories || [])
      .filter(cat => !categoryIds || categoryIds.includes(cat.id))
      .map(cat => {
        const catRules = rules?.filter(r => r.category_id === cat.id || r.category_key === cat.code);
        if (!catRules?.length) {
          return { categoryId: cat.id, available: false, unavailableReason: "Sem regras de tarifa" };
        }

        const tariff: Record<string, number> = {};
        catRules.forEach(r => {
          tariff[r.field_key] = Number(r.value);
        });

        try {
          const breakdown = calculateServerFare({
            category: cat.code,
            distanceKm: km,
            durationMin: min,
            tariff,
            serviceDetails
          });

          return {
            categoryId: cat.id,
            categoryCode: cat.code,
            available: true,
            estimatedPrice: breakdown.total,
            basePrice: breakdown.base,
            extras: breakdown.extras,
            currency: "BRL"
          };
        } catch (err) {
          return { categoryId: cat.id, available: false, unavailableReason: err.message };
        }
      });

    return new Response(JSON.stringify({ ok: true, estimates, pricingVersion: "v2-edge" }), { 
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: getCorsHeaders(req) });
  }
})
