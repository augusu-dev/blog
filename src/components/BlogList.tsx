"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { ArticleMeta } from "@/lib/types";

interface Props {
  articles: ArticleMeta[];
}

export default function BlogList({ articles }: Props) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const perPage = 20;

  const filtered = useMemo(() => {
    if (!search.trim()) return articles;
    const q = search.toLowerCase();
    return articles.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        (a.description && a.description.toLowerCase().includes(q))
    );
  }, [search, articles]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice(page * perPage, (page + 1) * perPage);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Blog</h1>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="タイトル/概要で検索"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-azuki-400 focus:ring-1 focus:ring-azuki-200"
        />
      </div>

      {/* Results label */}
      <p className="text-xs text-azuki-500 mb-3">
        検索結果 {filtered.length > 0 && `(${filtered.length}件)`}
      </p>

      {/* Article list */}
      <div className="divide-y divide-gray-100">
        {paginated.length > 0 ? (
          paginated.map((article) => (
            <Link
              key={article.slug}
              href={`/blog/${article.slug}`}
              className="block py-4 hover:bg-gray-50 -mx-2 px-2 rounded transition-colors"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-gray-800 hover:text-azuki-600 transition-colors">
                    {article.title}
                  </h2>
                  {article.description && (
                    <p className="text-sm text-gray-500 mt-0.5 truncate">
                      {article.description}
                    </p>
                  )}
                </div>
                <span className="text-sm text-azuki-400 whitespace-nowrap ml-4">
                  {article.date}
                </span>
              </div>
            </Link>
          ))
        ) : (
          <p className="py-8 text-center text-sm text-gray-400">
            {articles.length === 0
              ? "まだ記事がありません"
              : "該当する記事が見つかりません"}
          </p>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center space-x-4 mt-8">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-azuki-50 hover:border-azuki-200 transition-colors"
          >
            ← 前へ
          </button>
          <span className="text-sm text-gray-500">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-azuki-50 hover:border-azuki-200 transition-colors"
          >
            次へ →
          </button>
        </div>
      )}
    </div>
  );
}
