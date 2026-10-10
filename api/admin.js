import { neon } from '@neondatabase/serverless';
import { Redis } from '@upstash/redis';
import { timingSafeEqual } from 'node:crypto'; // Importación para comparación segura

const sql = neon(process.env.DATABASE_URL);
const redis = Redis.fromEnv();

function autorizado(req) {
  const authHeader = req.headers.get('authorization') || '';
  const tokenProporcionado = authHeader.replace('Bearer ', '');
  const tokenEsperado = process.env.ADMIN_TOKEN || '';

  // Evitar errores si los tokens no tienen la misma longitud (requisito de timingSafeEqual)
  if (!tokenProporcionado || tokenProporcionado.length !== tokenEsperado.length) {
    return false;
  }

  // Comparación en tiempo constante para evitar ataques de tiempo
  return timingSafeEqual(
    Buffer.from(tokenProporcionado),
    Buffer.from(tokenEsperado)
  );
}

export async function PUT(req) {
  if (!autorizado(req)) return new Response('No autorizado', { status: 401 });

  const params = new URL(req.url).searchParams;
  const id = params.get('id');
  
  // Validación estricta del recurso y formato del ID
  if (params.get('recurso') !== 'links' || !id || !/^[\w-]+$/.test(id)) {
    return new Response('No encontrado', { status: 404 });
  }

  const body = await req.json().catch(() => ({})); // Prevenir caídas por JSON mal formado
  const { destino, activo = true } = body;
  
  if (!destino) return new Response('Falta el destino', { status: 400 });

  let u;
  try { 
    u = new URL(destino); 
  } catch { 
    return new Response('URL inválida', { status: 400 }); 
  }
  
  if (!['http:', 'https:'].includes(u.protocol)) {
    return new Response('Solo se permiten protocolos http o https', { status: 400 });
  }
  
  // Limitar tamaño de la URL para evitar almacenamiento excesivo
  if (u.href.length > 2048) {
    return new Response('URL demasiado larga', { status: 400 });
  }

  await sql`
    INSERT INTO qr_links (id, destino, activo) VALUES (${id}, ${u.href}, ${activo})
    ON CONFLICT (id) DO UPDATE
      SET destino = EXCLUDED.destino, activo = EXCLUDED.activo, actualizado = now()`;

  await redis.del(`link:${id}`); // El cambio se aplica en el siguiente escaneo
  
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