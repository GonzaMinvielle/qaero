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
    const { action, ...params } = await req.json();

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Credenciales globales del admin (en app_config como antes)
    const { data: configs } = await serviceClient.from("app_config").select("key, value").in("key", ["trello_api_key", "trello_token"]);
    const configMap = Object.fromEntries((configs ?? []).map((c: any) => [c.key, c.value]));
    const apiKey = configMap["trello_api_key"];
    const token = configMap["trello_token"];

    if (action === "set-config") {
      const { trello_api_key, trello_token } = params;
      await serviceClient.from("app_config").upsert([
        { key: "trello_api_key", value: trello_api_key, updated_at: new Date().toISOString() },
        { key: "trello_token", value: trello_token, updated_at: new Date().toISOString() },
      ]);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "check-config") {
      return new Response(JSON.stringify({ configured: !!(apiKey && token) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!apiKey || !token) {
      return new Response(JSON.stringify({ error: "Trello no configurado por el admin" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const auth = `key=${apiKey}&token=${token}`;

    if (action === "list-boards") {
      const res = await fetch(`${TRELLO_BASE}/members/me/boards?fields=name,url,closed&${auth}`);
      const boards = await res.json();
      const open = Array.isArray(boards) ? boards.filter((b: any) => !b.closed) : [];
      return new Response(JSON.stringify({ boards: open }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "sync-board") {
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

      const { board_id, board_name } = params;

      // FULL SYNC siempre — el cron maneja el incremental
      const [cardsRes, listsRes] = await Promise.all([
        fetch(`${TRELLO_BASE}/boards/${board_id}/cards?fields=id,name,desc,idList,labels,dateLastActivity&filter=open&${auth}`),
        fetch(`${TRELLO_BASE}/boards/${board_id}/lists?fields=id,name&${auth}`),
      ]);
      const lists = await listsRes.json();
      const listMap = Object.fromEntries((Array.isArray(lists) ? lists : []).map((l: any) => [l.id, l.name]));
      const synced_at = new Date().toISOString();

      const cards = await cardsRes.json();
      if (!Array.isArray(cards)) throw new Error("Error obteniendo tarjetas de Trello");

      const CONCURRENCY = 10;
      const rows: any[] = [];

      for (let i = 0; i < cards.length; i += CONCURRENCY) {
        const batch = cards.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map(async (card: any) => {
            const commentsRes = await fetch(`${TRELLO_BASE}/cards/${card.id}/actions?filter=commentCard&${auth}`);
            const commentsData = await commentsRes.json();
            const comments = Array.isArray(commentsData)
              ? commentsData.map((a: any) => ({ text: a.data?.text ?? "", date: a.date, authorName: a.memberCreator?.fullName ?? "" }))
              : [];
            return {
              card_id: card.id, user_id: user.id, board_id, board_name,
              card_name: card.name, description: card.desc || null,
              list_name: listMap[card.idList] ?? null, labels: card.labels ?? [],
              comments, last_activity: card.dateLastActivity, synced_at,
            };
          })
        );
        rows.push(...results);
      }

      await serviceClient.from("trello_cards").upsert(rows, { onConflict: "card_id,user_id" });

      return new Response(JSON.stringify({ success: true, count: rows.length, mode: "full" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "sync-testing") {
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

      // Obtener todos los boards que el usuario tiene sincronizados
      const { data: userCards } = await serviceClient
        .from("trello_cards")
        .select("board_id, board_name")
        .eq("user_id", user.id);

      const uniqueBoards = [...new Map((userCards ?? []).map((r: any) => [r.board_id, r])).values()] as any[];

      const synced_at = new Date().toISOString();
      let totalCount = 0;

      for (const { board_id, board_name } of uniqueBoards) {
        const listsRes = await fetch(`${TRELLO_BASE}/boards/${board_id}/lists?fields=id,name&${auth}`);
        const lists = await listsRes.json();
        const testingLists = Array.isArray(lists)
          ? lists.filter((l: any) => l.name.toLowerCase().includes("testing"))
          : [];

        for (const list of testingLists) {
          const cardsRes = await fetch(
            `${TRELLO_BASE}/lists/${list.id}/cards?fields=id,name,desc,idList,labels,dateLastActivity&${auth}`
          );
          const cards = await cardsRes.json();
          if (!Array.isArray(cards)) continue;

          const CONCURRENCY = 10;
          const rows: any[] = [];

          for (let i = 0; i < cards.length; i += CONCURRENCY) {
            const batch = cards.slice(i, i + CONCURRENCY);
            const results = await Promise.all(
              batch.map(async (card: any) => {
                const commentsRes = await fetch(`${TRELLO_BASE}/cards/${card.id}/actions?filter=commentCard&${auth}`);
                const commentsData = await commentsRes.json();
                const comments = Array.isArray(commentsData)
                  ? commentsData.map((a: any) => ({ text: a.data?.text ?? "", date: a.date, authorName: a.memberCreator?.fullName ?? "" }))
                  : [];
                return {
                  card_id: card.id, user_id: user.id, board_id, board_name,
                  card_name: card.name, description: card.desc || null,
                  list_name: list.name, labels: card.labels ?? [],
                  comments, last_activity: card.dateLastActivity, synced_at,
                };
              })
            );
            rows.push(...results);
          }

          if (rows.length > 0) {
            await serviceClient.from("trello_cards").upsert(rows, { onConflict: "card_id,user_id" });
            totalCount += rows.length;
          }
        }
      }

      return new Response(JSON.stringify({ success: true, count: totalCount }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Acción desconocida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
