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

      const { data: holder, error: holderError } = await admin
        .from("holders")
        .select("id,client_id,legal_name,tax_id,status")
        .eq("id", id)
        .maybeSingle();
      if (holderError) throw holderError;
      if (!holder) return json({ error: "holder_not_found" }, 404);

      const [{ data: peers, error: peersError }, { data: client, error: clientError }, { data: clientHolders, error: clientHoldersError }] = await Promise.all([
        admin.from("holders").select("id,client_id,legal_name,tax_id").neq("id", id),
        admin.from("clients").select("id,name,tax_id,status").eq("id", holder.client_id).maybeSingle(),
        admin.from("holders").select("id,legal_name,tax_id").eq("client_id", holder.client_id),
      ]);
      if (peersError) throw peersError;
      if (clientError) throw clientError;
      if (clientHoldersError) throw clientHoldersError;

      const clean = (value: unknown) => String(value ?? "").trim().toLowerCase();
      const taxKey = (value: unknown) => String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const nextTaxKey = taxKey(taxId);
      if (nextTaxKey && (peers || []).some((row: any) => taxKey(row.tax_id) === nextTaxKey)) {
        return json({ error: "holder_tax_conflict" }, 409);
      }
      if ((peers || []).some((row: any) => row.client_id === holder.client_id && clean(row.legal_name) === clean(legalName))) {
        return json({ error: "holder_name_conflict" }, 409);
      }

      const oldHolderTax = taxKey(holder.tax_id);
      const clientTax = taxKey(client?.tax_id);
      const mirrorClient = Boolean(
        client &&
        (clientHolders || []).length === 1 &&
        clean(client.name) === clean(holder.legal_name) &&
        (!oldHolderTax || !clientTax || oldHolderTax === clientTax)
      );

      const now = new Date().toISOString();
      const { data: updated, error: updateError } = await admin
        .from("holders")
        .update({ legal_name: legalName, tax_id: taxId, updated_at: now })
        .eq("id", id)
        .select("id,client_id,legal_name,tax_id,status")
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updated) return json({ error: "holder_not_found" }, 404);

      let clientSynced = false;
      if (mirrorClient && client) {
        const { error: syncError } = await admin
          .from("clients")
          .update({ name: legalName, tax_id: taxId, updated_at: now })
          .eq("id", client.id);
        if (syncError) throw syncError;
        clientSynced = true;
      }

      const { error: auditError } = await admin.from("audit_log").insert({
        actor_user_id: user.id,
        action: "holder_updated",
        entity_type: "holder",
        entity_id: id,
        details: {
          before: { legal_name: holder.legal_name, tax_id: holder.tax_id },
          after: { legal_name: legalName, tax_id: taxId },
          client_synced: clientSynced,
        },
      });
      if (auditError) console.warn("holder_updated audit", auditError);

      return json({ ok: true, holder: updated, client_synced: clientSynced });
    }

    if (action === "reassign_supply_holder") {
      const targetHolderId = body?.target_holder_id;
      if (!validUuid(targetHolderId)) return json({ error: "invalid_target_holder" }, 400);

      const [{ data: supply, error: supplyError }, { data: targetHolder, error: targetError }] = await Promise.all([
        admin.from("supplies")
          .select("id,holder_id,cups,supply_name,address,city,province,postal_code,current_tariff,current_contract_number,current_retailer,current_distributor,status")
          .eq("id", id)
          .maybeSingle(),
        admin.from("holders").select("id,client_id,legal_name,tax_id,status").eq("id", targetHolderId).maybeSingle(),
      ]);
      if (supplyError) throw supplyError;
      if (targetError) throw targetError;
      if (!supply) return json({ error: "supply_not_found" }, 404);
      if (!targetHolder) return json({ error: "target_holder_not_found" }, 404);
      if (targetHolder.status !== "active") return json({ error: "target_holder_not_active" }, 409);
      if (supply.holder_id === targetHolderId) return json({ ok: true, mode: "unchanged", supply_id: id });

      const [{ data: oldHolder, error: oldHolderError }, { data: targetClient, error: targetClientError }] = await Promise.all([
        admin.from("holders").select("id,client_id,legal_name,tax_id").eq("id", supply.holder_id).maybeSingle(),
        admin.from("clients").select("id,name,tax_id,status").eq("id", targetHolder.client_id).maybeSingle(),
      ]);
      if (oldHolderError) throw oldHolderError;
      if (targetClientError) throw targetClientError;
      if (!targetClient || targetClient.status !== "active") return json({ error: "target_client_not_active" }, 409);

      const { data: saved, error: saveError } = await userClient.rpc("save_master_supply", {
        p_payload: {
          mode: "manual",
          original_cups: supply.cups,
          cups: supply.cups,
          client_name: targetClient.name,
          client_tax_id: targetClient.tax_id,
          holder_name: targetHolder.legal_name,
          holder_tax_id: targetHolder.tax_id,
          supply_name: supply.supply_name,
          address: supply.address,
          city: supply.city,
          province: supply.province,
          postal_code: supply.postal_code,
          tariff: supply.current_tariff,
          contract_number: supply.current_contract_number,
          retailer: supply.current_retailer,
          distributor: supply.current_distributor,
        },
      });
      if (saveError) throw saveError;
      if (!saved?.ok) return json({ error: saved?.reason || "holder_reassignment_rejected", details: saved }, 409);

      const { error: eventError } = await admin.from("supply_events").insert({
        supply_id: id,
        event_date: new Date().toISOString().slice(0, 10),
        event_type: "holder_change",
        title: "Cambio de titular",
        description: "Titular actual del CUPS reasignado desde la gestión administrativa.",
        before_value: oldHolder ? {
          holder_id: oldHolder.id,
          client_id: oldHolder.client_id,
          legal_name: oldHolder.legal_name,
          tax_id: oldHolder.tax_id,
        } : null,
        after_value: {
          holder_id: targetHolder.id,
          client_id: targetHolder.client_id,
          legal_name: targetHolder.legal_name,
          tax_id: targetHolder.tax_id,
        },
        created_by: user.id,
      });
      if (eventError) console.warn("holder_change event", eventError);

      const { count: oldActive, error: oldActiveError } = oldHolder
        ? await admin.from("supplies").select("id", { head: true, count: "exact" }).eq("holder_id", oldHolder.id).eq("status", "active")
        : { count: 0, error: null };
      if (oldActiveError) console.warn("old holder active supply count", oldActiveError);

      return json({
        ok: true,
        mode: "reassigned",
        supply_id: id,
        old_holder_id: oldHolder?.id || null,
        new_holder_id: targetHolder.id,
        old_holder_active_supplies: oldActive || 0,
      });
    }

    if (["archive_holder", "restore_holder", "delete_holder"].includes(action)) {
      const { data: holder, error: holderError } = await admin
        .from("holders")
        .select("id,client_id,legal_name,tax_id,status")
        .eq("id", id)
        .maybeSingle();
      if (holderError) throw holderError;
      if (!holder) return json({ error: "holder_not_found" }, 404);

      const [{ count: supplyCount, error: supplyCountError }, { count: activeSupplyCount, error: activeSupplyCountError }] = await Promise.all([
        admin.from("supplies").select("id", { head: true, count: "exact" }).eq("holder_id", id),
        admin.from("supplies").select("id", { head: true, count: "exact" }).eq("holder_id", id).eq("status", "active"),
      ]);
      if (supplyCountError) throw supplyCountError;
      if (activeSupplyCountError) throw activeSupplyCountError;

      const dependencies = { supplies: supplyCount || 0, active_supplies: activeSupplyCount || 0 };
      if (action === "archive_holder" && dependencies.active_supplies > 0) {
        return json({ error: "holder_has_active_supplies", dependencies }, 409);
      }
      if (action === "delete_holder" && dependencies.supplies > 0) {
        return json({ error: "holder_has_supplies", dependencies }, 409);
      }

      if (action === "restore_holder") {
        const { data: client, error: clientError } = await admin.from("clients").select("id,status").eq("id", holder.client_id).maybeSingle();
        if (clientError) throw clientError;
        if (!client || client.status !== "active") return json({ error: "target_client_not_active" }, 409);
      }

      if (action === "delete_holder") {
        const { error: deleteError } = await admin.from("holders").delete().eq("id", id);
        if (deleteError) throw deleteError;
      } else {
        const status = action === "archive_holder" ? "archived" : "active";
        const { error: statusError } = await admin.from("holders").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
        if (statusError) throw statusError;
      }

      const { error: auditError } = await admin.from("audit_log").insert({
        actor_user_id: user.id,
        action,
        entity_type: "holder",
        entity_id: id,
        details: { legal_name: holder.legal_name, client_id: holder.client_id, ...dependencies },
      });
      if (auditError) console.warn("holder lifecycle audit", auditError);

      return json({ ok: true, action, holder_id: id, ...dependencies });
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
