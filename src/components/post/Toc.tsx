import {
  AnimatePresence,
  motion,
  useDragControls,
  useMotionValueEvent,
  useScroll,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Heading } from "~/content/types";
import { cn } from "~/lib/cn";
import { useActiveHeading, useScrollLock } from "~/lib/hooks";
import { fade, sheet, spring } from "~/lib/motion";
import { ChevronDown, Close, ListIcon } from "../ui/icons";

function scrollToHeading(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  history.replaceState(history.state, "", `#${id}`);
  // move focus to the section so the next Tab continues from there, not from the TOC
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keep Tab / Shift+Tab cycling inside `root` (the modal sheet). */
function trapTab(e: React.KeyboardEvent, root: HTMLElement | null) {
  if (e.key !== "Tab" || !root) return;
  const nodes = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
  if (!nodes.length) return;
  const first = nodes[0]!;
  const last = nodes[nodes.length - 1]!;
  const current = document.activeElement;
  if (e.shiftKey && (current === first || !root.contains(current))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (current === last || !root.contains(current))) {
    e.preventDefault();
    first.focus();
  }
}

function TocList({
  headings,
  active,
  layoutId,
  onNavigate,
}: {
  headings: Heading[];
  active: string | null;
  layoutId: string;
  onNavigate?: () => void;
}) {
  return (
    <ul className="relative space-y-px border-l border-line">
      {headings.map((h) => {
        const isActive = h.id === active;
        return (
          <li key={h.id} className="relative">
            {isActive && (
              <motion.span
                layoutId={layoutId}
                transition={spring.layout}
                className="absolute inset-y-1 -left-px w-[2px] rounded-full bg-accent"
                aria-hidden="true"
              />
            )}
            <a
              href={`#${h.id}`}
              aria-current={isActive ? "location" : undefined}
              onClick={(e) => {
                e.preventDefault();
                if (onNavigate) {
                  // let the sheet close and the scroll lock release before scrolling
                  onNavigate();
                  setTimeout(() => scrollToHeading(h.id), 80);
                } else scrollToHeading(h.id);
              }}
              className={cn(
                "block rounded-r-md py-1.5 pr-2 text-[0.8125rem] leading-snug transition-colors",
                h.depth === 2 ? "pl-3.5" : "pl-6.5",
                isActive ? "font-medium text-fg" : "text-muted hover:text-fg",
              )}
            >
              {h.text}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

const visible = (headings: Heading[]) => headings.filter((h) => h.depth <= 3);

/** Desktop: sticky "On this page" with a sliding active indicator. */
export function Toc({ headings, className }: { headings: Heading[]; className?: string }) {
  const items = visible(headings);
  const active = useActiveHeading(items.map((h) => h.id));
  if (items.length < 2) return null;
  return (
    <nav aria-label="On this page" className={cn("text-sm", className)}>
      <p className="mb-3 text-xs font-semibold tracking-[0.08em] text-subtle uppercase">本页目录</p>
      <div className="scrollbar-thin max-h-[calc(100dvh-var(--header-h)-8rem)] overflow-y-auto overscroll-contain pr-1">
        <TocList headings={items} active={active} layoutId="toc-active" />
      </div>
    </nav>
  );
}

/**
 * Mobile: a floating pill showing the section you are in (with a progress ring); tap to
 * open a bottom sheet with the full outline. Drag the sheet down to dismiss.
 */
export function MobileToc({ headings }: { headings: Heading[] }) {
  const items = visible(headings);
  const active = useActiveHeading(items.map((h) => h.id));
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState(false);
  const { scrollY, scrollYProgress } = useScroll();
  const drag = useDragControls();
  useMotionValueEvent(scrollY, "change", (y) => setShow(y > 400));
  const openerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // false when the sheet closed because a link was chosen: focus then goes to the heading
  const returnFocus = useRef(true);
  const wasOpen = useRef(false);
  useScrollLock(open);
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      returnFocus.current = true;
      closeRef.current?.focus();
      const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      // the opener re-mounts on the same commit that closes the sheet
      if (returnFocus.current) openerRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  if (items.length < 2) return null;
  const current = items.find((h) => h.id === active) ?? items[0]!;

  return (
    <div className="no-print lg:hidden">
      <AnimatePresence>
        {show && !open && (
          <motion.button
            ref={openerRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            whileTap={{ scale: 0.97 }}
            transition={spring.snappy}
            className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-30 flex h-11 max-w-[calc(100vw-6rem)] items-center gap-2.5 rounded-full border border-line bg-surface/90 pr-4 pl-1.5 text-sm shadow-[var(--shadow-md)] backdrop-blur"
          >
            <svg
              viewBox="0 0 36 36"
              className="size-8 shrink-0 -rotate-90 text-accent"
              aria-hidden="true"
            >
              <circle cx="18" cy="18" r="14" fill="none" stroke="var(--line)" strokeWidth="2.5" />
              <motion.circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                style={{ pathLength: scrollYProgress }}
              />
            </svg>
            <span className="sr-only">Table of contents. Current section:</span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={current.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="truncate font-medium"
              >
                {current.text}
              </motion.span>
            </AnimatePresence>
            <ChevronDown size={14} className="shrink-0 rotate-180 text-subtle" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="scrim"
              variants={fade}
              initial="hidden"
              animate="show"
              exit="exit"
              className="fixed inset-0 z-40 bg-scrim"
              onClick={() => setOpen(false)}
            />
            <motion.div
              key="sheet"
              ref={sheetRef}
              onKeyDown={(e) => trapTab(e, sheetRef.current)}
              role="dialog"
              aria-modal="true"
              aria-label="On this page"
              variants={sheet}
              initial="hidden"
              animate="show"
              exit="exit"
              drag="y"
              dragListener={false}
              dragControls={drag}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 90 || info.velocity.y > 500) setOpen(false);
              }}
              className="fixed inset-x-0 bottom-0 z-50 flex max-h-[78dvh] flex-col rounded-t-3xl border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-lg)]"
            >
              <div
                onPointerDown={(e) => drag.start(e)}
                className="flex shrink-0 cursor-grab touch-none flex-col items-center pt-2.5 pb-1 active:cursor-grabbing"
              >
                <span className="h-1.5 w-10 rounded-full bg-line-strong" aria-hidden="true" />
              </div>
              <div
                onPointerDown={(e) => drag.start(e)}
                className="flex shrink-0 touch-none items-center justify-between px-5 pt-1 pb-3"
              >
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <ListIcon size={16} className="text-subtle" /> 本页目录
                </p>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="inline-flex size-10 items-center justify-center rounded-full text-muted hover:bg-sunken"
                >
                  <Close size={18} />
                </button>
              </div>
              <div className="overflow-y-auto overscroll-contain px-5 pb-6">
                <TocList
                  headings={items}
                  active={active}
                  layoutId="toc-active-mobile"
                  onNavigate={() => {
                    returnFocus.current = false;
                    setOpen(false);
                  }}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
