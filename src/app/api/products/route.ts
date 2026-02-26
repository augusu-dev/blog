import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET: プロダクト一覧
export async function GET() {
    try {
        const products = await prisma.product.findMany({
            orderBy: { name: "asc" },
        });
        return NextResponse.json(products);
    } catch (error) {
        console.error("Failed to fetch products:", error);
        return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
    }
}
