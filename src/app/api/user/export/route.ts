/* eslint-disable */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveSessionUserId } from "@/lib/sessionUser";
import { withShortPostTable } from "@/lib/shortPosts";

type DmSetting = "OPEN" | "PR_ONLY" | "CLOSED";
type ThemeName = "default" | "lightblue" | "sand" | "apricot" | "white" | "black" | "custom";

const DEFAULT_DM_SETTING: DmSetting = "OPEN";
const DEFAULT_THEME: ThemeName = "default";
const DEFAULT_THEME_CUSTOM_COLOR = "#925c5c";

export async function GET(request: NextRequest) {
    const session = await auth(req as any)  ;
    const userId = await resolveSessionUserId(session as any)  ;
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
        let parsedDmSetting: DmSetting = DEFAULT_DM_SETTING;
        let parsedTheme: ThemeName = DEFAULT_THEME;
        let parsedThemeCustomColor = DEFAULT_THEME_CUSTOM_COLOR;
        try {
            if ((user as any).links) {
                const rawParsed = JSON.parse((user as any).links as string);
                if (Array.isArray(rawParsed)) {
                    parsedLinks = rawParsed;
                } else if (rawParsed && typeof rawParsed === "object") {
                    const candidate = rawParsed as {
                        items?: unknown;
                        links?: unknown;
                        dmSetting?: unknown;
                        theme?: unknown;
                        themeCustomColor?: unknown;
                    };
                    parsedLinks = Array.isArray(candidate.items)
                        ? candidate.items
                        : Array.isArray(candidate.links)
                          ? candidate.links
                          : [];
                    if (
                        candidate.dmSetting === "OPEN" ||
                        candidate.dmSetting === "PR_ONLY" ||
                        candidate.dmSetting === "CLOSED"
                    ) {
                        parsedDmSetting = candidate.dmSetting;
                    }
                    if (
                        candidate.theme === "default" ||
                        candidate.theme === "lightblue" ||
                        candidate.theme === "sand" ||
                        candidate.theme === "apricot" ||
                        candidate.theme === "white" ||
                        candidate.theme === "black" ||
                        candidate.theme === "custom"
                    ) {
                        parsedTheme = candidate.theme;
                    }
                    if (
                        typeof candidate.themeCustomColor === "string" &&
                        /^#?[0-9a-fA-F]{6}$/.test(candidate.themeCustomColor.trim())
                    ) {
                        parsedThemeCustomColor = `#${candidate.themeCustomColor.replace(/^#/, "").toLowerCase()}`;
                    }
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
                dmSetting: parsedDmSetting,
                theme: parsedTheme,
                themeCustomColor: parsedThemeCustomColor,
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
