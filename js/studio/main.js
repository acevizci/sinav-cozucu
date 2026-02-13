import { bindGlobals } from "./globals.js";
import { bindFileInput, bindKeyboard } from "./bindings.js";
import { bindDraw } from "./draw.js";
import { bindCtrlWheelZoom } from "./wheel-zoom.js";
import { bindUxGlobals, bindShortcutsModal, bindDropzone } from "./ux.js";
import { render } from "./render.js";
import { updateQuestionList } from "./sidebar.js";
import { renderOverlays } from "./overlays.js";

bindGlobals();
bindUxGlobals();
bindShortcutsModal();
bindDropzone();
bindFileInput();
bindKeyboard();
bindDraw();
bindCtrlWheelZoom();

// initial UI
updateQuestionList();
renderOverlays();
await render();
