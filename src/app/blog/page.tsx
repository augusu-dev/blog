import { getAllBlogMeta } from "@/lib/markdown";
import BlogList from "@/components/BlogList";

export default function BlogPage() {
  const articles = getAllBlogMeta();
  return <BlogList articles={articles} />;
}
