
import { neon } from '@neondatabase/serverless';

export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  return neon(url);
}

function requestOrigin(req) {
  return String(req?.headers?.origin || '').trim();
}

function ownOrigin(req) {
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim();
  const proto = String(req?.headers?.['x-forwarded-proto'] || (req?.socket?.encrypted ? 'https' : 'http')).split(',')[0].trim();
  return host ? `${proto}://${host}` : '';
}

export function originAllowed(req) {
  const origin = requestOrigin(req);
  if (!origin) return true;
  const configured = String(process.env.CEPHEPRO_ALLOWED_ORIGINS || '')
    .split(',').map((value) => value.trim().replace(/\/+$/, '')).filter(Boolean);
  return origin === ownOrigin(req) || configured.includes(origin.replace(/\/+$/, ''));
}

export function noStore(req,res) {
  const origin = requestOrigin(req);
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Vary', 'Origin');
  if (origin && originAllowed(req)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Project-Token');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  return originAllowed(req);
}

export function bearer(req) {
  const raw = String(req.headers.authorization || '');
  return raw.toLowerCase().startsWith('bearer ') ? raw.slice(7).trim() : '';
}
