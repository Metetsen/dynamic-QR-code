import postgres from 'postgres';
import { waitUntil } from '@vercel/functions';
import { createHash } from 'node:crypto';

const sql = postgres(process.env.DATABASE_URL);

async function getLink(id) {
  // Consulta directa a Supabase
  const rows = await sql`SELECT destino, activo FROM qr_links WHERE id = ${id}`;
  return rows[0] ?? null;
}

function decodificarSeguro(texto) {
  if (!texto) return null;
  try { return decodeURIComponent(texto); } catch { return texto; }
}

async function logScan(id, req) {
  const ip = (req.headers.get('x-vercel-forwarded-for') || req.headers.get('x-forwarded-for') || '0.0.0.0').split(',')[0].trim();
  const salt = process.env.IP_SALT || 'salt-por-defecto-insegura'; 
  const ipHash = createHash('sha256').update(ip + salt).digest('hex');
  const ua = (req.headers.get('user-agent') || '').slice(0, 300);
  const pais = (req.headers.get('x-vercel-ip-country') || '').slice(0, 2);
  const ciudadRaw = req.headers.get('x-vercel-ip-city') || '';
  const ciudad = decodificarSeguro(ciudadRaw)?.slice(0, 100) || null;

  await sql`
    INSERT INTO qr_scans (qr_id, ip_hash, pais, ciudad, user_agent)
    VALUES (${id}, ${ipHash}, ${pais || null}, ${ciudad}, ${ua})`;
}

export async function GET(req) {
  const id = new URL(req.url).searchParams.get('id');
  
  if (!id || !/^[\w-]+$/.test(id)) {
     const fallback = process.env.FALLBACK_URL || 'https://github.com/Metetsen';
     return new Response(null, {
       status: 302,
       headers: { Location: fallback, 'Cache-Control': 'no-store' },
     });
  }

  const link = await getLink(id);

  if (link) {
    waitUntil(logScan(id, req).catch(err => console.error('Error analíticas:', err)));
  }

  const destino = link?.activo ? link.destino : (process.env.FALLBACK_URL || 'https://github.com/Metetsen');
  
  return new Response(null, {
    status: 302,
    headers: { Location: destino, 'Cache-Control': 'no-store' },
  });
}