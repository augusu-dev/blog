import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, name: true, email: true, image: true, bio: true, links: true },
    });

    return NextResponse.json({
        ...user,
        links: user?.links ? JSON.parse(user.links) : [],
    });
}

export async function PUT(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, bio, links } = await request.json();

    const user = await prisma.user.update({
        where: { id: session.user.id },
        data: {
            ...(name !== undefined && { name }),
            ...(bio !== undefined && { bio }),
            ...(links !== undefined && { links: JSON.stringify(links) }),
        },
        select: { id: true, name: true, email: true, image: true, bio: true, links: true },
    });

    return NextResponse.json({
        ...user,
        links: user.links ? JSON.parse(user.links) : [],
    });
}

export async function DELETE() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Delete all user data (posts cascade via onDelete)
    await prisma.user.delete({
        where: { id: session.user.id },
    });

    return NextResponse.json({ message: "Account deleted" });
}
