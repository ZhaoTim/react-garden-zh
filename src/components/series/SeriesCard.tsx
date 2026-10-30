import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import type { FolderInfo, PostMeta } from "~/content/types";
import { cn } from "~/lib/cn";
import { formatDate, formatDuration, isoDate, partNumber, plural } from "~/lib/format";
import { useCardHover } from "~/lib/hooks";
import { ArrowRight, Clock, Layers } from "../ui/icons";
import { SeriesCover } from "./SeriesCover";

/**
 * Featured course card on the home page: cover, title,
 * description, stats and the first few parts as a teaser.
 */
export function SeriesCard({
  folder,
  parts,
  className,
}: {
  folder: FolderInfo;
  parts?: PostMeta[];
  className?: string;
}) {
  const minutes = parts?.reduce((sum, p) => sum + p.readingMinutes, 0);
  const teaser = parts?.slice(0, 4) ?? [];
  // The cover carries the card's corners itself (top when stacked, right from md), so the rounded
  // edge holds even when the transformed card fails to clip a composited child.
  const hover = useCardHover();
  return (
    <motion.article
      {...hover}
      className={cn(
        "spotlight glass-edge group relative isolate grid overflow-hidden rounded-3xl shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-lg)] md:grid-cols-[1.15fr_1fr]",
        className,
      )}
    >
      <SeriesCover
        src={folder.cover}
        svg={folder.coverSvg}
        title={folder.title}
        priority
        ring={false}
        className="aspect-[16/9] rounded-t-3xl md:order-2 md:aspect-auto md:min-h-72 md:rounded-l-none md:rounded-r-3xl"
      />
      <div className="flex flex-col p-6 sm:p-8">
        <p className="inline-flex items-center gap-2 text-xs font-medium tracking-wide text-accent-strong uppercase">
          <Layers size={14} /> 专栏课程
        </p>
        <h3 className="mt-3 font-serif text-3xl leading-tight font-medium tracking-tight text-balance sm:text-[2.125rem]">
          <Link
            to="/series/$folder"
            params={{ folder: folder.slug }}
            preload="intent"
            className="outline-none after:absolute after:inset-0 after:rounded-3xl focus-visible:after:outline-2 focus-visible:after:outline-[var(--ring)]"
          >
            {folder.title}
          </Link>
        </h3>
        {folder.description && (
          <p className="mt-3 line-clamp-4 leading-relaxed text-pretty text-muted">
            {folder.description}
          </p>
        )}
        <dl className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Parts</dt>
            <Layers size={14} className="text-subtle" />
            <dd>{plural(folder.count, "part")}</dd>
          </div>
          {minutes ? (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Reading time</dt>
              <Clock size={14} className="text-subtle" />
              <dd>{formatDuration(minutes)}</dd>
            </div>
          ) : null}
          <div className="flex items-center gap-1.5">
            <dt>更新于</dt>
            <dd>
              <time dateTime={isoDate(folder.latest)}>{formatDate(folder.latest)}</time>
            </dd>
          </div>
        </dl>
        {teaser.length > 0 && (
          <ol
            className="mt-6 space-y-2 border-t border-line pt-5 text-sm max-sm:hidden"
            aria-label="First parts"
          >
            {teaser.map((p) => (
              <li key={p.slug} className="flex gap-3 text-muted">
                <span className="w-6 shrink-0 font-mono text-xs leading-5 text-subtle tabular-nums">
                  {partNumber(p.order ?? 0)}
                </span>
                <span className="line-clamp-1">{p.title}</span>
              </li>
            ))}
          </ol>
        )}
        <span className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-medium text-fg">
          开始阅读专栏
          <ArrowRight
            size={16}
            className="text-accent transition-transform duration-300 group-hover:translate-x-1"
          />
        </span>
      </div>
    </motion.article>
  );
}
