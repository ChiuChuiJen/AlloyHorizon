// =====================
// Mecha RPG V0.0.1
// =====================

// ---- Versioning ----
const VERSION = "V0.0.1";

// 版本遞增規則：VMAJOR.MINOR.PATCH；PATCH 0~9，超過進位到 MINOR
function bumpVersion(ver) {
  // accepts "V0.0.9" or "0.0.9"
  const v = ver.startsWith("V") ? ver.slice(1) : ver;
  const [maj, min, pat] = v.split(".").map(n => Number(n));
  let M = maj, m = min, p = pat + 1;
  if (p >= 10) { p = 0; m += 1; }
  // 你若未來要 m>=10 進位到 M，也可加：if (m>=10){m=0;M+=1;}
  return `V${M}.${m}.${p}`;
}

// ---- Changelog ----
const CHANGELOG = [
  {
    version: "V0.0.1",
    date: "2026-01-08",
    notes: [
      "建立網頁式機甲RPG骨架：戰鬥、掉寶、裝備、等級/經驗",
      "加入 HP/MP/能量/同步率(EXE) 與技能/EXE爆發",
      "加入存檔/讀檔、JSON/Base64 匯入匯出、版本更新視窗（近三筆）"
    ]
  }
  // 之後更新就往這裡 push 新物件；版本號可用 bumpVersion(前一版)
];

// ---- Game Data ----
const EQUIP_SLOTS = [
  { key: "head", label: "頭" },
  { key: "body", label: "身體" },
  { key: "lhand", label: "左手" },
  { key: "rhand", label: "右手" },
  { key: "legs", label: "腳" },
  { key: "acc1", label: "配件1" },
  { key: "acc2", label: "配件2" },
  { key: "acc3", label: "配件3" },
];

const RARITY = [
  { key: "N",  name: "一般",   mult: 1.0 },
  { key: "R",  name: "稀有",   mult: 1.25 },
  { key: "SR", name: "超稀有", mult: 1.55 },
  { key: "UR", name: "究極",   mult: 1.95 },
];

function newGameState() {
  return {
    meta: {
      version: VERSION,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    player: {
      lv: 1,
      xp: 0,
      gold: 0,
      // base stats
      base: { atk: 10, def: 5, crit: 0.05, acc: 0.90 },
      // resources
      hp: 120, hpMax: 120,
      mp: 40,  mpMax: 40,
      en: 50,  enMax: 50,
      exe: 0,  exeMax: 100,
      equips: {
        head: null, body: null, lhand: null, rhand: null, legs: null,
        acc1: null, acc2: null, acc3: null,
      },
      bag: [], // items
    },
    battle: {
      enemy: null,
      auto: false,
      log: [],
    }
  };
}

let S = loadOrInit();

// ---- Storage ----
const LS_KEY = "mecha_rpg_save_v001";

function saveLocal() {
  S.meta.updatedAt = Date.now();
  localStorage.setItem(LS_KEY, JSON.stringify(S));
  toast("已儲存到瀏覽器");
}

function loadLocal() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return false;
  try {
    const obj = JSON.parse(raw);
    S = obj;
    toast("已讀取存檔");
    return true;
  } catch {
    return false;
  }
}

function loadOrInit() {
  const ok = loadLocal();
  return ok ? S : newGameState();
}

// ---- Export/Import ----
function exportJSON() {
  const json = JSON.stringify(S);
  copyToClipboard(json);
  toast("JSON 已複製到剪貼簿");
}

function exportB64() {
  const json = JSON.stringify(S);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  copyToClipboard(b64);
  toast("Base64 已複製到剪貼簿");
}

function importFromText(text) {
  const t = (text || "").trim();
  if (!t) throw new Error("空內容");

  // Try JSON first
  if (t.startsWith("{") || t.startsWith("[")) {
    const obj = JSON.parse(t);
    return obj;
  }

  // Try Base64 -> JSON
  const json = decodeURIComponent(escape(atob(t)));
  const obj = JSON.parse(json);
  return obj;
}

// ---- Mechanics ----
function xpNeed(lv) {
  // V0.0.1 簡單曲線：每級需求稍微上升
  return Math.floor(100 + (lv - 1) * 60);
}

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function calcTotalStats() {
  const p = S.player;
  let atk = p.base.atk, def = p.base.def, crit = p.base.crit, acc = p.base.acc;

  for (const k of Object.keys(p.equips)) {
    const it = p.equips[k];
    if (!it) continue;
    atk += it.stats.atk || 0;
    def += it.stats.def || 0;
    crit += it.stats.crit || 0;
    acc += it.stats.acc || 0;
  }

  // 同步率(EXE) 可做微幅增益（示例）
  const exeBonus = (p.exe / 100) * 0.08; // +0~8% atk
  atk = Math.floor(atk * (1 + exeBonus));

  return { atk, def, crit, acc };
}

function rest() {
  const p = S.player;
  // 休息回復：HP/MP/能量（示例），EXE 小幅下降
  p.hp = clamp(p.hp + 35, 0, p.hpMax);
  p.mp = clamp(p.mp + 18, 0, p.mpMax);
  p.en = clamp(p.en + 20, 0, p.enMax);
  p.exe = clamp(p.exe - 5, 0, p.exeMax);
  log(`維修完成：HP/MP/能量回復，EXE略降`);
}

function spawnEnemy() {
  const p = S.player;
  const lv = clamp(p.lv + randInt(-1, +2), 1, 999);
  const hpMax = Math.floor(80 + lv * 45);
  S.battle.enemy = {
    name: pick(["偵察型無人機", "破城者機甲", "沙漠獵犬", "深海鋼鰭", "失控核心體"]),
    lv,
    hp: hpMax,
    hpMax,
    atk: Math.floor(8 + lv * 8),
    def: Math.floor(3 + lv * 5),
  };
  log(`遭遇敵人：${S.battle.enemy.name} Lv.${lv}`);
}

function attack(kind="basic") {
  const p = S.player;
  const e = S.battle.enemy;
  if (!e) { toast("沒有敵人，先點『遭遇敵人』"); return; }

  const st = calcTotalStats();
  const hit = Math.random() < st.acc;
  if (!hit) {
    log("你的攻擊落空！");
    enemyTurn();
    return;
  }

  let mult = 1.0;
  if (kind === "skill") mult = 1.35;
  if (kind === "exe") mult = 2.10;

  // cost
  if (kind === "skill") {
    if (p.mp < 10) { toast("MP 不足"); return; }
    p.mp -= 10;
    p.exe = clamp(p.exe + 6, 0, p.exeMax);
  }
  if (kind === "exe") {
    if (p.exe < 30) { toast("同步率不足（需 30）"); return; }
    p.exe -= 30;
    p.en = clamp(p.en + 10, 0, p.enMax); // 爆發回能（示例）
  }

  // crit
  const isCrit = Math.random() < st.crit;
  const critMult = isCrit ? 1.6 : 1.0;

  const raw = Math.floor(st.atk * mult * critMult);
  const dmg = Math.max(1, raw - e.def);

  e.hp = clamp(e.hp - dmg, 0, e.hpMax);
  p.en = clamp(p.en + 3, 0, p.enMax);
  p.exe = clamp(p.exe + 2, 0, p.exeMax);

  log(`你使用${kindName(kind)}造成 ${dmg} 傷害${isCrit ? "（暴擊）" : ""}！`);

  if (e.hp <= 0) {
    winBattle();
    return;
  }
  enemyTurn();
}

function enemyTurn() {
  const p = S.player;
  const e = S.battle.enemy;
  if (!e) return;

  const st = calcTotalStats();
  const raw = Math.floor(e.atk * (0.9 + Math.random() * 0.3));
  const dmg = Math.max(1, raw - st.def);

  p.hp = clamp(p.hp - dmg, 0, p.hpMax);
  p.exe = clamp(p.exe + 3, 0, p.exeMax);

  log(`敵人反擊，造成你 ${dmg} 傷害。`);

  if (p.hp <= 0) {
    log("⚠️ 你的機甲被擊破！已自動維修到 30% HP。");
    p.hp = Math.max(1, Math.floor(p.hpMax * 0.30));
    // 失敗懲罰示例
    p.gold = Math.max(0, p.gold - 20);
    p.exe = 0;
    S.battle.enemy = null;
  }
}

function winBattle() {
  const p = S.player;
  const e = S.battle.enemy;

  const gainXP = Math.floor(40 + e.lv * 25);
  const gainGold = Math.floor(10 + e.lv * 8);

  p.xp += gainXP;
  p.gold += gainGold;
  p.exe = clamp(p.exe + 10, 0, p.exeMax);

  log(`✅ 擊敗 ${e.name}！獲得 EXP+${gainXP}、金幣+${gainGold}、EXE+10`);

  // loot
  const drops = rollLoot(e.lv);
  for (const it of drops) p.bag.push(it);
  if (drops.length) log(`🎁 掉落：${drops.map(x => x.name).join("、")}`);
  else log("掉落：無");

  S.battle.enemy = null;
  levelUpIfNeeded();
}

function levelUpIfNeeded() {
  const p = S.player;
  let need = xpNeed(p.lv);
  while (p.xp >= need) {
    p.xp -= need;
    p.lv += 1;

    // 成長（示例）
    p.hpMax += 20; p.hp = p.hpMax;
    p.mpMax += 6;  p.mp = p.mpMax;
    p.enMax += 6;  p.en = p.enMax;
    p.base.atk += 3;
    p.base.def += 2;
    p.base.crit = clamp(p.base.crit + 0.003, 0, 0.30);
    p.base.acc = clamp(p.base.acc + 0.002, 0.60, 0.98);

    log(`⬆️ 升級！目前 Lv.${p.lv}`);
    need = xpNeed(p.lv);
  }
}

function rollLoot(enemyLv) {
  // V0.0.1：簡單掉落：0~2 件
  const count = Math.random() < 0.35 ? 0 : (Math.random() < 0.6 ? 1 : 2);
  const out = [];
  for (let i=0;i<count;i++) out.push(genEquip(enemyLv));
  return out;
}

function genEquip(lv) {
  const slot = pick(EQUIP_SLOTS.filter(s => !s.key.startsWith("acc")).concat(
    pick([ {key:"acc1",label:"配件1"},{key:"acc2",label:"配件2"},{key:"acc3",label:"配件3"} ])
  ));

  const r = rollRarity();
  const power = Math.max(1, Math.floor((lv * 2 + randInt(0, lv+3)) * r.mult));

  const stats = baseStatsBySlot(slot.key, power);

  return {
    id: cryptoId(),
    type: "equip",
    slot: slot.key,
    rarity: r.key,
    name: `${rarityName(r.key)} ${slotName(slot.key)}-MK${randInt(1, 9)}（+${power}）`,
    power,
    stats,
  };
}

function baseStatsBySlot(slotKey, power){
  // V0.0.1：示例規則
  const s = { atk:0, def:0, crit:0, acc:0 };
  if (slotKey === "lhand" || slotKey === "rhand") {
    s.atk = Math.floor(power * 1.2);
    if (Math.random() < 0.35) s.crit = round2((power/3000));
  } else if (slotKey === "head") {
    s.def = Math.floor(power * 0.8);
    s.acc = round2((power/4000));
  } else if (slotKey === "body" || slotKey === "legs") {
    s.def = Math.floor(power * 1.15);
  } else {
    // accessories
    if (Math.random() < 0.5) s.atk = Math.floor(power * 0.7);
    else s.def = Math.floor(power * 0.7);
    if (Math.random() < 0.25) s.crit = round2((power/3500));
  }
  return s;
}

function rollRarity() {
  const x = Math.random();
  if (x < 0.65) return RARITY[0]; // N
  if (x < 0.88) return RARITY[1]; // R
  if (x < 0.97) return RARITY[2]; // SR
  return RARITY[3];              // UR
}

// Quick equip: click slot => equip best matching from bag
function equipBest(slotKey) {
  const p = S.player;
  const cand = p.bag.filter(it => it.type==="equip" && it.slot===slotKey);
  if (!cand.length) { toast("背包沒有可用裝備"); return; }
  cand.sort((a,b)=> (b.power - a.power));
  const best = cand[0];

  // swap with currently equipped
  const cur = p.equips[slotKey];
  p.equips[slotKey] = best;

  // remove best from bag
  p.bag = p.bag.filter(x => x.id !== best.id);
  if (cur) p.bag.push(cur);

  log(`裝備更新：${slotName(slotKey)} → ${best.name}`);
}

// ---- UI ----
const el = (id)=>document.getElementById(id);

function render() {
  el("versionText").textContent = S.meta.version || VERSION;

  const p = S.player;
  el("lv").textContent = p.lv;
  el("xp").textContent = p.xp;
  el("xpNeed").textContent = xpNeed(p.lv);
  el("gold").textContent = p.gold;

  setBar("hp", p.hp, p.hpMax);
  setBar("mp", p.mp, p.mpMax);
  setBar("en", p.en, p.enMax);
  setBar("exe", p.exe, p.exeMax);

  const st = calcTotalStats();
  el("atk").textContent = st.atk;
  el("def").textContent = st.def;
  el("crit").textContent = Math.round(st.crit*100) + "%";
  el("acc").textContent = Math.round(st.acc*100) + "%";

  renderEquip();
  renderEnemy();
  renderBag();
  renderLog();
  renderChangelog();
}

function setBar(prefix, cur, max) {
  el(prefix+"Text").textContent = `${cur} / ${max}`;
  const pct = max<=0 ? 0 : (cur/max)*100;
  el(prefix+"Bar").style.width = `${pct}%`;
}

function renderEquip() {
  const wrap = el("equipGrid");
  wrap.innerHTML = "";
  const p = S.player;

  for (const s of EQUIP_SLOTS) {
    const it = p.equips[s.key];
    const div = document.createElement("div");
    div.className = "slot";
    div.innerHTML = `
      <div class="name">${s.label}</div>
      <div class="meta">${it ? it.name : "（未裝備）"}</div>
      <div class="meta">${it ? formatStats(it.stats) : ""}</div>
    `;
    div.addEventListener("click", ()=> equipBest(s.key));
    wrap.appendChild(div);
  }
}

function renderEnemy() {
  const e = S.battle.enemy;
  if (!e) {
    el("enemyName").textContent = "—";
    el("enemyLv").textContent = "—";
    el("enemyHpText").textContent = "—";
    el("enemyHpBar").style.width = `0%`;
    return;
  }
  el("enemyName").textContent = e.name;
  el("enemyLv").textContent = e.lv;
  el("enemyHpText").textContent = `${e.hp} / ${e.hpMax}`;
  el("enemyHpBar").style.width = `${(e.hp/e.hpMax)*100}%`;
}

function renderBag() {
  const wrap = el("bag");
  wrap.innerHTML = "";
  const bag = S.player.bag;

  if (!bag.length) {
    wrap.innerHTML = `<div class="hint">背包空空的。去打怪拿掉寶吧！</div>`;
    return;
  }

  for (const it of bag) {
    const d = document.createElement("div");
    d.className = "item";
    d.innerHTML = `
      <div class="top">
        <div class="name">${it.name}</div>
        <div class="badge">${rarityName(it.rarity)} • 強度 ${it.power}</div>
      </div>
      <div class="desc">部位：${slotName(it.slot)}<br/>${formatStats(it.stats)}</div>
      <div class="btns">
        <button>裝備到 ${slotName(it.slot)}</button>
        <button class="danger">丟棄</button>
      </div>
    `;
    const [btnEquip, btnDrop] = d.querySelectorAll("button");
    btnEquip.addEventListener("click", ()=>{
      // equip this item
      const slotKey = it.slot;
      const cur = S.player.equips[slotKey];
      S.player.equips[slotKey] = it;
      S.player.bag = S.player.bag.filter(x => x.id !== it.id);
      if (cur) S.player.bag.push(cur);
      log(`裝備：${it.name}`);
      render();
    });
    btnDrop.addEventListener("click", ()=>{
      S.player.bag = S.player.bag.filter(x => x.id !== it.id);
      log(`丟棄：${it.name}`);
      render();
    });
    wrap.appendChild(d);
  }
}

function renderLog() {
  const wrap = el("log");
  wrap.innerHTML = S.battle.log.map(line => `<div>${escapeHtml(line)}</div>`).join("");
  wrap.scrollTop = wrap.scrollHeight;
}

function renderChangelog() {
  const recent = el("changelogRecent");
  const all = el("changelogAll");
  recent.innerHTML = "";
  all.innerHTML = "";

  const items = [...CHANGELOG];
  const recent3 = items.slice(0, 3);

  for (const c of recent3) recent.appendChild(changelogLi(c));
  for (const c of items) all.appendChild(changelogLi(c));
}

function changelogLi(c) {
  const li = document.createElement("li");
  li.innerHTML = `<b>${c.version}</b> <span class="badge">(${c.date})</span><br/>• ${c.notes.join("<br/>• ")}`;
  li.style.margin = "10px 0";
  return li;
}

// ---- Logging & helpers ----
function log(msg) {
  const time = new Date().toLocaleTimeString("zh-TW", {hour:"2-digit", minute:"2-digit"});
  S.battle.log.push(`[${time}] ${msg}`);
  if (S.battle.log.length > 120) S.battle.log.shift();
  render();
}

function toast(msg) {
  // V0.0.1 簡化：用 log + alert 取代 fancy toast
  log(`ℹ️ ${msg}`);
}

function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).catch(()=>{});
}

function escapeHtml(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

function formatStats(st){
  const parts = [];
  if (st.atk) parts.push(`攻擊 +${st.atk}`);
  if (st.def) parts.push(`防禦 +${st.def}`);
  if (st.crit) parts.push(`暴擊 +${Math.round(st.crit*100)}%`);
  if (st.acc) parts.push(`命中 +${Math.round(st.acc*100)}%`);
  return parts.join(" / ");
}

function slotName(k){
  return (EQUIP_SLOTS.find(x=>x.key===k)?.label) || k;
}
function rarityName(rk){
  return (RARITY.find(x=>x.key===rk)?.name) || rk;
}
function kindName(k){
  if (k==="basic") return "一般攻擊";
  if (k==="skill") return "技能";
  if (k==="exe") return "EXE爆發";
  return k;
}

function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function randInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
function round2(x){ return Math.round(x*10000)/10000; }
function cryptoId(){
  // fallback-friendly
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "id_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
}

// ---- Events ----
window.addEventListener("DOMContentLoaded", ()=>{
  el("btnSave").addEventListener("click", saveLocal);
  el("btnLoad").addEventListener("click", ()=>{ if(!loadLocal()) toast("沒有存檔"); render(); });

  el("btnExportJson").addEventListener("click", exportJSON);
  el("btnExportB64").addEventListener("click", exportB64);

  el("btnImport").addEventListener("click", ()=> el("importModal").showModal());
  el("btnDoImport").addEventListener("click", ()=>{
    try{
      const obj = importFromText(el("importText").value);
      S = obj;
      toast("匯入成功");
      el("importModal").close();
      render();
    }catch(e){
      alert("匯入失敗：" + e.message);
    }
  });
  el("btnCloseImport").addEventListener("click", ()=> el("importModal").close());

  el("btnHardReset").addEventListener("click", ()=>{
    if (!confirm("確定重置？會清空進度")) return;
    S = newGameState();
    saveLocal();
    render();
  });

  el("btnRest").addEventListener("click", ()=>{ rest(); render(); });

  el("btnSpawn").addEventListener("click", ()=>{ spawnEnemy(); render(); });
  el("btnAttack").addEventListener("click", ()=> attack("basic"));
  el("btnSkill").addEventListener("click", ()=> attack("skill"));
  el("btnExe").addEventListener("click", ()=> attack("exe"));

  el("btnLootTest").addEventListener("click", ()=>{
    const drops = rollLoot(S.player.lv);
    for (const it of drops) S.player.bag.push(it);
    log(`測試掉寶：${drops.length ? drops.map(x=>x.name).join("、") : "無"}`);
    render();
  });

  el("btnSortBag").addEventListener("click", ()=>{
    const rank = { "UR":3, "SR":2, "R":1, "N":0 };
    S.player.bag.sort((a,b)=>{
      const ra = rank[a.rarity] ?? 0, rb = rank[b.rarity] ?? 0;
      if (rb !== ra) return rb - ra;
      return (b.power - a.power);
    });
    toast("已整理背包");
    render();
  });

  el("btnShowChangelog").addEventListener("click", ()=> el("changelogModal").showModal());
  el("btnCloseChangelog").addEventListener("click", ()=> el("changelogModal").close());

  el("btnToggleAuto").addEventListener("click", ()=>{
    S.battle.auto = !S.battle.auto;
    el("btnToggleAuto").textContent = `自動戰鬥：${S.battle.auto ? "開" : "關"}`;
  });

  // Auto battle tick (simple)
  setInterval(()=>{
    if (!S.battle.auto) return;
    if (!S.battle.enemy) spawnEnemy();
    attack("basic");
  }, 900);

  // initialize version
  S.meta.version = S.meta.version || VERSION;

  render();
});
