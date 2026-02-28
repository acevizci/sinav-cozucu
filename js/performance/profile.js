// js/performance/profile.js
// Deterministic learning profile engine (v17)

export function getLearningProfile({ trendDir, speedTrend }){
  // trendDir: up/down/stable ; speedTrend: faster/slower/stable
  if (trendDir === "up" && speedTrend === "faster") return { key:"steady_up", label:"🎯 İstikrarlı Yükseliş", hint:"Hızın artarken doğruluğun da yükseliyor. Aynı düzeni koru." };
  if (trendDir === "up" && speedTrend !== "faster") return { key:"solid_up", label:"🧱 Sağlam Yükseliş", hint:"Doğruluğun artıyor. Hızı artırmayı küçük adımlarla dene." };
  if (trendDir === "down" && speedTrend === "faster") return { key:"fast_risky", label:"⚡ Hızlı Ama Riskli", hint:"Hız artmış ama doğruluk düşüyor. Daha kontrollü tempo dene." };
  if (trendDir === "down" && speedTrend !== "faster") return { key:"slump", label:"🔄 Dalgalı Performans", hint:"Son dönemde düşüş var. Zayıf konuları hedefleyip kısa tekrar yap." };
  if (trendDir === "stable" && speedTrend === "faster") return { key:"speed_up", label:"⚖️ Hızlanıyorsun", hint:"Hız artıyor. Doğruluğu sabitlemek için kontrol adımı ekle." };
  if (trendDir === "stable" && speedTrend === "slower") return { key:"slow_careful", label:"🧠 Dikkatli İlerleyiş", hint:"Daha yavaş ama kontrollüsün. Hız için mini süre hedefleri koy." };
  return { key:"stable", label:"✅ Stabil", hint:"Performansın stabil. Gelişim için zayıf 1 konu seçip derinleş." };
}
