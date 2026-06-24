import { ReactNode } from "react";
import Link from "next/link";
import { Fragment } from "react";

// Django username chars; hyphen escaped / at end — avoid [.+-] range bugs in regex.
const MENTION_RE =
  /(@[A-Za-z0-9](?:[A-Za-z0-9_.+@-]{0,148}[A-Za-z0-9])?)/g;

export function bioCharCount(text: string): number {
  return text.replace(/\r\n?/g, "\n").length;
}

export default function BioText({
  text,
  className = "profile-bio",
  suffix,
}: {
  text: string;
  className?: string;
  suffix?: ReactNode;
}) {
  const parts = text.split(MENTION_RE);

  return (
    <p className={className}>
      {parts.map((part, i) => {
        if (part.startsWith("@")) {
          const user = part.slice(1);
          return (
            <Link
              key={i}
              href={`/u/${user}`}
              className="mindset-mention"
              data-username={user}
            >
              @{user}
            </Link>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
      {suffix}
    </p>
  );
}
