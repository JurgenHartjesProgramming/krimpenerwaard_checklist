const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)"'\]])/g;

/** Plain text with URLs turned into links; newlines preserved. */
export function Linkify({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="link">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </span>
  );
}
