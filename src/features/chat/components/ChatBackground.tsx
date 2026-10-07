import { useEffect } from "react";

/** Звёзды, которые изредка разгораются розовым: позиция, длительность цикла и сдвиг. */
const GLINTS: Array<[number, number, number, number]> = [
  [12, 18, 17, -2], [78, 9, 23, -11], [41, 37, 19, -6], [88, 52, 29, -19],
  [8, 66, 21, -14], [56, 74, 26, -3], [27, 88, 31, -22], [69, 31, 24, -16],
];

/** Тихое звёздное небо за сообщениями; не прокручивается вместе с ними. */
export function ChatBackground() {
  useEffect(() => {
    const sync = () => document.documentElement.toggleAttribute("data-tab-hidden", document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  return (
    <div aria-hidden="true" className="chat-sky pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="chat-sky__nebula" />
      <div className="chat-sky__drift">
        <div className="chat-sky__stars chat-sky__stars--a" />
        <div className="chat-sky__stars chat-sky__stars--b" />
        <div className="chat-sky__stars chat-sky__stars--c" />
      </div>
      {GLINTS.map(([x, y, period, delay], i) => (
        <span
          key={i}
          className="chat-sky__glint"
          style={{ left: `${x}%`, top: `${y}%`, animationDuration: `${period}s`, animationDelay: `${delay}s` }}
        />
      ))}
    </div>
  );
}
