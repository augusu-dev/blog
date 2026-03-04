import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DirectMessageSetting } from "@prisma/client";

const USER_SETTINGS_SELECT = {
    id: true,
    name: true,
    email: true,
    image: true,
    headerImage: true,
    bio: true,
    aboutMe: true,
    links: true,
    dmSetting: true,
} as const;

function parseDmSetting(value: unknown): DirectMessageSetting | undefined {
    if (value === undefined) return undefined;
    if (value === "OPEN" || value === "PR_ONLY" || value === "CLOSED") {
        return value;
    }
    return undefined;
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

    return NextResponse.json({
        ...user,
        links: user?.links ? JSON.parse(user.links) : [],
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

    const user = await prisma.user.update({
        where: { id: userId },
        data: {
            ...(name !== undefined && { name }),
            ...(bio !== undefined && { bio }),
            ...(aboutMe !== undefined && { aboutMe }),
            ...(image !== undefined && { image }),
            ...(headerImage !== undefined && { headerImage }),
            ...(links !== undefined && { links: JSON.stringify(links) }),
            ...(parsedDmSetting !== undefined && { dmSetting: parsedDmSetting }),
        },
        select: USER_SETTINGS_SELECT,
    });

    return NextResponse.json({
        ...user,
        links: user.links ? JSON.parse(user.links) : [],
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