import { Link, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { site } from "~/site.config";
import { cn } from "~/lib/cn";
import { plural } from "~/lib/format";
import { fade, spring } from "~/lib/motion";
import { palette, usePaletteOpen } from "~/lib/palette";
import { LessonsGrid, LessonsGridSkeleton } from "../series/LessonsGrid";
import { prefetchLessons, useLessons } from "../series/useLessons";
import { ArrowRight, ChevronDown, GraphIcon, Reset, SearchIcon } from "../ui/icons";
import { Kbd } from "../ui/Badge";
import { GithubButton } from "./GithubButton";
import { ThemeToggle } from "./ThemeToggle";

const nav = [
  { to: "/posts", label: "文章" },
  { to: "/tags", label: "标签" },
  { to: "/graph", label: "知识图谱" },
] as const;

/** The site mark: three linked nodes, the accent one "active". */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={cn("size-7", className)} aria-hidden="true" fill="none">
      <rect x="0.75" y="0.75" width="26.5" height="26.5" rx="8" className="fill-fg" />
      <path
        d="M9 18.5 14 9l5 9.5"
        stroke="var(--bg)"
        strokeOpacity=".55"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="14" cy="9" r="2.6" fill="var(--accent)" />
      <circle cx="9" cy="18.5" r="2.2" fill="var(--bg)" />
      <circle cx="19" cy="18.5" r="2.2" fill="var(--bg)" />
    </svg>
  );
}

/**
 * Sticky header. Condenses (hairline + blur) once the page scrolls; on small screens it
 * slides away while scrolling down and returns on the first scroll up.
 */
export function SiteHeader() {
  const { scrollY } = useScroll();
  const [condensed, setCondensed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const paletteOpen = usePaletteOpen();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setCondensed(y > 8);
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    if (!mobile || y < 120) return setHidden(false);
    if (Math.abs(y - prev) < 4) return;
    setHidden(y > prev);
  });

  return (
    <motion.header
      className="sticky top-0 z-40"
      initial={false}
      animate={{ y: hidden && !paletteOpen ? "-100%" : "0%" }}
      transition={spring.panel}
      onFocusCapture={() => setHidden(false)}
    >
      <div
        className={cn(
          "border-b transition-[background-color,border-color,backdrop-filter] duration-300",
          condensed
            ? "border-line bg-bg/80 backdrop-blur-xl backdrop-saturate-150 supports-[not(backdrop-filter:blur(1px))]:bg-bg"
            : "border-transparent bg-bg/0",
        )}
      >
        <div className="container-page flex h-[var(--header-h)] items-center gap-2">
          {/* Explicit tabIndex={0} on header links: Safari (and some Chromium setups) leave plain
              links out of the Tab order, which would skip the nav and the Lessons panel. */}
          <a
            tabIndex={0}
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-fg focus:px-4 focus:py-2 focus:text-sm focus:text-bg"
          >
            跳转到主要内容
          </a>
          <Link
            tabIndex={0}
            to="/"
            className="group -ml-1 flex min-w-0 items-center gap-2.5 rounded-lg p-1"
            aria-label={`${site.title}, home`}
          >
            {/* tabIndex -1: whileTap would otherwise make Motion add a tab stop inside the link */}
            <motion.span
              tabIndex={-1}
              whileHover={{ rotate: -8 }}
              whileTap={{ scale: 0.92 }}
              transition={spring.snappy}
              className="inline-flex"
            >
              <Logo />
            </motion.span>
            <span className="truncate font-serif text-[1.1875rem] font-medium tracking-tight">
              {site.title}
            </span>
          </Link>

          <nav aria-label="Main" className="ml-auto hidden md:block">
            <ul className="flex items-center gap-0.5">
              <LessonsMenu paletteOpen={paletteOpen} />
              {nav.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    pathname={pathname}
                    className="relative inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium text-muted transition-colors hover:text-fg data-[section]:text-fg"
                  >
                    {(inSection) => (
                      <>
                        {inSection && (
                          <motion.span
                            layoutId="nav-active"
                            transition={spring.layout}
                            className="absolute inset-0 rounded-full bg-sunken"
                          />
                        )}
                        <span className="relative">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-1 md:ml-2">
            <button
              type="button"
              onClick={() => palette.open()}
              aria-label="Search notes"
              aria-keyshortcuts="Meta+K Control+K /"
              className="group inline-flex h-10 items-center gap-2 rounded-full text-muted transition-colors hover:text-fg max-sm:w-10 max-sm:justify-center max-sm:hover:bg-sunken sm:h-9 sm:border sm:border-line sm:bg-surface sm:pr-1.5 sm:pl-3 sm:shadow-[var(--shadow-sm)] sm:hover:border-line-strong"
            >
              <SearchIcon size={16} className="sm:size-[15px]" />
              <span className="hidden text-sm sm:inline">Search</span>
              <Kbd className="ml-3 hidden sm:inline-flex">⌘K</Kbd>
            </button>
            <Link
              tabIndex={0}
              to="/graph"
              aria-label="Graph view"
              className="inline-flex size-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-sunken hover:text-fg md:hidden"
            >
              <GraphIcon size={18} />
            </Link>
            <GithubButton />
            <ThemeToggle />
          </div>
        </div>
        <MobileNav />
      </div>
    </motion.header>
  );
}

/** Second row on phones: the sections as a calm segmented strip (no dropdown on mobile). */
function MobileNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav aria-label="Sections" className="container-page -mt-1 pb-2 md:hidden">
      <ul className="flex gap-1">
        {[{ to: "/lessons", label: "Lessons" } as const, ...nav]
          .filter((n) => n.to !== "/graph")
          .map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                pathname={pathname}
                className="relative inline-flex h-8 items-center rounded-full px-3 text-sm font-medium text-muted data-[section]:text-fg"
              >
                {(inSection) => (
                  <>
                    {inSection && (
                      <motion.span
                        layoutId="mnav-active"
                        transition={spring.layout}
                        className="absolute inset-0 rounded-full bg-sunken"
                      />
                    )}
                    <span className="relative">{item.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
      </ul>
    </nav>
  );
}

type NavTo = (typeof nav)[number]["to"] | "/lessons";

/**
 * A section link. The visual "you are here" state covers the whole section (/posts/… lights
 * Posts), but only the section's own page is aria-current="page"; on a descendant the link says
 * aria-current="true" (current section). `exact` keeps the router from stamping "page" itself.
 */
function NavLink({
  to,
  pathname,
  className,
  children,
}: {
  to: NavTo;
  pathname: string;
  className: string;
  children: (inSection: boolean) => React.ReactNode;
}) {
  const inSection =
    pathname === to ||
    pathname.startsWith(`${to}/`) ||
    (to === "/lessons" && pathname.startsWith("/series/"));
  const exact = pathname === to;
  return (
    <Link
      tabIndex={0}
      to={to}
      activeOptions={{ exact: true, includeSearch: false }}
      aria-current={inSection && !exact ? "true" : undefined}
      data-section={inSection ? "" : undefined}
      className={className}
    >
      {children(inSection)}
    </Link>
  );
}

const PANEL_ID = "lessons-panel";
const panelLinks = (el: HTMLElement | null) => [
  ...(el?.querySelectorAll<HTMLElement>("a[href]") ?? []),
];

/**
 * Desktop "Lessons" disclosure: a button that opens a panel of course tiles under the header.
 * Data is fetched once on the first hover/focus/open (session cache in useLessons), so other
 * pages pay nothing for it. Closes on Escape (focus returns to the button), outside click,
 * focus leaving, route change, or choosing a tile. ArrowDown on the button opens it and moves
 * into the grid; arrow keys then step through the links (ArrowUp from the first returns).
 */
function LessonsMenu({ paletteOpen }: { paletteOpen: boolean }) {
  const [open, setOpen] = useState(false);
  const lessons = useLessons();
  const root = useRef<HTMLLIElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const focusOnReady = useRef(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = pathname === "/lessons" || pathname.startsWith("/series/");

  // Route change (including choosing a tile) or the palette opening closes the panel.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }
  if (open && paletteOpen) setOpen(false);

  useEffect(() => {
    if (!open) return;
    // Escape while focus is elsewhere on the page (focus inside is handled by the <li>).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || root.current?.contains(e.target as Node)) return;
      setOpen(false);
      button.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  // ArrowDown opened the panel: move focus to the first tile once the tiles exist.
  useEffect(() => {
    if (!open || !focusOnReady.current || lessons.status !== "ready") return;
    focusOnReady.current = false;
    const id = requestAnimationFrame(() => panelLinks(panel.current)[0]?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, lessons.status]);

  const onPanelKey = (e: React.KeyboardEvent) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    const links = panelLinks(panel.current);
    const i = links.indexOf(document.activeElement as HTMLElement);
    if (i === -1) return;
    e.preventDefault();
    if (i + step < 0) button.current?.focus();
    else links[Math.min(i + step, links.length - 1)]?.focus();
  };

  const close = () => setOpen(false);
  const folders = lessons.status === "ready" ? lessons.folders : [];

  return (
    <li
      ref={root}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !open) return;
        e.preventDefault();
        setOpen(false);
        button.current?.focus();
      }}
      onBlur={(e) => {
        // relatedTarget is null when the window itself loses focus: keep the panel then.
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) close();
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={PANEL_ID}
        onPointerEnter={prefetchLessons}
        onFocus={prefetchLessons}
        onClick={() => {
          prefetchLessons();
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown") return;
          e.preventDefault();
          prefetchLessons();
          focusOnReady.current = true;
          setOpen(true);
          if (open && lessons.status === "ready") panelLinks(panel.current)[0]?.focus();
        }}
        className={cn(
          "relative inline-flex h-9 items-center gap-1 rounded-full pr-2.5 pl-3.5 text-sm font-medium text-muted transition-colors hover:text-fg",
          (active || open) && "text-fg",
          open && !active && "bg-sunken/70",
        )}
      >
        {active && (
          <motion.span
            layoutId="nav-active"
            transition={spring.layout}
            className="absolute inset-0 rounded-full bg-sunken"
          />
        )}
        <span className="relative">专栏教程</span>
        {active && <span className="sr-only"> (current section)</span>}
        <motion.span
          className="relative inline-flex text-subtle"
          initial={false}
          animate={{ rotate: open ? 180 : 0 }}
          transition={spring.snappy}
        >
          <ChevronDown size={14} />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            id={PANEL_ID}
            ref={panel}
            role="region"
            aria-label="Lessons"
            tabIndex={-1}
            variants={fade}
            initial="hidden"
            animate="show"
            exit="exit"
            onKeyDown={onPanelKey}
            className="pointer-events-none absolute inset-x-0 top-full outline-none"
          >
            <div className="container-page pt-1.5">
              <div className="pointer-events-auto max-h-[calc(100dvh-var(--header-h)-1.5rem)] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-bg/95 p-3 shadow-[var(--shadow-lg)] backdrop-blur-xl backdrop-saturate-150 supports-[not(backdrop-filter:blur(1px))]:bg-bg">
                {lessons.status === "error" ? (
                  <div
                    role="alert"
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-line-strong px-4 py-5 text-sm"
                  >
                    <span className="text-muted">The lessons could not be loaded.</span>
                    <button
                      type="button"
                      onClick={prefetchLessons}
                      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 font-medium text-fg shadow-[var(--shadow-sm)] hover:border-line-strong"
                    >
                      <Reset size={14} /> Try again
                    </button>
                  </div>
                ) : lessons.status !== "ready" ? (
                  <LessonsGridSkeleton compact />
                ) : folders.length === 0 ? (
                  <p className="px-1 py-6 text-center text-sm text-muted">No lessons yet.</p>
                ) : (
                  <LessonsGrid
                    variant="panel"
                    lessons={folders.map((folder) => ({ folder }))}
                    onSelect={close}
                  />
                )}
                <div className="mt-3 flex items-center justify-between gap-4 border-t border-line px-1 pt-3 text-sm">
                  <span className="text-subtle">
                    {lessons.status === "ready" ? plural(folders.length, "course") : "Courses"}
                  </span>
                  <Link
                    tabIndex={0}
                    to="/lessons"
                    onClick={close}
                    className="group inline-flex items-center gap-1.5 rounded-full font-medium text-muted hover:text-fg"
                  >
                    All lessons
                    <ArrowRight
                      size={15}
                      className="text-accent transition-transform group-hover:translate-x-0.5"
                    />
                  </Link>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
