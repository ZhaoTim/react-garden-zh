import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { SearchHit } from "~/content/types";
import { cn } from "~/lib/cn";
import { findRanges } from "~/lib/highlight";
import { useDebounced } from "~/lib/hooks";
import { pop, spring } from "~/lib/motion";
import { palette, usePaletteOpen } from "~/lib/palette";
import { PrivateBadge } from "../ui/Badge";
import { Kbd } from "../ui/Badge";
import { CornerEnter, FileText, GraphIcon, Hash, Layers, SearchIcon } from "../ui/icons";
import { Overlay } from "../ui/Overlay";
import { Highlight } from "./Highlight";

export type SearchFn = (q: string) => Promise<SearchHit[]>;

type Item =
  | { kind: "hit"; hit: SearchHit }
  | {
      kind: "link";
      id: string;
      label: string;
      hint: string;
      icon: React.ReactNode;
      go: () => void;
    };

function isEditable(el: EventTarget | null) {
  return (
    el instanceof HTMLElement &&
    (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
  );
}

/** Global shortcuts: ⌘K / Ctrl+K toggles, "/" opens (unless typing somewhere). */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        palette.toggle();
      } else if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditable(e.target)) {
        e.preventDefault();
        palette.open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/**
 * ⌘K search. Results come from `search` (the searchPosts server fn), debounced; stale
 * responses are dropped. Combobox semantics: focus stays in the input, arrows move the
 * active option (aria-activedescendant), Enter opens it.
 */
export function CommandPalette({ search }: { search: SearchFn }) {
  useShortcuts();
  const open = usePaletteOpen();
  const close = useCallback(() => palette.close(), []);
  return (
    <Overlay
      open={open}
      onClose={close}
      label="搜索笔记"
      className="flex items-start justify-center px-3 pt-[min(14vh,7rem)] sm:px-6"
    >
      <Panel search={search} onClose={close} />
    </Overlay>
  );
}

function Panel({ search, onClose }: { search: SearchFn; onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 110);
  const [hits, setHits] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  // the query `hits` belong to; until it matches `dq` the results are still pending
  const [resultsFor, setResultsFor] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const req = useRef(0);

  useEffect(() => {
    if (!dq) {
      setHits([]);
      setLoading(false);
      return;
    }
    const id = ++req.current;
    setLoading(true);
    search(dq)
      .then((res) => {
        if (id !== req.current) return;
        setHits(res.map((hit) => ({ kind: "hit", hit })));
        setResultsFor(dq);
        setActive(0);
      })
      .catch(() => {
        if (id !== req.current) return;
        setHits([]);
        setResultsFor(dq);
      })
      .finally(() => id === req.current && setLoading(false));
  }, [dq, search]);

  const go = (fn: () => void) => {
    onClose();
    fn();
  };

  const quick: Item[] = [
    {
      kind: "link",
      id: "posts",
      label: "All posts",
      hint: "Browse everything",
      icon: <FileText size={16} />,
      go: () => go(() => void navigate({ to: "/posts" })),
    },
    {
      kind: "link",
      id: "tags",
      label: "Tags",
      hint: "Topics and counts",
      icon: <Hash size={16} />,
      go: () => go(() => void navigate({ to: "/tags" })),
    },
    {
      kind: "link",
      id: "graph",
      label: "Graph view",
      hint: "How notes connect",
      icon: <GraphIcon size={16} />,
      go: () => go(() => void navigate({ to: "/graph" })),
    },
    {
      kind: "link",
      id: "home",
      label: "Home",
      hint: "Series and recent notes",
      icon: <Layers size={16} />,
      go: () => go(() => void navigate({ to: "/" })),
    },
  ];
  const items = dq ? hits : quick;
  const activeIndex = Math.min(active, Math.max(0, items.length - 1));

  const openItem = (item: Item | undefined) => {
    if (!item) return;
    if (item.kind === "link") item.go();
    else go(() => void navigate({ to: "/posts/$", params: { _splat: item.hit.slug } }));
  };

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (items.length ? (i + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) {
        go(() => void navigate({ to: "/search", search: { q: q.trim() } }));
      } else openItem(items[activeIndex]);
    } else if (e.key === "Home" && e.altKey) {
      setActive(0);
    }
  };

  const optionId = (i: number) => `${listId}-opt-${i}`;
  const settled = !!dq && !loading && resultsFor === dq;
  const hasList = items.length > 0;
  const status = !dq
    ? ""
    : !settled
      ? "Searching…"
      : hits.length === 0
        ? "No results"
        : `${hits.length} ${hits.length === 1 ? "result" : "results"}`;

  return (
    <motion.div
      variants={pop}
      initial="hidden"
      animate="show"
      exit="exit"
      className="pointer-events-auto flex max-h-[min(36rem,calc(100dvh-8rem))] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-lg)]"
    >
      {/* the row's accent underline (has-[input:focus]) is the input's focus indicator */}
      <div className="flex items-center gap-3 border-b border-line px-4 transition-shadow has-[input:focus]:shadow-[inset_0_-2px_0_var(--ring)]">
        <SearchIcon size={18} className="shrink-0 text-subtle" />
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="搜索笔记与专栏…"
          aria-label="搜索笔记"
          role="combobox"
          aria-expanded={hasList}
          aria-controls={hasList ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={items.length ? optionId(activeIndex) : undefined}
          spellCheck={false}
          autoComplete="off"
          enterKeyHint="go"
          className="h-14 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-subtle"
        />
        <AnimatePresence>
          {loading && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, rotate: 360 }}
              exit={{ opacity: 0 }}
              transition={{
                rotate: { duration: 0.8, repeat: Infinity, ease: "linear" },
                opacity: { duration: 0.15 },
              }}
              className="size-4 shrink-0 rounded-full border-2 border-line-strong border-t-accent"
              aria-hidden="true"
            />
          )}
        </AnimatePresence>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded-md"
          aria-label="Close search"
        >
          <Kbd>Esc</Kbd>
        </button>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto overscroll-contain p-2">
        {!dq && <p className="px-3 pt-2 pb-1.5 text-xs font-medium text-subtle">快捷直达</p>}
        <p role="status" aria-live="polite" className="sr-only">
          {status}
        </p>
        {settled && hits.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-4 py-10 text-center text-sm text-muted"
          >
            未找到与 <span className="font-medium text-fg">“{dq}”</span> 相关的笔记。
            <br />
            <span className="text-subtle">请尝试更换或减少搜索关键词。</span>
          </motion.div>
        )}
        {hasList && (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Results"
            className="relative isolate"
          >
            <AnimatePresence initial={false} mode="popLayout">
              {items.map((item, i) => {
                const isActive = i === activeIndex;
                const key = item.kind === "hit" ? item.hit.slug : item.id;
                return (
                  <motion.li
                    key={key}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: { delay: Math.min(i, 8) * 0.02 } }}
                    exit={{ opacity: 0, transition: { duration: 0.1 } }}
                    id={optionId(i)}
                    data-index={i}
                    role="option"
                    aria-selected={isActive}
                    onPointerMove={() => !isActive && setActive(i)}
                    onClick={() => openItem(item)}
                    className="relative cursor-pointer rounded-xl"
                  >
                    {isActive && (
                      <motion.span
                        layoutId="palette-active"
                        transition={spring.layout}
                        className="absolute inset-0 z-0 rounded-xl bg-sunken"
                        aria-hidden="true"
                      />
                    )}
                    {item.kind === "hit" ? (
                      <HitRow hit={item.hit} q={dq} active={isActive} />
                    ) : (
                      <LinkRow item={item} active={isActive} />
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <div
        className={cn(
          "items-center gap-4 border-t border-line px-4 py-1 text-xs text-subtle sm:py-2.5",
          dq ? "flex" : "hidden sm:flex",
        )}
      >
        <span className="hidden items-center gap-1.5 sm:flex">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> navigate
        </span>
        <span className="hidden items-center gap-1.5 sm:flex">
          <Kbd>↵</Kbd> open
        </span>
        {dq && (
          <button
            type="button"
            onClick={() => go(() => void navigate({ to: "/search", search: { q: dq } }))}
            className="-mr-2 ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 transition-colors hover:text-fg sm:-my-1 sm:min-h-7"
          >
            All results <Kbd className="hidden sm:inline-flex">⌘↵</Kbd>
          </button>
        )}
      </div>
    </motion.div>
  );
}

function HitRow({ hit, q, active }: { hit: SearchHit; q: string; active: boolean }) {
  return (
    <div className="relative z-10 flex gap-3 px-3 py-2.5">
      <FileText
        size={16}
        className={cn("mt-0.5 shrink-0 transition-colors", active ? "text-accent" : "text-subtle")}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Highlight
            text={hit.title}
            ranges={findRanges(hit.title, q)}
            className="truncate text-sm font-medium"
          />
          {hit.visibility === "private" && <PrivateBadge compact />}
        </div>
        {hit.excerpt && (
          <Highlight
            text={hit.excerpt}
            ranges={hit.ranges}
            className="mt-0.5 line-clamp-2 text-[0.8125rem] leading-relaxed text-muted"
          />
        )}
      </div>
      <CornerEnter
        size={14}
        className={cn(
          "mt-1 shrink-0 text-subtle transition-opacity",
          active ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

function LinkRow({ item, active }: { item: Extract<Item, { kind: "link" }>; active: boolean }) {
  return (
    <div className="relative z-10 flex items-center gap-3 px-3 py-2.5">
      <span
        className={cn(
          "grid size-8 place-items-center rounded-lg border border-line bg-surface transition-colors",
          active ? "text-accent" : "text-muted",
        )}
      >
        {item.icon}
      </span>
      <span className="flex-1">
        <span className="block text-sm font-medium">{item.label}</span>
        <span className="block text-xs text-subtle">{item.hint}</span>
      </span>
      <CornerEnter
        size={14}
        className={cn(
          "shrink-0 text-subtle transition-opacity",
          active ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
