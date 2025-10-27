import { NextResponse } from "next/server";

import { ApiError, apiServerFetch } from "@/lib/api/client";

export async function POST() {
  try {
    await apiServerFetch("/api/v1/auth/logout", {
      method: "POST",
      cache: "no-store",
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { success: false, detail: error.message ?? null },
        { status: error.status },
      );
    }
    console.error("Unexpected error during logout", error);
    return NextResponse.json(
      { success: false, detail: "Unexpected error" },
      { status: 500 },
    );
  }
}
