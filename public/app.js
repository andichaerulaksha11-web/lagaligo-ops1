const {nf, rp, monthLabel, sum} = Core;
const NAVY = '#204685', SOFT = '#a9b9d8', RED = '#D9252A';
const S = {rows: [], voy: [], month: null, year: null, mode: 'db', charts: {}, token: sessionStorage.getItem('tk') || '', tab: 'xls'};
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const EMPTY = '<div class="card"><p class="empty">Belum ada data. Admin dapat mengunggah data melalui menu <b>Input Data</b>.</p></div>';

async function load() {
  const r = await fetch('/api/records'); const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Gagal memuat data');
  S.rows = j.rows; S.mode = j.mode; S.voy = Core.buildVoyages(S.rows);
  const ms = Core.months(S.rows);
  if (!S.month || !ms.includes(S.month)) S.month = ms[ms.length - 1] || null;
  const ys = [...new Set(ms.map(m => m.slice(0, 4)))];
  S.cur = ys[ys.length - 1] || null;
  if (!S.year || !ys.includes(S.year)) S.year = ys[ys.length - 1] || null;
}

function filterBar(title, subtitle) {
  const opts = Core.months(S.rows).map(m => `<option value="${m}" ${m === S.month ? 'selected' : ''}>${monthLabel(m, 1)}</option>`).join('');
  return `<div class="bar"><div><h1>${title}</h1><p class="sub">${subtitle}</p></div>
    <label class="mf">Bulan <select id="mf">${opts}</select></label></div>`;
}
function bindFilter() { $('#mf').onchange = e => { S.month = e.target.value; render(); }; }
function drawChart(id, cfg) { if (S.charts[id]) S.charts[id].destroy(); S.charts[id] = new Chart($('#' + id), cfg); }

const wrap = (s, w = 14) => { const out = []; s.split(' - ').forEach(p => { let l = ''; p.split(' ').forEach(x => { if (l && (l + ' ' + x).length > w) { out.push(l); l = x; } else l = (l + ' ' + x).trim(); }); if (l) out.push(l); }); return out; };
// angka Volume Awal / Realisasi (+ persen) selalu tampil di atas batang
const lblPlugin = {id: 'lbl', afterDatasetsDraw(ch, a, o) {
  if (!o) return; const c = ch.ctx; c.save(); c.textAlign = 'center';
  [0, 1].forEach(d => ch.getDatasetMeta(d).data.forEach((b, i) => { const v = o.v[d][i]; if (v == null) return; let y = b.y - 6;
    if (d === 1 && o.p && o.p[i] != null) { c.font = '600 11px system-ui'; c.fillStyle = NAVY; c.fillText('(' + nf(o.p[i], 1) + '%)', b.x, y); y -= 13; }
    c.font = 'bold 11px system-ui'; c.fillStyle = d ? NAVY : '#4a5f86'; c.fillText(nf(Math.trunc(v)), b.x, y); }));
  c.restore(); }};
// nama kapal tebal, info kegiatan tipis di bawah sumbu X
const namePlugin = {id: 'names', afterDraw(ch, a, o) {
  if (!o) return; const c = ch.ctx; c.save(); c.textAlign = 'center';
  o.items.forEach((it, i) => { const x = ch.scales.x.getPixelForTick(i); let y = ch.chartArea.bottom + 18;
    c.font = 'bold 12px system-ui'; c.fillStyle = '#1c2740'; it.name.forEach(l => { c.fillText(l, x, y); y += 15; });
    c.font = '300 11px system-ui'; c.fillStyle = '#6b7a96'; it.info.forEach(l => { c.fillText(l, x, y); y += 13; }); });
  c.restore(); }};
const valPlugin = {id: 'val', afterDatasetsDraw(ch, a, o) {
  const fm = (o && o.f) || rp; const c = ch.ctx; c.save(); c.textAlign = 'center'; c.font = '600 11px system-ui'; c.fillStyle = NAVY;
  ch.getDatasetMeta(0).data.forEach((b, i) => { const v = ch.data.datasets[0].data[i]; if (v) c.fillText(fm(v), b.x, b.y - 6); }); c.restore(); }};

const chartBox = (id, n, h) => `<div class="scroll"><div style="min-width:${Math.max(n * 140, 320)}px;height:${h}px"><canvas id="${id}"></canvas></div></div>`;
function lokasiHtml(pre, ships) {
  const k = ships.filter(s => !s.gudang), g = ships.filter(s => s.gudang);
  return (k.length ? chartBox(pre + '_s', k.length, 500) : '<p class="empty">Tidak ada kegiatan kapal pada bulan ini.</p>') +
    (g.length ? '<h3>Gudang / Silo</h3>' + chartBox(pre + '_g', g.length, 400) : '');
}
function lokasiDraw(pre, ships) {
  const k = ships.filter(s => !s.gudang), g = ships.filter(s => s.gudang);
  const mk = (list, infoOf, ds, pct) => {
    const items = list.map(s => ({name: wrap(s.label, 16), info: infoOf(s)}));
    const bottom = Math.max(...items.map(i => i.name.length * 15 + i.info.length * 13)) + 26;
    return {responsive: true, maintainAspectRatio: false, interaction: {mode: 'index', intersect: false}, layout: {padding: {top: 44, bottom}},
      scales: {y: {beginAtZero: true, title: {display: true, text: 'Ton'}, ticks: {callback: v => nf(v)}}, x: {grid: {display: false}, ticks: {display: false}}},
      datasets: {bar: {barPercentage: 1, categoryPercentage: .8, borderRadius: 3}},
      plugins: {lbl: {v: [list.map(s => ds[0](s)), list.map(s => ds[1](s))], p: pct}, names: {items}}};
  };
  if (k.length) { const o = mk(k, s => wrap(s.jenis + ' · ' + s.material, 24), [s => s.awal, s => s.real], k.map(s => s.pct));
    o.plugins.tooltip = {callbacks: {title: i => k[i[0].dataIndex].label, label: c => ` ${c.dataset.label}: ${nf(c.parsed.y, 2)}`,
      afterBody: i => { const s = k[i[0].dataIndex]; return [`${s.jenis} · ${s.material}`, `Progress: ${s.pct == null ? '-' : nf(s.pct, 1) + '%'}`, `Realisasi bulan ini: ${nf(s.bln, 2)}`, `Sisa: ${nf(s.sisa, 2)} · ${s.status}`]; }}};
    drawChart(pre + '_s', {type: 'bar', plugins: [lblPlugin, namePlugin], data: {labels: k.map(s => s.label), datasets: [
      {label: 'Volume Awal (ton)', data: k.map(s => s.awal), backgroundColor: SOFT}, {label: 'Realisasi (ton)', data: k.map(s => s.real), backgroundColor: NAVY}]}, options: o}); }
  if (g.length) { const o = mk(g, s => wrap(s.material, 24), [s => s.akhir, s => s.real], null);
    o.plugins.tooltip = {callbacks: {title: i => g[i[0].dataIndex].label, label: c => ` ${c.dataset.label}: ${nf(c.parsed.y, 2)}`}};
    drawChart(pre + '_g', {type: 'bar', plugins: [lblPlugin, namePlugin], data: {labels: g.map(s => s.label), datasets: [
      {label: 'Volume Akhir (ton)', data: g.map(s => s.akhir), backgroundColor: SOFT}, {label: 'Realisasi (ton)', data: g.map(s => s.real), backgroundColor: NAVY}]}, options: o}); }
}

const yearOpts = () => [...new Set(Core.months(S.rows).map(m => m.slice(0, 4)))].map(y => `<option ${y === S.year ? 'selected' : ''}>${y}</option>`).join('');
const bindYears = () => document.querySelectorAll('.yf').forEach(e => e.onchange = ev => { S.year = ev.target.value; render(); });
const trendCard = (id, title, sub) => `<div class="card"><div class="bar" style="margin-bottom:8px"><div><h2>${title}</h2><p class="sub" style="margin:0">${sub}</p></div>
  <label class="mf">Tahun <select class="yf">${yearOpts()}</select></label></div><div class="chart" style="height:320px"><canvas id="${id}"></canvas></div></div>`;
function rateChart(id, lokasi) {
  drawChart(id, {type: 'line', plugins: [valPlugin], data: {labels: Array.from({length: 12}, (_, i) => monthLabel(`${S.year}-${String(i + 1).padStart(2, '0')}`).slice(0, 3)),
    datasets: [{label: 'Rata-rata Loading Rate', data: Core.monthlyRate(S.rows, lokasi, S.year), borderColor: NAVY, backgroundColor: NAVY, borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#fff', pointBorderColor: NAVY, pointBorderWidth: 2, tension: .25}]},
    options: {responsive: true, maintainAspectRatio: false, layout: {padding: {top: 24}}, scales: {y: {beginAtZero: true, title: {display: true, text: 'Ton / jam'}}},
      plugins: {legend: {display: false}, val: {f: v => nf(v, 1)}, tooltip: {callbacks: {label: c => ` Rata-rata: ${nf(c.parsed.y, 2)} ton/jam`}}}}});
}

function shipTable(ships) {
  if (!ships.length) return '';
  return `<div class="wrap"><table><tr><th>Kapal / Gudang</th><th>Jenis</th><th>Material</th><th class="n">Volume Awal</th><th class="n">Realisasi</th><th class="n">Progress</th><th class="n">Sisa / Vol. Akhir</th><th class="n">Revenue</th><th>Status</th></tr>` +
    ships.map(s => `<tr><td>${esc(s.label)}</td><td>${s.gudang ? '-' : s.jenis}</td><td>${esc(s.material)}</td><td class="n">${nf(s.awal, 2)}</td><td class="n">${nf(s.real, 2)}</td>
      <td class="n">${s.pct == null ? '-' : nf(s.pct, 1) + '%'}</td><td class="n">${nf(s.gudang ? s.akhir : s.sisa, 2)}</td><td class="n">${rp(s.revenue)}</td>
      <td><span class="tag ${s.status === 'Berjalan' ? 'run' : ''}">${s.status}</span>${s.anomali ? ' <span class="tag warn" title="Realisasi melebihi volume awal — periksa data sumber">Cek data</span>' : ''}</td></tr>`).join('') + '</table></div>';
}

function pageSummary() {
  if (!S.month) { $('#app').innerHTML = '<div class="bar"><h1>Executive Summary</h1></div>' + EMPTY; return; }
  const mk = Core.shipsFor(S.voy, S.month, 'Makassar'), br = Core.shipsFor(S.voy, S.month, 'Barru'), all = mk.concat(br);
  const rev = sum(all, s => s.revenue), ktn = all.filter(s => !s.gudang), run = ktn.filter(s => s.status === 'Berjalan').length;
  const years = [...new Set(Core.months(S.rows).map(m => m.slice(0, 4)))];
  $('#app').innerHTML = filterBar('Executive Summary', 'Ringkasan kegiatan bongkar-muat Makassar & Barru') + `
  <div class="grid g5" style="margin-bottom:16px">
    <div class="card kpi"><small>Revenue bulan ini</small><strong>${rp(rev)}</strong></div>
    <div class="card kpi"><small>Kapal beroperasi</small><strong>${ktn.length}</strong></div>
    <div class="card kpi"><small>Masih berjalan</small><strong>${run}</strong></div>
    <div class="card kpi"><small>Selesai</small><strong>${ktn.length - run}</strong></div>
    <div class="card kpi"><small>Rata-rata Loading Rate (${S.cur})</small><strong>${nf(Core.avgRate(S.rows, null, S.cur), 1)} <span style="font-size:13px;font-weight:500">ton/jam</span></strong></div></div>
  <div class="card"><h2>Lagaligo Makassar</h2><p class="sub">Volume awal vs realisasi (progress %) · ${monthLabel(S.month, 1)}</p>${lokasiHtml('mk', mk)}</div>
  <div class="card"><h2>Lagaligo Barru</h2><p class="sub">Volume awal vs realisasi (progress %) · ${monthLabel(S.month, 1)}</p>${lokasiHtml('br', br)}</div>
  ${trendCard('c_mon', 'Trend Revenue Bulanan', 'Total kolom Revenue per bulan (tidak terpengaruh filter bulan)')}
  ${trendCard('c_rate', 'Trend Rata-rata Loading Rate Bulanan', 'Makassar + Barru · ton/jam (tidak terpengaruh filter bulan)')}`;
  bindFilter(); bindYears();
  lokasiDraw('mk', mk); lokasiDraw('br', br); rateChart('c_rate', null);
  const mr = Object.fromEntries(Core.monthlyRevenue(S.rows).map(x => [x.m, x.v])), ms = Array.from({length: 12}, (_, i) => `${S.year}-${String(i + 1).padStart(2, '0')}`);
  drawChart('c_mon', {type: 'bar', plugins: [valPlugin], data: {labels: ms.map(m => monthLabel(m).slice(0, 3)), datasets: [
      {label: 'Revenue', data: ms.map(m => mr[m] || 0), backgroundColor: NAVY, borderRadius: 3, order: 2},
      {type: 'line', label: 'Trend', data: ms.map(m => mr[m] || null), borderColor: RED, backgroundColor: RED, borderWidth: 2, pointRadius: 3, order: 1}]},
    options: {responsive: true, maintainAspectRatio: false, layout: {padding: {top: 18}}, scales: {y: {beginAtZero: true, ticks: {callback: v => rp(v)}}},
      plugins: {legend: {display: false}, tooltip: {callbacks: {label: c => ` ${c.dataset.label}: ${rp(c.parsed.y)}`}}}}});
}

function pageLokasi(lokasi) {
  if (!S.month) { $('#app').innerHTML = `<div class="bar"><h1>Lagaligo ${lokasi}</h1></div>` + EMPTY; return; }
  const ships = Core.shipsFor(S.voy, S.month, lokasi), st = Core.maxStop(S.rows, S.month, lokasi);
  const tgl = d => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);
  const stopCard = `<div class="grid g4" style="margin-bottom:16px"><div class="card kpi span2" style="margin:0"><small>Stop Time Tertinggi · ${monthLabel(S.month, 1)}</small>` + (st ?
    `<strong>${st.row.stop} <span style="font-size:13px;font-weight:500">jam</span></strong><div style="margin-top:4px"><b>Alasan:</b> ${esc(st.row.remarks || '-')}</div><small style="margin-top:2px">${esc(st.row.kapal)} · ${tgl(st.row.start)}</small>` : '<strong>-</strong>') + '</div></div>';
  $('#app').innerHTML = filterBar('Lagaligo ' + lokasi, `Kegiatan bongkar-muat di pelabuhan ${lokasi} · ${monthLabel(S.month, 1)}`) + stopCard + `
  <div class="card"><h2>Volume Awal vs Realisasi per Kapal</h2><p class="sub">Satuan ton · angka % di dalam batang = progress realisasi terhadap volume awal</p>${lokasiHtml('x', ships)}</div>
  ${trendCard('c_rate', 'Trend Rata-rata Loading Rate Bulanan', `Lagaligo ${lokasi} · ton/jam (tidak terpengaruh filter bulan)`)}
  <div class="card"><h2>Rincian</h2>${shipTable(ships) || '<p class="empty">Tidak ada data.</p>'}</div>`;
  bindFilter(); bindYears(); lokasiDraw('x', ships); rateChart('c_rate', lokasi);
}

function pageLogin() {
  $('#app').innerHTML = `<div class="card login"><h1 style="margin-bottom:4px">Login Admin</h1><p class="sub">Khusus administrator untuk mengakses Input Data.</p>
    <div class="form"><div><label>Username</label><input id="lu" autocomplete="username"></div><div><label>Password</label><input id="lp" type="password" autocomplete="current-password"></div>
    <div><button id="lgo" style="width:100%">Masuk</button></div></div></div>`;
  const go = async () => {
    const r = await fetch('/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username: $('#lu').value.trim(), password: $('#lp').value})});
    const j = await r.json(); if (!r.ok) return alert(j.error || 'Login gagal');
    S.token = j.token; sessionStorage.setItem('tk', j.token); location.hash = '#/input';
  };
  $('#lgo').onclick = go; $('#lp').onkeydown = e => { if (e.key === 'Enter') go(); };
}
function logout() { S.token = ''; sessionStorage.removeItem('tk'); location.hash = '#/summary'; render(); }

/* ---------- INPUT DATA ---------- */
const fmtDT = d => { const t = new Date(d.getTime() + 30000), p = n => String(n).padStart(2, '0'); return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}`; };
const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
const toMin = s => { const m = /^(\d+):(\d+)/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : 0; };

async function send(method, body) {
  const r = await fetch('/api/records', {method, headers: {'Content-Type': 'application/json', 'x-auth-token': S.token}, body: JSON.stringify(body)});
  const j = await r.json();
  if (r.status === 401) { logout(); throw new Error(j.error || 'Sesi berakhir'); }
  if (!r.ok) throw new Error(j.error || 'Gagal'); return j;
}

function pageInput() {
  $('#app').innerHTML = `<div class="bar"><div><h1>Input Data</h1><p class="sub">Update data operasional Makassar & Barru (khusus admin)</p></div></div>
  ${S.mode === 'readonly' ? '<div class="note bad" style="margin-bottom:14px"><b>Database belum terhubung.</b> Data belum bisa disimpan. Hubungkan database Neon di Vercel (lihat README).</div>' : ''}
  <div class="tabs"><button data-t="xls" class="${S.tab === 'xls' ? '' : 'off'}">Upload Excel</button><button data-t="form" class="${S.tab === 'form' ? '' : 'off'}">Form Manual</button><button data-t="list" class="${S.tab === 'list' ? '' : 'off'}">Data Terbaru</button></div>
  <div id="tab"></div>`;
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { S.tab = b.dataset.t; pageInput(); });
  ({form: tabForm, xls: tabXls, list: tabList})[S.tab](false);
}

function tabForm(locked) {
  const names = [...new Set(S.rows.map(r => r.kapal))].sort(), mats = [...new Set(S.rows.map(r => r.material))].sort();
  $('#tab').innerHTML = `<div class="card"><h2>Tambah data per shift</h2><p class="sub">Volume, sisa, jam kerja, loading rate, dan revenue dihitung otomatis.</p>
  <div class="form">
    <div><label>Lokasi</label><select id="f_lok"><option>Makassar</option><option>Barru</option></select></div>
    <div><label>Nama Kapal / Gudang</label><input id="f_kapal" list="dl_k" placeholder="Ketik atau pilih…"><datalist id="dl_k">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>
    <div><label>Jenis</label><select id="f_jenis"><option>Muat</option><option>Bongkar</option></select></div>
    <div><label>Material</label><input id="f_mat" list="dl_m"><datalist id="dl_m">${mats.map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>
    <div><label>Volume (ton)</label><input id="f_vol" type="number" step="any"></div>
    <div><label>Tarif (Rp/ton)</label><input id="f_tarif" type="number" step="any"></div>
    <div><label>Start</label><input id="f_start" type="datetime-local"></div>
    <div><label>Finish</label><input id="f_fin" type="datetime-local"></div>
    <div><label>Stop Time (jj:mm)</label><input id="f_stop" value="00:00" placeholder="00:00"></div>
    <div><label>Realisasi (ton)</label><input id="f_real" type="number" step="any"></div>
    <div class="full"><label>Remarks</label><input id="f_rem"></div>
    <div class="full note" id="f_note">Pilih kapal untuk melihat status kegiatannya.</div>
    <div class="full calc" id="f_calc"></div>
    <div class="full"><button id="f_go" ${locked ? 'disabled' : ''}>Simpan Data</button></div>
  </div></div>`;
  const g = id => $('#' + id).value;
  const ctx = () => {
    const lok = g('f_lok'), kapal = g('f_kapal').trim(), gud = Core.isGudang(kapal);
    const v = S.voy.filter(x => x.lokasi === lok && x.kapal === kapal).sort((a, b) => a.rows[0].start.localeCompare(b.rows[0].start)).pop();
    return {lok, kapal, gud, v};
  };
  const calc = () => {
    const {gud} = ctx(), vol = +g('f_vol'), real = +g('f_real'), s = g('f_start'), f = g('f_fin');
    const wm = s && f ? Math.max((new Date(f) - new Date(s)) / 60000 - toMin(g('f_stop')), 0) : 0;
    const bal = gud ? vol + real : vol - real;
    $('#f_calc').innerHTML = `<div>Working Hour<b>${hhmm(wm)}</b></div><div>Loading Rate<b>${wm ? nf(real / (wm / 60), 2) : '-'} ton/jam</b></div><div>${gud ? 'Saldo' : 'Balance'}<b>${nf(bal, 2)}</b></div><div>Revenue<b>${rp(real * +g('f_tarif'))}</b></div>`;
  };
  const pick = () => {
    const {lok, kapal, gud, v} = ctx(); if (!kapal) return;
    const last = v && v.rows[v.rows.length - 1];
    if (v && (gud || !v.done)) {
      $('#f_jenis').value = v.jenis; $('#f_mat').value = v.material; $('#f_vol').value = +last.balance.toFixed(3);
      $('#f_note').textContent = gud ? `Gudang/silo: saldo terakhir ${nf(last.balance, 2)} ton.` : `Kegiatan lanjutan: sisa ${nf(last.balance, 2)} ton dari total ${nf(v.total, 2)} ton. Volume terisi otomatis.`;
    } else $('#f_note').textContent = v ? 'Kegiatan sebelumnya sudah selesai. Isi volume total untuk kegiatan baru.' : 'Kapal baru. Isi volume total (muatan awal).';
    const t = [...S.rows].reverse().find(r => r.lokasi === lok && r.jenis === g('f_jenis') && r.material.toLowerCase() === g('f_mat').trim().toLowerCase() && r.realisasi > 0);
    if (t) $('#f_tarif').value = Math.round(t.revenue / t.realisasi);
    calc();
  };
  ['f_kapal', 'f_lok'].forEach(i => $('#' + i).addEventListener('change', pick));
  ['f_jenis', 'f_mat'].forEach(i => $('#' + i).addEventListener('change', () => { const t = [...S.rows].reverse().find(r => r.lokasi === g('f_lok') && r.jenis === g('f_jenis') && r.material.toLowerCase() === g('f_mat').trim().toLowerCase()); if (t) $('#f_tarif').value = Math.round(t.revenue / t.realisasi); calc(); }));
  ['f_vol', 'f_tarif', 'f_start', 'f_fin', 'f_stop', 'f_real'].forEach(i => $('#' + i).addEventListener('input', calc)); calc();
  $('#f_go').onclick = async () => {
    const {lok, kapal, gud} = ctx(), vol = +g('f_vol'), real = +g('f_real');
    if (!kapal || !g('f_mat') || !g('f_start') || !g('f_fin') || !real || !g('f_tarif') || g('f_vol') === '') return alert('Lengkapi semua kolom wajib (kapal, material, volume, tarif, start, finish, realisasi).');
    if (g('f_fin') <= g('f_start')) return alert('Finish harus setelah Start.');
    const wm = Math.max((new Date(g('f_fin')) - new Date(g('f_start'))) / 60000 - toMin(g('f_stop')), 0);
    const row = {nomor: `INP-${lok === 'Makassar' ? 'MKS' : 'BRU'}-${g('f_start').replace(/\D/g, '')}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
      kapal, material: g('f_mat').trim(), jenis: g('f_jenis'), lokasi: lok, volume: vol, start: g('f_start'), finish: g('f_fin'), stop: g('f_stop') || '00:00', wh: hhmm(wm),
      realisasi: real, rate: wm ? +(real / (wm / 60)).toFixed(2) : 0, balance: +(gud ? vol + real : vol - real).toFixed(3), revenue: Math.round(real * +g('f_tarif')), remarks: g('f_rem') || null};
    try { $('#f_go').disabled = true; await send('POST', {rows: [row]}); await load(); alert('Data tersimpan.'); S.tab = 'list'; pageInput(); }
    catch (e) { alert(e.message); $('#f_go').disabled = false; }
  };
}

function tabXls(locked) {
  $('#tab').innerHTML = `<div class="card"><h2>Upload file Excel</h2><p class="sub">Gunakan format Data-PBM2026.xlsx (kolom: Nomor, Nama Kapal/Gudang, Material, Jenis, Volume, Start, Finish, Stop Time, Working Hour, Realisasi, Loading Rate, Balance, Revenue, Revenue MTD, Remarks). Lokasi dibaca dari kode Nomor: <b>RBM-MKS</b> = Makassar, <b>RBM-BRU</b> = Barru.</p>\n  <div class="row"><label><input type="radio" name="md" value="add" checked> Tambah baris baru saja (lewati yang sudah ada)</label><label><input type="radio" name="md" value="rep"> Ganti seluruh data dengan isi file ini</label></div>
  <input type="file" id="xf" accept=".xlsx,.xls,.csv"><div id="xp" style="margin-top:12px"></div>
  <p style="margin-top:18px"><button class="danger" id="xdel">Hapus Semua Data</button></p></div>`;
  $('#xdel').onclick = async () => { if (!confirm('Hapus SEMUA data di dashboard? Tindakan ini tidak bisa dibatalkan.')) return; try { await send('DELETE', {all: true}); await load(); alert('Semua data dihapus.'); pageInput(); } catch (e) { alert(e.message); } };
  $('#xf').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const wb = XLSX.read(await f.arrayBuffer(), {type: 'array', cellDates: true}), ws = wb.Sheets[wb.SheetNames[0]];
    const T = v => v instanceof Date ? hhmm(v.getUTCHours() * 60 + v.getUTCMinutes()) : typeof v === 'number' ? hhmm(Math.round(v * 1440)) : String(v ?? '00:00');
    const D = v => v instanceof Date ? fmtDT(v) : String(v || '').replace(' ', 'T').slice(0, 16);
    const rep = () => document.querySelector('input[name=md]:checked').value === 'rep';
    const have = new Set(rep() ? [] : S.rows.map(r => `${r.nomor}|${r.start}|${Math.round(r.volume)}`));
    let bad = 0, dup = 0; const add = [];
    XLSX.utils.sheet_to_json(ws, {raw: true, defval: null}).forEach(o => {
      const r = {}; Object.keys(o).forEach(k => r[k.trim().toLowerCase()] = o[k]);
      const nomor = String(r['nomor'] || ''), lk = String(r['lokasi'] || nomor.slice(4, 7)).toLowerCase();
      const lokasi = /barru|bru/.test(lk) ? 'Barru' : /makassar|mks/.test(lk) ? 'Makassar' : null;
      if (!r['nama kapal/gudang'] || !r['start'] || !lokasi || !['Muat', 'Bongkar'].includes(String(r['jenis']).trim())) return bad++;
      const row = {nomor, kapal: String(r['nama kapal/gudang']).split(/\s+/).join(' ').trim(), material: String(r['material'] || '').trim(), jenis: String(r['jenis']).trim(), lokasi,
        volume: +r['volume'], start: D(r['start']), finish: D(r['finish']), stop: T(r['stop time']), wh: T(r['working hour']), realisasi: +r['realisasi'], rate: +r['loading rate'] || 0,
        balance: +r['balance'], revenue: +r['revenue'] || 0, remarks: r['remarks'] || null};
      if (have.has(`${row.nomor}|${row.start}|${Math.round(row.volume)}`)) return dup++;
      add.push(row);
    });
    $('#xp').innerHTML = `<div class="note"><b>${add.length}</b> baris baru siap diimpor · ${dup} sudah ada (dilewati) · ${bad} dilewati (lokasi/kapal/tanggal tidak terbaca).</div>
      <p><button id="xgo" ${!add.length ? 'disabled' : ''}>${rep() ? 'Ganti semua data dengan' : 'Impor'} ${add.length} baris</button></p>`;
    $('#xgo').onclick = async () => { try { $('#xgo').disabled = true; if (rep() && !confirm('Seluruh data lama akan DIGANTI dengan isi file ini. Lanjutkan?')) { $('#xgo').disabled = false; return; } const j = await send('POST', {rows: add, replace: rep()}); await load(); alert(j.inserted + ' baris diimpor.'); pageInput(); } catch (er) { alert(er.message); } };
  };
}

function tabList(locked) {
  const last = [...S.rows].sort((a, b) => b.start.localeCompare(a.start) || b.id - a.id).slice(0, 20);
  $('#tab').innerHTML = `<div class="card"><h2>20 data terakhir</h2><p class="sub">Salah input? Hapus baris lalu input ulang.</p><div class="wrap"><table>
   <tr><th>Start</th><th>Lokasi</th><th>Kapal / Gudang</th><th>Jenis</th><th>Material</th><th class="n">Realisasi</th><th class="n">Balance</th><th class="n">Revenue</th><th></th></tr>` +
    last.map(r => `<tr><td>${r.start.replace('T', ' ')}</td><td>${r.lokasi}</td><td>${esc(r.kapal)}</td><td>${r.jenis}</td><td>${esc(r.material)}</td><td class="n">${nf(r.realisasi, 2)}</td><td class="n">${nf(r.balance, 2)}</td><td class="n">${rp(r.revenue)}</td>
     <td><button class="x" data-id="${r.id}" ${locked ? 'disabled' : ''}>Hapus</button></td></tr>`).join('') + '</table></div></div>';
  document.querySelectorAll('.x').forEach(b => b.onclick = async () => {
    if (!confirm('Hapus baris ini?')) return;
    try { await send('DELETE', {ids: [b.dataset.id]}); await load(); pageInput(); } catch (e) { alert(e.message); }
  });
}

/* ---------- ROUTER ---------- */
function render() {
  let p = (location.hash.replace('#/', '') || 'summary');
  if (p === 'input' && !S.token) { location.hash = '#/login'; return; }
  document.querySelectorAll('aside a').forEach(a => a.classList.toggle('on', a.dataset.p === p));
  $('#authbtn').textContent = S.token ? 'Logout' : 'Login';
  Object.values(S.charts).forEach(c => c.destroy()); S.charts = {};
  ({summary: pageSummary, makassar: () => pageLokasi('Makassar'), barru: () => pageLokasi('Barru'), input: pageInput, login: pageLogin}[p] || pageSummary)();
}
$('#authbtn').onclick = () => { if (S.token) logout(); else location.hash = '#/login'; };
window.addEventListener('hashchange', render);
load().then(render).catch(e => { $('#app').innerHTML = `<div class="note bad"><b>Gagal memuat data:</b> ${esc(e.message)}</div>`; });
