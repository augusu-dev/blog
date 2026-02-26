import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
    try {
        const { name, email, password } = await request.json();

        if (!email || !password) {
            return NextResponse.json(
                { error: "メールアドレスとパスワードは必須です" },
                { status: 400 }
            );
        }

        if (password.length < 6) {
            return NextResponse.json(
                { error: "パスワードは6文字以上にしてください" },
                { status: 400 }
            );
        }

        // メールアドレスが既に使われているかチェック
        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            return NextResponse.json(
                { error: "このメールアドレスは既に登録されています" },
                { status: 400 }
            );
        }

        // パスワードをハッシュ化して保存
        const hashedPassword = await bcrypt.hash(password, 12);

        const user = await prisma.user.create({
            data: {
                name: name || email.split("@")[0],
                email,
                password: hashedPassword,
            },
        });

        return NextResponse.json(
            { message: "アカウントを作成しました", userId: user.id },
            { status: 201 }
        );
    } catch (error) {
        console.error("Signup error:", error);
        return NextResponse.json(
            { error: "アカウント作成に失敗しました" },
            { status: 500 }
        );
    }
}
