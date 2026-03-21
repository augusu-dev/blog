import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";

type LocaleLayoutProps = {
    children: React.ReactNode;
    params: Promise<{
        locale: string;
    }>;
};

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
    const { locale } = await params;

    if (!isLocale(locale)) {
        notFound();
    }

    return children;
}
