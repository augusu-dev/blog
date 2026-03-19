import { prisma } from "@/lib/db";
import { fillMissingPublicUserIds } from "@/lib/userId";

export type PullRequestPostUser = {
    id: string;
    userId?: string | null;
    name: string | null;
    email: string | null;
    image: string | null;
};

type PullRequestPostLike = {
    pullRequestProposerId?: string | null;
    pullRequestProposer?: PullRequestPostUser | null;
};

function isSchemaMismatchError(error: unknown): boolean {
    if (error && typeof error === "object" && "code" in error) {
        const code = String((error as { code?: unknown }).code || "");
        if (code === "P2021" || code === "P2022") return true;
    }

    if (error instanceof Error) {
        return /unknown arg|column .* does not exist|relation .* does not exist|permission denied|must be owner/i.test(
            error.message
        );
    }

    return false;
}

async function loadUsersByIds(ids: string[]): Promise<PullRequestPostUser[]> {
    try {
        return await prisma.user.findMany({
            where: { id: { in: ids } },
            select: { id: true, userId: true, name: true, email: true, image: true },
        });
    } catch (error) {
        if (!isSchemaMismatchError(error)) {
            throw error;
        }
    }

    return prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, email: true, image: true },
    });
}

export async function hydratePullRequestProposers<T extends PullRequestPostLike>(posts: T[]): Promise<T[]> {
    const proposerIds = [...new Set(posts.map((post) => post.pullRequestProposerId || "").filter(Boolean))];

    if (proposerIds.length === 0) {
        return posts.map((post) => ({
            ...post,
            pullRequestProposer: post.pullRequestProposer || null,
        })) as T[];
    }

    const users = await loadUsersByIds(proposerIds);
    const hydratedUsers = await fillMissingPublicUserIds(users);
    const userById = new Map(hydratedUsers.map((user) => [user.id, user]));

    return posts.map((post) => ({
        ...post,
        pullRequestProposer: post.pullRequestProposerId
            ? userById.get(post.pullRequestProposerId) || post.pullRequestProposer || null
            : post.pullRequestProposer || null,
    })) as T[];
}
