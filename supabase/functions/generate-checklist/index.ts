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
    const { title, description, card_context } = await req.json();

    const cardContextBlock = card_context ? [
      card_context.description ? `Descripción / criterios de aceptación:\n${card_context.description}` : "",
      card_context.labels?.length ? `Labels: ${card_context.labels.join(", ")}` : "",
      card_context.comments?.length ? `Comentarios de la tarjeta:\n${card_context.comments.join("\n")}` : "",
    ].filter(Boolean).join("\n\n") : "";

    const prompt = `Sos un QA Manual Senior especializado en el dominio de turismo y booking.
Dado el siguiente caso de testing, generá un checklist estructurado en texto plano con EXACTAMENTE este formato:

## CHECKLIST FUNCIONAL
(un caso por línea, sin viñetas)

## EDGE CASES
(un caso por línea, sin viñetas)

## RIESGOS / PUNTOS SENSIBLES
(un caso por línea, sin viñetas)

Tarea: ${title}
${description ? `Descripción adicional: ${description}` : ""}
${cardContextBlock ? `\n${cardContextBlock}` : ""}

IMPORTANTE: Generá SOLO los casos de prueba necesarios según el alcance real de la tarea.
Si los criterios de aceptación son específicos, basate en ellos — no agregues casos genéricos que no apliquen.
Máximo 10 ítems por sección. Calidad sobre cantidad. Solo texto plano, sin Markdown decorativo.`;

    const geminiRes = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
      }),
    });

    const geminiData = await geminiRes.json();
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    const parseSection = (sectionHeader: string, nextHeader: string | null, raw: string): string[] => {
      const startIdx = raw.indexOf(sectionHeader);
      if (startIdx === -1) return [];
      const start = startIdx + sectionHeader.length;
      const end = nextHeader ? raw.indexOf(nextHeader, start) : raw.length;
      const section = raw.slice(start, end === -1 ? raw.length : end);
      return section.split("\n")
        .map(l => l.replace(/^[-*•]\s*/, "").trim())
        .filter(l => l.length > 3 && !l.startsWith("#"));
    };

    const checklist = parseSection("## CHECKLIST FUNCIONAL", "## EDGE CASES", text);
    const edge_cases = parseSection("## EDGE CASES", "## RIESGOS", text);
    const risks = parseSection("## RIESGOS / PUNTOS SENSIBLES", null, text);

    return new Response(JSON.stringify({ checklist, edge_cases, risks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
