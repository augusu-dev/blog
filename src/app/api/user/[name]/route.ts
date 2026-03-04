import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type DmSetting = "OPEN" | "PR_ONLY" | "CLOSED";
const DEFAULT_DM_SETTING: DmSetting = "OPEN";

function parseDmSetting(value: unknown): DmSetting | undefined {
    if (value === "OPEN" || value === "PR_ONLY" || value === "CLOSED") {
        return value;
    }
    return undefined;
}

function unpackLinks(raw: string | null | undefined): { links: unknown[]; dmSetting: DmSetting } {
    if (!raw) {
        return { links: [], dmSetting: DEFAULT_DM_SETTING };
    }

    try {
        const parsed = JSON.parse(raw);

        if (Array.isArray(parsed)) {
            return { links: parsed, dmSetting: DEFAULT_DM_SETTING };
        }

        if (parsed && typeof parsed === "object") {
            const candidate = parsed as { items?: unknown; links?: unknown; dmSetting?: unknown };
            const links = Array.isArray(candidate.items)
                ? candidate.items
                : Array.isArray(candidate.links)
                  ? candidate.links
                  : [];
            const dmSetting = parseDmSetting(candidate.dmSetting) || DEFAULT_DM_SETTING;
            return { links, dmSetting };
        }
    } catch {
        return { links: [], dmSetting: DEFAULT_DM_SETTING };
    }

    return { links: [], dmSetting: DEFAULT_DM_SETTING };
}

// GET: Fetch public profile by user ID (fallback: user name for compatibility)
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ name: string }> }
) {
    const { name } = await params;
    const userRef = typeof name === "string" ? name.trim() : "";

    try {
        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { id: userRef },
                    { name: { equals: userRef, mode: "insensitive" } },
                ],
            },
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
                headerImage: true,
                bio: true,
                aboutMe: true,
                links: true,
                posts: {
                    where: { published: true },
                    orderBy: { createdAt: "desc" },
                },
            },
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const unpacked = unpackLinks(user.links);

        return NextResponse.json({
            ...user,
            links: unpacked.links,
            dmSetting: unpacked.dmSetting,
        });
    } catch (error) {
        console.error("Failed to fetch user:", error);
        return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
    }
}
