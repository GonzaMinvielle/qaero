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
      const { data: roleRow } = await serviceClient.from("user_roles").select("role").eq("user_id", user.id).single();
      if (roleRow?.role !== "admin") {
        return new Response(JSON.stringify({ error: "Sólo un admin puede configurar Trello" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

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

      const { data: profile } = await serviceClient.from("profiles").select("trello_username").eq("id", user.id).single();
      const trelloUsername = profile?.trello_username?.trim().toLowerCase();
      if (!trelloUsername) {
        return new Response(JSON.stringify({ error: "Tu usuario de Trello no está configurado. Pedile al admin que lo cargue en Admin → Usuarios." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // FULL SYNC siempre — el cron maneja el incremental
      const [cardsRes, listsRes] = await Promise.all([
        fetch(`${TRELLO_BASE}/boards/${board_id}/cards?fields=id,name,desc,idList,labels,dateLastActivity&filter=open&members=true&member_fields=username&${auth}`),
        fetch(`${TRELLO_BASE}/boards/${board_id}/lists?fields=id,name&${auth}`),
      ]);
      const lists = await listsRes.json();
      const listMap = Object.fromEntries((Array.isArray(lists) ? lists : []).map((l: any) => [l.id, l.name]));
      const synced_at = new Date().toISOString();

      const allCards = await cardsRes.json();
      if (!Array.isArray(allCards)) throw new Error("Error obteniendo tarjetas de Trello");

      // Sólo tarjetas donde el usuario está asignado en Trello
      const cards = allCards.filter((card: any) =>
        Array.isArray(card.members) && card.members.some((m: any) => m.username?.toLowerCase() === trelloUsername)
      );

      // Limpiar tarjetas de este board que quedaron sincronizadas antes y ya no corresponden
      // Se borra directo por (user_id, board_id) — no hace falta el .in(card_id) para esto,
      // y evita mandar URLs gigantes con miles de IDs (eso hacía que el delete fallara en boards grandes)
      const notAssignedIds = allCards.filter((card: any) => !cards.includes(card)).map((card: any) => card.id);
      const assignedIds = cards.map((c: any) => c.id);
      let deleteError: string | null = null;
      let deletedCount: number | null = null;
      {
        let query = serviceClient
          .from("trello_cards")
          .delete({ count: "exact" })
          .eq("user_id", user.id)
          .eq("board_id", board_id);
        query = assignedIds.length > 0 ? query.not("card_id", "in", `(${assignedIds.join(",")})`) : query;
        const res = await query;
        deletedCount = res.count;
        if (res.error) deleteError = res.error.message;
      }

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

      return new Response(JSON.stringify({
        success: true, count: rows.length, mode: "full",
        totalScanned: allCards.length, notAssignedCount: notAssignedIds.length, deletedCount, deleteError,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

      const { data: profile } = await serviceClient.from("profiles").select("trello_username").eq("id", user.id).single();
      const trelloUsername = profile?.trello_username?.trim().toLowerCase();
      if (!trelloUsername) {
        return new Response(JSON.stringify({ error: "Tu usuario de Trello no está configurado. Pedile al admin que lo cargue en Admin → Usuarios." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Sólo los boards que el usuario ya eligió y sincronizó en "Mi Trello" — no se escanean todos los boards de Trello.
      // OJO: sin .limit() explícito, Supabase corta en 1000 filas por default — con miles de filas viejas
      // acumuladas de sync anteriores, boards enteros pueden quedar afuera del escaneo sin que sea evidente.
      const { data: syncedBoards } = await serviceClient
        .from("trello_cards")
        .select("board_id, board_name")
        .eq("user_id", user.id)
        .limit(20000);
      const uniqueBoards = Array.from(
        new Map((syncedBoards ?? []).map((b: any) => [b.board_id, { board_id: b.board_id, board_name: b.board_name }])).values()
      );

      if (uniqueBoards.length === 0) {
        return new Response(JSON.stringify({ error: "Todavía no sincronizaste ningún board en 'Mi Trello'. Sincronizá uno primero." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const synced_at = new Date().toISOString();
      let totalCount = 0;
      let totalScanned = 0;
      const debug: any[] = [];
      const boardsScanned: any[] = [];

      for (const { board_id, board_name } of uniqueBoards) {
        const boardDebug: any = { board_id, board_name };
        boardsScanned.push(boardDebug);

        // Limpieza a nivel de TODO el board (no sólo la lista Testing) — cubre tarjetas viejas
        // sincronizadas antes del fix de asignación, sin tener que ir board por board a "Mi Trello"
        const boardCardsRes = await fetch(
          `${TRELLO_BASE}/boards/${board_id}/cards?fields=id&filter=open&members=true&member_fields=username&${auth}`
        );
        const boardCards = await boardCardsRes.json();
        boardDebug.boardCardsStatus = boardCardsRes.status;
        boardDebug.boardCardsIsArray = Array.isArray(boardCards);
        boardDebug.boardCardsRaw = Array.isArray(boardCards) ? undefined : boardCards;
        if (Array.isArray(boardCards)) {
          const assignedBoardIds = boardCards
            .filter((c: any) => Array.isArray(c.members) && c.members.some((m: any) => m.username?.toLowerCase() === trelloUsername))
            .map((c: any) => c.id);
          boardDebug.totalBoardCards = boardCards.length;
          boardDebug.assignedOnBoard = assignedBoardIds.length;
          let cleanupQuery = serviceClient.from("trello_cards").delete({ count: "exact" }).eq("user_id", user.id).eq("board_id", board_id);
          cleanupQuery = assignedBoardIds.length > 0 ? cleanupQuery.not("card_id", "in", `(${assignedBoardIds.join(",")})`) : cleanupQuery;
          const boardCleanupRes = await cleanupQuery;
          boardDebug.boardWideDeletedCount = boardCleanupRes.count;
          if (boardCleanupRes.error) boardDebug.boardWideDeleteError = boardCleanupRes.error.message;
        }

        const listsRes = await fetch(`${TRELLO_BASE}/boards/${board_id}/lists?fields=id,name&${auth}`);
        const lists = await listsRes.json();
        boardDebug.listsStatus = listsRes.status;
        boardDebug.allListNames = Array.isArray(lists) ? lists.map((l: any) => l.name) : lists;
        const testingLists = Array.isArray(lists)
          ? lists.filter((l: any) => l.name.toLowerCase().includes("testing"))
          : [];
        boardDebug.testingListNames = testingLists.map((l: any) => l.name);

        for (const list of testingLists) {
          const cardsRes = await fetch(
            `${TRELLO_BASE}/lists/${list.id}/cards?fields=id,name,desc,idList,labels,dateLastActivity&members=true&member_fields=username&${auth}`
          );
          const allCards = await cardsRes.json();
          if (!Array.isArray(allCards)) continue;
          totalScanned += allCards.length;

          // Sólo tarjetas donde el usuario está asignado en Trello — evita mezclar tarjetas de otros testers
          const cards = allCards.filter((card: any) =>
            Array.isArray(card.members) && card.members.some((m: any) => m.username?.toLowerCase() === trelloUsername)
          );

          const debugEntry: any = {
            board_name, list_name: list.name,
            trelloUsername,
            totalCards: allCards.length,
            matchedCards: cards.length,
            sampleMembers: allCards.slice(0, 5).map((c: any) => ({
              card_name: c.name,
              members: Array.isArray(c.members) ? c.members.map((m: any) => m.username) : c.members,
            })),
          };
          debug.push(debugEntry);

          // Limpiar filas guardadas bajo esta lista que ya no correspondan — comparando contra lo que
          // tenemos NOSOTROS guardado en trello_cards para (user, board, list_name), no contra el fetch
          // de Trello. Esto cubre tanto "perdió la asignación" como "la tarjeta se movió/desapareció de
          // esta lista" (en ese caso ni aparece en el fetch actual, así que compararla contra allCards no alcanza).
          const assignedIds = cards.map((c: any) => c.id);
          {
            let cleanupQuery = serviceClient
              .from("trello_cards")
              .delete({ count: "exact" })
              .eq("user_id", user.id)
              .eq("board_id", board_id)
              .eq("list_name", list.name);
            cleanupQuery = assignedIds.length > 0 ? cleanupQuery.not("card_id", "in", `(${assignedIds.join(",")})`) : cleanupQuery;
            const res = await cleanupQuery;
            debugEntry.deletedCount = res.count;
            if (res.error) debugEntry.deleteError = res.error.message;
          }

          if (cards.length === 0) continue;

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

      return new Response(JSON.stringify({ success: true, count: totalCount, scanned: totalScanned, debug, boardsScanned }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Acción desconocida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
