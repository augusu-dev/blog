/* eslint-disable */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
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
                parsedLinks = JSON.parse((user as any).links as string);
            }
        } catch { }

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
            }))
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
