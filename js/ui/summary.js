// js/ui/summary.js - Sonuç Özeti Modalı (V2 - Akıllı Hesaplama)

import { escapeHtml, wrongBookDashboard } from "./shared.js";
import { showToast } from "./status.js";
import { refreshSubjectChart } from "./subjects.js";

// ✅ YENİ HELPER: Kesin Doğru Cevabı Bul (Her yere bakar)
function getCorrectAnswerSafe(q, keyMap) {
  if (!q) return null;
  
  // 1. Cevap anahtarından dene (Sayı ve String olarak)
  let val = keyMap?.[q.n] || keyMap?.[String(q.n)] || keyMap?.[Number(q.n)];

  // 2. Sorunun içinden dene
  if (!val) {
    val = q.answer || q.correctAnswer || q.dogruCevap || q._answerFromSolution;
  }

  // 3. Temizle (Boşlukları at, büyük harf yap)
  if (val && typeof val === 'string') {
    const m = val.match(/[A-F]/i);
    if (m) return m[0].toUpperCase();
    return val.trim().toUpperCase();
  }
  
  return val;
}

// ✅ summary.js local helper: shuffle olsa bile correctId -> görünen harf (A-F)
function getCorrectDisplayLetter(q, correctId) {
  if (!q || !correctId) return null;

  const cid = String(correctId).toUpperCase().trim();

  // Eğer zaten harf geliyorsa (A-F) direkt döndür
  if (/^[A-F]$/.test(cid)) return cid;

  // Bazı akışlarda correctId option.id olabilir (shuffle sonrası id -> harf map)
  const opts = q.optionsByLetter || {};
  for (const L of ["A", "B", "C", "D", "E", "F"]) {
    const opt = opts[L];
    if (!opt) continue;
    const oid = String(opt.id || "").toUpperCase().trim();
    if (oid && oid === cid) return L;
  }

  // Fallback: içinden harf yakalamaya çalış
  const m = cid.match(/[A-F]/);
  return m ? m[0] : null;
}

// ✅ multi destek gerekiyorsa: "ACEF" -> Set("A","C","E","F")
function _toLetterSet(v) {
  if (!v) return new Set();
  const s = String(v).toUpperCase();
  const letters = s.match(/[A-F]/g) || [];
  return new Set(letters);
}

let summaryChartInstance = null;
let __summaryLastFocus = null;
let __practiceHistoryLastFocus = null;
let __practiceSessionViewLastFocus = null;

function _fmtWhen(iso){
  try {
    if (!iso) return '';
    return String(iso).replace('T',' ').slice(0,16);
  } catch { return ''; }
}

function _getOpenEndedTextFromAnswer(rec){
  try {
    if (!rec || rec.__type !== 'open-ended') return '';
    const parts = rec.parts || {};
    const keys = Object.keys(parts);
    if (!keys.length) return '';
    const segs = [];
    for (const k of keys){
      const t = String(parts[k]?.text || '').trim();
      if (t) segs.push(t);
    }
    return segs.join("\n\n");
  } catch { return ''; }
}

function _getGradeFromAnswer(rec){
  try {
    if (!rec || rec.__type !== 'open-ended') return null;
    const parts = rec.parts || {};
    let best = null;
    for (const k of Object.keys(parts)){
      const g = parts[k]?.grade;
      if (g && typeof g.score === 'number') {
        best = g;
        break;
      }
    }
    return best;
  } catch { return null; }
}

function _makePracticeSetFromParsed(parsed){
  try {
    const qs = parsed?.questions || [];
    return qs.map(q => ({
      title: q?.subject || 'Pratik',
      question: String(q?.text || '').trim(),
      difficulty: q?.meta?.difficulty || q?.meta?.level || 'medium',
      focus: q?.subject || 'Pratik',
      meta: q?.meta || {},
    })).filter(it => it.question);
  } catch { return []; }
}

function _openPracticeSessionViewModal({ sessionId = null } = {}){
  const overlay = document.getElementById('practiceSessionViewModal');
  const listEl = document.getElementById('practiceSessionViewList');
  const metaEl = document.getElementById('practiceSessionViewMeta');
  const titleEl = document.getElementById('practiceSessionViewTitle');
  const subEl = document.getElementById('practiceSessionViewSub');
  if (!overlay || !listEl || !metaEl) return;

  const getFn = window.__ACUMEN_SESSIONS_GET;
  const sess = (typeof getFn === 'function' && sessionId) ? getFn(sessionId) : null;

  listEl.innerHTML = '';
  metaEl.innerHTML = '';

  if (!sess) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:14px; border:1px dashed var(--border); border-radius:14px; color:#a1a1aa;';
    empty.textContent = 'Oturum bulunamadı.';
    listEl.appendChild(empty);
  } else {
    const t = sess?.title || 'Gelişim Pratiği';
    if (titleEl) titleEl.textContent = `🧪 ${t}`;
    if (subEl) subEl.textContent = sess?.parentExamTitle ? `Kaynak: ${sess.parentExamTitle}` : 'Detaylar';

    const pct = (sess?.result?.openEndedScore?.pct == null) ? '—' : (String(sess.result.openEndedScore.pct) + '%');
    const dp = (sess?.delta?.pct == null) ? '—' : ((sess.delta.pct >= 0 ? '+' : '') + String(Math.round(sess.delta.pct)));

    const chip = (label, val) => {
      const d = document.createElement('div');
      d.style.cssText = 'padding:8px 10px; border:1px solid var(--border); border-radius:999px; background:rgba(255,255,255,0.03);';
      d.innerHTML = `${escapeHtml(label)}: <b>${escapeHtml(String(val))}</b>`;
      return d;
    };
    metaEl.appendChild(chip('Sonuç', pct));
    metaEl.appendChild(chip('Δ', `${dp} puan`));
    if (sess?.generator?.model) metaEl.appendChild(chip('Model', sess.generator.model));
    metaEl.appendChild(chip('Tarih', _fmtWhen(sess?.finishedAt || sess?.createdAt)));

    // Show rubric delta summary if available
    try {
      const rd = sess?.delta?.rubricDelta || null;
      const keys = rd ? Object.keys(rd) : [];
      if (keys.length) {
        const box = document.createElement('div');
        box.style.cssText = 'width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:14px; background:rgba(255,255,255,0.02); font-size:12px; color:#d1d1d6;';
        const items = keys.slice(0,6).map(k => `${escapeHtml(k)} <b>${(rd[k] >= 0 ? '+' : '') + escapeHtml(String(rd[k]))}</b>`);
        box.innerHTML = `<div style="font-weight:700; margin-bottom:6px;">Rubrik Δ</div><div style="display:flex; gap:10px; flex-wrap:wrap;">${items.map(it=>`<span style=\"padding:6px 10px; border:1px solid var(--border); border-radius:999px;\">${it}</span>`).join('')}</div>`;
        metaEl.appendChild(box);
      }
    } catch {}

    // Render question cards
    const parsed = sess?.parsed || null;
    const answers = sess?.answers || {};
    const qs = parsed?.questions || [];
    if (!qs.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:14px; border:1px dashed var(--border); border-radius:14px; color:#a1a1aa;';
      empty.textContent = 'Bu oturumda soru bulunamadı.';
      listEl.appendChild(empty);
    } else {
      for (const q of qs){
        const n = q?.n;
        const rec = answers?.[String(n)] || answers?.[n];
        const ansText = _getOpenEndedTextFromAnswer(rec);
        const g = _getGradeFromAnswer(rec);
        const score = (g && typeof g.score === 'number') ? `${Math.round(g.score)}%` : '—';
        const conf = (g && typeof g.confidence === 'number') ? `${Math.round(g.confidence)}%` : '—';
        const model = g?.meta?.model || sess?.generator?.model || '';

        const card = document.createElement('div');
        card.style.cssText = 'border:1px solid var(--border); background:rgba(255,255,255,0.03); border-radius:14px; padding:12px; display:flex; flex-direction:column; gap:10px;';
        card.innerHTML = `
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
            <div style="font-weight:800;">Soru ${escapeHtml(String(n))}</div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; color:#d1d1d6; font-size:12px;">
              <div>Skor: <b>${escapeHtml(score)}</b></div>
              <div>Confidence: <b>${escapeHtml(conf)}</b></div>
              ${model ? `<div>Model: <b>${escapeHtml(String(model))}</b></div>` : ''}
            </div>
          </div>
          <div style="color:#e5e7eb; line-height:1.45;">${escapeHtml(String(q?.text || '').trim()).replace(/\n/g,'<br>')}</div>
          <div style="border-top:1px solid var(--border); padding-top:10px;">
            <div style="font-size:12px; color:#a1a1aa; margin-bottom:6px;">Senin Yanıtın</div>
            <div style="white-space:pre-wrap; background:rgba(0,0,0,0.22); border:1px solid var(--border); border-radius:12px; padding:10px;">${escapeHtml(ansText || '—')}</div>
          </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
              <button class="btn" data-act="copyAns" data-qn="${escapeHtml(String(n))}" style="padding:8px 10px;">📋 Yanıtı Kopyala</button>
              <button class="btn" data-act="regrade" data-qn="${escapeHtml(String(n))}" style="padding:8px 10px;">🔁 Yeniden Değerlendir</button>
            </div>
        `;

        // Rubrik/feedback
        try {
          const fb = String(g?.feedback || '').trim();
          const subs = g?.subscores && typeof g.subscores === 'object' ? g.subscores : null;
          if ((fb && fb.length) || (subs && Object.keys(subs).length)) {
            const sec = document.createElement('div');
            sec.style.cssText = 'border-top:1px solid var(--border); padding-top:10px; display:flex; flex-direction:column; gap:8px;';
            if (fb) {
              const d = document.createElement('div');
              d.innerHTML = `<div style="font-size:12px; color:#a1a1aa; margin-bottom:4px;">AI Geri Bildirim</div><div style="color:#d1d1d6; white-space:pre-wrap;">${escapeHtml(fb)}</div>`;
              sec.appendChild(d);
            }
            if (subs && Object.keys(subs).length) {
              const chips = Object.entries(subs).slice(0,12).map(([k,v]) => {
                const num = Number(v);
                const vv = Number.isFinite(num) ? (Math.round(num*10)/10) : String(v);
                return `<span style="padding:6px 10px; border:1px solid var(--border); border-radius:999px; font-size:12px; color:#d1d1d6;">${escapeHtml(k)} <b>${escapeHtml(String(vv))}</b></span>`;
              }).join('');
              const d = document.createElement('div');
              d.innerHTML = `<div style="font-size:12px; color:#a1a1aa; margin-bottom:6px;">Rubrik</div><div style="display:flex; gap:10px; flex-wrap:wrap;">${chips}</div>`;
              sec.appendChild(d);
            }
            card.appendChild(sec);
          }
        } catch {}

        listEl.appendChild(card);

        // Wire per-card actions (copy / regrade)
        try {
          card.querySelectorAll('button[data-act]').forEach(b => {
            b.addEventListener('click', async (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              const act = b.getAttribute('data-act');
              const qn = b.getAttribute('data-qn') || '';
              if (act === 'copyAns') {
                const text = ansText || '';
                try {
                  await navigator.clipboard.writeText(text);
                  try { showToast?.({ kind:"ok", id:"COPY_ANS", text:"Yanıt kopyalandı." }); } catch {}
                } catch {
                  // fallback
                  try { window.prompt("Yanıtı kopyala:", text); } catch {}
                }
                return;
              }
              if (act === 'regrade') {
                const text = (ansText || '').trim();
                if (!text) {
                  alert('Yanıt boş. Önce yanıt olmalı.');
                  return;
                }
                const grader = window.__ACUMEN_GRADE_OPEN_ENDED;
                if (typeof grader !== 'function') {
                  alert('Değerlendirme fonksiyonu bulunamadı.');
                  return;
                }
                const oldLabel = b.textContent;
                b.textContent = '⏳ Değerlendiriliyor...';
                b.disabled = true;
                try {
                  const grade = await grader({ caseText: "", question: String(q?.text || ""), answer: text });
                  // Update answer record in session
                  const key = String(n);
                  const cur = (sess.answers && typeof sess.answers === 'object') ? (sess.answers[key] || sess.answers[n] || null) : null;
                  const rec2 = (cur && typeof cur === 'object') ? cur : { __type:'open-ended', parts:{} };
                  if (!rec2.__type) rec2.__type = 'open-ended';
                  if (!rec2.parts || typeof rec2.parts !== 'object') rec2.parts = {};
                  const pk = Object.keys(rec2.parts)[0] || '1';
                  rec2.parts[pk] = rec2.parts[pk] || {};
                  rec2.parts[pk].text = text;
                  rec2.parts[pk].grade = grade;
                  rec2.parts[pk].gradedAt = Date.now();
                  rec2.parts[pk].updatedAt = Date.now();
                  sess.answers = sess.answers || {};
                  sess.answers[key] = rec2;

                  // Recompute session aggregates (openEndedScore + rubricAvg + delta)
                  const answersObj = sess.answers || {};
                  const computeRubricAvg = (obj) => {
                    const sums = new Map();
                    const counts = new Map();
                    try {
                      for (const nn of Object.keys(obj||{})){
                        const a = obj[nn];
                        if (!a || a.__type !== 'open-ended') continue;
                        const parts = a.parts || {};
                        for (const pk2 of Object.keys(parts)){
                          const subs = parts[pk2]?.grade?.subscores;
                          if (!subs || typeof subs !== 'object') continue;
                          for (const [k,v] of Object.entries(subs)){
                            const num = Number(v);
                            if (!Number.isFinite(num)) continue;
                            sums.set(k, (sums.get(k)||0) + num);
                            counts.set(k, (counts.get(k)||0) + 1);
                          }
                        }
                      }
                    } catch {}
                    const out = {};
                    for (const [k,sum] of sums.entries()){
                      const c = counts.get(k)||0;
                      if (c) out[k] = Math.round((sum / c) * 10) / 10;
                    }
                    return out;
                  };
                  const computeOpenEndedScore = (parsed, obj) => {
                    const qs2 = parsed?.questions || [];
                    let total = 0, blank = 0, pending = 0, error = 0, graded = 0;
                    const perCard = [];
                    const gradedScores = [];
                    for (const qq of qs2){
                      const nn = qq?.n;
                      total++;
                      const a = obj?.[String(nn)] || obj?.[nn];
                      const text2 = _getOpenEndedTextFromAnswer(a);
                      const g2 = _getGradeFromAnswer(a);
                      if (!text2 || !String(text2).trim()) { blank++; perCard.push({ n: nn, score: null, status: 'blank' }); continue; }
                      if (!g2 || typeof g2.score !== 'number') { pending++; perCard.push({ n: nn, score: null, status: 'pending' }); continue; }
                      const sc = Number(g2.score);
                      if (!Number.isFinite(sc)) { error++; perCard.push({ n: nn, score: null, status:'error' }); continue; }
                      graded++; gradedScores.push(sc);
                      perCard.push({ n: nn, score: Math.round(sc), status: sc>=80?'pass':sc>=50?'partial':'retry' });
                    }
                    const pct = gradedScores.length ? Math.round(gradedScores.reduce((a,b)=>a+b,0)/gradedScores.length) : null;
                    return { mode:'practice', pct, status: (pct==null?'none':(pct>=80?'pass':pct>=50?'partial':'retry')), provisional: pending>0, cards:{ total, graded, pending, blank, error }, perCard, updatedAt: Date.now() };
                  };

                  const practiceRubric = computeRubricAvg(answersObj);
                  const newOe = computeOpenEndedScore(sess.parsed, answersObj);
                  sess.result = sess.result || {};
                  sess.result.openEndedScore = newOe;
                  sess.result.rubricAvg = practiceRubric;

                  // Delta recompute if baseline exists
                  try {
                    const baselinePct = Number(sess?.baseline?.pct);
                    const newPct = Number(newOe?.pct);
                    const rubricDelta = {};
                    const baseRub = sess?.baseline?.rubricAvg || {};
                    for (const k of Object.keys(practiceRubric||{})){
                      const a = Number(baseRub?.[k]);
                      const b = Number(practiceRubric?.[k]);
                      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
                      rubricDelta[k] = Math.round((b - a) * 10) / 10;
                    }
                    sess.delta = sess.delta || {};
                    sess.delta.pct = (Number.isFinite(baselinePct) && Number.isFinite(newPct)) ? (newPct - baselinePct) : null;
                    sess.delta.rubricDelta = rubricDelta;
                  } catch {}

                  // Persist update
                  try {
                    const upd = window.__ACUMEN_SESSIONS_UPDATE;
                    if (typeof upd === 'function') upd(sess.id, sess);
                    else {
                      const add = window.__ACUMEN_SESSIONS_ADD;
                      if (typeof add === 'function') add(sess);
                    }
                  } catch {}

                  try { showToast?.({ kind:"ok", id:"RE_GRADED", text:"Yeniden değerlendirildi." }); } catch {}

                  // Re-render modal to reflect changes
                  _openPracticeSessionViewModal({ sessionId: sess.id });
                } catch (e) {
                  console.error(e);
                  alert('Yeniden değerlendirme başarısız.');
                } finally {
                  b.disabled = false;
                  b.textContent = oldLabel;
                }
                return;
              }
            });
          });
        } catch {}

      }
    }

    // Wire rerun & delete buttons
    const btnRerun = document.getElementById('btnRerunPracticeSession');
    const btnDel = document.getElementById('btnDeletePracticeSession');
    if (btnRerun) {
      btnRerun.onclick = () => {
        try {
          const startFn = window.__ACUMEN_START_GENERATED_PRACTICE;
          if (typeof startFn !== 'function') {
            alert('Pratik başlatma fonksiyonu bulunamadı.');
            return;
          }
          const practiceSet = _makePracticeSetFromParsed(sess?.parsed);
          if (!practiceSet.length) {
            alert('Pratik seti boş.');
            return;
          }
          startFn({
            title: sess?.title || 'Gelişim Pratiği',
            practiceSet,
            generator: sess?.generator || null,
          });
          // close modal
          try {
            const ae = document.activeElement;
            if (ae && overlay.contains(ae)) ae.blur();
          } catch {}
          overlay.style.display = 'none';
          overlay.setAttribute('aria-hidden','true');
        } catch (e) {
          console.error(e);
          alert('Pratik başlatılamadı.');
        }
      };
    }
    if (btnDel) {
      btnDel.onclick = () => {
        if (!confirm('Bu pratik oturumunu silmek istiyor musun?')) return;
        const delFn = window.__ACUMEN_SESSIONS_DELETE;
        if (typeof delFn !== 'function') {
          alert('Silme fonksiyonu bulunamadı.');
          return;
        }
        const ok = delFn(sess.id);
        if (!ok) { alert('Silinemedi.'); return; }
        // Close and refresh practice history list
        try {
          const ae = document.activeElement;
          if (ae && overlay.contains(ae)) ae.blur();
        } catch {}
        overlay.style.display = 'none';
        overlay.setAttribute('aria-hidden','true');
        showToast?.({ kind:'ok', id:'PRACTICE_DELETED', text:'Pratik oturumu silindi.' });
      };
    }
  }

  // open modal
  try { __practiceSessionViewLastFocus = document.activeElement || null; } catch {}
  overlay.style.display = 'flex';
  overlay.setAttribute('aria-hidden','false');
  try { document.getElementById('btnOkPracticeSessionView')?.focus({ preventScroll:true }); } catch {}

  const close = () => {
    try {
      const ae = document.activeElement;
      if (ae && overlay.contains(ae)) ae.blur();
      if (__practiceSessionViewLastFocus && typeof __practiceSessionViewLastFocus.focus === 'function') __practiceSessionViewLastFocus.focus({ preventScroll:true });
    } catch {}
    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden','true');
  };
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  document.getElementById('btnClosePracticeSessionView')?.addEventListener('click', close, { once:true });
  document.getElementById('btnOkPracticeSessionView')?.addEventListener('click', close, { once:true });
  const esc = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } };
  document.addEventListener('keydown', esc);
}

function _openPracticeHistoryModal({ parentExamId = null } = {}){
  const overlay = document.getElementById('practiceHistoryModal');
  const listEl = document.getElementById('practiceHistoryList');
  if (!overlay || !listEl) return;

  const listFn = window.__ACUMEN_SESSIONS_LIST;
  const sessions = (typeof listFn === 'function')
    ? listFn({ type: 'generated_practice', parentExamId: parentExamId || null, limit: 50 })
    : [];

  listEl.innerHTML = '';

  if (!sessions.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:14px; border:1px dashed var(--border); border-radius:14px; color:#a1a1aa;';
    empty.textContent = 'Henüz kayıtlı pratik oturumu yok.';
    listEl.appendChild(empty);
  } else {
    for (const s of sessions) {
      const row = document.createElement('div');
      row.style.cssText = 'border:1px solid var(--border); background:rgba(255,255,255,0.03); border-radius:14px; padding:12px; display:flex; flex-direction:column; gap:8px;';

      const title = s?.title || 'Gelişim Pratiği';
      const when = s?.finishedAt || s?.createdAt || '';
      const pct = (s?.result?.openEndedScore?.pct == null) ? '—' : (String(s.result.openEndedScore.pct) + '%');
      const dp = (s?.delta?.pct == null) ? '—' : ((s.delta.pct >= 0 ? '+' : '') + String(Math.round(s.delta.pct)));

      row.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div style="font-weight:700;">${escapeHtml(String(title))}</div>
          <div style="color:#a1a1aa; font-size:12px;">${escapeHtml(_fmtWhen(when))}</div>
        </div>
        <div style="display:flex; gap:14px; flex-wrap:wrap; color:#d1d1d6; font-size:12px;">
          <div>Sonuç: <b>${escapeHtml(pct)}</b></div>
          <div>Δ: <b>${escapeHtml(dp)}</b> puan</div>
          ${s?.generator?.model ? `<div>Model: <b>${escapeHtml(String(s.generator.model))}</b></div>` : ''}
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:2px;">
          <button class="btn" data-act="view" data-sid="${escapeHtml(String(s.id))}" style="padding:8px 10px;">🔎 İncele</button>
          <button class="btn" data-act="rerun" data-sid="${escapeHtml(String(s.id))}" style="padding:8px 10px;">🔁 Tekrar Başlat</button>
        </div>
      `;

      // wire actions
      row.querySelectorAll('button[data-act]').forEach(btn => {
        btn.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const act = btn.getAttribute('data-act');
          const sid = btn.getAttribute('data-sid');
          if (!sid) return;
          if (act === 'view') {
            _openPracticeSessionViewModal({ sessionId: sid });
            return;
          }
          if (act === 'rerun') {
            try {
              const getFn = window.__ACUMEN_SESSIONS_GET;
              const startFn = window.__ACUMEN_START_GENERATED_PRACTICE;
              if (typeof getFn !== 'function' || typeof startFn !== 'function') {
                alert('Pratik başlatma altyapısı bulunamadı.');
                return;
              }
              const sess = getFn(sid);
              const practiceSet = _makePracticeSetFromParsed(sess?.parsed);
              if (!practiceSet.length) {
                alert('Pratik seti boş.');
                return;
              }
              startFn({ title: sess?.title || 'Gelişim Pratiği', practiceSet, generator: sess?.generator || null });
              // close history modal
              try {
                const ae = document.activeElement;
                if (ae && overlay.contains(ae)) ae.blur();
              } catch {}
              overlay.style.display = 'none';
              overlay.setAttribute('aria-hidden','true');
            } catch (e) {
              console.error(e);
              alert('Pratik başlatılamadı.');
            }
          }
        });
      });

      listEl.appendChild(row);
    }
  }

  // open modal
  try { __practiceHistoryLastFocus = document.activeElement || null; } catch {}
  overlay.style.display = 'flex';
  overlay.setAttribute('aria-hidden','false');
  try { document.getElementById('btnOkPracticeHistory')?.focus({ preventScroll:true }); } catch {}

  const close = () => {
    try {
      const ae = document.activeElement;
      if (ae && overlay.contains(ae)) ae.blur();
      if (__practiceHistoryLastFocus && typeof __practiceHistoryLastFocus.focus === 'function') __practiceHistoryLastFocus.focus({ preventScroll:true });
    } catch {}
    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden','true');
  };
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  document.getElementById('btnClosePracticeHistory')?.addEventListener('click', close, { once:true });
  document.getElementById('btnOkPracticeHistory')?.addEventListener('click', close, { once:true });
  const esc = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } };
  document.addEventListener('keydown', esc);
}

export function openSummaryModal({ total, answered, correct, score, wrong=0, blank=0, keyMissing=0, timeSpent='0:00', title, openEndedScore=null, practiceDelta=null }){
  const overlay = document.getElementById("summaryModal");
  if (!overlay) return;

  const sub = document.getElementById("summarySub");
  if (sub) sub.textContent = title ? `"${title}" sonuçları` : "Sonuçlar";

  // Veri Yaz
  const set = (id, v) => { const e=document.getElementById(id); if(e) e.textContent = String(v ?? 0); };
  set("mSumQ", total); set("mSumA", answered); set("mSumC", correct);
  set("mSumW", wrong); set("mSumB", blank); set("mScoreDisplay", score);

  // Süre Hesap
  let avgText = "-";
  if (answered > 0 && timeSpent) {
    const parts = timeSpent.split(":");
    if (parts.length === 2) {
      const totalSec = (parseInt(parts[0]) * 60) + parseInt(parts[1]);
      const avg = Math.round(totalSec / answered);
      avgText = avg + "sn";
    }
  }
  set("mSumAvg", avgText);

  // --- MCQ yoksa doğru/yanlış/boş gibi alanları gizle (Pratik sınavlar için) ---
  try {
    const qs = window.__APP_STATE?.parsed?.questions || [];
    const mcqCount = qs.filter(q => {
      const ob = q?.optionsByLetter;
      if (ob && typeof ob === "object" && Object.keys(ob).length) return true;
      const opts = q?.options || q?.choices;
      return Array.isArray(opts) && opts.length > 0;
    }).length;


    // Başlık metnini sınav tipine göre düzelt (MCQ yoksa "Hata Analizi" demeyelim)
    const titleEl = document.getElementById("subjectAnalysisTitle");
    if (titleEl) {
      const totalQ = Array.isArray(qs) ? qs.length : 0;
      const openCount = Math.max(0, totalQ - mcqCount);
      if (mcqCount === 0) {
        titleEl.textContent = (openCount > 0) ? "📊 Pratik Analizi" : "📊 Konu Analizi";
      } else {
        titleEl.textContent = "📊 Konu Bazlı Hata Analizi";
      }
    }

    // AI Subjects buton metnini sınav tipine göre düzelt
    const aiBtn = document.getElementById("btnAiSubjects");
    if (aiBtn) {
      const label = (mcqCount === 0) ? "🤖 AI ile Yanıtlarını Geliştir" : "🤖 AI ile Konuları Tamamla";
      aiBtn.textContent = label;
      // ai.js modal başlığında da kullanılsın
      window.__ACUMEN_AI_SUBJECT_TITLE = label;
    }



    if (mcqCount === 0) {
      const hideStat = (valId) => {
        const el = document.getElementById(valId);
        const card = el?.closest?.(".statCard");
        if (card) card.style.display = "none";
      };
      hideStat("mSumC");
      hideStat("mSumW");
      hideStat("mSumB");

      // Eğer tüm MCQ metrikleri anlamsızsa ortalama süreyi de gizleyebilirsin (şimdilik bırakıyoruz)
      // Konu grafiği MCQ'ya bağlıysa ayrıca subjectAnalysisWrap gizlenebilir; şimdilik dokunmuyoruz.
    } else {
      // MCQ varsa, gizlenmiş olabilir; geri aç
      const showStat = (valId) => {
        const el = document.getElementById(valId);
        const card = el?.closest?.(".statCard");
        if (card) card.style.display = "";
      };
      showStat("mSumC");
      showStat("mSumW");
      showStat("mSumB");
    }
  } catch (e) {
    // UI kırılmasın
    console.warn("MCQ stat visibility check failed:", e);
  }


  // --- 0. OPEN-ENDED (AI) PANEL ---
// Pratik modunda sonuçlar provisional olabilir; akışı kilitlemeden gösterir.
{
  const st = openEndedScore || window.__OPEN_ENDED_SCORE || window.__APP_STATE?.openEndedScore || null;
  const wrap = document.getElementById("openEndedSummaryWrap");

  if (!wrap || !st) {
    if (wrap) wrap.style.display = "none";
  } else {
    wrap.style.display = "block";

    const graded = st?.cards?.graded ?? 0;
    const totalCards = st?.cards?.total ?? 0;
    const pending = st?.cards?.pending ?? 0;
    const blankOE = st?.cards?.blank ?? 0;
    const errOE = st?.cards?.error ?? 0;

    // Ortalama (%)
    let pctText = (st?.pct == null) ? "—" : (String(st.pct) + "%");

    // Pratik modu için semantik doğru durum/sonuç mapping
    let statusText = "—";
    let resultText = "—";

    if (totalCards > 0 && blankOE === totalCards) {
      // Hiç cevap verilmemiş
      statusText = "Yapılmadı";
      resultText = "Yok";
      pctText = "—";
    } else if (pending > 0 && graded === 0) {
      // Cevap var ama puan yok
      statusText = "Değerlendiriliyor";
      resultText = "Geçici";
    } else if (graded > 0) {
      // Puan var (kısmi veya tam)
      const pctNum = (st?.pct == null) ? 0 : Number(st.pct);
      if (pctNum >= 80) statusText = "Güçlü";
      else if (pctNum >= 50) statusText = "Orta";
      else statusText = "Zayıf";
      resultText = (pending > 0 || errOE > 0) ? "Geçici" : "Tam";
    } else {
      statusText = "Yok";
      resultText = "Yok";
      pctText = "—";
    }

    const setT = (id, v) => {
      const e = document.getElementById(id);
      if (e) e.textContent = String(v);
    };
    setT("oeSumGraded", `${graded}/${totalCards}`);
    setT("oeSumPct", pctText);
    setT("oeSumStatus", statusText);
    setT("oeSumProvisional", resultText);

    const hint = document.getElementById("oeSumHint");
    if (hint) {
      const parts = [];
      if (pending > 0) parts.push(`${pending} soru değerlendiriliyor`);
      if (blankOE > 0) parts.push(`${blankOE} soru boş`);
      if (errOE > 0) parts.push(`${errOE} değerlendirme hatası`);
      hint.textContent = parts.length ? ("Not: " + parts.join(" • ") + ".") : "";
    }

    const mdl = document.getElementById("oeSumModel");
    if (mdl) {
      const mi = st?.modelInfo || null;
      if (mi && (mi.model || mi.provider || mi.rubric)) {
        const bits = [];
        if (mi.provider) bits.push(`Kaynak: ${mi.provider}`);
        if (mi.model) bits.push(`Model: ${mi.model}`);
        if (mi.rubric) bits.push(`Rubrik: ${mi.rubric}`);
        mdl.textContent = bits.join(" • ");
      } else {
        mdl.textContent = "";
      }
    }

    // --- Gelişim Pratiği (Δ) ---
    try {
      const delta = practiceDelta || window.__APP_STATE?.lastPracticeDelta || null;
      const dWrap = document.getElementById("oeDeltaWrap");
      if (!dWrap) {
        // no mount => skip
      } else if (!delta || (delta.beforePct == null && delta.afterPct == null)) {
        dWrap.style.display = "none";
      } else {
        dWrap.style.display = "block";
        const beforeEl = document.getElementById("oeDeltaBefore");
        const afterEl = document.getElementById("oeDeltaAfter");
        const diffEl = document.getElementById("oeDeltaDiff");
        if (beforeEl) beforeEl.textContent = (delta.beforePct == null) ? "—" : `${delta.beforePct}%`;
        if (afterEl) afterEl.textContent = (delta.afterPct == null) ? "—" : `${delta.afterPct}%`;
        if (diffEl) {
          const d = delta.deltaPct;
          diffEl.textContent = (d == null) ? "—" : ((d >= 0 ? "+" : "") + String(Math.round(d)));
        }

        const list = document.getElementById("oeDeltaRubric");
        if (list) {
          const rd = delta.rubricDelta || {};
          const entries = Object.entries(rd).filter(([k,v]) => k && typeof v === 'number');
          entries.sort((a,b)=>Math.abs(b[1]) - Math.abs(a[1]));
          const top = entries.slice(0, 5);
          if (!top.length) {
            list.innerHTML = "";
          } else {
            list.innerHTML = top.map(([k,v]) => {
              const s = (v >= 0 ? "+" : "") + String(v);
              return `<div style="display:flex; justify-content:space-between; gap:10px; font-size:12px; color:#d1d1d6;"><span>${escapeHtml(String(k))}</span><b style="font-variant-numeric: tabular-nums;">${escapeHtml(s)}</b></div>`;
            }).join("");
          }
        }
      }
    } catch (e) {
      console.warn("delta render failed", e);
    }
  }
}


// --- 1. GRAFİK: Genel Doughnut ---
  const ctx = document.getElementById('summaryChart');
  if (ctx && window.Chart) {
    if (summaryChartInstance) summaryChartInstance.destroy();
    summaryChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ["Doğru", "Yanlış", "Boş"],
        datasets: [{
          data: [correct, wrong, blank],
          backgroundColor: ['#34C759', '#FF453A', '#3a3a3c'],
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '75%',
        plugins: { legend: { display: false }, tooltip: { enabled: true } }
      }
    });
  }

  // --- 2. GRAFİK: Konu Analizi ---
  refreshSubjectChart();

  // --- Buton ve Modal Mantığı ---
  try { __summaryLastFocus = document.activeElement || null; } catch {}
  overlay.style.display = "flex";
  overlay.setAttribute("aria-hidden","false");
  // Move focus into the modal for accessibility
  try {
    const btnOk = document.getElementById("btnOkSummary");
    if (btnOk) btnOk.focus({ preventScroll: true });
  } catch {}
  
  const close = () => closeSummaryModal();

  const btnX = document.getElementById("btnCloseSummary");
  const btnOk = document.getElementById("btnOkSummary");
  if (btnX) btnX.onclick = close;
  if (btnOk) btnOk.onclick = close;

  const btnReview = document.getElementById("btnReviewWrongs");
  if (btnReview) {
    btnReview.style.display = (wrong > 0) ? "block" : "none";
    // Eski listener'ı temizlemek için clone
    const newBtnRev = btnReview.cloneNode(true);
    btnReview.parentNode.replaceChild(newBtnRev, btnReview);
    
    newBtnRev.onclick = () => {
      close();
      const chkWrong = document.getElementById("showOnlyWrong");
      if (chkWrong) { 
        chkWrong.checked = true; 
        chkWrong.dispatchEvent(new Event('change')); 
      }
      // İlk yanlış soruya git
      const firstWrong = document.querySelector(".navBtn.wrong");
      if (firstWrong) firstWrong.click();
    };
  }

  // ✅ Practice history (generated practice) button
  const btnPH = document.getElementById('btnPracticeHistory');
  if (btnPH) {
    try {
      const parentExamId = window.__APP_STATE?.parsed?.meta?.examId || window.__APP_STATE?.parsed?.meta?.sourceId || window.__APP_STATE?._parentExamId || null;
      const listFn = window.__ACUMEN_SESSIONS_LIST;
      const has = (typeof listFn === 'function') ? (listFn({ type:'generated_practice', parentExamId, limit: 1 }).length > 0) : false;
      btnPH.style.display = has ? 'inline-flex' : 'none';
      // reset listener via clone
      const newBtn = btnPH.cloneNode(true);
      btnPH.parentNode.replaceChild(newBtn, btnPH);
      if (has) {
        newBtn.onclick = () => _openPracticeHistoryModal({ parentExamId });
      }
    } catch {
      btnPH.style.display = 'none';
    }
  }

  const btnRetry = document.getElementById("btnRetryWrongs");
  if (btnRetry) {
    btnRetry.style.display = (wrong > 0) ? "block" : "none";
    const newBtnRetry = btnRetry.cloneNode(true);
    btnRetry.parentNode.replaceChild(newBtnRetry, btnRetry);

    // 🔥 FIX: Hataları Tekrarla Mantığı (GÜÇLENDİRİLMİŞ)
    newBtnRetry.onclick = () => {
      try {
        const state = window.__APP_STATE;
        
        // Eğer global değişkenlerde fonksiyonlar yoksa uyarı ver
        if (!state || !state.parsed) { 
           console.error("APP STATE EKSİK");
           return; 
        }

        const keyMap = state.parsed.answerKey || {};

        // Yanlışları Filtrele
        const wrongQuestions = (state.parsed.questions || []).filter(q => {
            const userAns = state.answers?.get?.(q.n);
            if (!userAns) return false; // Boşları yanlış sayma (isteğe bağlı)

            // Doğru cevabı akıllıca bul
            const correctRaw = getCorrectAnswerSafe(q, keyMap);
            if (!correctRaw) return false; // Cevap anahtarı yoksa geç

            // Ekranda görünen harfi bul (Shuffle desteği)
            const correctLetter = getCorrectDisplayLetter(q, correctRaw);
            
            // Kıyasla
            return userAns !== correctLetter;
        });

        if (wrongQuestions.length === 0) { 
            window.showToast?.({id:"NO_REPEAT_WRONG_FOUND", kind:"warn"}); 
            return; 
        }

        // State Güncelleme
        state.parsed.questions = wrongQuestions;
        state.answers = new Map();
        state.mode = "exam";
        state.startedAt = new Date().toISOString();
        state.timeLeftSec = state.durationSec ?? (20*60); // Süreyi sıfırla

        // Global fonksiyonları çağır (window üzerinden)
        if (window.__APP_PAINT_ALL) window.__APP_PAINT_ALL();
        if (window.__APP_PERSIST) window.__APP_PERSIST();

        close();

        // Filtreyi temizle
        const chkWrong = document.getElementById("showOnlyWrong");
        if (chkWrong) chkWrong.checked = false;

        if (window.showToast) {
            window.showToast({ id:"SUMMARY_RETRY_STARTED", vars:{ count: wrongQuestions.length }, kind:"warn" });
        }
        
        window.scrollTo({ top: 0, behavior: "smooth" });

      } catch (e) {
        console.error("Retry Error:", e);
        window.showToast?.({ id:"SUMMARY_RETRY_FAILED", vars:{ reason: (e?.message||"") }, kind:"bad" });
      }
    };
  }

  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  function esc(e){ if (e.key === "Escape"){ close(); document.removeEventListener("keydown", esc); } }
  document.addEventListener("keydown", esc);
}

export function closeSummaryModal(){
  const overlay = document.getElementById("summaryModal");
  if (!overlay) return;

  // If focus is inside the modal, move it out before hiding (prevents aria-hidden focus warnings)
  try {
    const ae = document.activeElement;
    if (ae && overlay.contains(ae)) ae.blur();
    if (__summaryLastFocus && typeof __summaryLastFocus.focus === "function") {
      __summaryLastFocus.focus({ preventScroll: true });
    } else if (typeof document.body?.focus === "function") {
      document.body.focus({ preventScroll: true });
    }
  } catch {}

  overlay.style.display = "none";
  overlay.setAttribute("aria-hidden","true");
}