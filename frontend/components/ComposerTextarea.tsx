"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type SyntheticEvent,
} from "react";
import Avatar from "@/components/Avatar";
import { UserPublic, searchMentionUsers } from "@/lib/api";

const MENTION_QUERY_RE = /(?:^|[\s\n])@([A-Za-z0-9_.+@-]*)$/;
const DEBOUNCE_MS = 200;

export default function ComposerTextarea({
  id,
  value,
  onChange,
  placeholder,
  "aria-label": ariaLabel,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  "aria-label"?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mentionStart, setMentionStart] = useState(0);
  const [results, setResults] = useState<UserPublic[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const detectMention = useCallback((text: string, cursor: number) => {
    const before = text.slice(0, cursor);
    const match = before.match(MENTION_QUERY_RE);
    if (!match) {
      setOpen(false);
      return;
    }
    const q = match[1];
    setMentionStart(before.length - q.length - 1);
    setQuery(q);
    setOpen(true);
    setActiveIndex(0);
  }, []);

  const insertMention = useCallback(
    (username: string) => {
      const el = textareaRef.current;
      if (!el) return;
      const cursor = el.selectionStart ?? value.length;
      const before = value.slice(0, mentionStart);
      const after = value.slice(cursor);
      const next = `${before}@${username} ${after}`;
      onChange(next);
      setOpen(false);
      const pos = mentionStart + username.length + 2;
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(pos, pos);
      });
    },
    [value, mentionStart, onChange],
  );

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query) {
      abortRef.current?.abort();
      setResults([]);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      searchMentionUsers(query, controller.signal)
        .then((page) => {
          if (!controller.signal.aborted) setResults(page.results);
        })
        .catch(() => {
          if (!controller.signal.aborted) setResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, query]);

  function onInputChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    onChange(next);
    detectMention(next, e.target.selectionStart ?? next.length);
  }

  function onCaretMove(e: SyntheticEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    detectMention(el.value, el.selectionStart ?? 0);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) return;
    if (e.key === "ArrowDown" && results.length > 0) {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
      return;
    }
    if (e.key === "ArrowUp" && results.length > 0) {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
      return;
    }
    if ((e.key === "Enter" || e.key === "Tab") && results.length > 0) {
      e.preventDefault();
      insertMention(results[activeIndex].username);
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="composer-textarea-wrap">
      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={onInputChange}
        onSelect={onCaretMove}
        onClick={onCaretMove}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={open ? listId : undefined}
      />
      {open && (
        <ul id={listId} className="mention-suggest" role="listbox">
          {!query && <li className="mention-suggest__status">Type a username…</li>}
          {query && loading && results.length === 0 && (
            <li className="mention-suggest__status">Searching…</li>
          )}
          {query && !loading && results.length === 0 && (
            <li className="mention-suggest__status">No users found</li>
          )}
          {results.map((user, i) => (
            <li key={user.id} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                className={`mention-suggest__item${
                  i === activeIndex ? " mention-suggest__item--active" : ""
                }`}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(user.username);
                }}
              >
                <span className="mention-suggest__avatar">
                  <Avatar username={user.username} src={user.avatar} />
                </span>
                <span className="mention-suggest__identity">
                  <span className="mention-suggest__name">{user.username}</span>
                  <span className="mention-suggest__handle">@{user.username}</span>
                  {user.bio && (
                    <span className="mention-suggest__bio">{user.bio}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
