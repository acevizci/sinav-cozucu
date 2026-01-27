import { el, formatTime } from "./utils.js";

export function createTimer({ onTick, onDone }){
  let intId = null;

  function stop(){
    if (intId){
      clearInterval(intId);
      intId = null;
    }
  }

  function start(getTimeLeft, setTimeLeft){
    stop();
    const t0 = formatTime(getTimeLeft());
    el("timer").textContent = t0;
    const ft = document.getElementById("focusTimer");
    if (ft) ft.textContent = t0;
    const ht = document.getElementById("hudT");
    if (ht) ht.textContent = t0;

    intId = setInterval(() => {
      const next = getTimeLeft() - 1;
      setTimeLeft(next);

      const t1 = formatTime(next);
      el("timer").textContent = t1;
      const ft = document.getElementById("focusTimer");
      if (ft) ft.textContent = t1;
      const ht = document.getElementById("hudT");
      if (ht) ht.textContent = t1;

      if (next <= 30) el("timer").style.color = "#fde68a";
      if (next <= 10) el("timer").style.color = "#fecaca";

      onTick?.(next);

      if (next <= 0){
        stop();
        onDone?.();
      }
    }, 1000);
  }

  return { start, stop };
}