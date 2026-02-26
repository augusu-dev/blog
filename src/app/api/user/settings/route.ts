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
        select: { id: true, name: true, email: true, image: true },
    });

    return NextResponse.json(user);
}

export async function PUT(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, image } = await request.json();

    const user = await prisma.user.update({
        where: { id: session.user.id },
        data: {
            ...(name !== undefined && { name }),
            ...(image !== undefined && { image }),
        },
        select: { id: true, name: true, email: true, image: true },
    });

    return NextResponse.json(user);
}
