import { neon } from '@neondatabase/serverless';
import { Redis } from '@upstash/redis';
import { waitUntil } from '@vercel/functions';
import { createHash } from 'node:crypto';

const sql = neon(process.env.DATABASE_URL);
const redis = Redis.fromEnv();
const TTL = 300; 

async function getLink(id) {
  const key = `link:${id}`;
  const cached = await redis.get(key);
  if (cached) return cached;

  const rows = await sql`SELECT destino, activo FROM qr_links WHERE id = ${id}`;
  const link = rows[0] ?? null;
  
  if (link) await redis.set(key, link, { ex: TTL });
  return link;
}

// Función segura para decodificar texto
function decodificarSeguro(texto) {
  if (!texto) return null;
  try {
    return decodeURIComponent(texto);
  } catch {
    return texto; // Devuelve el original si la decodificación falla
  }
}

async function logScan(id, req) {
  // Manejo más seguro de la IP (evitar suplantación básica)
  const ip = (req.headers.get('x-vercel-forwarded-for') || req.headers.get('x-forwarded-for') || '0.0.0.0').split(',')[0].trim();
  
  // Garantizar que siempre haya una "sal" (salt) para el hash, evitando errores en el servidor
  const salt = process.env.IP_SALT || 'salt-por-defecto-insegura'; 
  const ipHash = createHash('sha256').update(ip + salt).digest('hex');
  
  const ua = (req.headers.get('user-agent') || '').slice(0, 300);
  const pais = (req.headers.get('x-vercel-ip-country') || '').slice(0, 2); // Código ISO país
  const ciudadRaw = req.headers.get('x-vercel-ip-city') || '';
  const ciudad = decodificarSeguro(ciudadRaw)?.slice(0, 100) || null; // Limitar longitud

  await sql`
    INSERT INTO qr_scans (qr_id, ip_hash, pais, ciudad, user_agent)
    VALUES (${id}, ${ipHash}, ${pais || null}, ${ciudad}, ${ua})`;
}

export async function GET(req) {
  const id = new URL(req.url).searchParams.get('id');
  
  // VALIDACIÓN CRÍTICA: Bloquear basura antes de consultar DB o Redis
  if (!id || !/^[\w-]+$/.test(id)) {
     // Redirigir a fallback o mostrar error sin procesar nada
     const fallback = process.env.FALLBACK_URL || 'https://tu-sitio.com';
     return new Response(null, {
       status: 302,
       headers: { Location: fallback, 'Cache-Control': 'no-store' },
     });
  }

  const link = await getLink(id);

  if (link) {
    waitUntil(logScan(id, req).catch(err => {
      // Opcional: Console.error para detectar fallos en la BD sin afectar al usuario
      console.error('Error guardando analíticas:', err);
    }));
  }

  const destino = link?.activo ? link.destino : (process.env.FALLBACK_URL || 'https://tu-sitio.com');
  
  return new Response(null, {
    status: 302,
    headers: { Location: destino, 'Cache-Control': 'no-store' },
  });
}