import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const SCHEMA_VERSION = "1.0";
const SERVICE_NAME = "xispa-energy-query";
const MAX_LIMIT = 48;\nconst XISPA_KEY_SHA256 = "0088c50af1c5a91ab9ccb5f2085d952f2e39b6aaa79cad45bd36837a52072457";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-xispa-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
});

const ok = (data: unknown, meta: Record<string, unknown> = {}) => json({
  ok: true,
  schemaVersion: SCHEMA_VERSION,
  data,
  meta: { service: SERVICE_NAME, ...meta },
});

const fail = (code: string, status: number, message?: string, details?: unknown) => json({
  ok: false,
  schemaVersion: SCHEMA_VERSION,
  error: { code, message: message || code, ...(details === undefined ? {} : { details }) },
  meta: { service: SERVICE_NAME },
}, status);

const norm = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const cupsKey = (value: unknown) => norm(value).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
const isUuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const clampLimit = (value: unknown, fallback = 24) => Math.min(MAX_LIMIT, Math.max(1, Number(value) || fallback));
const ilikeTerm = (value: unknown) => "%" + norm(value).replace(/[%,()]/g, " ").slice(0, 120) + "%";

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function groupBy<T extends Record<string, any>>(rows: T[], key: string) {
  const out: Record<string, T[]> = {};
  for (const row of rows || []) {
    const k = String(row?.[key] ?? "");
    if (!k) continue;
    (out[k] ||= []).push(row);
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).at(-1) || "health";

  if (req.method === "GET" && (action === SERVICE_NAME || action === "health")) {
    return ok({
      status: "ok",
      authConfigured: Boolean(Deno.env.get("XISPA_ENERGY_API_KEY") || XISPA_KEY_SHA256),
      capabilities: [
        "search-clients",
        "search-supplies",
        "client",
        "supply",
        "history",
        "invoice",
        "opportunities",
      ],
      readOnly: true,
    });
  }

  if (req.method !== "POST") return fail("method_not_allowed", 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const secret = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}")?.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const publishable = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}")?.default || Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!supabaseUrl || !secret || !publishable) return fail("server_not_configured", 503);

  const admin = createClient(supabaseUrl, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const expectedKey = Deno.env.get("XISPA_ENERGY_API_KEY") || "";
    const suppliedKey = req.headers.get("x-xispa-key") || "";
    let authMode: "xispa_key" | "internal_user" | null = null;
    let actorUserId: string | null = null;

    const suppliedHash = suppliedKey ? await sha256Hex(suppliedKey) : "";
    if (
      (expectedKey && timingSafeEqual(suppliedKey, expectedKey)) ||
      (suppliedHash && timingSafeEqual(suppliedHash, XISPA_KEY_SHA256))
    ) {
      authMode = "xispa_key";
    } else {
      const authHeader = req.headers.get("Authorization") || "";
      if (authHeader.startsWith("Bearer ")) {
        const userClient = createClient(supabaseUrl, publishable, {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: userData, error: userError } = await userClient.auth.getUser();
        const user = userData?.user;
        if (!userError && user) {
          const { data: profile, error: profileError } = await admin
            .from("profiles")
            .select("id,role,active")
            .eq("id", user.id)
            .maybeSingle();
          if (!profileError && profile && profile.active !== false && ["admin", "staff"].includes(profile.role)) {
            authMode = "internal_user";
            actorUserId = user.id;
          }
        }
      }
    }

    if (!authMode) return fail("unauthorized", 401, "Se requiere una credencial interna valida.");

    const body = await req.json().catch(() => ({}));

    async function resolveSupply(input: any) {
      let query = admin.from("supplies").select("id,holder_id,cups,cups_key,supply_name,address,city,province,postal_code,current_tariff,current_contract_number,current_retailer,current_distributor,status,updated_at");
      if (isUuid(input?.supply_id)) query = query.eq("id", input.supply_id);
      else {
        const key = cupsKey(input?.cups);
        if (!key) return { supply: null, holder: null, client: null, error: "supply_identifier_required" };
        query = query.eq("cups_key", key);
      }
      const { data: supply, error } = await query.maybeSingle();
      if (error) throw error;
      if (!supply) return { supply: null, holder: null, client: null, error: "supply_not_found" };

      const { data: holder, error: holderError } = await admin
        .from("holders")
        .select("id,client_id,legal_name,status")
        .eq("id", supply.holder_id)
        .maybeSingle();
      if (holderError) throw holderError;
      if (!holder) return { supply, holder: null, client: null, error: "holder_not_found" };

      const { data: client, error: clientError } = await admin
        .from("clients")
        .select("id,name,reference,status")
        .eq("id", holder.client_id)
        .maybeSingle();
      if (clientError) throw clientError;
      return { supply, holder, client, error: client ? null : "client_not_found" };
    }

    if (action === "search-clients") {
      const q = norm(body?.query);
      if (q.length < 2) return fail("query_too_short", 400, "La busqueda necesita al menos 2 caracteres.");
      const limit = Math.min(25, clampLimit(body?.limit, 10));
      const term = ilikeTerm(q);
      const fields = ["name", "reference", "tax_id"];
      const found = new Map<string, any>();
      for (const field of fields) {
        const { data, error } = await admin
          .from("clients")
          .select("id,name,reference,status")
          .eq("status", "active")
          .ilike(field, term)
          .limit(limit);
        if (error) throw error;
        for (const row of data || []) found.set(row.id, row);
      }
      const rows = [...found.values()].slice(0, limit);
      return ok(rows, { count: rows.length, authMode });
    }

    if (action === "search-supplies") {
      const q = norm(body?.query);
      if (q.length < 2) return fail("query_too_short", 400, "La busqueda necesita al menos 2 caracteres.");
      const limit = Math.min(30, clampLimit(body?.limit, 12));
      const term = ilikeTerm(q);
      const fields = ["cups", "supply_name", "address", "city", "postal_code"];
      const found = new Map<string, any>();
      for (const field of fields) {
        const { data, error } = await admin
          .from("supplies")
          .select("id,holder_id,cups,supply_name,address,city,province,postal_code,current_tariff,current_retailer,current_distributor,status")
          .ilike(field, term)
          .limit(limit);
        if (error) throw error;
        for (const row of data || []) found.set(row.id, row);
      }
      const supplies = [...found.values()].slice(0, limit);
      const holderIds = [...new Set(supplies.map((s: any) => s.holder_id).filter(Boolean))];
      let holders: any[] = [];
      if (holderIds.length) {
        const { data, error } = await admin.from("holders").select("id,client_id,legal_name").in("id", holderIds);
        if (error) throw error;
        holders = data || [];
      }
      const clientIds = [...new Set(holders.map((h: any) => h.client_id).filter(Boolean))];
      let clients: any[] = [];
      if (clientIds.length) {
        const { data, error } = await admin.from("clients").select("id,name,reference").in("id", clientIds);
        if (error) throw error;
        clients = data || [];
      }
      const holderMap = new Map(holders.map((h: any) => [h.id, h]));
      const clientMap = new Map(clients.map((c: any) => [c.id, c]));
      const rows = supplies.map((s: any) => {
        const holder = holderMap.get(s.holder_id);
        const client = clientMap.get(holder?.client_id);
        return { ...s, holder: holder ? { id: holder.id, legal_name: holder.legal_name } : null, client: client || null };
      });
      return ok(rows, { count: rows.length, authMode });
    }

    if (action === "client") {
      if (!isUuid(body?.client_id)) return fail("invalid_client_id", 400);
      const { data: client, error: clientError } = await admin
        .from("clients")
        .select("id,name,reference,status,notes,updated_at")
        .eq("id", body.client_id)
        .maybeSingle();
      if (clientError) throw clientError;
      if (!client) return fail("client_not_found", 404);

      const { data: holders, error: holderError } = await admin
        .from("holders")
        .select("id,client_id,legal_name,status")
        .eq("client_id", client.id)
        .order("legal_name");
      if (holderError) throw holderError;
      const holderIds = (holders || []).map((h: any) => h.id);
      let supplies: any[] = [];
      if (holderIds.length) {
        const { data, error } = await admin
          .from("supplies")
          .select("id,holder_id,cups,supply_name,address,city,province,postal_code,current_tariff,current_contract_number,current_retailer,current_distributor,status,updated_at")
          .in("holder_id", holderIds)
          .order("cups");
        if (error) throw error;
        supplies = data || [];
      }
      return ok({ client, holders: holders || [], supplies }, { authMode });
    }

    if (action === "supply") {
      const resolved = await resolveSupply(body);
      if (resolved.error === "supply_identifier_required") return fail(resolved.error, 400);
      if (resolved.error) return fail(resolved.error, 404);

      const { data: latest, error: latestError } = await admin
        .from("invoices")
        .select("id,invoice_number,billing_start,billing_end,issue_date,tariff,retailer,distributor,consumption_kwh,total_eur,power_cost_eur,excess_cost_eur,reactive_cost_eur,validation_status,completeness_assessment_status,reading_status")
        .eq("supply_id", resolved.supply.id)
        .is("superseded_by", null)
        .order("billing_end", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestError) throw latestError;

      let powerPeriods: any[] = [];
      if (latest?.id) {
        const { data, error } = await admin
          .from("invoice_power_periods")
          .select("period,contracted_kw,billed_power_eur,unit_price_eur_kw_day")
          .eq("invoice_id", latest.id)
          .order("period");
        if (error) throw error;
        powerPeriods = data || [];
      }

      return ok({
        client: resolved.client,
        holder: resolved.holder,
        supply: resolved.supply,
        latestInvoice: latest || null,
        latestContractedPower: powerPeriods,
      }, { authMode });
    }

    if (action === "history") {
      const resolved = await resolveSupply(body);
      if (resolved.error === "supply_identifier_required") return fail(resolved.error, 400);
      if (resolved.error) return fail(resolved.error, 404);
      const limit = clampLimit(body?.limit, 24);

      let query = admin
        .from("invoices")
        .select("id,invoice_number,billing_start,billing_end,issue_date,billing_days,tariff,retailer,distributor,consumption_kwh,energy_cost_eur,power_cost_eur,excess_cost_eur,reactive_cost_eur,compensation_eur,electricity_tax_eur,vat_eur,igic_eur,other_cost_eur,total_eur,average_total_eur_kwh,validation_status,validation_message,completeness_assessment_status,reading_status,reading_source_label")
        .eq("supply_id", resolved.supply.id)
        .is("superseded_by", null)
        .order("billing_end", { ascending: false })
        .limit(limit);
      if (body?.from) query = query.gte("billing_end", String(body.from));
      if (body?.to) query = query.lte("billing_start", String(body.to));
      const { data: invoices, error: invoiceError } = await query;
      if (invoiceError) throw invoiceError;

      const invoiceIds = (invoices || []).map((row: any) => row.id);
      let energy: any[] = [], power: any[] = [], maximeters: any[] = [], excesses: any[] = [], reactive: any[] = [];
      if (invoiceIds.length) {
        const results = await Promise.all([
          admin.from("invoice_energy_periods").select("invoice_id,period,consumption_kwh,energy_cost_eur,unit_price_eur_kwh").in("invoice_id", invoiceIds).order("period"),
          admin.from("invoice_power_periods").select("invoice_id,period,contracted_kw,billed_power_eur,unit_price_eur_kw_day").in("invoice_id", invoiceIds).order("period"),
          admin.from("invoice_maximeters").select("invoice_id,period,maximeter_kw,reliable,source").in("invoice_id", invoiceIds).order("period"),
          admin.from("invoice_excesses").select("invoice_id,period,excess_kw,unit_price,amount_eur").in("invoice_id", invoiceIds).order("period"),
          admin.from("invoice_reactive").select("invoice_id,period,reactive_kvarh,consumption_kvarh,cos_phi,excess_kvarh,unit_price_eur_kvarh,amount_eur").in("invoice_id", invoiceIds).order("period"),
        ]);
        for (const result of results) if (result.error) throw result.error;
        energy = results[0].data || [];
        power = results[1].data || [];
        maximeters = results[2].data || [];
        excesses = results[3].data || [];
        reactive = results[4].data || [];
      }
      const energyBy = groupBy(energy, "invoice_id");
      const powerBy = groupBy(power, "invoice_id");
      const maximetersBy = groupBy(maximeters, "invoice_id");
      const excessBy = groupBy(excesses, "invoice_id");
      const reactiveBy = groupBy(reactive, "invoice_id");
      const history = (invoices || []).map((invoice: any) => ({
        ...invoice,
        energyPeriods: energyBy[invoice.id] || [],
        powerPeriods: powerBy[invoice.id] || [],
        maximeters: maximetersBy[invoice.id] || [],
        excesses: excessBy[invoice.id] || [],
        reactive: reactiveBy[invoice.id] || [],
      }));
      return ok({ client: resolved.client, holder: resolved.holder, supply: resolved.supply, invoices: history }, { count: history.length, authMode });
    }

    if (action === "invoice") {
      if (!isUuid(body?.invoice_id)) return fail("invalid_invoice_id", 400);
      const { data: invoice, error: invoiceError } = await admin
        .from("invoices")
        .select("id,supply_id,invoice_number,billing_start,billing_end,issue_date,billing_days,tariff,retailer,distributor,consumption_kwh,energy_cost_eur,power_cost_eur,excess_cost_eur,reactive_cost_eur,compensation_eur,social_bonus_eur,meter_rental_eur,distributor_charges_eur,electricity_tax_eur,vat_eur,igic_eur,other_cost_eur,total_eur,accounted_eur,difference_eur,average_total_eur_kwh,validation_status,validation_message,source_holder_name,source_supply_address,access_contract_number,contract_number,contract_type,contract_end_date,meter_number,completeness_assessment_status,source_completeness,reading_status,reading_source_label,superseded_by")
        .eq("id", body.invoice_id)
        .maybeSingle();
      if (invoiceError) throw invoiceError;
      if (!invoice) return fail("invoice_not_found", 404);

      const [energy, power, maximeters, excesses, reactive, taxes, rights, adjustments] = await Promise.all([
        admin.from("invoice_energy_periods").select("period,consumption_kwh,energy_cost_eur,unit_price_eur_kwh,toll_price_eur_kwh,charges_price_eur_kwh,retailer_price_eur_kwh").eq("invoice_id", invoice.id).order("period"),
        admin.from("invoice_power_periods").select("period,contracted_kw,billed_power_eur,unit_price_eur_kw_day,toll_price_eur_kw_day,charges_price_eur_kw_day,retailer_price_eur_kw_day").eq("invoice_id", invoice.id).order("period"),
        admin.from("invoice_maximeters").select("period,maximeter_kw,reliable,source").eq("invoice_id", invoice.id).order("period"),
        admin.from("invoice_excesses").select("period,excess_kw,unit_price,amount_eur").eq("invoice_id", invoice.id).order("period"),
        admin.from("invoice_reactive").select("period,reactive_kvarh,consumption_kvarh,cos_phi,excess_kvarh,unit_price_eur_kvarh,amount_eur").eq("invoice_id", invoice.id).order("period"),
        admin.from("invoice_tax_lines").select("tax_type,label,rate_pct,taxable_base_eur,amount_eur").eq("invoice_id", invoice.id),
        admin.from("invoice_distributor_rights").select("concept,amount_eur,legal_reference").eq("invoice_id", invoice.id),
        admin.from("invoice_adjustments").select("concept,amount_eur,category").eq("invoice_id", invoice.id),
      ]);
      for (const result of [energy, power, maximeters, excesses, reactive, taxes, rights, adjustments]) if (result.error) throw result.error;
      const resolved = await resolveSupply({ supply_id: invoice.supply_id });

      return ok({
        client: resolved.client,
        holder: resolved.holder,
        supply: resolved.supply,
        invoice,
        energyPeriods: energy.data || [],
        powerPeriods: power.data || [],
        maximeters: maximeters.data || [],
        excesses: excesses.data || [],
        reactive: reactive.data || [],
        taxes: taxes.data || [],
        distributorRights: rights.data || [],
        adjustments: adjustments.data || [],
      }, { authMode });
    }

    if (action === "opportunities") {
      const resolved = await resolveSupply(body);
      if (resolved.error === "supply_identifier_required") return fail(resolved.error, 400);
      if (resolved.error) return fail(resolved.error, 404);
      const limit = Math.min(50, clampLimit(body?.limit, 20));
      const [recs, incidents] = await Promise.all([
        admin.from("recommendations")
          .select("id,invoice_id,title,description,category,estimated_savings_eur_year,estimated_savings_percent,status,created_at,updated_at,implemented_at")
          .eq("supply_id", resolved.supply.id)
          .order("created_at", { ascending: false })
          .limit(limit),
        admin.from("incidents")
          .select("id,invoice_id,title,description,severity,status,detected_at,resolved_at")
          .eq("supply_id", resolved.supply.id)
          .order("detected_at", { ascending: false })
          .limit(limit),
      ]);
      if (recs.error) throw recs.error;
      if (incidents.error) throw incidents.error;
      return ok({
        client: resolved.client,
        holder: resolved.holder,
        supply: resolved.supply,
        recommendations: recs.data || [],
        incidents: incidents.data || [],
        interpretationRule: "Las recomendaciones son senales internas para revisar; no equivalen a ahorro garantizado ni a una orden de cambio de contrato.",
      }, { authMode });
    }

    return fail("unknown_action", 404, "Accion no soportada: " + action);
  } catch (error) {
    console.error(SERVICE_NAME, { action, actorUserId, message: error instanceof Error ? error.message : String(error) });
    return fail("operation_failed", 500, "No se pudo completar la consulta.");
  }
});
