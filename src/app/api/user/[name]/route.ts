import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureUserIdForUser, ensureUserIdSchema } from "@/lib/userId";

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

// GET: Fetch public profile by user ID only
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ name: string }> }
) {
    const { name } = await params;
    const userRef = typeof name === "string" ? name.trim() : "";
    const userRefLower = userRef.toLowerCase();

    try {
        try {
            await ensureUserIdSchema();
        } catch (schemaError) {
            console.error("Failed to ensure userId schema in profile route:", schemaError);
        }
        const user = await prisma.user.findFirst({
            where: {
                OR: [{ userId: userRefLower }, { id: userRef }],
            },
            select: {
                id: true,
                userId: true,
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
        let ensuredUserId = user.userId || user.id;
        try {
            ensuredUserId = await ensureUserIdForUser(user.id);
        } catch (ensureError) {
            console.error("Failed to ensure userId in profile route:", ensureError);
        }

        return NextResponse.json({
            ...user,
            userId: ensuredUserId,
            links: unpacked.links,
            dmSetting: unpacked.dmSetting,
        });
    } catch (error) {
        console.error("Failed to fetch user:", error);
        return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
    }
}
