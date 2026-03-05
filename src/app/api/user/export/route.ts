/* eslint-disable */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveSessionUserId } from "@/lib/sessionUser";
import { withShortPostTable } from "@/lib/shortPosts";

export async function GET(request: NextRequest) {
    const session = await auth();
    const userId = await resolveSessionUserId(session);
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                posts: true,
            },
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        let parsedLinks = [];
        try {
            if ((user as any).links) {
                const rawParsed = JSON.parse((user as any).links as string);
                if (Array.isArray(rawParsed)) {
                    parsedLinks = rawParsed;
                } else if (rawParsed && typeof rawParsed === "object") {
                    const candidate = rawParsed as { items?: unknown; links?: unknown };
                    parsedLinks = Array.isArray(candidate.items)
                        ? candidate.items
                        : Array.isArray(candidate.links)
                          ? candidate.links
                          : [];
                }
            }
        } catch { }

        let shortPosts: Array<{
            id: string;
            content: string;
            createdAt: Date;
        }> = [];
        try {
            shortPosts = await withShortPostTable(() =>
                prisma.shortPost.findMany({
                    where: { authorId: userId },
                    orderBy: { createdAt: "desc" },
                    select: {
                        id: true,
                        content: true,
                        createdAt: true,
                    },
                })
            );
        } catch {
            shortPosts = [];
        }

        const data = {
            exportDate: new Date().toISOString(),
            profile: {
                name: user.name,
                email: user.email,
                image: user.image,
                headerImage: (user as any).headerImage,
                bio: (user as any).bio,
                aboutMe: (user as any).aboutMe,
                links: parsedLinks,
            },
            posts: user.posts.map((p: any) => ({
                id: p.id,
                title: p.title,
                content: p.content,
                excerpt: p.excerpt,
                headerImage: p.headerImage,
                tags: p.tags,
                published: p.published,
                createdAt: p.createdAt,
                updatedAt: p.updatedAt,
            })),
            shortPosts: shortPosts.map((p) => ({
                id: p.id,
                content: p.content,
                createdAt: p.createdAt,
            })),
        };

        const filename = `backup-${user.name || "user"}-${new Date().toISOString().split("T")[0]}.json`;

        return new NextResponse(JSON.stringify(data, null, 2), {
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Content-Disposition": `attachment; filename="${filename}"`,
            }
        });
    } catch (error) {
        console.error("Export error:", error);
        return NextResponse.json({ error: "Export failed" }, { status: 500 });
    }
}
