// Serves an uploaded photo or letter: GET /files/<id>
export async function onRequestGet({ params, env }) {
  const id = params.id;
  if (!/^[a-f0-9]{32}$/.test(id)) return new Response("Not found", { status: 404 });
  const { value, metadata } = await env.FILES.getWithMetadata(id, { type: "stream" });
  if (!value) return new Response("Not found", { status: 404 });
  return new Response(value, {
    headers: {
      "Content-Type": metadata?.type || "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(metadata?.name || id)}`,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
