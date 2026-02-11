// js/ui.js - modüler giriş (otomatik ayrıştırılmış)
// Not: Bu dosya artık sadece modülleri birleştirir.

import { ensureThemePatches } from "./ui/shared.js";
import "./ui/version.js"; // sürüm kontrolü (side-effect)

// UI polish: bir kere enjekte et
try { ensureThemePatches(); } catch {}

export { refreshSubjectChips, refreshSubjectChart } from "./ui/subjects.js";
export { setStatus, showWarn, showToast, setLoading } from "./ui/status.js";
export { updateModeUI, updateStats } from "./ui/mode_stats.js";
export { generateAnswerKeyWithGemini, runGeminiAnalysis, runGeminiGenerator, fillMissingSubjectsWithGemini } from "./ui/ai.js";
export { renderExam } from "./ui/exam.js";
export { buildNav, refreshNavColors } from "./ui/nav.js";
export { attachKeyboardShortcuts } from "./ui/keyboard.js";
export { openSummaryModal, closeSummaryModal } from "./ui/summary.js";
export { openSrsModal, closeSrsModal } from "./ui/srs.js";
export { renderFocusMiniNav, refreshFocusMiniNav } from "./ui/focusNav.js";
export { initTheme } from "./ui/theme.js";
