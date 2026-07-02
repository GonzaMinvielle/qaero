import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TRELLO_BASE = "https://api.trello.com/1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = user.id;

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { action, ...params } = await req.json();

    if (action === "save-config") {
      const { trello_api_key, trello_token } = params;
      const { error } = await serviceClient.from("user_trello_config").upsert({
        user_id: userId,
        api_key: trello_api_key,
        token: trello_token,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "check-config") {
      const { data } = await serviceClient.from("user_trello_config").select("id").eq("user_id", userId).single();
      return new Response(JSON.stringify({ configured: !!data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: config } = await serviceClient.from("user_trello_config").select("api_key, token").eq("user_id", userId).single();
    const apiKey = config?.api_key;
    const token = config?.token;

    if (!apiKey || !token) {
      return new Response(JSON.stringify({ error: "Trello no configurado" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const auth = `key=${apiKey}&token=${token}`;

    if (action === "list-boards") {
      const res = await fetch(`${TRELLO_BASE}/members/me/boards?fields=name,url,closed&${auth}`);
      const boards = await res.json();
      const open = Array.isArray(boards) ? boards.filter((b: any) => !b.closed) : [];
      return new Response(JSON.stringify({ boards: open }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "sync-board") {
      const { board_id, board_name } = params;

      const [cardsRes, listsRes] = await Promise.all([
        fetch(`${TRELLO_BASE}/boards/${board_id}/cards?fields=id,name,desc,idList,labels,dateLastActivity&${auth}`),
        fetch(`${TRELLO_BASE}/boards/${board_id}/lists?fields=id,name&${auth}`),
      ]);

      const cards = await cardsRes.json();
      const lists = await listsRes.json();
      const listMap = Object.fromEntries((Array.isArray(lists) ? lists : []).map((l: any) => [l.id, l.name]));

      if (!Array.isArray(cards)) throw new Error("Error obteniendo tarjetas de Trello");

      const SYNC_LISTS = ["en desarrollo", "testing", "code review", "En produccion", "producción", "info util", "info útil"];
      const filteredCards = cards.filter((card: any) => {
        const listName = (listMap[card.idList] ?? "").toLowerCase();
        return SYNC_LISTS.some(allowed => listName.includes(allowed));
      });

      const CONCURRENCY = 10;
      const synced_at = new Date().toISOString();
      const rows: any[] = [];

      for (let i = 0; i < filteredCards.length; i += CONCURRENCY) {
        const batch = filteredCards.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map(async (card: any) => {
            const commentsRes = await fetch(
              `${TRELLO_BASE}/cards/${card.id}/actions?filter=commentCard&${auth}`
            );
            const commentsData = await commentsRes.json();
            const comments = Array.isArray(commentsData)
              ? commentsData.map((a: any) => ({
                  text: a.data?.text ?? "",
                  date: a.date,
                  authorName: a.memberCreator?.fullName ?? "",
                }))
              : [];
            return {
              card_id: card.id,
              user_id: userId,
              board_id,
              board_name,
              card_name: card.name,
              description: card.desc || null,
              list_name: listMap[card.idList] ?? null,
              labels: card.labels ?? [],
              comments,
              last_activity: card.dateLastActivity,
              synced_at,
            };
          })
        );
        rows.push(...results);
      }

      await serviceClient.from("trello_cards").upsert(rows, { onConflict: "card_id,user_id" });

      return new Response(JSON.stringify({ success: true, count: rows.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Acción desconocida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
