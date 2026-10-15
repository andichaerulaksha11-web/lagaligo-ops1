const { verify } = require('./_auth');
const dbUrl = require('./_db');
const CABANG = ['Makassar', 'Garongkong', 'Siawung'];

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!dbUrl) {
    if (req.method === 'GET') return res.status(200).json({ mode: 'readonly', rows: [] });
    return res.status(503).json({ error: 'Database belum terhubung. Hubungkan database Neon di Vercel (lihat README).' });
  }
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(dbUrl);
  try {
    await sql`CREATE TABLE IF NOT EXISTS master_volume (
      bulan text NOT NULL, cabang text NOT NULL, target float8, realisasi float8, PRIMARY KEY (bulan, cabang))`;

    if (req.method === 'GET') {
      const rows = await sql`SELECT bulan, cabang, target, realisasi FROM master_volume ORDER BY bulan, cabang`;
      return res.status(200).json({ mode: 'db', rows });
    }
    if (!verify(req.headers['x-auth-token'])) return res.status(401).json({ error: 'Sesi login berakhir. Silakan login ulang.' });

    if (req.method === 'POST') {
      const b = req.body || {};
      const target = Number(b.target);
      const real = b.realisasi === null || b.realisasi === '' || b.realisasi === undefined ? null : Number(b.realisasi);
      if (!/^\d{4}-\d{2}$/.test(b.bulan || '') || !CABANG.includes(b.cabang) || !(target >= 0) || (real !== null && !(real >= 0)))
        return res.status(400).json({ error: 'Data tidak valid. Periksa bulan, cabang, target, dan realisasi.' });
      await sql`INSERT INTO master_volume (bulan, cabang, target, realisasi) VALUES (${b.bulan}, ${b.cabang}, ${target}, ${real})
                ON CONFLICT (bulan, cabang) DO UPDATE SET target = EXCLUDED.target, realisasi = EXCLUDED.realisasi`;
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
};
