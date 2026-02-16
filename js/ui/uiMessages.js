// js/ui/uiMessages.js
// ACUMEN - Central message catalog for UI alerts/toasts/status.
//
// RULES
// - Prefer IDs everywhere instead of hard-coded strings.
// - Values can be either a string (used as message) or an object:
//   { title: "…", msg: "…" }  (for toasts/modals that need a title)

export const M = Object.freeze({
  // -----------------------------
  // Generic
  // -----------------------------
  UNKNOWN_ERROR: "Beklenmeyen bir hata oluştu.",
  NETWORK_ERROR: "Ağ hatası. İnternet bağlantını kontrol et.",
  OP_NOT_ALLOWED: "Bu işlem şu an izinli değil.",

  GENERIC_ERROR: { title: "Hata", msg: "{reason}" },
  FILE_UPLOAD_FAILED: { title: "Yükleme", msg: "Dosya yüklenemedi: {reason}" },

  // Labels (small pieces used in vars)
  LABEL_CANCELLED: "Durduruldu.",
  LABEL_DONE: "Tamamlandı.",

  // -----------------------------
  // Status texts
  // -----------------------------
  STATUS_READING: "okunuyor...",
  STATUS_READY: "hazır",
  STATUS_ERROR: "hata",

  // -----------------------------
  // Loading
  // -----------------------------
  LOADING_DEFAULT: "İşlem yapılıyor…",
  LOADING_SUB: "Lütfen bekleyin…",
  AI_STEP_CHECKING_KEY: "AI anahtarı doğrulanıyor…",
  AI_STEP_LISTING_MODELS: "Model kataloğu hazırlanıyor…",
  AI_STEP_RESOLVING_MODEL: "En uygun model seçiliyor…",
  AI_STEP_PREPARING_PROMPT: "İstek hazırlanıyor…",
  AI_STEP_GENERATING: "Sorular oluşturuluyor…",
  AI_STEP_PARSING: "Yanıt derleniyor…",
  AI_STEP_VALIDATING: "Kontroller yapılıyor…",
  AI_STEP_SAVING: "Kaydediliyor…",
  EXAM_PARSING_LOADING: "Sorular ayrıştırılıyor…",
  AI_KEY_LOADING: "AI cevap anahtarı üretiliyor…",
  AI_KEY_PROGRESS: "AI cevap anahtarı üretiliyor… ({pct})",
  AI_KEY_FAILED_DEFAULT: "AI anahtar üretilemedi",
  PRACTICE_LOADING_ATTEMPT: "Deneme #{attemptNo} yükleniyor…",
  PRACTICE_GENERATING_ATTEMPT: "Deneme {attemptNo} hazırlanıyor…",

  // -----------------------------
  // Exam / parsing / flow
  // -----------------------------
  EXAM_LOAD_FIRST: "Önce sınavı yükle.",
  EXAM_NO_TEXT: "Metin yok.",
  EXAM_PARSED: { title: "Hazır", msg: "Sınav ayrıştırıldı." },
  EXAM_FINISHED: { title: "Bitti", msg: "Sınav tamamlandı." },
  TIME_UP_AUTO_FINISH: { title: "Süre doldu", msg: "Sınav otomatik bitirildi." },
  EXAM_CHOICE_LIMIT: { title: "Seçim limiti", msg: "En fazla {count} şık seçebilirsin." },

  TEMPLATE_INVALID: "⚠️ Şablon verisi geçersiz/eksik geldi.",
  TEMPLATE_INTEGRATION_ERROR: "Şablon entegrasyonu hatası",

  // -----------------------------
  // Wrong book / analysis
  // -----------------------------
  WRONG_BOOK_EMPTY: "Yanlış Defteri boş",
  WRONG_BOOK_ALL_EMPTY: "Yanlış defterin tamamen boş.",
  WRONGS_NOT_FOUND_FOR_ANALYSIS: "Analiz edilecek hatalı soru bulunamadı.",
  NO_REPEAT_WRONG_FOUND: "Tekrarlanacak yanlış soru bulunamadı.",
  WRONGBOOK_CLEARED: { title: "Temizlendi", msg: "Yanlış Defteri başarıyla sıfırlandı. 🧽" },
  WRONGBOOK_GRADUATED: { title: "Harikasın! 🎉", msg: "{count} soruyu Yanlış Defteri'nden sildik!" },

  // -----------------------------
  // Local data
  // -----------------------------
  LOCALDATA_CLEARED: { title: "Silindi", msg: "Tüm yerel veriler temizlendi. 🧨" },

  // -----------------------------
  // SRS
  // -----------------------------
  APP_STATE_MISSING: "Uygulama state yok (window.__APP_STATE).",
  SRS_STARTER_MISSING: "SRS başlatıcı bulunamadı (startSrsBySubject)",
  SRS_NO_QUESTIONS_FOR_SUBJECT: "\"{sub}\" için tekrar sorusu yok.",
  SRS_READY_FOR_SUBJECT: { title: "SRS", msg: "\"{sub}\" tekrarı hazır ({count} soru)" },

  // -----------------------------
  // Drive / notes
  // -----------------------------
  DRIVE_INTEGRATION_MISSING: "Drive entegrasyonu bulunamadı",
  DRIVE_ERROR_GENERIC: { title: "Drive", msg: "{reason}" },
  DRIVE_BOOKLET_UPLOADED: { title: "Drive", msg: "Kitapçık yüklendi" },
  DRIVE_FOLDER_ID_REQUIRED: { title: "Eksik bilgi", msg: "Lütfen Klasör ID girin! 📂" },

  NOTES_EMPTY_SELECTION: "Seçili notlarda yeterli içerik yok.",
  NOTE_FILE_READ_FAILED: "Dosya okunamadı",
  NOTE_RECORD_NOT_FOUND: "Silinemedi. Kayıt bulunamadı.",
  FILE_SELECT_FIRST: { title: "Dosya", msg: "Lütfen bir dosya seçin." },

  // -----------------------------
  // Reports
  // -----------------------------
  REPORT_EMPTY: "Lütfen bir mesaj yaz şampiyon! 😊",
  REPORT_SENT: "Raporun e-postana uçtu! 🕵️‍♂️",
  REPORT_FAILED: "Gönderilemedi, tekrar dene.",

  // -----------------------------
  // AI
  // -----------------------------
  AI_SUBJECT_MODULE_MISSING: "AI konu modülü bulunamadı (ui.js).",
  AI_SUBJECT_FILL_ERROR: "AI konu tamamlama hatası",
  AI_KEY_CREATED: { title: "AI", msg: "Anahtar üretildi: {done}/{total}" },
  AI_KEY_FAILED: { title: "AI", msg: "{reason}" },

  AI_KEY_REQUIRED: { title: "AI", msg: "AI özellikleri için Gemini API anahtarı gerekli." },
  AI_KEY_REQUIRED_SHORT: "Gemini API anahtarı gerekli",
  AI_KEY_INVALID_SHORT: "Geçersiz Gemini API anahtarı",
  AI_KEY_SAVED: { title: "AI", msg: "API anahtarı kaydedildi." },

  AI_CORRECT: { title: "Tebrikler!", msg: "Doğru cevap!" },
  AI_WRONG_MARKED: { title: "Yanlış", msg: "Doğru cevap işaretlendi." },

  AI_SUBJECT_EMPTY: "Konu boş olamaz.",
  AI_SUBJECT_APPLIED: { title: "AI Konu", msg: "Tamamlandı. Uygulanan: {applied}" },
  AI_SUBJECT_SET_FOR_Q: { title: "Konu", msg: "Soru {n} → {subject}" },
  AI_SUBJECT_SUMMARY: { title: "AI Konu", msg: "{status} Uygulanan: {applied}, Öneri: {suggested}" },

  AI_KEY_INVALID: "⚠️ Geçersiz anahtar! 'AIza' ile başlamalı.",
  AI_KEY_VALIDATING: "Anahtar doğrulanıyor…",
  AI_KEY_VALID: { title: "AI Hazır", msg: "API anahtarı doğrulandı. Model erişimi başarılı." },
  AI_KEY_MISSING_LIMITED: { title: "AI anahtarı gerekli", msg: "Gemini API anahtarı girilmedi. AI destekli özellikler olmadan deneyim zayıf kalır. Ayarlar > AI anahtarı kısmından ekleyebilirsin." },
  AI_KEY_INVALID_SERVER: { title: "Geçersiz Anahtar", msg: "API key geçersiz görünüyor. Lütfen AI Studio'dan yeni bir key oluşturup tekrar deneyin." },
  AI_KEY_VALIDATE_NET_FAIL: { title: "Bağlantı", msg: "Anahtar doğrulanamadı (bağlantı sorunu). Kaydedildi; ilk AI kullanımında tekrar denenecek." },

  // -----------------------------
  // Practice / attempts (AI practice)
  // -----------------------------
  PRACTICE_ATTEMPT_TRASHED: { title: "Başarılı", msg: "Deneme #{attemptNo} çöpe atıldı." },
  PRACTICE_ATTEMPT_LOADED: { title: "Başarılı", msg: "Deneme #{attemptNo} yüklendi." },
  PRACTICE_FILE_ADDED_TO_NOTES: { title: "Not", msg: "Dosya notlara eklendi" },
  PRACTICE_DRIVE_NOTE_ADDED: { title: "Drive", msg: "Not eklendi" },
  PRACTICE_AI_ATTEMPT_READY: { title: "AI", msg: "Deneme {attemptNo} hazır. Başlatıldı." },
  PRACTICE_Q_REGENERATED: { title: "Güncellendi", msg: "Soru {n} yenilendi." },
  PRACTICE_Q_REGENERATE_FAILED: { title: "Hata", msg: "{reason}" },

  // -----------------------------
  // Studio
  // -----------------------------
  STUDIO_NO_QUESTION_SELECTED: "Lütfen en az bir soru işaretleyin.",
  STUDIO_EXPORT_ERROR: { title: "Dışa aktarma", msg: "{reason}" },
  STUDIO_JS_NOT_FOUND: { title: "Studio", msg: "Studio JS bulunamadı. Dosya yolu hatalı: {paths}" },

  // -----------------------------
  // Exam UI / other
  // -----------------------------
  STRATEGY_EXPORT_READY: { title: "Başarılı", msg: "Yeni tasarım hazır!" },
  TEMPLATE_Q_LOADED: { title: "Şablon", msg: "{count} soru yüklendi." },
  ANSWERKEY_MISSING_EXCLUDED: { title: "Cevap Anahtarı", msg: "{missing} sorunun anahtarı yok. Bu sorular değerlendirmeye dahil edilmedi. (Değerlendirilen: {evaluated}/{total})" },
  ANSWERKEY_EXTRA_IGNORED: { title: "Cevap Anahtarı", msg: "Soru listesiyle eşleşmeyen {extra} anahtar girdisi yok sayıldı." },
  ANSWERKEY_MISMATCH_ON_LOAD: { title: "Cevap Anahtarı", msg: "Anahtar eksik: {missing} soru. (Anahtarlı: {keyed}/{total}) Bu sorular sonuçta puanlanmayacak." },

  // -----------------------------
  // Pati
  // -----------------------------
  PATI_NO_FOOD: "Stokta mama yok! Sınav çözerek kazanmalısın. 🥺",
  PATI_LEVEL_UP: { title: "Pati", msg: "Level atladın! LVL {lvl}" },
  PATI_DAILY_GOAL: { title: "Günlük Hedef", msg: "{goal} soru tamamlandı!" },
  PATI_STREAK: { title: "Streak", msg: "Seri: {streak} gün (10 soru/gün)" },

  // -----------------------------
  // Summary
  // -----------------------------
  SUMMARY_RETRY_STARTED: { title: "Tekrar Başladı", msg: "{count} yanlış soru hazırlanıyor." },
  SUMMARY_RETRY_FAILED: { title: "Hata", msg: "{reason}" },
  RESUME_DISCARDED: { title: "Sıfırlandı", msg: "Kayıt silindi." },
  RESUME_CONTINUED: { title: "Devam", msg: "Kaldığın yerden devam ediyorsun." },

  // -----------------------------
  // Errors (thrown / user-facing)
  // -----------------------------
  ERR_RESIM_OKUNAMADI: { title: "Hata", msg: "Resim okunamadı" },
  ERR_AI_ANAHTAR_URETIMI_ICIN_SORU_BULUNAM: { title: "Hata", msg: "AI anahtar üretimi için soru bulunamadı." },
  ERR_AI_BOS: { title: "Hata", msg: "AI boş" },
  ERR_AI_CIKTISI_JSON_DEGIL: { title: "Hata", msg: "AI çıktısı JSON değil." },
  ERR_AI_KONU_TAMAMLAMAK_ICIN_SORU_BULUNAM: { title: "Hata", msg: "AI konu tamamlamak için soru bulunamadı." },
  ERR_ANSWERKEY_FORMATI_HATALI: { title: "Hata", msg: "answerKey formatı hatalı" },
  ERR_BINDEVENTS_STATE_MISSING: { title: "Hata", msg: "bindEvents: state missing" },
  ERR_BOS_YANIT: { title: "Hata", msg: "Boş yanıt" },
  ERR_BU_DENEME_ESKI_SURUMLE_OLUSTURULMUS: { title: "Hata", msg: "Bu deneme eski sürümle oluşturulmuş, içeriği yüklenemiyor. Lütfen yeni bir deneme üret." },
  ERR_CREATEFOCUSHELPERS_STATE_MISSING: { title: "Hata", msg: "createFocusHelpers: state missing" },
  ERR_DESTEKLENMEYEN_DOSYA_TIPI: { title: "Hata", msg: "Desteklenmeyen dosya tipi." },
  ERR_DESTEKLENMEYEN_FORMAT_SADECE_TXT_DOC: { title: "Hata", msg: "Desteklenmeyen format. Sadece .txt, .docx, .pdf" },
  ERR_DOKUMAN_YOK: { title: "Hata", msg: "Doküman yok." },
  ERR_DOPARSE_FONKSIYONU_BULUNAMADI: { title: "Hata", msg: "doParse fonksiyonu bulunamadı." },
  ERR_DRIVE_ICERIGI_ALINAMADI_VEYA_COK_KIS: { title: "Hata", msg: "Drive içeriği alınamadı veya çok kısa." },
  ERR_FILEID_YOK_2: { title: "Hata", msg: "fileId yok" },
  ERR_GECERSIZ_SINAV_FORMATI: { title: "Hata", msg: "Geçersiz sınav formatı" },
  ERR_GEMINI_API_ANAHTARI_GIRILMEDI_2: { title: "Hata", msg: "Gemini API anahtarı girilmedi." },
  ERR_GEMINI_API_KEY_BULUNAMADI_LOCALSTORA: { title: "Hata", msg: "Gemini API key bulunamadı. (localStorage: GEMINI_KEY)" },
  ERR_GEMINI_BOS_CEVAP_DONDU: { title: "Hata", msg: "Gemini boş cevap döndü" },
  ERR_GEMINI_GECERLI_SORU_URETMEDI: { title: "Hata", msg: "Gemini geçerli soru üretmedi" },
  ERR_GEMINI_JSON_PARSE_EDILEMEDI: { title: "Hata", msg: "Gemini JSON parse edilemedi" },
  ERR_GENERATECONTENT_DESTEKLEYEN_MODEL_BU: { title: "Hata", msg: "generateContent destekleyen model bulunamadı." },
  ERR_GOOGLE_DRIVE_ERISIM_IZNI_ALINAMADI: { title: "Hata", msg: "Google Drive erişim izni alınamadı." },
  ERR_GOOGLE_OAUTH_ACCESS_TOKEN_ALINAMADI: { title: "Hata", msg: "Google OAuth access token alınamadı. Drive izni verilmemiş olabilir." },
  ERR_JSON_BULUNAMADI: { title: "Hata", msg: "JSON bulunamadı" },
  ERR_KAYIT_BULUNAMADI: { title: "Hata", msg: "Kayıt bulunamadı." },
  ERR_KAYNAK_NOT_BULUNAMADI_SOURCEIDS_BOS: { title: "Hata", msg: "Kaynak not bulunamadı (sourceIds boş)." },
  ERR_KLASOR_ID_COZULEMEDI_2: { title: "Hata", msg: "Klasör ID çözülemedi." },
  ERR_LOGIN_POPUP_ZATEN_ACIK: { title: "Hata", msg: "Login popup zaten açık." },
  ERR_MAMMOTH_JS_KUTUPHANESI_EKSIK: { title: "Hata", msg: "mammoth.js kütüphanesi eksik." },
  ERR_MODEL_BOS_CEVAP_DONDURDU: { title: "Hata", msg: "Model boş cevap döndürdü." },
  ERR_NOT_COK_KISA_BIRAZ_DAHA_ICERIK_EKLE: { title: "Hata", msg: "Not çok kısa. Biraz daha içerik ekle." },
  ERR_PDF_JS_KUTUPHANESI_EKSIK: { title: "Hata", msg: "pdf.js kütüphanesi eksik." },
  ERR_PDF_JS_YUKLENEMEDI: { title: "Hata", msg: "pdf.js yüklenemedi" },
  ERR_RANDOM_FALLBACK: { title: "Hata", msg: "Random fallback" },
  ERR_RENDER_BINDRENDERCONTEXT_CAGRILMADI: { title: "Hata", msg: "[render] bindRenderContext() çağrılmadı veya ctx.state yok." },
  ERR_SORU_BULUNAMADI: { title: "Hata", msg: "Soru bulunamadı." },
  ERR_SORU_GUNCELLENEMEDI: { title: "Hata", msg: "Soru güncellenemedi." },
  ERR_SORU_NUMARASI_EKSIK: { title: "Hata", msg: "Soru numarası eksik" },
  ERR_TESSERACT_JS_YUKLENEMEDI: { title: "Hata", msg: "Tesseract.js yüklenemedi" },

  // -----------------------------
  // Errors - Added (full centralization)
  // -----------------------------
  ERR_DRIVE_API: { title: "Drive Hatası", msg: "Drive API hata ({status}). {details}" },
  ERR_DRIVE_TOKEN_MISSING: { title: "Drive Yetkisi Gerekli", msg: "Drive token bulunamadı. Ana uygulamada Drive Listele ile izin verip tekrar dene." },
  ERR_DRIVE_PDF_DOWNLOAD_FAILED: { title: "Drive Hatası", msg: "PDF indirilemedi ({status}). {details}" },
  ERR_REPORT_SEND_FAILED: { title: "Rapor Gönderilemedi", msg: "Bildirim gönderilemedi ({status}). {details}" },
  ERR_AI_LIST_MODELS_FAILED: { title: "AI Hatası", msg: "Model listesi alınamadı ({status}). {details}" },
  ERR_GEMINI_CALL_FAILED: { title: "AI Hatası", msg: "İstek başarısız ({status}). {details}" },
  ERR_GEMINI_API: { title: "AI Hatası", msg: "{details}" },
  ERR_EXPECTED_20_QUESTIONS: { title: "Format Hatası", msg: "20 soru bekleniyordu, {got} geldi." },
  ERR_QUESTION_TEXT_EMPTY: { title: "Format Hatası", msg: "Soru {n}: metin boş." },
  ERR_OPTION_MISSING: { title: "Format Hatası", msg: "Soru {n}: {opt} şıkkı eksik." },
  AI_KEY_MODAL_MISSING: { title: "Eksik UI", msg: "API Key penceresi bulunamadı. Lütfen sayfayı yenileyip tekrar deneyin." },
  ERR_STUDIO_FILE_INPUT_MISSING: { title: "Eksik UI", msg: "Studio dosya alanı bulunamadı (fileInp)." },
});

export function format(template, vars = {}) {
  return String(template ?? "").replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars?.[k];
    return (v === undefined || v === null) ? "" : String(v);
  });
}

function formatValue(v, vars = {}) {
  if (v && typeof v === "object") {
    return {
      title: format(v.title ?? "", vars),
      msg: format(v.msg ?? "", vars),
    };
  }
  return format(String(v ?? ""), vars);
}

/**
 * msg('ID', {vars}, 'fallback') -> string
 * - If the catalog entry is an object, returns its msg field.
 */
export function msg(id, vars = {}, fallback = "") {
  const v = M?.[id];
  if (!v) return fallback || String(id || "");
  const fv = formatValue(v, vars);
  if (fv && typeof fv === "object") return fv.msg || fallback || "";
  return fv;
}

/**
 * toastMsg('ID', {vars}) -> { title, msg }
 * - If the entry is a string, uses defaultTitle for title.
 */
export function toastMsg(id, vars = {}, defaultTitle = "BİLDİRİM") {
  const v = M?.[id];
  if (!v) return { title: defaultTitle, msg: String(id || "") };
  const fv = formatValue(v, vars);
  if (fv && typeof fv === "object") {
    return { title: fv.title || defaultTitle, msg: fv.msg || "" };
  }
  return { title: defaultTitle, msg: fv };
}
