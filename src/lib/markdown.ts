import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import html from "remark-html";
import type { ArticleMeta, Article, LearnEntry, ProductEntry } from "./types";

const contentDir = path.join(process.cwd(), "content");

function getMarkdownFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

function parseMarkdownFile(dir: string, slug: string) {
  const filePath = path.join(dir, `${slug}.md`);
  const fileContents = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(fileContents);
  return { data, content };
}

async function markdownToHtml(markdown: string): Promise<string> {
  const result = await remark().use(html).process(markdown);
  return result.toString();
}

// Blog
export function getAllBlogSlugs(): string[] {
  return getMarkdownFiles(path.join(contentDir, "blog"));
}

export function getAllBlogMeta(): ArticleMeta[] {
  const dir = path.join(contentDir, "blog");
  const slugs = getMarkdownFiles(dir);
  return slugs
    .map((slug) => {
      const { data } = parseMarkdownFile(dir, slug);
      return {
        slug,
        title: data.title || slug,
        date: data.date || "",
        description: data.description || "",
        tags: data.tags || [],
        image: data.image || "",
        featured: data.featured || false,
        category: data.category || "",
      };
    })
    .sort((a, b) => (a.date > b.date ? -1 : 1));
}

export async function getBlogBySlug(slug: string): Promise<Article> {
  const dir = path.join(contentDir, "blog");
  const { data, content } = parseMarkdownFile(dir, slug);
  const htmlContent = await markdownToHtml(content);
  return {
    slug,
    title: data.title || slug,
    date: data.date || "",
    description: data.description || "",
    tags: data.tags || [],
    image: data.image || "",
    featured: data.featured || false,
    category: data.category || "",
    content: htmlContent,
  };
}

// Learn
export function getAllLearnMeta(): ArticleMeta[] {
  const dir = path.join(contentDir, "learn");
  const slugs = getMarkdownFiles(dir);
  return slugs
    .map((slug) => {
      const { data } = parseMarkdownFile(dir, slug);
      return {
        slug,
        title: data.title || slug,
        date: data.date || "",
        description: data.description || "",
        tags: data.tags || [],
        category: data.category || "",
      };
    })
    .sort((a, b) => (a.date > b.date ? -1 : 1));
}

export async function getLearnBySlug(slug: string): Promise<LearnEntry> {
  const dir = path.join(contentDir, "learn");
  const { data, content } = parseMarkdownFile(dir, slug);
  const htmlContent = await markdownToHtml(content);
  return {
    slug,
    title: data.title || slug,
    date: data.date || "",
    description: data.description || "",
    tags: data.tags || [],
    category: data.category || "",
    content: htmlContent,
  };
}

// Product
export function getAllProductMeta(): ArticleMeta[] {
  const dir = path.join(contentDir, "products");
  const slugs = getMarkdownFiles(dir);
  return slugs
    .map((slug) => {
      const { data } = parseMarkdownFile(dir, slug);
      return {
        slug,
        title: data.title || slug,
        date: data.date || "",
        description: data.description || "",
        image: data.image || "",
        tags: data.tags || [],
      };
    })
    .sort((a, b) => (a.date > b.date ? -1 : 1));
}

export async function getProductBySlug(slug: string): Promise<ProductEntry> {
  const dir = path.join(contentDir, "products");
  const { data, content } = parseMarkdownFile(dir, slug);
  const htmlContent = await markdownToHtml(content);
  return {
    slug,
    title: data.title || slug,
    date: data.date || "",
    description: data.description || "",
    image: data.image || "",
    tags: data.tags || [],
    url: data.url || "",
    content: htmlContent,
  };
}
