import { clerkMiddleware } from "@clerk/nextjs/server";
import { clerkPublishableKey } from "@repo/env/client";
import { NextResponse } from "next/server";

const clerk = clerkMiddleware();
export default clerkPublishableKey ? clerk : () => NextResponse.next();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
