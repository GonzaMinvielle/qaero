import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const TRELLO_BASE = "https://api.trello.com/1";

Deno.serve(async (req) => {
  // Verificar secret para que solo pg_cron pueda dispararlo
  const secret = req.headers.get("x-cron-secret");
  if (secret !== Deno.env.get("CRON_SECRET")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Credenciales globales del admin
  const { data: configs } = await serviceClient
    .from("app_config")
    .select("key, value")
    .in("key", ["trello_api_key", "trello_token"]);

  const configMap = Object.fromEntries((configs ?? []).map((c: any) => [c.key, c.value]));
  const apiKey = configMap["trello_api_key"];
  const token = configMap["trello_token"];

  if (!apiKey || !token) {
    return new Response(JSON.stringify({ error: "Trello no configurado" }), { status: 400 });
  }

  const auth = `key=${apiKey}&token=${token}`;

  // Obtener todos los (user_id, board_id) únicos que hay sincronizados
  const { data: existingCards } = await serviceClient
    .from("trello_cards")
    .select("user_id, board_id, board_name, synced_at")
    .order("synced_at", { ascending: false });

  // Deduplicar — quedarse con el synced_at más reciente por (user_id, board_id)
  const boardMap = new Map<string, { user_id: string; board_id: string; board_name: string; synced_at: string }>();
  for (const row of (existingCards ?? [])) {
    const key = `${row.user_id}_${row.board_id}`;
    if (!boardMap.has(key)) boardMap.set(key, row);
  }

  const results: any[] = [];

  for (const { user_id, board_id, board_name, synced_at: lastSync } of boardMap.values()) {
    try {
      // Tarjetas que cambiaron de columna o son nuevas desde el último sync
      const actionsRes = await fetch(
        `${TRELLO_BASE}/boards/${board_id}/actions?filter=updateCard:idList,createCard&since=${lastSync}&limit=1000&${auth}`
      );
      const actions = await actionsRes.json();

      if (!Array.isArray(actions) || actions.length === 0) {
        results.push({ board_id, user_id, count: 0, message: "Sin cambios" });
        continue;
      }

      // IDs únicos de tarjetas afectadas
      const changedCardIds = [
        ...new Set(actions.map((a: any) => a.data?.card?.id).filter(Boolean)),
      ] as string[];

      // Obtener listas del board
      const listsRes = await fetch(`${TRELLO_BASE}/boards/${board_id}/lists?fields=id,name&${auth}`);
      const lists = await listsRes.json();
      const listMap = Object.fromEntries((Array.isArray(lists) ? lists : []).map((l: any) => [l.id, l.name]));

      // Obtener estado actual de cada tarjeta
      const cardResults = await Promise.all(
        changedCardIds.map(async (cardId) => {
          const res = await fetch(`${TRELLO_BASE}/cards/${cardId}?fields=id,name,desc,idList,labels,dateLastActivity,closed&${auth}`);
          return res.json();
        })
      );

      const synced_at = new Date().toISOString();
      const toUpsert: any[] = [];
      const toDelete: string[] = [];

      for (const card of cardResults) {
        if (!card.id) continue;
        if (card.closed) {
          // Tarjeta archivada en Trello → eliminar de nuestra DB
          toDelete.push(card.id);
          continue;
        }
        toUpsert.push({
          card_id: card.id,
          user_id,
          board_id,
          board_name,
          card_name: card.name,
          description: card.desc || null,
          list_name: listMap[card.idList] ?? null,
          labels: card.labels ?? [],
          comments: [],
          last_activity: card.dateLastActivity,
          synced_at,
        });
      }

      if (toDelete.length > 0) {
        await serviceClient.from("trello_cards").delete().eq("user_id", user_id).in("card_id", toDelete);
      }

      if (toUpsert.length > 0) {
        await serviceClient.from("trello_cards").upsert(toUpsert, { onConflict: "card_id,user_id" });
      }

      results.push({ board_id, user_id, count: toUpsert.length, deleted: toDelete.length });
    } catch (e: any) {
      results.push({ board_id, user_id, error: e.message });
    }
  }

  return new Response(JSON.stringify({ success: true, results }), {
    headers: { "Content-Type": "application/json" },
  });
});
