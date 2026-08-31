export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(
    {
      ok: true,
      service: 'chainmind',
      role: process.env.CHAINMIND_SERVER_ROLE || 'primary',
      mode: process.env.NODE_ENV || 'development',
      readOnly: process.env.CHAINMIND_READ_ONLY === '1',
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}
