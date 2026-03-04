import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

type DmSetting = "OPEN" | "PR_ONLY" | "CLOSED";
const DEFAULT_DM_SETTING: DmSetting = "OPEN";

const USER_SETTINGS_SELECT = {
    id: true,
    name: true,
    email: true,
    image: true,
    headerImage: true,
    bio: true,
    aboutMe: true,
    links: true,
} as const;

function parseDmSetting(value: unknown): DmSetting | undefined {
    if (value === undefined) return undefined;
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

function packLinks(links: unknown[], dmSetting: DmSetting): string {
    if (dmSetting === DEFAULT_DM_SETTING) {
        return JSON.stringify(links);
    }
    return JSON.stringify({ items: links, dmSetting });
}

export async function GET() {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: USER_SETTINGS_SELECT,
    });

    const unpacked = unpackLinks(user?.links);

    return NextResponse.json({
        ...user,
        links: unpacked.links,
        dmSetting: unpacked.dmSetting,
    });
}

export async function PUT(request: NextRequest) {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, bio, aboutMe, links, image, headerImage, dmSetting } = await request.json();
    const parsedDmSetting = parseDmSetting(dmSetting);

    if (dmSetting !== undefined && !parsedDmSetting) {
        return NextResponse.json(
            { error: "Invalid dmSetting. Use OPEN, PR_ONLY, or CLOSED." },
            { status: 400 }
        );
    }

    const current = await prisma.user.findUnique({
        where: { id: userId },
        select: { links: true },
    });

    const currentUnpacked = unpackLinks(current?.links);
    const nextLinks = Array.isArray(links) ? links : currentUnpacked.links;
    const nextDmSetting = parsedDmSetting || currentUnpacked.dmSetting;

    const user = await prisma.user.update({
        where: { id: userId },
        data: {
            ...(name !== undefined && { name }),
            ...(bio !== undefined && { bio }),
            ...(aboutMe !== undefined && { aboutMe }),
            ...(image !== undefined && { image }),
            ...(headerImage !== undefined && { headerImage }),
            links: packLinks(nextLinks, nextDmSetting),
        },
        select: USER_SETTINGS_SELECT,
    });

    const unpacked = unpackLinks(user.links);

    return NextResponse.json({
        ...user,
        links: unpacked.links,
        dmSetting: unpacked.dmSetting,
    });
}

export async function DELETE() {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.user.delete({
        where: { id: userId },
    });

    return NextResponse.json({ message: "Account deleted" });
}