/* ================================================================
   SIPOL — Sistem Informasi Pelacakan
   Shared app engine: config, media store, audio, boot, utils
   ================================================================ */

const $ = (id) => document.getElementById(id);
const LS_KEY = "sipol_config";
const DB_NAME = "sipol_media";

const DEFAULT_CONFIG = {
  orgName: "POLDA",
  appName: "SISTEM INFORMASI PELACAKAN",
  subName: "KEPOLISIAN DAERAH RIAU",
  missionText: "MISSION COMPLETE",
  autoplay: true,
  soundOn: true,
  password: "poldariau123",
};

let CONFIG = { ...DEFAULT_CONFIG };

function loadConfig() {
  try {
    const s = localStorage.getItem(LS_KEY);
    if (s) CONFIG = { ...DEFAULT_CONFIG, ...JSON.parse(s) };
  } catch (e) {}
}
function saveConfig() {
  localStorage.setItem(LS_KEY, JSON.stringify(CONFIG));
}

/* ---------- IndexedDB media store (video, photo, sounds) ---------- */
const idb = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore("media");
      r.onsuccess = () => { idb.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  set(key, blob) {
    return new Promise((res, rej) => {
      const tx = idb.db.transaction("media", "readwrite");
      tx.objectStore("media").put(blob, key);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  },
  get(key) {
    return new Promise((res, rej) => {
      const r = idb.db.transaction("media").objectStore("media").get(key);
      r.onsuccess = async () => {
        if (r.result) return res(r.result);
        /* fallback: file default di folder media/ */
        const file = MEDIA_FILES[key];
        if (file) {
          try {
            const resp = await fetch(file);
            if (resp.ok) return res(await resp.blob());
          } catch (e) {}
        }
        res(null);
      };
      r.onerror = () => rej(r.error);
    });
  },
  del(key) {
    return new Promise((res, rej) => {
      const tx = idb.db.transaction("media", "readwrite");
      tx.objectStore("media").delete(key);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  },
};

/* Media keys */
const MEDIA = {
  VIDEO: "video",
  PHOTO: "photo",
  LOGO: "logo",
  SND_ALERT: "snd_alert",
  SND_BLIP: "snd_blip",
  SND_CHIME: "snd_chime",
};

/* Default media files — used when IndexedDB kosong */
const MEDIA_FILES = {
  video: "media/video.mp4",
  photo: "media/photo.png",
  logo: "media/logo.png",
  snd_alert: "media/snd_alert.mp3",
  snd_blip: "media/snd_blip.mp3",
  snd_chime: "media/snd_chime.mp3",
};

/* ---------- Audio engine ---------- */
let audioCtx = null;
const audioUrlCache = {};

/* Invalidate cache — admin upload/hapus media */
function clearMediaUrlCache() {
  for (const k in audioUrlCache) {
    try { URL.revokeObjectURL(audioUrlCache[k]); } catch (e) {}
    delete audioUrlCache[k];
  }
}

async function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") await audioCtx.resume();
}

async function getMediaUrl(key) {
  if (audioUrlCache[key]) return audioUrlCache[key];
  const blob = await idb.get(key);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  audioUrlCache[key] = url;
  return url;
}

async function playSoundFile(key) {
  const url = await getMediaUrl(key);
  if (!url) return false;
  const a = new Audio(url);
  a.volume = 1;
  await a.play().catch(() => {});
  return true;
}

/* Web Audio fallbacks (used when no sound file uploaded) */
function wa_blip(freq = 880, dur = 0.05, type = "sine", vol = 0.05) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + dur);
}

async function sndBlip(freq = 880) {
  if (!CONFIG.soundOn) return;
  initAudio();
  if (await playSoundFile(MEDIA.SND_BLIP)) return;
  wa_blip(freq, 0.05, "square", 0.03);
}
async function sndChime() {
  if (!CONFIG.soundOn) return;
  initAudio();
  if (await playSoundFile(MEDIA.SND_CHIME)) return;
  wa_blip(880, 0.12, "sine", 0.06);
  setTimeout(() => wa_blip(1320, 0.18, "sine", 0.05), 130);
}
async function sndAlert() {
  if (!CONFIG.soundOn) return;
  initAudio();
  if (await playSoundFile(MEDIA.SND_ALERT)) return;
  wa_blip(740, 0.35, "sine", 0.09);
  setTimeout(() => wa_blip(560, 0.45, "sine", 0.09), 380);
}

/* Alarm loop — bunyi "tit tit" tiada henti sampai direset */
let alarmTimer = null;
function startAlarmLoop() {
  if (alarmTimer) return;
  const tick = () => {
    if (!CONFIG.soundOn) return;
    if (!audioCtx) initAudio();
    wa_blip(740, 0.12, "square", 0.07);
    setTimeout(() => wa_blip(620, 0.12, "square", 0.07), 180);
  };
  tick();
  alarmTimer = setInterval(tick, 850);
}
function stopAlarmLoop() {
  if (alarmTimer) { clearInterval(alarmTimer); alarmTimer = null; }
}

/* ---------- Disclaimer typewriter ---------- */
const DISC_LINES = [
  "POLDA RIAU — SISTEM INFORMASI PELACAKAN",
  "Selamat datang. Aplikasi ini merupakan simulator edukasi yang dibuat untuk keperluan syuting film pendek dan edukasi masyarakat mengenai cara kerja sistem pelacakan.",
  "Seluruh data, identitas, alamat, dan nomor yang ditampilkan bersifat fiktif dan tidak mewakili individu maupun instansi yang sebenarnya.",
  "Dibuat oleh Ayogi Akbar, dipersembahkan untuk Polda Riau.",
];

function typeDisclaimer(done) {
  const wrap = $("disc-typed");
  const after = $("disc-after");
  if (!wrap) { if (done) done(); return; }
  const paras = DISC_LINES.map(() => {
    const p = document.createElement("p");
    wrap.appendChild(p);
    return p;
  });
  const cur = $("disc-cursor");
  let li = 0, ci = 0;
  if (cur && paras[0]) paras[0].appendChild(cur);
  const tick = () => {
    if (li >= DISC_LINES.length) {
      if (cur) cur.classList.add("done");
      if (after) after.classList.add("show");
      if (done) done();
      return;
    }
    const chars = [...DISC_LINES[li]];
    if (ci < chars.length) {
      paras[li].textContent += chars[ci];
      ci++;
      setTimeout(tick, 24);
    } else {
      li++;
      ci = 0;
      if (cur) {
        if (paras[li]) paras[li].appendChild(cur);
        else cur.classList.add("done");
      }
      setTimeout(tick, 420);
    }
  };
  tick();
}

/* ---------- Fullscreen toggle ---------- */
function initFullscreen() {
  const btn = document.getElementById("btn-fullscreen");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  });
  document.addEventListener("fullscreenchange", () => {
    btn.textContent = document.fullscreenElement ? "⛶" : "⛶";
    btn.style.color = document.fullscreenElement ? "var(--green)" : "var(--cyan)";
  });
}

/* ---------- Boot splash ---------- */
const BOOT_STEPS = [
  "Inisialisasi kernel sistem...",
  "Memverifikasi modul keamanan...",
  "Menghubungkan server pusat...",
  "Memuat database intelijen...",
  "Menyiapkan modul pelacakan...",
  "Sistem siap.",
];

function runBoot(done) {
  const fill = $("boot-fill");
  const status = $("boot-status");
  const splash = $("splash");
  if (!fill || !status || !splash) { if (done) done(); return; }

  let i = 0;
  const step = () => {
    if (i < BOOT_STEPS.length) {
      status.textContent = BOOT_STEPS[i];
      fill.style.width = Math.round(((i + 1) / BOOT_STEPS.length) * 100) + "%";
      i++;
      setTimeout(step, 350);
    } else {
      setTimeout(() => {
        splash.classList.add("done");
        setTimeout(() => { splash.style.display = "none"; if (done) done(); }, 650);
      }, 300);
    }
  };
  step();
}

/* ---------- Utils ---------- */
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[c]));
}

function fmtTime() {
  return new Date().toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta", hour12: false,
  });
}
function fmtTimestamp() {
  return new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta", hour12: false,
  }) + " WIB";
}

/* NIK generator — deterministic from name, 16 digit, format prov/kab/kec/dob/urut */
function generateNIK(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  }
  const rand = (n) => (Math.abs(Math.sin(hash + n) * 1e6) % n);
  const prov = "14"; /* Riau */
  const kab = String(Math.floor(rand(90))).padStart(2, "0");
  const kec = String(Math.floor(rand(20))).padStart(2, "0");
  const dd = String(1 + Math.floor(rand(28))).padStart(2, "0");
  const mm = String(1 + Math.floor(rand(12))).padStart(2, "0");
  const yy = String(60 + Math.floor(rand(45)));
  const urut = String(1 + Math.floor(rand(999))).padStart(4, "0");
  return `${prov}${kab}${kec}${dd}${mm}${yy}${urut}`;
}

/* Pekerjaan random */
const PEKERJAAN = [
  "KARYAWAN SWASTA", "WIRAUSAHA", "PNS", "GURU", "SOPIR",
  "PEDAGANG", "TEKNISI", "BURUH HARIAN LEPAS", "PETANI", "NELAYAN",
  "GURU HONORER", "KARYAWAN BUMN", "PENJAGA TOKO", "MEKANIK",
];
function pekerjaanFromNIK(nik) {
  if (!nik || nik.length < 6) return "—";
  return PEKERJAAN[Math.abs(nik.charCodeAt(7) * 37 + nik.charCodeAt(11) * 11) % PEKERJAAN.length];
}

/* No telepon — +62 838-83xx-xxxx sensor */
function phoneFromNIK(nik) {
  if (!nik || nik.length < 6) return "—";
  const d4 = String(Math.abs(nik.charCodeAt(4) * 5011 + nik.charCodeAt(9) * 103) % 10000).padStart(4, "0");
  return `+6283883${d4}****`;
}

/* NIK sensor — tengah jadi asterisk: 3171**********1234 */
function sensorNIK(nik) {
  if (!nik) return "—";
  if (nik.length < 8) return nik[0] + "*".repeat(Math.max(1, nik.length - 2)) + nik[nik.length - 1];
  if (nik.length < 16) return nik.slice(0, 3) + "*".repeat(nik.length - 6) + nik.slice(-3);
  return nik.slice(0, 4) + "**********" + nik.slice(14);
}

/* TTL dari NIK: digit 7-12 = DDMMYY */
function ttlFromNIK(nik) {
  if (!nik || nik.length < 12) return "—";
  const dd = nik.slice(6, 8);
  const mm = nik.slice(8, 10);
  const yy = nik.slice(10, 12);
  const months = ["JANUARI","FEBRUARI","MARET","APRIL","MEI","JUNI",
    "JULI","AGUSTUS","SEPTEMBER","OKTOBER","NOVEMBER","DESEMBER"];
  const m = parseInt(mm, 10);
  if (m < 1 || m > 12 || !parseInt(dd, 10)) return "—";
  return `${parseInt(dd, 10)} ${months[m - 1]} 19${yy}`;
}

/* Alamat palsu — domisili Pekanbaru, Riau */
const JALAN_PEKANBARU = [
  "JL. SUDIRMAN", "JL. DIPONEGORO", "JL. CUT NYAK DHIEN", "JL. GAJAH MADA",
  "JL. TENGKU RIZAL NURDIN", "JL. HR. SUBRANTAS", "JL. SOEPRAPTO", "JL. PELITA",
  "JL. KUARA", "JL. TANJUNGPURA", "JL. KANTOR POS", "JL. MEDAN",
  "JL. PERINTIS KEMERDEKAAN", "JL. SAWI", "JL. MORO", "JL. ARIFIN AHMAD",
];
const KEC_PEKANBARU = [
  "SUKAJADI", "SENAPELAN", "TAMPA", "PAYUNG SEKAKI", "TENAYAN RAYA",
  "MARPOYAN", "SAIL", "LANGSAT", "RUMBAI TIMUR", "RUMBAI BARAT",
  "BUNGAN", "LIMA PULUH", "PEKANBARU KOTA", "SINTONG",
];
function alamatFromNIK(nik) {
  if (!nik || nik.length < 6) return "—";
  const j = Math.abs(nik.charCodeAt(3) * 31) % JALAN_PEKANBARU.length;
  const k = Math.abs(nik.charCodeAt(5) * 17 + nik.charCodeAt(9) * 7) % KEC_PEKANBARU.length;
  const no = Math.abs(nik.charCodeAt(2) * 7919) % 190 + 10;
  const rt = String(Math.abs(nik.charCodeAt(1) * 13) % 10 + 1).padStart(2, "0");
  const rw = String(Math.abs(nik.charCodeAt(6) * 29) % 10 + 1).padStart(2, "0");
  return `${JALAN_PEKANBARU[j]} NO. ${no}, RT.${rt}/RW.${rw}, KEC. ${KEC_PEKANBARU[k]}, PEKANBARU, RIAU`;
}

/* Apply org branding from config to shell elements */
function applyBranding() {
  document.querySelectorAll("[data-org]").forEach((el) => el.textContent = CONFIG.orgName);
  document.querySelectorAll("[data-app]").forEach((el) => el.textContent = CONFIG.appName);
  document.querySelectorAll("[data-sub]").forEach((el) => el.textContent = CONFIG.subName);
  document.title = CONFIG.appName + " — " + CONFIG.orgName;
}

/* Clock */
function startClock() {
  const el = $("clock");
  if (!el) return;
  const tick = () => { el.textContent = fmtTime(); };
  tick();
  setInterval(tick, 1000);
}

/* Common init for pages */
async function sipolInit(done) {
  loadConfig();
  applyBranding();
  startClock();
  initFullscreen();
  try { await idb.open(); } catch (e) {}
  runBoot(done);
}
