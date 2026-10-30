// Liveness probe cho Docker HEALTHCHECK (không đi qua Nginx, không phụ thuộc backend)
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json(
    { status: 'ok', version: process.env.APP_VERSION ?? 'dev', uptimeSeconds: Math.round(process.uptime()) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
