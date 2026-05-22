const BACKEND_URL = process.env.BACKEND_URL || "http://91.99.11.184:8080";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const url = new URL(`${BACKEND_URL}/api/structures`);
  if (symbol) url.searchParams.set("symbol", symbol);

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return Response.json({ error: `Backend returned ${res.status}` }, { status: 502 });
    }
    const data = await res.json();
    return Response.json(data);
  } catch {
    return Response.json({ error: "Backend unreachable" }, { status: 502 });
  }
}
