/* =========================
 Alloy Horizon V0.0.7
 Core System
========================= */

const VERSION = "V0.0.7";

/* ---------- State ---------- */
const S = {
  player: {
    hpMax: 100,
    hp: 100,
    mpMax: 50,
    mp: 50,
    cohMax: 100,
    coh: 30,
    exeMax: 100,
    exe: 0,
    equips: {
      weaponL: null,
      weaponR: null,
      head: null,
      body: null,
      arms: null,
      legs: null,
      acc1: null,
      acc2: null,
    },
    bag: [],
  },
  catalog: {
    equipment: null,
    weapon: null,
    sets: null,
    dropShop: null,
  },
  battle: {
    burst: { active: false, turns: 0 },
    log: [],
  },
};

/* ---------- Utils ---------- */
const el = (id) => document.getElementById(id);
const log = (t) => {
  el("log").textContent += t + "\n";
  el("log").scrollTop = 99999;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- Catalog Load ---------- */
async function loadCatalogs() {
  const files = [
    ["equipment.json", "equipment"],
    ["weapon.json", "weapon"],
    ["set_bonus.json", "sets"],
    ["drop_and_shop.json", "dropShop"],
  ];
  for (const [file, key] of files) {
    const res = await fetch(`catalogs/${file}`);
    S.catalog[key] = await res.json();
  }
}

/* ---------- Render ---------- */
function renderBars() {
  el("hpBar").style.width = (S.player.hp / S.player.hpMax) * 100 + "%";
  el("mpBar").style.width = (S.player.mp / S.player.mpMax) * 100 + "%";
  el("cohBar").style.width = (S.player.coh / S.player.cohMax) * 100 + "%";
  el("exeBar").style.width = (S.player.exe / S.player.exeMax) * 100 + "%";
}

function renderEquip() {
  const grid = el("equipGrid");
  grid.innerHTML = "";
  const slots = [
    "weaponL",
    "weaponR",
    "head",
    "body",
    "arms",
    "legs",
    "acc1",
    "acc2",
  ];
  for (const s of slots) {
    const it = S.player.equips[s];
    const d = document.createElement("div");
    d.textContent = `${s}：${it ? it.name : "（空）"}`;
    grid.appendChild(d);
  }
  renderSetProgress();
}

function renderSetProgress() {
  const box = el("setProgress");
  box.innerHTML = "";
  const items = Object.values(S.player.equips).filter(Boolean);
  const countBySet = {};
  for (const it of items) {
    if (!it.set) continue;
    countBySet[it.set] = (countBySet[it.set] || 0) + 1;
  }
  for (const setId in countBySet) {
    const set = S.catalog.sets[setId];
    const cnt = countBySet[setId];
    const d = document.createElement("div");
    d.textContent = `${set.name}：${cnt}/${set.pieces.length}（2件/4件）`;
    box.appendChild(d);
  }
}

function render() {
  renderBars();
  renderEquip();
}

/* ---------- Battle ---------- */
function attack() {
  log("你發動攻擊");
  S.player.exe = clamp(S.player.exe + 5, 0, S.player.exeMax);
  renderBars();
}

function startBurst() {
  if (S.player.coh < 40) {
    log("同心率不足，無法爆發");
    return;
  }
  S.player.coh -= 40;
  S.battle.burst.active = true;
  S.battle.burst.turns = 3;
  log("🔥 機體爆發啟動！");
  renderBars();
}

/* ---------- UI ---------- */
function wireUI() {
  document.querySelectorAll(".tabs button").forEach((btn) => {
    btn.onclick = () => {
      document
        .querySelectorAll(".tabs button")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document
        .querySelectorAll(".panel")
        .forEach((p) => p.classList.add("hidden"));
      el("panel-" + btn.dataset.sub).classList.remove("hidden");
    };
  });

  el("btnAttack").onclick = attack;
  el("btnBurst").onclick = startBurst;

  el("btnGear").onclick = () => el("gearModal").classList.remove("hidden");
  el("btnCloseGear").onclick = () =>
    el("gearModal").classList.add("hidden");

  el("btnSave").onclick = () =>
    localStorage.setItem("AH_SAVE", btoa(JSON.stringify(S)));

  el("btnLoad").onclick = () => {
    const s = localStorage.getItem("AH_SAVE");
    if (!s) return;
    Object.assign(S, JSON.parse(atob(s)));
    render();
  };

  el("btnExport").onclick = () => {
    const a = document.createElement("a");
    a.href =
      "data:application/json;base64," + btoa(JSON.stringify(S));
    a.download = "save.json";
    a.click();
  };

  el("btnImport").onclick = () => {
    const f = el("importFile").files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      Object.assign(
        S,
        JSON.parse(atob(r.result.split(",")[1]))
      );
      render();
    };
    r.readAsDataURL(f);
  };
}

/* ---------- Init ---------- */
(async function init() {
  await loadCatalogs();
  wireUI();
  render();
  log(`系統啟動 ${VERSION}`);
})();
