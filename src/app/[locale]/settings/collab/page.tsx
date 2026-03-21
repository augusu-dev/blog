import CollabSettingsPage from "../../../settings/collab/page";
import { buildLocaleMetadata } from "@/lib/localeMetadata";

type LocalizedPageProps = {
    params: Promise<{
        locale: string;
    }>;
};

export async function generateMetadata({ params }: LocalizedPageProps) {
    const { locale } = await params;
    return buildLocaleMetadata("/settings/collab", locale);
}

export default CollabSettingsPage;
