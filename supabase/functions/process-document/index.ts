import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY")!;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

async function geminiText(prompt: string): Promise<string> {
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
    }),
  });
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function geminiVision(prompt: string, mimeType: string, base64Data: string): Promise<string> {
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: base64Data } },
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
    }),
  });
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

function extractXmlText(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { bucket, filePath, fileName } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: fileData, error } = await supabase.storage.from(bucket).download(filePath);
    if (error || !fileData) throw new Error("No se pudo descargar el archivo: " + error?.message);

    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    let text = "";

    if (ext === "txt" || ext === "md") {
      text = await fileData.text();
    } else if (ext === "docx") {
      const JSZip = (await import("https://esm.sh/jszip@3.10.1")).default;
      const arrayBuffer = await fileData.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      const xmlFile = zip.file("word/document.xml");
      if (xmlFile) {
        const xml = await xmlFile.async("string");
        text = extractXmlText(xml);
      }
    } else if (["pdf", "png", "jpg", "jpeg", "webp"].includes(ext)) {
      const arrayBuffer = await fileData.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      const mimeMap: Record<string, string> = {
        pdf: "application/pdf", png: "image/png", jpg: "image/jpeg",
        jpeg: "image/jpeg", webp: "image/webp",
      };
      text = await geminiVision(
        "Extraé TODO el contenido textual de este documento. Incluí todos los párrafos, tablas, listas y texto visible. No agregues comentarios propios.",
        mimeMap[ext],
        base64
      );
    } else {
      throw new Error(`Formato no soportado: ${ext}`);
    }

    const summary = await geminiText(
      `Generá un resumen de 4-8 líneas del siguiente documento. Idioma español. Sin Markdown. Solo texto plano.\n\n${text.slice(0, 8000)}`
    );

    return new Response(JSON.stringify({ success: true, text, summary, charCount: text.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
