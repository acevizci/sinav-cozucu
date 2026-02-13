// server/gemini_http_client.mjs
// Minimal Gemini HTTP client (v1beta) with JSON-safe parsing.

export function stripCodeFences(s) {
  return String(s || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

export function extractJson(text) {
  const s = stripCodeFences(text);
  try { return JSON.parse(s); } catch {}

  const m = s.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("JSON bulunamadı");
  return JSON.parse(m[0]);
}

export async function geminiGenerateText({
  apiKey,
  model = "models/gemini-1.5-flash",
  prompt,
  temperature = 0.4,
  topP = 0.9,
  responseMimeType = null // e.g. "application/json"
}) {
  if (!apiKey) throw new Error("GEMINI_API_KEY yok");
  const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [{ role: "user", parts: [{ text: String(prompt || "") }] }],
    generationConfig: { temperature, topP }
  };
  if (responseMimeType) body.generationConfig.responseMimeType = responseMimeType;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    let msg = res.statusText;
    try {
      const err = await res.json();
      msg = err?.error?.message || msg;
    } catch {}
    throw new Error(`Gemini error (${res.status}): ${msg}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini boş cevap döndürdü.");
  return String(text);
}
