const BACKEND_URL = process.env.BACKEND_URL || "http://91.99.11.184:8080";

export async function GET() {
  const res = await fetch(`${BACKEND_URL}/api/status`, {
    cache: "no-store",
  });
  const data = await res.json();
  return Response.json(data);
}
