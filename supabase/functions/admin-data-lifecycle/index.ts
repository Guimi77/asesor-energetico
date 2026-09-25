import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const validUuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const publishable = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}")?.default || Deno.env.get("SUPABASE_ANON_KEY");
    const secret = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}")?.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = req.headers.get("Authorization") || "";
    if (!publishable || !secret || !authHeader) return json({ error: "missing_auth_context" }, 401);

    const userClient = createClient(supabaseUrl, publishable, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(supabaseUrl, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: callerProfile, error: callerError } = await admin.from("profiles").select("id,role,active").eq("id", user.id).maybeSingle();
    if (callerError || !callerProfile || callerProfile.role !== "admin" || callerProfile.active === false) {
      return json({ error: "admin_required" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    const id = body?.id;
    if (!validUuid(id)) return json({ error: "invalid_id" }, 400);

    if (action === "approve_user") {
      const clientId = body?.client_id;
      if (!validUuid(clientId)) return json({ error: "invalid_client_id" }, 400);
      if (id === user.id) return json({ error: "cannot_approve_self" }, 409);

      const { data: target, error: targetError } = await admin
        .from("profiles")
        .select("id,email,display_name,role,active")
        .eq("id", id)
        .maybeSingle();
      if (targetError) throw targetError;
      if (!target) return json({ error: "user_not_found" }, 404);
      if (target.role !== "client") return json({ error: "target_not_client" }, 409);

      const { data: client, error: clientError } = await admin
        .from("clients")
        .select("id,name,status")
        .eq("id", clientId)
        .maybeSingle();
      if (clientError) throw clientError;
      if (!client || client.status !== "active") return json({ error: "client_not_active" }, 409);

      const { error: linkError } = await admin
        .from("client_users")
        .upsert({ user_id: id, client_id: clientId }, { onConflict: "user_id,client_id" });
      if (linkError) throw linkError;

      const { error: profileError } = await admin
        .from("profiles")
        .update({ active: true })
        .eq("id", id);
      if (profileError) throw profileError;

      const { error: authError } = await admin.auth.admin.updateUserById(id, { email_confirm: true });
      if (authError) throw authError;

      return json({
        ok: true,
        approved: true,
        user: { id: target.id, email: target.email, display_name: target.display_name },
        client: { id: client.id, name: client.name }
      });
    }

    if (action === "update_holder") {
      const legalName = String(body?.legal_name || "").trim();
      const taxId = body?.tax_id == null ? null : String(body.tax_id).trim() || null;
      if (!legalName) return json({ error: "invalid_holder_name" }, 400);

      const { data, error } = await admin.rpc("admin_update_holder", {
        p_holder_id: id,
        p_legal_name: legalName,
        p_tax_id: taxId,
        p_actor: user.id,
      });
      if (error) throw error;
      if (!data?.ok) return json(data || { error: "holder_update_rejected" }, 409);
      return json(data);
    }

    if (action === "reassign_supply_holder") {
      const targetHolderId = body?.target_holder_id;
      if (!validUuid(targetHolderId)) return json({ error: "invalid_target_holder" }, 400);

      const { data, error } = await admin.rpc("admin_reassign_supply_holder", {
        p_supply_id: id,
        p_target_holder_id: targetHolderId,
        p_actor: user.id,
      });
      if (error) throw error;
      if (!data?.ok) return json(data || { error: "holder_reassignment_rejected" }, 409);
      return json(data);
    }

    if (["archive_holder", "restore_holder", "delete_holder"].includes(action)) {
      const { data, error } = await admin.rpc("admin_holder_lifecycle", {
        p_action: action,
        p_holder_id: id,
        p_actor: user.id,
      });
      if (error) throw error;
      if (!data?.ok) return json(data || { error: "holder_lifecycle_rejected" }, 409);
      return json(data);
    }

    if (action === "archive_client" || action === "restore_client") {
      const status = action === "archive_client" ? "archived" : "active";
      const { data, error } = await admin.from("clients").update({ status }).eq("id", id).select("id,name,status").maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "client_not_found" }, 404);
      return json({ ok: true, client: data });
    }

    if (action === "delete_client") {
      const { data: client, error: clientError } = await admin.from("clients").select("id,name").eq("id", id).maybeSingle();
      if (clientError) throw clientError;
      if (!client) return json({ error: "client_not_found" }, 404);

      const { data: holders, error: holdersError } = await admin.from("holders").select("id").eq("client_id", id);
      if (holdersError) throw holdersError;
      const holderIds = (holders || []).map((row: any) => row.id);
      let supplyIds: string[] = [];
      if (holderIds.length) {
        const { data: supplies, error: suppliesError } = await admin.from("supplies").select("id").in("holder_id", holderIds);
        if (suppliesError) throw suppliesError;
        supplyIds = (supplies || []).map((row: any) => row.id);
      }
      let invoiceCount = 0;
      if (supplyIds.length) {
        const { count, error } = await admin.from("invoices").select("id", { head: true, count: "exact" }).in("supply_id", supplyIds);
        if (error) throw error;
        invoiceCount = count || 0;
      }
      const dependencies = { holders: holderIds.length, supplies: supplyIds.length, invoices: invoiceCount };
      if (dependencies.holders || dependencies.supplies || dependencies.invoices) {
        return json({ error: "client_not_empty", dependencies }, 409);
      }
      const { error: deleteError } = await admin.from("clients").delete().eq("id", id);
      if (deleteError) throw deleteError;
      return json({ ok: true, deleted: "client", id });
    }

    if (action === "archive_supply" || action === "restore_supply") {
      const status = action === "archive_supply" ? "archived" : "active";
      const { data, error } = await admin.from("supplies").update({ status }).eq("id", id).select("id,cups,status").maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "supply_not_found" }, 404);
      return json({ ok: true, supply: data });
    }

    if (action === "delete_supply") {
      const { data: supply, error: supplyError } = await admin.from("supplies").select("id,cups").eq("id", id).maybeSingle();
      if (supplyError) throw supplyError;
      if (!supply) return json({ error: "supply_not_found" }, 404);

      const dependencyTables = ["invoices", "incidents", "recommendations", "supply_events"];
      const dependencies: Record<string, number> = {};
      for (const table of dependencyTables) {
        const { count, error } = await admin.from(table).select("id", { head: true, count: "exact" }).eq("supply_id", id);
        if (error) throw error;
        dependencies[table] = count || 0;
      }
      if (Object.values(dependencies).some((count) => count > 0)) {
        return json({ error: "supply_has_history", dependencies }, 409);
      }
      const { error: deleteError } = await admin.from("supplies").delete().eq("id", id);
      if (deleteError) throw deleteError;
      return json({ ok: true, deleted: "supply", id });
    }

    if (action === "delete_user") {
      if (id === user.id) return json({ error: "cannot_delete_self" }, 409);
      const { data: target, error: targetError } = await admin.from("profiles").select("id,email,display_name,role,active").eq("id", id).maybeSingle();
      if (targetError) throw targetError;
      if (!target) return json({ error: "user_not_found" }, 404);
      if (target.role === "admin") {
        const { count, error } = await admin.from("profiles").select("id", { head: true, count: "exact" }).eq("role", "admin").eq("active", true).neq("id", id);
        if (error) throw error;
        if ((count || 0) < 1) return json({ error: "last_admin" }, 409);
      }
      const { error: deleteError } = await admin.auth.admin.deleteUser(id);
      if (deleteError) throw deleteError;
      return json({ ok: true, deleted: "user", id });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    console.error("admin-data-lifecycle", error);
    return json({ error: "operation_failed", message: error instanceof Error ? error.message : String(error) }, 500);
  }
});
