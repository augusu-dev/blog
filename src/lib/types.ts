export interface ArticleMeta {
  slug: string;
  title: string;
  date: string;
  description?: string;
  tags?: string[];
  image?: string;
  featured?: boolean;
  category?: string;
}

export interface Article extends ArticleMeta {
  content: string;
}

export interface LearnEntry {
  slug: string;
  title: string;
  date: string;
  description?: string;
  tags?: string[];
  category?: string;
  content: string;
}

export interface ProductEntry {
  slug: string;
  title: string;
  date: string;
  description?: string;
  image?: string;
  tags?: string[];
  url?: string;
  content: string;
}
