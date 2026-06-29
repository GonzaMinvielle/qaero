import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY")!;
const GEMINI_STREAM_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${GEMINI_KEY}`;

const SYSTEM_PROMPT = `Actuás como un asistente interno de QA. Respondés SOLO con la información proporcionada.
Fuentes disponibles: knowledge base, tarjetas de Trello sincronizadas, historial de tareas QA y notas rápidas del usuario.
Si te preguntan si algo se probó: buscá en el historial de tareas. Indicá tarea, fecha, resultado pass/fail y notas.
Si te preguntan qué hay en Trello: buscá en las tarjetas sincronizadas.
Si te preguntan qué notas tomaste hoy o qué tenés pendiente: buscá en quick_notes y tareas pendientes.
No inventes nada. Si no está documentado, decilo claramente.
Lenguaje claro, profesional, en español. Sin Markdown decorativo.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { question, userId } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [docsRes, trelloRes, tasksRes, notesRes] = await Promise.all([
      supabase.from("knowledge_docs").select("title, area, tags, full_content, content").eq("status", "active"),
      supabase.from("trello_cards").select("card_name, list_name, description, comments, labels").order("synced_at", { ascending: false }).limit(100),
      supabase.from("tasks").select("id, title, description, status, updated_at, trello_cards(card_name, list_name), checklist_items(text, status, note, type), task_notes(content, created_at)").eq("user_id", userId).order("updated_at", { ascending: false }).limit(50),
      supabase.from("quick_notes").select("content, tag, created_at").eq("user_id", userId).gte("created_at", thirtyDaysAgo.toISOString()).order("created_at", { ascending: false }),
    ]);

    const docs = docsRes.data ?? [];
    const trelloCards = trelloRes.data ?? [];
    const tasks = tasksRes.data ?? [];
    const quickNotes = notesRes.data ?? [];

    const context = `
=== KNOWLEDGE BASE (${docs.length} documentos) ===
${docs.map(d => `[${d.area}] ${d.title}\n${(d.full_content || d.content || "").slice(0, 2000)}`).join("\n---\n")}

=== TARJETAS TRELLO (${trelloCards.length} tarjetas) ===
${trelloCards.map(c => {
  const comments = (c.comments as any[] || []).map((cm: any) => `  Comentario (${cm.authorName}): ${cm.text}`).join("\n");
  return `[${c.list_name}] ${c.card_name}\n${c.description || ""}\n${comments}`;
}).join("\n---\n")}

=== HISTORIAL DE TAREAS QA (últimas 50) ===
${tasks.map((t: any) => {
  const items = (t.checklist_items || []).map((i: any) => `  [${i.status.toUpperCase()}] ${i.text}${i.note ? ` — ${i.note}` : ""}`).join("\n");
  const notes = (t.task_notes || []).map((n: any) => `  Nota: ${n.content}`).join("\n");
  const listName = (t.trello_cards as any)?.list_name ?? null;
  return `Tarea: ${t.title} | Columna Trello: ${listName ?? "Sin tarjeta Trello"} | Estado: ${t.status} | Actualizada: ${new Date(t.updated_at).toLocaleDateString("es-AR")}\n${items}\n${notes}`;
}).join("\n---\n")}

=== NOTAS RÁPIDAS (últimos 30 días) ===
${quickNotes.map((n: any) => `[${n.tag}] ${new Date(n.created_at).toLocaleDateString("es-AR")}: ${n.content}`).join("\n")}
`.trim();

    const geminiRes = await fetch(GEMINI_STREAM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{
          role: "user",
          parts: [{ text: `CONTEXTO DISPONIBLE:\n${context}\n\nPREGUNTA: ${question}` }],
        }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
      }),
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const reader = geminiRes.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (!data || data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                const token = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
                if (token) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
                }
              } catch {}
            }
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
