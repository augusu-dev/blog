import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { reserveAvailableUserId } from "@/lib/userId";

export async function POST(request: NextRequest) {
    try {
        const { name, email, password } = await request.json();
        const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
        const normalizedName = typeof name === "string" ? name.trim() : "";

        if (!normalizedEmail || !password) {
            return NextResponse.json(
                { error: "Email and password are required." },
                { status: 400 }
            );
        }

        if (password.length < 6) {
            return NextResponse.json(
                { error: "Password must be at least 6 characters." },
                { status: 400 }
            );
        }

        const existingUser = await prisma.user.findFirst({
            where: {
                email: {
                    equals: normalizedEmail,
                    mode: "insensitive",
                },
            },
            select: { id: true },
        });

        if (existingUser) {
            return NextResponse.json(
                { error: "This email address is already registered." },
                { status: 400 }
            );
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const baseUserId = (normalizedName || normalizedEmail.split("@")[0] || "").toString();
        const userId = await reserveAvailableUserId(baseUserId);

        const user = await prisma.user.create({
            data: {
                name: normalizedName || normalizedEmail.split("@")[0],
                email: normalizedEmail,
                password: hashedPassword,
                userId,
            },
        });

        return NextResponse.json(
            { message: "Account created.", userId: user.id },
            { status: 201 }
        );
    } catch (error) {
        console.error("Signup error:", error);
        return NextResponse.json(
            { error: "Failed to create account." },
            { status: 500 }
        );
    }
}
