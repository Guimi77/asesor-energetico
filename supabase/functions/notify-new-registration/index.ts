import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import nodemailer from "npm:nodemailer@6.9.16";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const validUuid = (value: unknown) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const esc = (value: unknown) => String(value ?? "").replace(/[&<>"]/g, (c) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
}[c] || c));

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const publishable = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}")?.default || Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}")?.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const gmailPass = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!publishable || !serviceKey) return json({ error: "server_config_missing" }, 503);
    if (!gmailPass) return json({ error: "gmail_secret_missing" }, 503);

    const body = await req.json().catch(() => ({}));
    let targetUserId = validUuid(body?.user_id) ? body.user_id : null;

    const authHeader = req.headers.get("Authorization") || "";
    if (authHeader) {
      const userClient = createClient(supabaseUrl, publishable, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (user?.id) targetUserId = user.id;
    }

    if (!targetUserId) return json({ ok: true });

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id,email,display_name,role,active,created_at")
      .eq("id", targetUserId)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile || profile.role !== "client" || profile.active !== false) {
      return json({ ok: true, skipped: "not_pending_client" });
    }

    const createdAt = profile.created_at ? new Date(profile.created_at).getTime() : 0;
    if (!createdAt || Date.now() - createdAt > 24 * 60 * 60 * 1000) {
      return json({ ok: true, skipped: "request_too_old" });
    }

    const { count, error: linkError } = await admin
      .from("client_users")
      .select("client_id", { count: "exact", head: true })
      .eq("user_id", targetUserId);
    if (linkError) throw linkError;
    if ((count || 0) > 0) return json({ ok: true, skipped: "already_linked" });

    const { data: existing, error: existingError } = await admin
      .from("registration_admin_notifications")
      .select("sent_at")
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.sent_at) return json({ ok: true, skipped: "already_notified" });

    const smtpUser = "tecnicoelectricabt@gmail.com";
    const notifyTo = "tecnico1@electricabt.com";
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user: smtpUser, pass: gmailPass },
      tls: { minVersion: "TLSv1.2" },
    });

    const displayName = profile.display_name || "Nuevo usuario";
    const email = profile.email || "correo no disponible";

    await transporter.sendMail({
      from: `Instal·lacions BT <${smtpUser}>`,
      to: notifyTo,
      subject: "Nueva solicitud de acceso al Asesor Energético",
      text:
        `Se ha registrado una nueva solicitud de acceso.\n\n` +
        `Usuario: ${displayName}\n` +
        `Correo: ${email}\n\n` +
        `La cuenta está BLOQUEADA hasta que un administrador la vincule con un cliente.\n` +
        `La contraseña no puede consultarse: Supabase la almacena cifrada. Si el usuario la pierde, debe restablecerla.`,
      html:
        `<h2>Nueva solicitud de acceso</h2>` +
        `<p><strong>Usuario:</strong> ${esc(displayName)}<br><strong>Correo:</strong> ${esc(email)}</p>` +
        `<p><strong>Estado:</strong> pendiente de aprobación y vinculación con un cliente.</p>` +
        `<p>La contraseña no se almacena en texto legible. Si el usuario la pierde, puede restablecerse desde la aplicación.</p>`,
    });

    const { error: notifyError } = await admin
      .from("registration_admin_notifications")
      .upsert({
        user_id: targetUserId,
        email,
        display_name: displayName,
        sent_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    if (notifyError) throw notifyError;

    return json({ ok: true });
  } catch (error) {
    console.error("notify-new-registration", error);
    return json({ error: "notification_failed" }, 500);
  }
});
