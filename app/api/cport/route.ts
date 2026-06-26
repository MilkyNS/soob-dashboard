const BACKEND_URL = process.env.BACKEND_URL || "http://91.99.11.184:8080";

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/cport`, { cache: "no-store" });
    if (!res.ok) {
      return Response.json({ error: `Backend returned ${res.status}` }, { status: 502 });
    }
    return Response.json(await res.json());
  } catch {
    return Response.json({ error: "Backend unreachable" }, { status: 502 });
  }
}
