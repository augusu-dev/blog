import UserPage from "../../../user/[name]/page";
import { buildLocaleMetadata } from "@/lib/localeMetadata";

type UserRouteProps = {
    params: Promise<{
        locale: string;
        name: string;
    }>;
};

export async function generateMetadata({ params }: UserRouteProps) {
    const { locale, name } = await params;
    return buildLocaleMetadata(`/user/${encodeURIComponent(name)}`, locale);
}

export default function LocalizedUserPage() {
    return <UserPage />;
}
