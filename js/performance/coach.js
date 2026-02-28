// js/performance/coach.js
// Gemini-powered short coaching note for exam history.

async function fetchModels(apiKey){
  try{
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if(!r.ok) return null;
    const data = await r.json();
    const viable = (data.models || []).filter(m => (m.supportedGenerationMethods||[]).includes("generateContent"));
    const best = viable.find(m => m.name.includes("flash")) || viable.find(m => m.name.includes("pro")) || viable[0];
    return best?.name || null;
  } catch {
    return null;
  }
}

async function callGemini(apiKey, promptText){
  const model = (await fetchModels(apiKey)) || "models/gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`;
  
  const body = {
    contents: [{ role:"user", parts: [{ text: promptText }] }],
    // maxOutputTokens parametresini tamamen sildik! 
    // Sadece yaratıcılık ayarı (temperature) kaldı:
    generationConfig: { temperature: 0.45 },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ]
  };
  
  const res = await fetch(url, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(body)
  });
  
  if(!res.ok){
    const t = await res.text().catch(()=> "");
    throw new Error(`Gemini API Hatası: ${res.status} ${t}`);
  }
  
  const data = await res.json();
  
  // API'nin yanıtı bitirme sebebini alıyoruz
  const finishReason = data?.candidates?.[0]?.finishReason || "BİLİNMİYOR";
  const text = data?.candidates?.[0]?.content?.parts?.map(p=>p.text).join("") || "";

  // 3. HATA AYIKLAMA: Eğer yanıt normal ("STOP") bitmediyse arayüzde sebebini göster:
  if (finishReason !== "STOP") {
     return `[DİKKAT: Yapay zeka '${finishReason}' sebebiyle metni kesti] \n\n${text.trim()}`;
  }
  
  return text.trim();
}

function buildPrompt({ analytics, profile, lastItems }){
  const last = (lastItems||[]).slice(0,10);
  const compactLast = last.map(it => {
    const date = (it.finishedAt || "").slice(0,10);
    const title = it.title || "Sınav";
    const type = it.examType || "";
    const durMin = Math.round((it.durationSec||0)/60);
    const mcqAcc = it?.mcq?.accuracyPct;
    const oePct = it?.openEnded?.pct;
    return { date, title, type, durMin, mcqAcc, oePct };
  });

  return `
Sen ACUMEN uygulamasında öğrencinin kişisel performans koçusun.
Aşağıdaki özet metriklere göre kısa bir koç notu yaz.

Kurallar:
- Türkçe yaz.
- 6–10 cümle.
- Yargılayıcı değil; motive edici.
- Somut öneri ver (tempo, tekrar, dikkat, plan).
- 120 kelimeyi geçme.
- Veri yoksa uydurma; "yeterli veri yok" de.

Özet Metrikler:
${JSON.stringify({ analytics, profile }, null, 2)}

Son Sınavlar:
${JSON.stringify(compactLast, null, 2)}
`.trim();
}

export async function generateCoachNote({ analytics, profile, items, apiKey }){
  const prompt = buildPrompt({ analytics, profile, lastItems: items });
  return await callGemini(apiKey, prompt);
}
