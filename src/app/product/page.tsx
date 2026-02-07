import Link from "next/link";
import { getAllProductMeta } from "@/lib/markdown";

export default function ProductPage() {
  const products = getAllProductMeta();

  return (
    <div>
      <div className="text-center mb-8">
        <span className="text-3xl">📦</span>
        <h1 className="text-2xl font-bold text-gray-800 mt-2">Product</h1>
        <p className="text-sm text-gray-500 mt-1">つくったもの</p>
      </div>

      {products.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {products.map((product) => (
            <div
              key={product.slug}
              className="group border border-gray-100 rounded-xl overflow-hidden hover:shadow-lg transition-all duration-300"
            >
              <div className="aspect-video bg-gray-50 overflow-hidden">
                {product.image ? (
                  <img
                    src={product.image}
                    alt={product.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-5xl opacity-30">📦</span>
                  </div>
                )}
              </div>
              <div className="p-4">
                {product.tags && product.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {product.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] font-medium text-azuki-600 bg-azuki-50 px-2 py-0.5 rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <h2 className="font-bold text-gray-800 group-hover:text-azuki-600 transition-colors">
                  {product.title}
                </h2>
                {product.description && (
                  <p className="text-sm text-gray-500 mt-1 line-clamp-3">
                    {product.description}
                  </p>
                )}
                <div className="flex items-center justify-between mt-3">
                  <time className="text-xs text-gray-400">{product.date}</time>
                  <span className="text-azuki-500 text-sm group-hover:translate-x-1 transition-transform">
                    →
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400 text-center py-12">
          まだプロダクトがありません
        </p>
      )}
    </div>
  );
}
