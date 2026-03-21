import TermsPage from "../../terms/page";
import { buildLocaleMetadata } from "@/lib/localeMetadata";

type LocalizedPageProps = {
    params: Promise<{
        locale: string;
    }>;
};

export async function generateMetadata({ params }: LocalizedPageProps) {
    const { locale } = await params;
    return buildLocaleMetadata("/terms", locale);
}

export default TermsPage;
