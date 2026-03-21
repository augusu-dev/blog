import UserPage from "../../../../../user/[name]/page";
import { buildLocaleMetadata } from "@/lib/localeMetadata";

type UserPostPageProps = {
    params: Promise<{
        locale: string;
        name: string;
        postId: string;
    }>;
};

export async function generateMetadata({ params }: UserPostPageProps) {
    const { locale, name, postId } = await params;
    return buildLocaleMetadata(`/user/${encodeURIComponent(name)}/posts/${encodeURIComponent(postId)}`, locale);
}

export default async function LocalizedUserPostPage({ params }: UserPostPageProps) {
    const { postId } = await params;
    return <UserPage requestedPostId={postId} />;
}
