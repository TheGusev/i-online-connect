/**
 * Зимнее оформление названия: шапка на правом углу буквы «Я».
 * Не меняет текст, размер шрифта или высоту навигационной панели.
 */
export function WinterWordmark({ text }: { text: string }) {
  if (!/^[Яя]/u.test(text)) return <span>{text}</span>;

  return (
    <span
      role="img"
      aria-label={text}
      className="inline-block whitespace-pre"
    >
      <span aria-hidden="true">
        <style>{`
          @keyframes ya-winter-local-snow {
            0% {
              transform: translate(-0.10mm, -0.58mm);
              opacity: 0;
            }
            20% {
              opacity: 0.9;
            }
            55% {
              transform: translate(0.18mm, 0mm);
              opacity: 0.75;
            }
            100% {
              transform: translate(-0.10mm, 0.58mm);
              opacity: 0;
            }
          }

          .ya-winter-snow-dot {
            position: absolute;
            display: block;
            width: 0.09em;
            height: 0.09em;
            border-radius: 50%;
            background: #f5fbff;
            box-shadow: 0 0 0.09em rgba(216, 237, 247, 0.65);
            opacity: 0;
            animation: ya-winter-local-snow 2.8s linear infinite;
          }

          @media (prefers-reduced-motion: reduce) {
            .ya-winter-snow-dot {
              animation: none;
              opacity: 0.6;
            }
          }
        `}</style>
        <span className="relative inline-block">
          {text.slice(0, 1)}
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 100 80"
            className="pointer-events-none absolute -right-[0.62em] -top-[0.36em] h-[1.12em] w-[1.4em] overflow-visible"
            style={{
              // Левый край отворота выше исходного на 0.5 CSS-мм; правая опора сохранена.
              transform: "translate(-0.0997457312em, calc(0.5mm + 0.0814638564em)) rotate(20deg) scale(0.85) skewY(atan2(0.5mm, 0.5591171094em))",
              transformOrigin: "65% 75%",
            }}
          >
            {/* Небольшие снежинки рядом с шапкой. */}
            <g
              fill="none"
              stroke="#d8edf7"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M12 12v8m-4-4h8m-7-3 6 6m0-6-6 6" />
              <path d="M78 8v6m-3-3h6" />
            </g>

            {/* Мягкая красная шапка, кончик загнут вправо. */}
            <path
              d="M22 49c2-14 5-30 17-36 13-7 28-1 35 9 5 7 7 14 15 19-8 3-17 0-23-5-3-3-6-7-9-7 0 8 2 16 5 24Z"
              fill="#c92e3e"
              stroke="#9f2434"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="M26 45c2-12 6-25 15-29 7-3 14-3 20 1-13-1-20 11-22 30Z"
              fill="#ef5860"
              opacity=".85"
            />
            <path
              d="M57 29c-2 5-1 13 2 22l-10-1c0-9 2-16 8-21Z"
              fill="#aa2435"
              opacity=".65"
            />

            {/* Золотая петелька и колокольчик на кончике. */}
            <path
              d="m86 40 2 8"
              fill="none"
              stroke="#bd8530"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M82 57c3-3 2-7 5-9 3-2 7 0 8 3 1 3 0 6 3 9-5 3-11 2-16-3Z"
              fill="#edbd55"
              stroke="#b27a26"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
            <path
              d="m84 57 12 3"
              stroke="#fff0b5"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle cx="89" cy="63" r="2.2" fill="#b27a26" />
            <path
              d="m88 51-1 3"
              stroke="#fff2bc"
              strokeWidth="2"
              strokeLinecap="round"
            />

            {/* Белый меховой отворот с мягким нижним краем. */}
            <path
              d="M19 46c4-3 8-2 12-1 6-2 11-1 16 1 6-1 12 1 16 4 4 2 5 7 2 10-3 3-8 3-12 1-5 1-10 0-15-2-6 1-11 0-16-2-4 0-8-3-7-6 0-2 2-4 4-5Z"
              fill="#fffaf2"
              stroke="#d5dfe5"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            <path
              d="M21 54c6 2 10 3 16 2 7 3 12 3 17 2 3 2 6 2 9 0"
              fill="none"
              stroke="#dbe7ed"
              strokeWidth="2"
              strokeLinecap="round"
            />

            {/* Немного снега на ткани. */}
            <g fill="#fffaf2">
              <ellipse cx="35" cy="23" rx="3.5" ry="1.5" transform="rotate(-35 35 23)" />
              <circle cx="58" cy="19" r="1.5" />
              <circle cx="70" cy="28" r="1.1" />
            </g>
          </svg>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-[0.62em] -top-[0.36em] h-[1.12em] w-[1.4em] overflow-visible"
            style={{
              transform: "translateY(0.5mm) rotate(20deg)",
              transformOrigin: "40% 66%",
            }}
          >
            {[
              { left: '8%', top: '28%', delay: '-0.4s', duration: '2.8s' },
              { left: '34%', top: '5%', delay: '-1.7s', duration: '3.2s' },
              { left: '69%', top: '15%', delay: '-0.9s', duration: '2.6s' },
              { left: '94%', top: '43%', delay: '-2.2s', duration: '3.4s' },
              { left: '76%', top: '76%', delay: '-1.2s', duration: '2.9s' },
              { left: '7%', top: '73%', delay: '-2.6s', duration: '3.1s' },
            ].map((flake, index) => (
              <span
                key={index}
                className="ya-winter-snow-dot"
                style={{
                  left: flake.left,
                  top: flake.top,
                  animationDelay: flake.delay,
                  animationDuration: flake.duration,
                }}
              />
            ))}
          </span>
        </span>
        {text.slice(1)}
      </span>
    </span>
  );
}
