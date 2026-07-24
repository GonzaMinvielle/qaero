import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY")!;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

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

    const { title, description, card_context } = await req.json();

    const cardContextBlock = card_context ? [
      card_context.description ? `Criterios de aceptación / descripción:\n${card_context.description}` : "",
      card_context.labels?.length ? `Labels: ${card_context.labels.join(", ")}` : "",
      card_context.comments?.length ? `Comentarios:\n${card_context.comments.join("\n")}` : "",
    ].filter(Boolean).join("\n\n") : "";

    const prompt = `Sos un QA Manual Senior especializado en el dominio de turismo y booking.
Generá un checklist de testing exhaustivo basado en toda la información disponible de la tarea.
Devolvé ÚNICAMENTE un JSON válido con exactamente tres arrays:
- "checklist": casos de prueba funcionales (uno por criterio de aceptación si los hay)
- "edge_cases": escenarios límite y casos no felices relevantes
- "risks": puntos técnicos o de negocio que podrían fallar

Cubrí todos los criterios de aceptación disponibles. No agregues casos genéricos que no apliquen al contexto real.

Tarea: ${title}
${description ? `Descripción adicional: ${description}` : ""}
${cardContextBlock ? `\n${cardContextBlock}` : ""}`;

    const geminiRes = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              checklist:  { type: "array", items: { type: "string" } },
              edge_cases: { type: "array", items: { type: "string" } },
              risks:      { type: "array", items: { type: "string" } },
            },
            required: ["checklist", "edge_cases", "risks"],
          },
        },
      }),
    });

    const geminiData = await geminiRes.json();
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const parsed = JSON.parse(text);

    return new Response(JSON.stringify({
      checklist:  Array.isArray(parsed.checklist)  ? parsed.checklist  : [],
      edge_cases: Array.isArray(parsed.edge_cases) ? parsed.edge_cases : [],
      risks:      Array.isArray(parsed.risks)      ? parsed.risks      : [],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
