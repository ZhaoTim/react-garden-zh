import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import type { PostMeta } from "~/content/types";
import { cn } from "~/lib/cn";
import { ease, spring } from "~/lib/motion";
import { ArrowLeft, ArrowRight } from "../ui/icons";

/**
 * Previous / next cards. Hover is direction-aware: a tint sweeps in from the side the
 * card points to and the arrow nudges that way.
 */
export function PrevNext({
  prev,
  next,
  className,
}: {
  prev: PostMeta | null;
  next: PostMeta | null;
  className?: string;
}) {
  if (!prev && !next) return null;
  // Neighbours are series parts (same folder, numbered) or, for loose notes, the date order.
  const neighbours = [prev, next].filter((p): p is PostMeta => p !== null);
  const inSeries = neighbours.every(
    (p) => p.folder !== null && p.order !== null && p.folder === neighbours[0]!.folder,
  );
  return (
    <nav
      aria-label={inSeries ? "Series navigation" : "Post navigation"}
      className={cn("grid gap-3 sm:grid-cols-2", className)}
    >
      {prev ? <Card post={prev} dir="prev" /> : <span className="max-sm:hidden" />}
      {next && <Card post={next} dir="next" />}
    </nav>
  );
}

function Card({ post, dir }: { post: PostMeta; dir: "prev" | "next" }) {
  const isNext = dir === "next";
  const Arrow = isNext ? ArrowRight : ArrowLeft;
  return (
    <motion.div
      initial="rest"
      animate="rest"
      whileHover="hover"
      whileFocus="hover"
      className="relative"
    >
      <Link
        to="/posts/$"
        params={{ _splat: post.slug }}
        preload="intent"
        rel={dir}
        className={cn(
          "relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-accent-line",
          isNext && "sm:items-end sm:text-right",
        )}
      >
        <motion.span
          aria-hidden="true"
          className={cn("absolute inset-0 bg-accent-soft", isNext ? "origin-right" : "origin-left")}
          variants={{ rest: { scaleX: 0, opacity: 0 }, hover: { scaleX: 1, opacity: 1 } }}
          transition={{ duration: 0.45, ease: ease.out }}
        />
        <span className="relative inline-flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted uppercase">
          {!isNext && (
            <motion.span variants={{ rest: { x: 0 }, hover: { x: -3 } }} transition={spring.snappy}>
              <Arrow size={14} />
            </motion.span>
          )}
          {isNext ? "下一篇" : "上一篇"}
          {isNext && (
            <motion.span variants={{ rest: { x: 0 }, hover: { x: 3 } }} transition={spring.snappy}>
              <Arrow size={14} />
            </motion.span>
          )}
        </span>
        <span className="relative mt-2 font-serif text-lg leading-snug font-medium text-balance">
          {post.title}
        </span>
      </Link>
    </motion.div>
  );
}
