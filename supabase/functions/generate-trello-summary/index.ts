import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY")!;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { title, description, checklist_items, notes } = await req.json();

    const passItems = checklist_items.filter((i: any) => i.status === "pass");
    const failItems = checklist_items.filter((i: any) => i.status === "fail");

    const prompt = `Generá un reporte de testing QA en texto plano para pegar en Trello. Idioma: español. Sin Markdown decorativo. Lenguaje profesional.

Estructura EXACTA (respetá los títulos):
Resumen
(2-3 líneas de qué se probó y el resultado general)

Lo que funciona bien
(lista de ítems que pasaron, uno por línea con guión)

Errores detectados
(lista de ítems que fallaron con su nota si existe, uno por línea con guión)

Observaciones
(notas del tester, solo si existen, sino omitir esta sección)

---
Tarea: ${title}
${description ? `Descripción: ${description}` : ""}

Ítems que pasaron (${passItems.length}):
${passItems.map((i: any) => `- ${i.text}`).join("\n") || "Ninguno"}

Ítems que fallaron (${failItems.length}):
${failItems.map((i: any) => `- ${i.text}${i.note ? ` (${i.note})` : ""}`).join("\n") || "Ninguno"}

${notes?.length ? `Notas del tester:\n${notes.map((n: string) => `- ${n}`).join("\n")}` : ""}`;

    const geminiRes = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
      }),
    });

    if (!geminiRes.ok) {
      const errorBody = await geminiRes.text();
      console.error("Gemini error:", geminiRes.status, errorBody);
      return new Response(JSON.stringify({ error: `Gemini error ${geminiRes.status}: ${errorBody}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiData = await geminiRes.json();
    const report = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    return new Response(JSON.stringify({ report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
