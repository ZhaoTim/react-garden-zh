import type { PostMeta } from "~/content/types";
import { cn } from "~/lib/cn";
import { Reveal, RevealItem } from "../ui/Reveal";
import { LinkIcon } from "../ui/icons";
import { PostRow } from "./PostCard";

/** "Linked from": notes that wikilink to this one. Renders nothing when empty. */
export function Backlinks({ posts, className }: { posts: PostMeta[]; className?: string }) {
  if (!posts.length) return null;
  return (
    <section aria-labelledby="backlinks-title" className={cn(className)}>
      <h2
        id="backlinks-title"
        className="flex items-center gap-2 text-xs font-semibold tracking-[0.08em] text-subtle uppercase"
      >
        <LinkIcon size={14} /> 被 {posts.length} 篇笔记引用
      </h2>
      <Reveal as="ul" className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {posts.map((p, i) => (
          <RevealItem as="li" key={p.slug} index={i}>
            <PostRow post={p} className="h-full" />
          </RevealItem>
        ))}
      </Reveal>
    </section>
  );
}

export function RelatedPosts({
  posts,
  className,
  title = "推荐阅读",
}: {
  posts: PostMeta[];
  className?: string;
  title?: string;
}) {
  if (!posts.length) return null;
  return (
    <section aria-labelledby="related-title" className={cn(className)}>
      <h2
        id="related-title"
        className="text-xs font-semibold tracking-[0.08em] text-subtle uppercase"
      >
        {title}
      </h2>
      <Reveal as="ul" className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {posts.map((p, i) => (
          <RevealItem as="li" key={p.slug} index={i}>
            <PostRow post={p} className="h-full" />
          </RevealItem>
        ))}
      </Reveal>
    </section>
  );
}
