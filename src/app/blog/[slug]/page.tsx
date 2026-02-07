import Link from "next/link";
import { getAllBlogSlugs, getBlogBySlug } from "@/lib/markdown";

export async function generateStaticParams() {
  return getAllBlogSlugs().map((slug) => ({ slug }));
}

export default async function BlogArticle({
  params,
}: {
  params: { slug: string };
}) {
  const article = await getBlogBySlug(params.slug);

  return (
    <article className="max-w-none">
      <div className="mb-8">
        <Link
          href="/blog"
          className="text-sm text-azuki-500 hover:text-azuki-700 transition-colors"
        >
          ← Blog に戻る
        </Link>
      </div>

      <header className="mb-8">
        {article.category && (
          <span className="text-xs font-medium text-azuki-600 bg-azuki-50 px-2 py-0.5 rounded">
            {article.category}
          </span>
        )}
        <h1 className="text-2xl font-bold text-gray-800 mt-2">
          {article.title}
        </h1>
        <div className="flex items-center space-x-4 mt-3 text-sm text-gray-400">
          <time>{article.date}</time>
          {article.tags && article.tags.length > 0 && (
            <div className="flex space-x-2">
              {article.tags.map((tag) => (
                <span key={tag} className="text-azuki-400">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </header>

      {article.image && (
        <img
          src={article.image}
          alt={article.title}
          className="w-full rounded-lg mb-8"
        />
      )}

      <div
        className="prose"
        dangerouslySetInnerHTML={{ __html: article.content }}
      />
    </article>
  );
}
