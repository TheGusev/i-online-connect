/** Тихое звёздное небо за сообщениями; не прокручивается вместе с ними. */
export function ChatBackground() {
  return (
    <div aria-hidden="true" className="chat-sky pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="chat-sky__nebula" />
      <div className="chat-sky__drift">
        <div className="chat-sky__stars chat-sky__stars--a" />
        <div className="chat-sky__stars chat-sky__stars--b" />
        <div className="chat-sky__stars chat-sky__stars--c" />
      </div>
    </div>
  );
}
