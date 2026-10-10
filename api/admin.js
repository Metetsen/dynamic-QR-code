import postgres from 'postgres';
import { timingSafeEqual } from 'node:crypto';

// Conexión estándar a PostgreSQL (Supabase)
const sql = postgres(process.env.DATABASE_URL);

function autorizado(req) {
  const authHeader = req.headers.get('authorization') || '';
  const tokenProporcionado = authHeader.replace('Bearer ', '');
  const tokenEsperado = process.env.ADMIN_TOKEN || '';

  if (!tokenProporcionado || tokenProporcionado.length !== tokenEsperado.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(tokenProporcionado), Buffer.from(tokenEsperado));
}

export async function PUT(req) {
  if (!autorizado(req)) return new Response('No autorizado', { status: 401 });

  const params = new URL(req.url).searchParams;
  const id = params.get('id');
  if (params.get('recurso') !== 'links' || !id || !/^[\w-]+$/.test(id)) {
    return new Response('No encontrado', { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const { destino, activo = true } = body;
  
  if (!destino) return new Response('Falta el destino', { status: 400 });

  let u;
  try { u = new URL(destino); } catch { return new Response('URL inválida', { status: 400 }); }
  if (!['http:', 'https:'].includes(u.protocol)) return new Response('Solo http/https', { status: 400 });
  if (u.href.length > 2048) return new Response('URL demasiado larga', { status: 400 });

  await sql`
    INSERT INTO qr_links (id, destino, activo) VALUES (${id}, ${u.href}, ${activo})
    ON CONFLICT (id) DO UPDATE
      SET destino = EXCLUDED.destino, activo = EXCLUDED.activo, actualizado = now()`;

  return Response.json({ ok: true, id, destino: u.href });
}

export async function GET(req) {
  if (!autorizado(req)) return new Response('No autorizado', { status: 401 });

  const params = new URL(req.url).searchParams;
  const id = params.get('id');
  if (params.get('recurso') !== 'stats' || !id || !/^[\w-]+$/.test(id)) {
    return new Response('No encontrado', { status: 404 });
  }

  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM qr_scans WHERE qr_id = ${id}`;
  const porPais = await sql`
    SELECT pais, COUNT(*)::int AS n FROM qr_scans WHERE qr_id = ${id}
    GROUP BY pais ORDER BY n DESC LIMIT 10`;
  const porDia = await sql`
    SELECT ts::date AS dia, COUNT(*)::int AS n FROM qr_scans WHERE qr_id = ${id}
    GROUP BY dia ORDER BY dia DESC LIMIT 30`;

  return Response.json({ total: n, porPais, porDia });
}