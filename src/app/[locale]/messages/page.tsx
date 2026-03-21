import MessagesPage from "../../messages/page";
import { buildLocaleMetadata } from "@/lib/localeMetadata";

type LocalizedPageProps = {
    params: Promise<{
        locale: string;
    }>;
};

export async function generateMetadata({ params }: LocalizedPageProps) {
    const { locale } = await params;
    return buildLocaleMetadata("/messages", locale);
}

export default MessagesPage;
