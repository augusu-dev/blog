import UserPage from "../../page";

type UserPostPageProps = {
    params: Promise<{
        postId: string;
    }>;
};

export default async function UserPostPage({ params }: UserPostPageProps) {
    const { postId } = await params;

    return <UserPage requestedPostId={postId} />;
}
