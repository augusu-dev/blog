import Link from "next/link";
import { getAllBlogMeta, getAllLearnMeta, getAllProductMeta } from "@/lib/markdown";

export default function Home() {
  const blogs = getAllBlogMeta().slice(0, 3);
  const learns = getAllLearnMeta().slice(0, 3);
  const products = getAllProductMeta().slice(0, 3);

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="text-center py-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">
          Augusu Blog
        </h1>
        <p className="text-gray-500 text-sm">
          学びと創作の記録
        </p>
      </section>

      {/* Featured Blog */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">Blog</h2>
          <Link
            href="/blog"
            className="text-sm text-azuki-600 hover:text-azuki-800"
          >
            すべて見る →
          </Link>
        </div>
        {blogs.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {blogs.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group block border border-gray-100 rounded-lg overflow-hidden hover:shadow-md transition-shadow"
              >
                {post.image && (
                  <div className="aspect-video bg-gray-100 overflow-hidden">
                    <img
                      src={post.image}
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                )}
                <div className="p-4">
                  {post.category && (
                    <span className="text-xs font-medium text-azuki-600 bg-azuki-50 px-2 py-0.5 rounded">
                      {post.category}
                    </span>
                  )}
                  <h3 className="font-semibold text-gray-800 mt-2 group-hover:text-azuki-600 transition-colors line-clamp-2">
                    {post.title}
                  </h3>
                  {post.description && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                      {post.description}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-2">{post.date}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">まだ記事がありません</p>
        )}
      </section>

      {/* Featured Learn */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">Learn</h2>
          <Link
            href="/learn"
            className="text-sm text-azuki-600 hover:text-azuki-800"
          >
            すべて見る →
          </Link>
        </div>
        {learns.length > 0 ? (
          <div className="space-y-3">
            {learns.map((entry) => (
              <Link
                key={entry.slug}
                href={`/learn#${entry.slug}`}
                className="block p-3 border border-gray-100 rounded-lg hover:bg-azuki-50 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium text-gray-800">{entry.title}</h3>
                    {entry.description && (
                      <p className="text-sm text-gray-500 mt-0.5">
                        {entry.description}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap ml-4">
                    {entry.date}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">まだエントリーがありません</p>
        )}
      </section>

      {/* Featured Products */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">Product</h2>
          <Link
            href="/product"
            className="text-sm text-azuki-600 hover:text-azuki-800"
          >
            すべて見る →
          </Link>
        </div>
        {products.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {products.map((product) => (
              <Link
                key={product.slug}
                href={`/product#${product.slug}`}
                className="group block border border-gray-100 rounded-lg overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="aspect-square bg-gray-50 overflow-hidden flex items-center justify-center">
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <span className="text-4xl">📦</span>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="font-medium text-sm text-gray-800 group-hover:text-azuki-600 transition-colors">
                    {product.title}
                  </h3>
                  {product.description && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                      {product.description}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">まだプロダクトがありません</p>
        )}
      </section>
    </div>
  );
}
