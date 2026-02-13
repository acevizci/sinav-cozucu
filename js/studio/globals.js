import { changePage, zoomBy, resetZoom } from "./controls.js";
import { exportToApp } from "./export.js";
import { goToQuestion, removeQuestion } from "./sidebar.js";

export function bindGlobals(){
  window.changePage = changePage;
  window.zoomBy = zoomBy;
  window.resetZoom = resetZoom;
  window.exportToApp = exportToApp;
  window.goToQuestion = goToQuestion;
  window.removeQuestion = removeQuestion;
}
