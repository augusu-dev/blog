import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DirectMessageContext, PullRequestStatus } from "@prisma/client";
import { ensureDirectMessageCapacity } from "@/lib/directMessages";
import { ensureUserIdSchema } from "@/lib/userId";
import { resolveSessionUserId } from "@/lib/sessionUser";

type DmSetting = "OPEN" | "PR_ONLY" | "CLOSED";
const DEFAULT_DM_SETTING: DmSetting = "OPEN";

function normalizeString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function normalizeTags(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((tag) => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
        .slice(0, 20);
}

function parseDmSetting(value: unknown): DmSetting | undefined {
    if (value === "OPEN" || value === "PR_ONLY" || value === "CLOSED") {
        return value;
    }
    return undefined;
}

function unpackDmSettingFromLinks(raw: string | null | undefined): DmSetting {
    if (!raw) return DEFAULT_DM_SETTING;

    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            const candidate = parsed as { dmSetting?: unknown };
            return parseDmSetting(candidate.dmSetting) || DEFAULT_DM_SETTING;
        }
    } catch {
        return DEFAULT_DM_SETTING;
    }

    return DEFAULT_DM_SETTING;
}

export async function GET() {
    const session = await auth();
    const userId = await resolveSessionUserId(session);
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const [received, sent] = await Promise.all([
            prisma.articlePullRequest.findMany({
                where: { recipientId: userId },
                orderBy: { createdAt: "desc" },
                include: {
                    proposer: {
                        select: { id: true, name: true, email: true },
                    },
                    messages: {
                        where: { context: DirectMessageContext.PULL_REQUEST },
                        orderBy: { createdAt: "desc" },
                        take: 1,
                        select: {
                            id: true,
                            content: true,
                            createdAt: true,
                            sender: { select: { id: true, name: true, email: true } },
                        },
                    },
                },
            }),
            prisma.articlePullRequest.findMany({
                where: { proposerId: userId },
                orderBy: { createdAt: "desc" },
                include: {
                    recipient: {
                        select: { id: true, name: true, email: true },
                    },
                    messages: {
                        where: { context: DirectMessageContext.PULL_REQUEST },
                        orderBy: { createdAt: "desc" },
                        take: 1,
                        select: {
                            id: true,
                            content: true,
                            createdAt: true,
                            sender: { select: { id: true, name: true, email: true } },
                        },
                    },
                },
            }),
        ]);

        return NextResponse.json({ received, sent });
    } catch (error) {
        console.error("Failed to fetch pull requests:", error);
        return NextResponse.json({ error: "Failed to fetch pull requests" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const session = await auth();
    const userId = await resolveSessionUserId(session);
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        await ensureUserIdSchema();
        const body = await request.json();
        const recipientIdInput = normalizeString(body.recipientId);
        const recipientQuery = normalizeString(body.recipientQuery || body.recipientName);
        const recipientLookup = recipientIdInput || recipientQuery;
        const title = normalizeString(body.title);
        const excerpt = normalizeString(body.excerpt);
        const content = normalizeString(body.content);
        const tags = normalizeTags(body.tags);
        const dmMessage = normalizeString(body.dmMessage);

        if (!recipientLookup) {
            return NextResponse.json({ error: "recipientId or recipientQuery is required" }, { status: 400 });
        }

        if (!title || !content) {
            return NextResponse.json({ error: "title and content are required" }, { status: 400 });
        }

        if (title.length > 200) {
            return NextResponse.json({ error: "title must be 200 characters or fewer" }, { status: 400 });
        }

        if (excerpt.length > 500) {
            return NextResponse.json({ error: "excerpt must be 500 characters or fewer" }, { status: 400 });
        }

        if (content.length > 50000) {
            return NextResponse.json({ error: "content is too long" }, { status: 400 });
        }

        if (dmMessage.length > 10000) {
            return NextResponse.json({ error: "dmMessage must be 10000 characters or fewer" }, { status: 400 });
        }

        const recipient = await prisma.user.findFirst({
            where: {
                OR: [
                    { id: recipientLookup },
                    { userId: recipientLookup.toLowerCase() },
                    { name: { equals: recipientLookup, mode: "insensitive" } },
                ],
            },
            select: { id: true, links: true },
        });

        if (!recipient) {
            return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
        }

        const recipientId = recipient.id;

        if (recipientId === userId) {
            return NextResponse.json({ error: "Cannot create a pull request to yourself" }, { status: 400 });
        }

        const recipientDmSetting = unpackDmSettingFromLinks(recipient.links);
        if (recipientDmSetting === "CLOSED") {
            return NextResponse.json(
                { error: "This user is not accepting pull requests or direct messages." },
                { status: 403 }
            );
        }

        if (dmMessage.length > 1000) {
            await ensureDirectMessageCapacity();
        }

        const result = await prisma.$transaction(async (tx) => {
            const pullRequest = await tx.articlePullRequest.create({
                data: {
                    proposerId: userId,
                    recipientId,
                    title,
                    excerpt: excerpt || null,
                    content,
                    tags,
                    status: PullRequestStatus.PENDING,
                },
            });

            if (dmMessage) {
                await tx.directMessage.create({
                    data: {
                        senderId: userId,
                        recipientId,
                        content: dmMessage,
                        context: DirectMessageContext.PULL_REQUEST,
                        pullRequestId: pullRequest.id,
                    },
                });
            }

            return pullRequest;
        });

        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        console.error("Failed to create pull request:", error);
        return NextResponse.json({ error: "Failed to create pull request" }, { status: 500 });
    }
}
