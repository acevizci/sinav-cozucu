import { el, formatTime } from "./utils.js";

export function createTimer({ onTick, onDone }){
  let intId = null;
  let doneFired = false;

  function setTextSafe(id, txt){
    const node = typeof id === "string" ? document.getElementById(id) : id;
    if (node) node.textContent = txt;
  }

  function resetTimerColor(){
    const t = el("timer");
    if (t) t.style.color = "";
  }

  function stop(){
    if (intId){
      clearInterval(intId);
      intId = null;
    }
  }

  function start(getTimeLeft, setTimeLeft){
    stop();
    doneFired = false;
    resetTimerColor();

    const initial = Math.max(0, getTimeLeft() | 0);
    const t0 = formatTime(initial);

    setTextSafe("timer", t0);
    setTextSafe("focusTimer", t0);
    setTextSafe("hudT", t0);

    intId = setInterval(() => {
      let next = Math.max(0, (getTimeLeft() | 0) - 1);
      setTimeLeft(next);

      const t1 = formatTime(next);
      setTextSafe("timer", t1);
      setTextSafe("focusTimer", t1);
      setTextSafe("hudT", t1);
	  setTextSafe("examTimerInline", `⏱ ${t1}`);

     const ids = ["timer", "focusTimer", "hudT", "examTimerInline"];

ids.forEach(id => {
  const t = el(id);
  if (!t) return;

  // renkler
  if (next <= 10) t.style.color = "#fecaca";
  else if (next <= 30) t.style.color = "#fde68a";
  else t.style.color = "";

  // 🔥 son 5 saniye pulse
  if (next <= 5 && next > 0) {
    t.classList.add("timer-pulse");
  } else {
    t.classList.remove("timer-pulse");
  }
});


      onTick?.(next);

      if (next <= 0 && !doneFired){
        doneFired = true;
        stop();
        onDone?.();
      }
    }, 1000);
  }

  return { start, stop };
}
