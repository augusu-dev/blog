import PinsPage from "../../pins/page";
import { buildLocaleMetadata } from "@/lib/localeMetadata";

type LocalizedPageProps = {
    params: Promise<{
        locale: string;
    }>;
};

export async function generateMetadata({ params }: LocalizedPageProps) {
    const { locale } = await params;
    return buildLocaleMetadata("/pins", locale);
}

export default PinsPage;
