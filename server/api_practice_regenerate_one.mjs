  // server/api_practice_regenerate_one.mjs
  // Example Express route for POST /api/practice/regenerate-one
  // Uses Google Generative AI SDK. Wire with your existing server setup.
  //
  // Expected input:
  // { attemptNo, distribution, sources:[{id,title,text}], target:{n,stem,choices}, previous:{stemsHash[],weakTags[]} }
  //
  // Output:
  // { n, stem, choices:{A..E}, correct:'A'..'E', explanation?, subject? }

  import express from "express";
  import crypto from "crypto";
  import { GoogleGenerativeAI } from "@google/generative-ai";

  const router = express.Router();

  const MODEL = process.env.GEMINI_MODEL || "gemini-1.5-pro";
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  function sha1(s){ return crypto.createHash("sha1").update(String(s||"")).digest("hex"); }

  function buildPrompt({ sources, target, previous }){
    const dist = sources.map(s => `- ${s.id}: ${s.title}`).join("\n");
    const srcText = sources.map(s => `### SOURCE ${s.id}: ${s.title}\n${s.text}`).join("\n\n");

    const avoid = (previous?.stemsHash || []).slice(0, 200).join(", ");

    return `
You are an exam question generator for Turkish educational content.
Regenerate EXACTLY ONE multiple-choice question (5 options A-E) based on the provided sources.

Hard rules:
- Output MUST be valid JSON only. No markdown.
- Produce a single correct answer (one of A,B,C,D,E).
- Options must be plausible distractors; avoid "Hepsi/Hiçbiri".
- Do NOT repeat previous question stems (avoid list hashes).
- Keep the question aligned with the user's content.

Context:
Sources:
${dist}

Target question number: ${target.n}
Existing stem (for direction only): ${target.stem}

Avoid stems hashes: ${avoid}

Return JSON with this shape:
{
  "n": ${target.n},
  "stem": "...",
  "choices": {"A":"...","B":"...","C":"...","D":"...","E":"..."},
  "correct": "A",
  "explanation": "...",
  "subject": "..."
}

${srcText}
    `.trim();
  }

  router.post("/practice/regenerate-one", async (req, res) => {
    try{
      const { sources, target, previous } = req.body || {};
      if (!Array.isArray(sources) || sources.length === 0) return res.status(400).json({ error: "sources boş." });
      if (!target?.n) return res.status(400).json({ error: "target.n yok." });

      const model = genAI.getGenerativeModel({ model: MODEL, generationConfig: {
        temperature: 0.5,
        topP: 0.9,
        responseMimeType: "application/json"
      }});

      const prompt = buildPrompt({ sources, target, previous });

      const out = await model.generateContent(prompt);
      const text = out.response.text();

      let json;
      try{ json = JSON.parse(text); }
      catch(e){ return res.status(500).json({ error: "JSON parse hatası (model output)." }); }

      // Minimal validation
      const letters = ["A","B","C","D","E"];
      if (!json?.stem || !json?.choices) return res.status(500).json({ error: "Eksik alanlar." });
      for (const L of letters){ if (!json.choices[L]) return res.status(500).json({ error: "Eksik şık." }); }
      if (!letters.includes(json.correct)) return res.status(500).json({ error: "correct hatalı." });
      json.n = Number(target.n);

      return res.json(json);
    }catch(e){
      console.error(e);
      return res.status(500).json({ error: e?.message || "Server error" });
    }
  });

  export default router;
