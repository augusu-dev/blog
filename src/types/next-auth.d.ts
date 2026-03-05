import { DefaultSession } from "next-auth";

declare module "next-auth" {
    interface Session {
        user: DefaultSession["user"] & {
            id: string;
            userId?: string;
        };
    }

    interface User {
        id: string;
        userId?: string | null;
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        id?: string;
        userId?: string;
    }
}
