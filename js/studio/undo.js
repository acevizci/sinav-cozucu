import { State } from "./state.js";
import { toast } from "./ui.js";
import { updateQuestionList } from "./sidebar.js";
import { renderOverlays } from "./overlays.js";

export function undoLast(){
  if (!State.questions.length) return;
  const last = State.questions[State.questions.length - 1];
  State.questions.pop();
  State.undoStack.pop();
  State.highlightQ = State.questions.length ? State.questions[State.questions.length - 1].number : null;
  updateQuestionList();
  renderOverlays();
  toast("Geri alındı", `Soru ${last.number} kaldırıldı.`, 1400);
}
