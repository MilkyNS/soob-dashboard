const BACKEND_URL = process.env.BACKEND_URL || "http://91.99.11.184:8080";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const prefix = searchParams.get("prefix");
  const url = new URL(`${BACKEND_URL}/api/status`);
  if (symbol) url.searchParams.set("symbol", symbol);
  if (prefix) url.searchParams.set("prefix", prefix);

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();
  return Response.json(data);
}
