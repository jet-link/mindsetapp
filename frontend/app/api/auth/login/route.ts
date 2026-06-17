import { NextResponse } from "next/server";

export async function POST(request: Request) {
  let username: string;
  let password: string;
  try {
    const body = (await request.json()) as { username?: string; password?: string };
    username = (body.username ?? "").trim();
    password = body.password ?? "";
  } catch {
    return NextResponse.json({
      ok: false,
      code: "user_not_found",
      message: "User not found",
    });
  }

  const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:8000";
  const res = await fetch(`${apiOrigin}/api/v1/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    cache: "no-store",
  });

  const data = (await res.json()) as {
    ok?: boolean;
    access?: string;
    refresh?: string;
    code?: string;
    message?: string;
  };

  if (!res.ok || !data.ok || !data.access || !data.refresh) {
    return NextResponse.json({
      ok: false,
      code: data.code ?? "user_not_found",
      message: data.message ?? "User not found",
    });
  }

  return NextResponse.json({ ok: true, access: data.access, refresh: data.refresh });
}
