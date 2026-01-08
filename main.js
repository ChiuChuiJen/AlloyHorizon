// =====================
// Mecha RPG V0.0.5 — EXE for Leveling, Coherence for Burst, Subtabs, Unequip, Log newest-first
// =====================

const VERSION = "V0.0.5";

const CHANGELOG = [
  {
    version: "V0.0.5",
    date: "2026-01-08",
    notes: [
      "EXE 改為升級專用（擊敗敵人累積 EXE，達門檻自動升級）",
      "能量改為『同心率』，用於機體爆發（原 EXE 爆發用途）",
      "裝備/戰鬥/背包合併同一排分頁；戰鬥紀錄改最新在最上面",
      "裝備欄新增卸下功能（卸下回到背包）"
    ]
  },
];

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

const LS_KEY = "mecha_rpg_save";
const TOWER_MAX_FLOOR = 10;

function defaultFloorPlan() {
  return { normalsDone:0, normalNeed:3, eliteDone:false, miniBossDone:false, bossDone:false, lastEncounter:null };
}

function floorEnemyPool(floor) {
  const base = floor * 2;
  const normal = [
    { name: "巡弋偵察蜂群", atkK: 7.6, defK: 4.5, lvBias: 0 },
    { name: "破片火力單元", atkK: 8.0, defK: 4.8, lvBias: 0 },
    { name: "舊型自律守衛", atkK: 8.2, defK: 5.0, lvBias: 1 },
    { name: "脈衝干擾器",   atkK: 7.9, defK: 4.7, lvBias: -1 },
    { name: "沙塵追獵者",   atkK: 8.4, defK: 5.1, lvBias: 1 },
  ];
  const elite = [
    { name: "菁英・鋼甲破城者", atkK: 9.4, defK: 6.4, lvBias: 2 },
    { name: "菁英・高機動獵犬", atkK: 9.8, defK: 6.0, lvBias: 2 },
    { name: "菁英・電弧斬切者", atkK: 10.2, defK: 6.2, lvBias: 3 },
  ];
  const mini = [
    { name: "Mini Boss・暴走核心體", atkK: 10.8, defK: 7.0, lvBias: 3 },
    { name: "Mini Boss・重盾堡壘",   atkK: 10.0, defK: 7.8, lvBias: 3 },
  ];
  const boss = [
    { name: `Boss・第${floor}層 機神「裂空」`, atkK: 12.2, defK: 8.6, lvBias: 5, boss:true },
    { name: `Boss・第${floor}層 終端核心「審判」`, atkK: 12.8, defK: 8.2, lvBias: 5, boss:true },
  ];
  return { normal, elite, mini, boss, base };
}

function nextEncounterTypeForFloorState(fs) {
  if (fs.bossDone) return "CLEARED";
  if (!fs.miniBossDone) {
    if (fs.normalsDone < fs.normalNeed) return "NORMAL";
    return "MINI";
  }
  return "BOSS_READY";
}

function mkConsumable(name, kind, amount, price) {
  return { id: cryptoId(), type:"consumable", name, kind, amount, price };
}

/**
 * ✅ 新定義：
 * - exeLv: 升級用 EXE（取代原本 xp）
 * - coh:  同心率（取代原本 en）
 */
function newGameState() {
  return {
    meta: { version: VERSION, createdAt: Date.now(), updatedAt: Date.now() },
    player: {
      lv: 1,
      exeLv: 0,   // ✅ 升級專用
      gold: 120,
      base: { atk: 10, def: 5, crit: 0.05, acc: 0.90 },

      hp: 120, hpMax: 120,
      mp: 40,  mpMax: 40,

      coh: 50, cohMax: 50, // ✅ 同心率（爆發用）
      equips: Object.fromEntries(EQUIP_SLOTS.map(s => [s.key, null])),
      bag: [
        mkConsumable("小型修復包", "heal_hp", 45, 35),
        mkConsumable("同心注入劑", "heal_coh", 30, 28),
        mkConsumable("資料注入針", "gain_exe", 18, 25),
      ],
    },
    tower: { floor: 1, floorState: defaultFloorPlan() },
    battle: { enemy: null, enemyType: null, auto: false, log: [] }
  };
}

let S = loadOrInit();
migrateIfNeeded();

function migrateIfNeeded() {
  if (!S.meta) S.meta = { version: VERSION, createdAt: Date.now(), updatedAt: Date.now() };
  if (!S.meta.version) S.meta.version = VERSION;

  if (!S.player) S.player = newGameState().player;

  // ✅ 舊版兼容：xp -> exeLv
  if (typeof S.player.exeLv !== "number") {
    if (typeof S.player.xp === "number") S.player.exeLv = S.player.xp;
    else S.player.exeLv = 0;
  }
  delete S.player.xp;

  // ✅ 舊版兼容：en -> coh
  if (typeof S.player.coh !== "number") {
    if (typeof S.player.en === "number") S.player.coh = S.player.en;
    else S.player.coh = 0;
  }
  if (typeof S.player.cohMax !== "number") {
    if (typeof S.player.enMax === "number") S.player.cohMax = S.player.enMax;
    else S.player.cohMax = 50;
  }
  delete S.player.en; delete S.player.enMax;

  if (!S.player.equips) S.player.equips = Object.fromEntries(EQUIP_SLOTS.map(s => [s.key, null]));
  for (const s of EQUIP_SLOTS) if (!(s.key in S.player.equips)) S.player.equips[s.key] = null;
  if (!Array.isArray(S.player.bag)) S.player.bag = [];

  if (!S.tower) S.tower = newGameState().tower;
  if (!S.tower.floor) S.tower.floor = 1;
  if (!S.tower.floorState) S.tower.floorState = defaultFloorPlan();

  if (!S.battle) S.battle = newGameState().battle;

  applyDerivedMax();
}

function saveLocal() {
  S.meta.version = VERSION;
  S.meta.updatedAt = Date.now();
  localStorage.setItem(LS_KEY, JSON.stringify(S));
  toast("已儲存到瀏覽器");
}

function loadLocal() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return false;
  try {
    S = JSON.parse(raw);
    migrateIfNeeded();
    toast("已讀取存檔");
    return true;
  } catch { return false; }
}

function loadOrInit() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return newGameState();
  try { return JSON.parse(raw); } catch { return newGameState(); }
}

// Export/Import
function exportJSON() { copyToClipboard(JSON.stringify(S)); toast("JSON 已複製到剪貼簿"); }
function exportB64() {
  const json = JSON.stringify(S);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  copyToClipboard(b64);
  toast("Base64 已複製到剪貼簿");
}
function importFromText(text) {
  const t = (text || "").trim();
  if (!t) throw new Error("空內容");
  if (t.startsWith("{") || t.startsWith("[")) return JSON.parse(t);
  const json = decodeURIComponent(escape(atob(t)));
  return JSON.parse(json);
}

// ✅ EXE(升級)門檻
function exeNeed(lv) {
  return Math.floor(120 + (lv - 1) * 70 + Math.pow(lv - 1, 1.35) * 25);
}
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function applyDerivedMax() {
  const p = S.player;
  let hpBonus = 0, mpBonus = 0, cohBonus = 0;

  for (const k of Object.keys(p.equips)) {
    const it = p.equips[k];
    if (!it || it.type !== "equip") continue;
    hpBonus += it.stats.hpMax || 0;
    mpBonus += it.stats.mpMax || 0;
    // 兼容：舊裝備若有 enMax 就算到 cohMax
    cohBonus += (it.stats.cohMax || 0) + (it.stats.enMax || 0);
  }

  const baseHp = 120 + (p.lv - 1) * 20;
  const baseMp = 40 + (p.lv - 1) * 6;
  const baseCoh = 50 + (p.lv - 1) * 6;

  p.hpMax = Math.max(1, Math.floor(baseHp + hpBonus));
  p.mpMax = Math.max(1, Math.floor(baseMp + mpBonus));
  p.cohMax = Math.max(1, Math.floor(baseCoh + cohBonus));

  p.hp = clamp(p.hp, 0, p.hpMax);
  p.mp = clamp(p.mp, 0, p.mpMax);
  p.coh = clamp(p.coh, 0, p.cohMax);
  p.exeLv = clamp(p.exeLv, 0, exeNeed(p.lv));
}

function calcTotalStats() {
  const p = S.player;
  let atk = p.base.atk + (p.lv - 1) * 3;
  let def = p.base.def + (p.lv - 1) * 2;
  let crit = p.base.crit;
  let acc  = p.base.acc;

  for (const k of Object.keys(p.equips)) {
    const it = p.equips[k];
    if (!it) continue;
    atk  += it.stats.atk || 0;
    def Oklahoma: def  += it.stats.def || 0;
    crit += it.stats.crit || 0;
    acc  += it.stats.acc || 0;
  }

  crit = clamp(crit, 0, 0.40);
  acc  = clamp(acc, 0.65, 0.99);
  return { atk, def, crit, acc };
}

function rest() {
  const p = S.player;
  applyDerivedMax();
  p.hp = clamp(p.hp + Math.floor(p.hpMax * 0.25), 0, p.hpMax);
  p.mp = clamp(p.mp + Math.floor(p.mpMax * 0.35), 0, p.mpMax);
  p.coh = clamp(p.coh + Math.floor(p.cohMax * 0.35), 0, p.cohMax);
  log(`維修完成：HP/MP/同心率回復（不超過最大值）`);
  saveLocal();
}

// Tower
function canGoNextFloor() {
  const fs = S.tower.floorState;
  return fs.bossDone && S.tower.floor < TOWER_MAX_FLOOR;
}
function nextEncounterHint() {
  const fs = S.tower.floorState;
  const t = nextEncounterTypeForFloorState(fs);
  if (t === "CLEARED") return "本層已通關";
  if (t === "BOSS_READY") return "Boss（可挑戰）";
  if (t === "MINI") return "Mini Boss";
  if (!fs.eliteDone && fs.normalsDone >= 1 && Math.random() < 0.30) return "可能出現 菁英";
  return "一般怪";
}
function exploreNext() {
  if (S.battle.enemy) { toast("正在戰鬥中"); return; }

  const fs = S.tower.floorState;
  if (fs.bossDone) { toast("本層已通關，請前往下一層"); return; }

  const planType = nextEncounterTypeForFloorState(fs);
  if (planType === "MINI") { spawnTowerEnemy("MINI"); return; }
  if (planType === "BOSS_READY") { toast("本層已可挑戰 Boss（點『挑戰 Boss』）"); return; }

  if (!fs.eliteDone && fs.normalsDone >= 1 && Math.random() < 0.30) {
    fs.eliteDone = true;
    spawnTowerEnemy("ELITE");
    return;
  }
  spawnTowerEnemy("NORMAL");
}
function challengeBoss() {
  if (S.battle.enemy) { toast("正在戰鬥中"); return; }
  const fs = S.tower.floorState;
  if (!fs.miniBossDone) { toast("還不能打Boss：先完成一般怪與Mini Boss"); return; }
  if (fs.bossDone) { toast("本層Boss已擊敗"); return; }
  spawnTowerEnemy("BOSS");
}
function goNextFloor() {
  if (!canGoNextFloor()) { toast("需要先擊敗本層 Boss 才能前往下一層"); return; }
  S.tower.floor += 1;
  S.tower.floorState = defaultFloorPlan();
  log(`➡️ 前往第 ${S.tower.floor} 層`);
  saveLocal(); render();
}
function resetTower() {
  S.tower.floor = 1;
  S.tower.floorState = defaultFloorPlan();
  S.battle.enemy = null;
  S.battle.enemyType = null;
  log("↩️ 回到第1層（重置探索進度）");
  saveLocal(); render();
}

function spawnTowerEnemy(type) {
  const floor = S.tower.floor;
  const pool = floorEnemyPool(floor);
  const p = S.player;
  const baseLv = Math.max(1, Math.floor(p.lv + pool.base / 2));

  let tmpl;
  if (type === "NORMAL") tmpl = pick(pool.normal);
  if (type === "ELITE")  tmpl = pick(pool.elite);
  if (type === "MINI")   tmpl = pick(pool.mini);
  if (type === "BOSS")   tmpl = pick(pool.boss);

  const lv = clamp(baseLv + (tmpl.lvBias || 0) + randInt(-1, +1), 1, 999);

  const hpMaxBase = 90 + lv * 48;
  const hpMult = type === "BOSS" ? 1.55 : type === "MINI" ? 1.25 : type === "ELITE" ? 1.15 : 1.0;
  const hpMax = Math.floor(hpMaxBase * hpMult);

  const atkMult = type === "BOSS" ? 1.20 : type === "MINI" ? 1.12 : type === "ELITE" ? 1.08 : 1.0;
  const defMult = type === "BOSS" ? 1.22 : type === "MINI" ? 1.14 : type === "ELITE" ? 1.10 : 1.0;

  S.battle.enemy = {
    name: tmpl.name,
    lv,
    hp: hpMax,
    hpMax,
    atk: Math.floor((6 + lv * tmpl.atkK) * atkMult),
    def: Math.floor((2 + lv * tmpl.defK) * defMult),
    boss: !!tmpl.boss,
  };
  S.battle.enemyType = type;

  S.tower.floorState.lastEncounter = type;
  log(`🛰️ 探索遭遇：${labelEncounter(type)}｜${S.battle.enemy.name} Lv.${lv}`);
  render();
}

// Combat
function attack(kind="basic") {
  const p = S.player;
  const e = S.battle.enemy;
  if (!e) { toast("沒有敵人，請先探索"); return; }

  applyDerivedMax();
  const st = calcTotalStats();

  if (kind === "skill") {
    if (p.mp < 12) { toast("MP 不足"); return; }
    p.mp -= 12;
  }
  if (kind === "burst") { // ✅ 爆發耗同心率
    if (p.coh < 30) { toast("同心率不足（需 30）"); return; }
    p.coh -= 30;
  }

  const hit = Math.random() < st.acc;
  if (!hit) { log("你的攻擊落空！"); enemyTurn(); render(); return; }

  let mult = 1.0;
  if (kind === "skill") mult = 1.40;
  if (kind === "burst") mult = 2.15;

  const isCrit = Math.random() < st.crit;
  const critMult = isCrit ? 1.65 : 1.0;

  const raw = Math.floor(st.atk * mult * critMult);
  const dmg = Math.max(1, raw - e.def);

  e.hp = clamp(e.hp - dmg, 0, e.hpMax);

  // ✅ 資源回復：同心率慢慢回；升級EXE由勝利給
  p.coh = clamp(p.coh + (kind==="burst" ? 0 : 3), 0, p.cohMax);

  log(`你使用${kindName(kind)}造成 ${dmg} 傷害${isCrit ? "（暴擊）" : ""}！`);

  if (e.hp <= 0) { winBattle(); render(); return; }
  enemyTurn();
  render();
}

function enemyTurn() {
  const p = S.player;
  const e = S.battle.enemy;
  if (!e) return;

  applyDerivedMax();
  const st = calcTotalStats();

  const raw = Math.floor(e.atk * (0.9 + Math.random() * 0.3));
  const dmg = Math.max(1, raw - st.def);

  p.hp = clamp(p.hp - dmg, 0, p.hpMax);

  log(`敵人反擊，造成你 ${dmg} 傷害。`);

  if (p.hp <= 0) {
    log("⚠️ 你的機甲被擊破！已自動維修到 30% HP。");
    p.hp = Math.max(1, Math.floor(p.hpMax * 0.30));
    p.gold = Math.max(0, p.gold - 25);

    // ✅ 死亡停止自動戰鬥
    if (S.battle.auto) {
      S.battle.auto = false;
      setAutoButtonText();
      log("⛔ 自動戰鬥已停止（死亡觸發）");
    }

    // ✅ 同心率不歸零（你沒要求重置），這裡不動 p.coh
    // ✅ EXE(升級)也不重置
    S.battle.enemy = null;
    S.battle.enemyType = null;
    saveLocal();
  }
}

function winBattle() {
  const p = S.player;
  const e = S.battle.enemy;
  const et = S.battle.enemyType || "NORMAL";

  // ✅ EXE(升級)取代舊 xp
  const gainEXE  = Math.floor((55 + e.lv * 28) * exeMultByEncounter(et));
  const gainGold = Math.floor((15 + e.lv * 9)  * goldMultByEncounter(et));

  p.exeLv += gainEXE;
  p.gold += gainGold;

  log(`✅ 擊敗 ${e.name}（${labelEncounter(et)}）！EXE+${gainEXE} 金幣+${gainGold}`);

  const drops = rollLoot(e.lv, et);
  for (const it of drops) p.bag.push(it);
  if (drops.length) log(`🎁 掉落：${drops.map(x => x.name).join("、")}`);
  else log("掉落：無");

  const fs = S.tower.floorState;
  if (et === "NORMAL") fs.normalsDone += 1;
  if (et === "ELITE")  fs.eliteDone = true;
  if (et === "MINI")   fs.miniBossDone = true;
  if (et === "BOSS")   fs.bossDone = true;

  S.battle.enemy = null;
  S.battle.enemyType = null;

  levelUpIfNeeded();
  saveLocal();
}

function exeMultByEncounter(et){
  if (et==="BOSS") return 2.2;
  if (et==="MINI") return 1.6;
  if (et==="ELITE") return 1.35;
  return 1.0;
}
function goldMultByEncounter(et){
  if (et==="BOSS") return 2.0;
  if (et==="MINI") return 1.5;
  if (et==="ELITE") return 1.25;
  return 1.0;
}

function levelUpIfNeeded() {
  const p = S.player;
  let need = exeNeed(p.lv);
  while (p.exeLv >= need) {
    p.exeLv -= need;
    p.lv += 1;
    applyDerivedMax();
    p.hp = p.hpMax; p.mp = p.mpMax; p.coh = p.cohMax;
    log(`⬆️ 升級！目前 Lv.${p.lv}`);
    need = exeNeed(p.lv);
  }
}

// Loot
function rollLoot(enemyLv, encounterType="NORMAL") {
  const out = [];

  let equipChance = 0.70;
  let equipMin = 0, equipMax = 1;
  if (encounterType === "ELITE") { equipChance = 0.85; equipMax = 2; }
  if (encounterType === "MINI")  { equipChance = 1.00; equipMin = 1; equipMax = 2; }
  if (encounterType === "BOSS")  { equipChance = 1.00; equipMin = 1; equipMax = 3; }

  const equipCount = encounterType === "BOSS"
    ? randInt(1, 2)
    : (Math.random() < equipChance ? randInt(equipMin, equipMax) : 0);

  for (let i=0;i<equipCount;i++) out.push(genEquip(enemyLv, encounterType));

  const consChance =
    encounterType==="BOSS" ? 0.85 :
    encounterType==="MINI" ? 0.65 :
    encounterType==="ELITE"? 0.50 : 0.35;
  if (Math.random() < consChance) out.push(genConsumable(enemyLv));

  if (encounterType === "BOSS") {
    log("📦 Boss 戰利品箱已開啟！");
    out.push(genEquip(enemyLv + 2, "BOSS"));
    if (Math.random() < 0.70) out.push(genConsumable(enemyLv + 2));
  }
  return out;
}

function genConsumable(lv) {
  const t = pick([
    { name:"小型修復包", kind:"heal_hp", base: 40, costK: 35 },
    { name:"中型修復包", kind:"heal_hp", base: 85, costK: 80 },
    { name:"MP 注入劑", kind:"heal_mp", base: 30, costK: 45 },
    { name:"同心注入劑", kind:"heal_coh", base: 30, costK: 28 },
    { name:"資料注入針", kind:"gain_exe", base: 18, costK: 25 },
  ]);
  const amount = Math.floor(t.base + lv * (t.kind==="heal_hp" ? 5 : 3));
  const price  = Math.floor(t.costK + lv * 4);
  return mkConsumable(t.name, t.kind, amount, price);
}

function genEquip(lv, encounterType="NORMAL") {
  const slot = pick(EQUIP_SLOTS);
  const r = rollRarity(encounterType);
  const power = Math.max(1, Math.floor((lv * 2 + randInt(0, lv+4)) * r.mult));
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

function rollRarity(encounterType="NORMAL") {
  const x = Math.random();
  const bonus =
    encounterType==="BOSS" ? -0.07 :
    encounterType==="MINI" ? -0.04 :
    encounterType==="ELITE"? -0.02 : 0;

  const y = clamp(x + bonus, 0, 1);
  if (y < 0.62) return RARITY[0];
  if (y < 0.85) return RARITY[1];
  if (y < 0.96) return RARITY[2];
  return RARITY[3];
}

function baseStatsBySlot(slotKey, power){
  const s = { atk:0, def:0, crit:0, acc:0, hpMax:0, mpMax:0, cohMax:0 };
  const small = (x)=> Math.max(0, Math.floor(x));
  const tinyP = power / 6000;

  if (slotKey === "lhand" || slotKey === "rhand") {
    s.atk = Math.floor(power * 1.25);
    if (Math.random() < 0.35) s.crit = round4(tinyP * 1.6);
  } else if (slotKey === "head") {
    s.def = Math.floor(power * 0.85);
    if (Math.random() < 0.35) s.acc = round4(tinyP * 1.4);
    s.mpMax = small(power * 0.10);
  } else if (slotKey === "body") {
    s.def = Math.floor(power * 1.20);
    s.hpMax = small(power * 0.20);
  } else if (slotKey === "legs") {
    s.def = Math.floor(power * 1.10);
    s.cohMax = small(power * 0.12);
  } else {
    if (Math.random() < 0.5) s.atk = Math.floor(power * 0.65);
    else s.def = Math.floor(power * 0.65);
    if (Math.random() < 0.25) s.crit = round4(tinyP * 1.2);
    if (Math.random() < 0.25) s.acc  = round4(tinyP * 1.0);
    if (Math.random() < 0.35) s.hpMax = small(power * 0.10);
    if (Math.random() < 0.20) s.cohMax = small(power * 0.10);
  }

  s.crit = clamp(s.crit, 0, 0.08);
  s.acc  = clamp(s.acc,  0, 0.06);
  return s;
}

// Inventory actions
function equipItemById(itemId) {
  const p = S.player;
  const it = p.bag.find(x => x.id === itemId);
  if (!it || it.type !== "equip") return;

  const slotKey = it.slot;
  const cur = p.equips[slotKey];

  p.equips[slotKey] = it;
  p.bag = p.bag.filter(x => x.id !== it.id);
  if (cur) p.bag.push(cur);

  applyDerivedMax();
  log(`裝備：${it.name}`);
  saveLocal();
  render();
}

function equipBest(slotKey) {
  const p = S.player;
  const cand = p.bag.filter(it => it.type==="equip" && it.slot===slotKey);
  if (!cand.length) { toast("背包沒有可用裝備"); return; }
  cand.sort((a,b)=> (b.power - a.power));
  equipItemById(cand[0].id);
}

// ✅ 卸下裝備
function unequip(slotKey){
  const p = S.player;
  const cur = p.equips[slotKey];
  if (!cur) { toast("此部位沒有裝備"); return; }
  p.equips[slotKey] = null;
  p.bag.push(cur);
  applyDerivedMax();
  log(`卸下：${cur.name}`);
  saveLocal();
  render();
}

function dropItem(itemId) {
  const p = S.player;
  const it = p.bag.find(x => x.id === itemId);
  if (!it) return;
  p.bag = p.bag.filter(x => x.id !== itemId);
  log(`丟棄：${it.name}`);
  saveLocal();
  render();
}

function useConsumable(itemId) {
  const p = S.player;
  const it = p.bag.find(x => x.id === itemId);
  if (!it || it.type !== "consumable") return;

  applyDerivedMax();
  if (it.kind === "heal_hp") p.hp = clamp(p.hp + it.amount, 0, p.hpMax);
  if (it.kind === "heal_mp") p.mp = clamp(p.mp + it.amount, 0, p.mpMax);
  if (it.kind === "heal_coh") p.coh = clamp(p.coh + it.amount, 0, p.cohMax);
  if (it.kind === "gain_exe") p.exeLv = clamp(p.exeLv + it.amount, 0, exeNeed(p.lv));

  p.bag = p.bag.filter(x => x.id !== itemId);
  log(`使用：${it.name}（效果：${consumableDesc(it)}）`);

  // 如果用道具把 EXE 補滿，允許升級
  levelUpIfNeeded();

  saveLocal();
  render();
}

function useBestPotionAuto() {
  const p = S.player;
  applyDerivedMax();

  const hpNeed = p.hpMax - p.hp;
  const mpNeed = p.mpMax - p.mp;
  const cohNeed = p.cohMax - p.coh;

  let targetKind = "heal_hp";
  if (hpNeed <= 0 && mpNeed > 0) targetKind = "heal_mp";
  if (hpNeed <= 0 && mpNeed <= 0 && cohNeed > 0) targetKind = "heal_coh";
  if (hpNeed <= 0 && mpNeed <= 0 && cohNeed <= 0) { toast("不需要回復"); return; }

  const cands = p.bag.filter(x => x.type==="consumable" && x.kind===targetKind);
  if (!cands.length) { toast("沒有對應回復品"); return; }
  cands.sort((a,b)=> b.amount - a.amount);
  useConsumable(cands[0].id);
}

// Shop
function getShopList() {
  const p = S.player;
  const lv = p.lv;
  const potSmall = mkConsumable("小型修復包", "heal_hp", 45 + lv*4, 35 + lv*3);
  const potMp    = mkConsumable("MP 注入劑", "heal_mp", 28 + lv*3, 40 + lv*3);
  const potCoh   = mkConsumable("同心注入劑", "heal_coh", 26 + lv*3, 28 + lv*2);
  const exeNeedle= mkConsumable("資料注入針", "gain_exe", 18 + lv*2, 25 + lv*3);
  return [
    { kind:"buy_item", item: potSmall, label:"回復 HP" },
    { kind:"buy_item", item: potMp,    label:"回復 MP" },
    { kind:"buy_item", item: potCoh,   label:"回復 同心率" },
    { kind:"buy_item", item: exeNeedle,label:"增加 EXE（升級值）" },
    { kind:"buy_box",  price: 60 + lv*8, label:"基礎裝備箱（隨機 1 件裝備）" },
  ];
}
function buyShopEntry(entry) {
  const p = S.player;
  if (entry.kind === "buy_item") {
    const price = entry.item.price;
    if (p.gold < price) { toast("金幣不足"); return; }
    p.gold -= price;
    p.bag.push(entry.item);
    log(`購買：${entry.item.name} -${price}G`);
    saveLocal(); render();
    return;
  }
  if (entry.kind === "buy_box") {
    if (p.gold < entry.price) { toast("金幣不足"); return; }
    p.gold -= entry.price;
    const eq = genEquip(p.lv, "NORMAL");
    p.bag.push(eq);
    log(`購買：裝備箱，獲得 ${eq.name}`);
    saveLocal(); render();
  }
}

// UI
const el = (id)=>document.getElementById(id);

function render() {
  el("versionText").textContent = S.meta.version || VERSION;

  const p = S.player;
  applyDerivedMax();

  el("lv").textContent = p.lv;
  el("gold").textContent = p.gold;

  el("gold2").textContent = p.gold;
  el("lv2").textContent = p.lv;
  el("saveVer").textContent = S.meta.version || VERSION;
  el("floor2").textContent = S.tower.floor;

  // ✅ 升級EXE顯示
  el("exeLvVal").textContent = p.exeLv;
  el("exeLvNeed").textContent = exeNeed(p.lv);

  // ✅ 即時條
  setBar("hp", p.hp, p.hpMax, "hpBar", "hpText");
  setBar("mp", p.mp, p.mpMax, "mpBar", "mpText");
  setBar("coh", p.coh, p.cohMax, "cohBar", "cohText");

  // EXE 升級條（比例= exeLv / need）
  el("exeBarText").textContent = `${p.exeLv} / ${exeNeed(p.lv)}`;
  el("exeLvBar").style.width = `${(p.exeLv / exeNeed(p.lv)) * 100}%`;

  const st = calcTotalStats();
  el("atk").textContent = st.atk;
  el("def").textContent = st.def;
  el("crit").textContent = Math.round(st.crit*100) + "%";
  el("acc").textContent = Math.round(st.acc*100) + "%";

  el("floor").textContent = S.tower.floor;
  renderFloorInfo();

  renderEquip();
  renderEnemy();
  renderBag();
  renderLog();
  renderChangelog();
  renderShop();

  setAutoButtonText();
}

function setBar(prefix, cur, max, barId, textId) {
  el(textId).textContent = `${cur} / ${max}`;
  const pct = max<=0 ? 0 : (cur/max)*100;
  el(barId).style.width = `${pct}%`;
}

function renderFloorInfo() {
  const fs = S.tower.floorState;
  const floor = S.tower.floor;

  const normalLine = `一般 ${fs.normalsDone}/${fs.normalNeed}`;
  const eliteLine  = `菁英 ${fs.eliteDone ? "✓" : "—"}`;
  const miniLine   = `MiniBoss ${fs.miniBossDone ? "✓" : "—"}`;
  const bossLine   = `Boss ${fs.bossDone ? "✓" : "—"}`;

  el("floorProgress").textContent = `${normalLine}｜${eliteLine}｜${miniLine}｜${bossLine}`;
  el("nextEncounter").textContent = nextEncounterHint();

  el("btnChallengeBoss").disabled = !fs.miniBossDone || fs.bossDone || !!S.battle.enemy;
  el("btnNextFloor").disabled = !canGoNextFloor() || !!S.battle.enemy;
  if (floor >= TOWER_MAX_FLOOR && fs.bossDone) el("btnNextFloor").disabled = true;
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
      <div class="top">
        <div class="name">${s.label}</div>
        <div class="badge">${it ? `已裝備` : `未裝備`}</div>
      </div>
      <div class="meta">${it ? it.name : "（—）"}</div>
      <div class="meta">${it ? formatEquipStats(it.stats) : ""}</div>
      <div class="actions">
        <button class="btnBest">裝最強</button>
        <button class="btnUnequip danger">卸下</button>
      </div>
    `;

    div.querySelector(".btnBest").addEventListener("click", ()=> equipBest(s.key));
    div.querySelector(".btnUnequip").addEventListener("click", ()=> unequip(s.key));

    // 點整個格也可以裝最強（保留你的習慣）
    div.addEventListener("click", (ev)=>{
      if (ev.target.closest("button")) return;
      equipBest(s.key);
    });

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
  el("enemyName").textContent = `${labelEncounter(S.battle.enemyType)}｜${e.name}`;
  el("enemyLv").textContent = e.lv;
  el("enemyHpText").textContent = `${e.hp} / ${e.hpMax}`;
  el("enemyHpBar").style.width = `${(e.hp/e.hpMax)*100}%`;
}

function renderBag() {
  const wrap = el("bag");
  wrap.innerHTML = "";
  const bag = S.player.bag;

  if (!bag.length) {
    wrap.innerHTML = `<div class="hint">背包空空的。推層或去商店補貨吧！</div>`;
    return;
  }

  for (const it of bag) {
    const d = document.createElement("div");
    d.className = "item";

    if (it.type === "equip") {
      d.innerHTML = `
        <div class="top">
          <div class="name">${it.name}</div>
          <div class="badge">${rarityName(it.rarity)} • 強度 ${it.power}</div>
        </div>
        <div class="desc">
          部位：${slotName(it.slot)}<br/>
          ${formatEquipStats(it.stats)}
        </div>
        <div class="btns">
          <button class="btnEquip">裝備</button>
          <button class="danger btnDrop">丟棄</button>
        </div>
      `;
      d.querySelector(".btnEquip").addEventListener("click", ()=> equipItemById(it.id));
      d.querySelector(".btnDrop").addEventListener("click", ()=> dropItem(it.id));
    } else {
      d.innerHTML = `
        <div class="top">
          <div class="name">${it.name}</div>
          <div class="badge">消耗品 • ${it.price}G</div>
        </div>
        <div class="desc">效果：${consumableDesc(it)}</div>
        <div class="btns">
          <button class="btnUse">使用</button>
          <button class="danger btnDrop">丟棄</button>
        </div>
      `;
      d.querySelector(".btnUse").addEventListener("click", ()=> useConsumable(it.id));
      d.querySelector(".btnDrop").addEventListener("click", ()=> dropItem(it.id));
    }

    wrap.appendChild(d);
  }
}

function renderShop() {
  const wrap = el("shop");
  const list = getShopList();
  wrap.innerHTML = "";

  for (const entry of list) {
    const card = document.createElement("div");
    card.className = "item";

    if (entry.kind === "buy_item") {
      card.innerHTML = `
        <div class="top">
          <div class="name">${entry.item.name}</div>
          <div class="badge">${entry.item.price}G</div>
        </div>
        <div class="desc">${entry.label}<br/>效果：${consumableDesc(entry.item)}</div>
        <div class="btns"><button class="btnBuy">購買</button></div>
      `;
      card.querySelector(".btnBuy").addEventListener("click", ()=> buyShopEntry(entry));
    } else {
      card.innerHTML = `
        <div class="top">
          <div class="name">${entry.label}</div>
          <div class="badge">${entry.price}G</div>
        </div>
        <div class="desc">隨機掉落 1 件裝備（部位/稀有度隨機）。</div>
        <div class="btns"><button class="btnBuy">購買</button></div>
      `;
      card.querySelector(".btnBuy").addEventListener("click", ()=> buyShopEntry(entry));
    }

    wrap.appendChild(card);
  }
}

// ✅ 戰鬥紀錄：最新在最上面（由上往下看）
function renderLog() {
  const wrap = el("log");
  wrap.innerHTML = S.battle.log.map(line => `<div>${escapeHtml(line)}</div>`).join("");
  wrap.scrollTop = 0; // 固定在最上面
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

// Log helpers — ✅ 最新放最上面：unshift
function log(msg) {
  const time = new Date().toLocaleTimeString("zh-TW", {hour:"2-digit", minute:"2-digit"});
  S.battle.log.unshift(`[${time}] ${msg}`);
  if (S.battle.log.length > 180) S.battle.log.pop();
  render();
}
function toast(msg) { log(`ℹ️ ${msg}`); }

function setAutoButtonText() {
  const b = document.getElementById("btnToggleAuto");
  if (!b) return;
  b.textContent = `自動戰鬥：${S.battle.auto ? "開" : "關"}`;
}

function copyToClipboard(text) { navigator.clipboard?.writeText(text).catch(()=>{}); }
function escapeHtml(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

function formatEquipStats(st){
  const parts = [];
  if (st.atk) parts.push(`攻擊 +${st.atk}`);
  if (st.def) parts.push(`防禦 +${st.def}`);
  if (st.hpMax) parts.push(`HP上限 +${st.hpMax}`);
  if (st.mpMax) parts.push(`MP上限 +${st.mpMax}`);
  if (st.cohMax) parts.push(`同心率上限 +${st.cohMax}`);
  if (st.enMax) parts.push(`同心率上限 +${st.enMax}`); // 舊裝備兼容
  if (st.crit) parts.push(`暴擊 +${Math.round(st.crit*100)}%`);
  if (st.acc) parts.push(`命中 +${Math.round(st.acc*100)}%`);
  return parts.join(" / ");
}

function consumableDesc(it){
  if (it.kind==="heal_hp") return `HP +${it.amount}`;
  if (it.kind==="heal_mp") return `MP +${it.amount}`;
  if (it.kind==="heal_coh") return `同心率 +${it.amount}`;
  if (it.kind==="gain_exe") return `EXE（升級值） +${it.amount}`;
  return `+${it.amount}`;
}

function slotName(k){ return (EQUIP_SLOTS.find(x=>x.key===k)?.label) || k; }
function rarityName(rk){ return (RARITY.find(x=>x.key===rk)?.name) || rk; }
function labelEncounter(t){
  if (t==="BOSS") return "BOSS";
  if (t==="MINI") return "MINI";
  if (t==="ELITE") return "菁英";
  return "一般";
}
function kindName(k){
  if (k==="basic") return "一般攻擊";
  if (k==="skill") return "技能";
  if (k==="burst") return "機體爆發";
  return k;
}
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function randInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
function round4(x){ return Math.round(x*10000)/10000; }
function cryptoId(){
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "id_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
}

// Tabs
function setTab(tabKey) {
  document.querySelectorAll(".tab").forEach(b=>{
    b.classList.toggle("active", b.dataset.tab === tabKey);
  });
  document.querySelectorAll(".tabpage").forEach(p=>{
    p.classList.toggle("hidden", p.dataset.tabpage !== tabKey);
  });
  render();
}

function setSubtab(key){
  document.querySelectorAll(".subtab").forEach(b=>{
    b.classList.toggle("active", b.dataset.subtab === key);
  });
  document.querySelectorAll(".subpage").forEach(p=>{
    p.classList.toggle("hidden", p.dataset.subpage !== key);
  });
}

// DOM events
window.addEventListener("DOMContentLoaded", ()=>{
  // main tabs
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.addEventListener("click", ()=> setTab(btn.dataset.tab));
  });

  // subtabs
  document.querySelectorAll(".subtab").forEach(btn=>{
    btn.addEventListener("click", ()=> setSubtab(btn.dataset.subtab));
  });

  // ⚙️ settings modal
  el("btnOpenSettings").addEventListener("click", ()=> el("settingsModal").showModal());
  el("btnCloseSettings").addEventListener("click", ()=> el("settingsModal").close());

  el("btnSave").addEventListener("click", saveLocal);
  el("btnLoad").addEventListener("click", ()=>{ if(!loadLocal()) toast("沒有存檔"); render(); });

  el("btnExportJson").addEventListener("click", exportJSON);
  el("btnExportB64").addEventListener("click", exportB64);

  el("btnImport").addEventListener("click", ()=> el("importModal").showModal());
  el("btnDoImport").addEventListener("click", ()=>{
    try{
      const obj = importFromText(el("importText").value);
      S = obj;
      migrateIfNeeded();
      toast("匯入成功");
      el("importModal").close();
      saveLocal();
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

  // changelog
  el("btnShowChangelog").addEventListener("click", ()=> el("changelogModal").showModal());
  el("btnCloseChangelog").addEventListener("click", ()=> el("changelogModal").close());

  // gameplay
  el("btnRest").addEventListener("click", ()=> rest());

  el("btnExplore").addEventListener("click", ()=>{ exploreNext(); render(); });
  el("btnChallengeBoss").addEventListener("click", ()=>{ challengeBoss(); render(); });
  el("btnNextFloor").addEventListener("click", ()=> goNextFloor());
  el("btnResetTower").addEventListener("click", ()=> resetTower());

  el("btnAttack").addEventListener("click", ()=> attack("basic"));
  el("btnSkill").addEventListener("click", ()=> attack("skill"));
  el("btnBurst").addEventListener("click", ()=> attack("burst"));

  el("btnLootTest").addEventListener("click", ()=>{
    const drops = rollLoot(S.player.lv, "NORMAL");
    for (const it of drops) S.player.bag.push(it);
    log(`測試掉寶：${drops.length ? drops.map(x=>x.name).join("、") : "無"}`);
    saveLocal();
    render();
  });

  el("btnSortBag").addEventListener("click", ()=>{
    const rank = { "UR":3, "SR":2, "R":1, "N":0 };
    S.player.bag.sort((a,b)=>{
      const ra = a.type==="equip" ? (rank[a.rarity] ?? 0) : -1;
      const rb = b.type==="equip" ? (rank[b.rarity] ?? 0) : -1;
      if (rb !== ra) return rb - ra;
      const pa = a.type==="equip" ? a.power : a.amount;
      const pb = b.type==="equip" ? b.power : b.amount;
      return pb - pa;
    });
    toast("已整理背包");
    saveLocal();
    render();
  });

  el("btnUseBestPotion").addEventListener("click", ()=>{ useBestPotionAuto(); render(); });

  // auto battle loop
  el("btnToggleAuto").addEventListener("click", ()=>{
    S.battle.auto = !S.battle.auto;
    setAutoButtonText();
    saveLocal();
  });

  setInterval(()=>{
    if (!S.battle.auto) return;
    if (!S.battle.enemy) exploreNext();
    if (S.battle.enemy) attack("basic");
  }, 950);

  // ensure version
  S.meta.version = VERSION;
  saveLocal();
  render();
});