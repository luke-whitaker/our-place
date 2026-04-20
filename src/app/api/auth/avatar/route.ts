import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { updateAvatarSchema, getZodErrorMessage } from "@/lib/schemas";

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = updateAvatarSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: auth.user.userId },
      data: { avatar: parsed.data },
    });

    return NextResponse.json({ message: "Avatar saved!", avatar: parsed.data });
  } catch (error) {
    console.error("Update avatar error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
