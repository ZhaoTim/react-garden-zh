import { Await, Link, createFileRoute } from "@tanstack/react-router";
import { PostList } from "~/components/post/PostList";
import { SeriesCard } from "~/components/series/SeriesCard";
import { Kbd } from "~/components/ui/Badge";
import { ArrowRight, SearchIcon } from "~/components/ui/icons";
import { Reveal, RevealItem } from "~/components/ui/Reveal";
import { PostListSkeleton, TagCloudSkeleton } from "~/components/ui/Skeleton";
import { buttonStyles, EmptyState } from "~/components/ui/States";
import { TagChip } from "~/components/ui/TagChip";
import { getFolders, getPosts, getSeries, getTags } from "~/content/functions";
import { palette } from "~/lib/palette";
import { seo, siteUrlFrom } from "~/lib/seo";
import { site } from "~/site.config";

export const Route = createFileRoute("/")({
  ssr: true,
  loader: async () => {
    const [folders, recent] = await Promise.all([
      getFolders(),
      getPosts({ data: { sort: "newest", pageSize: 6 } }),
    ]);
    const featured = folders.slice(0, 3);
    const series = await Promise.all(
      featured.map((f) => getSeries({ data: { folder: f.slug } }).catch(() => [])),
    );
    return {
      featured: featured.map((folder, i) => ({ folder, parts: series[i] ?? [] })),
      recent,
      // Not awaited: the tag cloud streams in after the first byte (rendered with <Await> + skeleton).
      tags: getTags(),
    };
  },
  head: ({ matches }) => {
    const siteUrl = siteUrlFrom(matches);
    return seo({ siteUrl, path: "/" });
  },
  pendingComponent: () => (
    <main id="main" tabIndex={-1} className="container-page py-16 outline-none">
      <PostListSkeleton count={3} />
    </main>
  ),
  component: Home,
});

function Home() {
  const { featured, recent, tags } = Route.useLoaderData();
  const seriesTitles = Object.fromEntries(featured.map((f) => [f.folder.folder, f.folder.title]));
  return (
    <main id="main" tabIndex={-1} className="outline-none">
      <Hero />

      {featured.length > 0 && (
        <section aria-labelledby="series-title" className="container-page mt-4 sm:mt-8">
          <SectionHeading id="series-title" eyebrow="专栏课程">
            精选专栏
          </SectionHeading>
          <Reveal className="mt-6 grid gap-6" delay={0.1}>
            {featured.map(({ folder, parts }, i) => (
              <RevealItem key={folder.slug} index={i + 3}>
                <SeriesCard folder={folder} parts={parts} />
              </RevealItem>
            ))}
          </Reveal>
        </section>
      )}

      <section aria-labelledby="recent-title" className="container-page mt-20">
        <div className="flex items-end justify-between gap-4">
          <SectionHeading id="recent-title" eyebrow="最新发布">
            近期笔记与文章
          </SectionHeading>
          <Link
            to="/posts"
            className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-muted hover:text-fg"
          >
            全部 {recent.total} 篇文章
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        {recent.posts.length ? (
          <PostList
            posts={recent.posts}
            seriesTitles={seriesTitles}
            className="mt-6 md:grid-cols-2"
          />
        ) : (
          <EmptyState className="mt-6" title="暂无已发布文章">
            文章发布后将在此处呈现。
          </EmptyState>
        )}
      </section>

      <section aria-labelledby="topics-title" className="container-page mt-20">
        <SectionHeading id="topics-title" eyebrow="探索分类">
          热门主题
        </SectionHeading>
        <div className="mt-6">
          <Await promise={tags} fallback={<TagCloudSkeleton />}>
            {(list) => <TagCloud tags={list} />}
          </Await>
        </div>
      </section>
    </main>
  );
}

function Hero() {
  return (
    <section className="container-page pt-12 pb-14 sm:pt-20 sm:pb-20" aria-labelledby="hero-title">
      <p className="enter" style={{ "--i": 0 } as React.CSSProperties}>
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 py-1 pr-3 pl-1.5 text-xs font-medium text-muted">
          <span className="relative flex size-5 items-center justify-center rounded-full bg-accent-soft">
            <span className="size-1.5 rounded-full bg-accent" />
            <span className="absolute inset-0 animate-ping rounded-full bg-accent/20 [animation-duration:2.4s]" />
          </span>
          A digital garden by {site.author}
        </span>
      </p>
      <h1
        id="hero-title"
        className={`mt-6 max-w-[18ch] font-serif text-[2.75rem] leading-[1.04] font-medium tracking-[-0.025em] text-balance sm:text-6xl lg:text-7xl enter`}
        style={{ "--i": 1 } as React.CSSProperties}
      >
        直击本质、探寻到底的 <em className="font-normal text-accent italic">React 深度笔记</em>。
      </h1>
      <p
        className={`mt-6 max-w-[56ch] text-lg leading-relaxed text-pretty text-muted sm:text-xl enter`}
        style={{ "--i": 2 } as React.CSSProperties}
      >
        {site.description} 包含精美架构流程图、代码图解与源码级全流程推导。
      </p>
      <div
        className={`mt-8 flex flex-wrap gap-3 enter`}
        style={{ "--i": 3 } as React.CSSProperties}
      >
        <Link to="/posts" className={buttonStyles.primary}>
          浏览全部文章 <ArrowRight size={15} />
        </Link>
        <button type="button" onClick={() => palette.open()} className={buttonStyles.secondary}>
          <SearchIcon size={15} /> 搜索
          <Kbd className="ml-1 max-sm:hidden">/</Kbd>
        </button>
      </div>
    </section>
  );
}

function SectionHeading({
  id,
  eyebrow,
  children,
}: {
  id: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-[0.1em] text-subtle uppercase">{eyebrow}</p>
      <h2 id={id} className="mt-1.5 font-serif text-3xl font-medium tracking-tight">
        {children}
      </h2>
    </div>
  );
}

function TagCloud({ tags }: { tags: { tag: string; count: number }[] }) {
  if (!tags.length) return <p className="text-muted">No tags yet.</p>;
  const top = tags.toSorted((a, b) => b.count - a.count).slice(0, 28);
  return (
    <Reveal as="ul" each={0.02} className="flex flex-wrap gap-2">
      {top.map((t, i) => (
        <RevealItem as="li" key={t.tag} index={i}>
          <TagChip tag={t.tag} count={t.count} size="md" />
        </RevealItem>
      ))}
      <RevealItem as="li" index={top.length}>
        <Link
          to="/tags"
          className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-sm font-medium text-muted hover:text-fg"
        >
          All tags <ArrowRight size={14} />
        </Link>
      </RevealItem>
    </Reveal>
  );
}
