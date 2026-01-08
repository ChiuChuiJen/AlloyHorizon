// =====================
// Mecha RPG V0.0.6
// - Burst uses COHERENCE (同心率) only
// - EXE is leveling exp only
// - Burst Buff system (turn-based), affixes + enhance, exploration events + map progress bar
// - Cache busting via index.html: main.js?v=0.0.6
// =====================

const VERSION = "V0.0.6";

const CHANGELOG = [
  {
    version: "V0.0.6",
    date: "2026-01-08",
    notes: [
      "機體爆發 Buff：消耗同心率啟動，持續回合數，提供增傷/減傷",
      "裝備系統：詞綴（affix）、強化（+0~+10）、分解回收零件",
      "探索系統：補給/陷阱/伏擊/同心共鳴/偶遇商販；新增地圖進度條",
      "固定使用方法一快取處理：index.html 引用 main.js?v=0.0.6"
    ]
  },
  // 你之前的版本可以留著（略）— 若你要我幫你把 V0.0.5 也補回去我再補
];

const LS_KEY = "mecha_rpg_save";
const TOWER_MAX_FLOOR = 10;

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
  { key: "N",  name: "一般",   mult: 1.0, scrap: 2 },
  { key: "R",  name: "稀有",   mult: 1.25, scrap: 4 },
  { key: "SR", name: "超稀有", mult: 1.55, scrap: 8 },
  { key: "UR", name: "究極",   mult: 1.95, scrap: 16 },
];

const AFFIX_POOL = [
  { key:"overclock",  name:"超頻",   w: 18, stats:(p)=>({ atk: Math.floor(p*0.75) }) },
  { key:"fortified",  name:"加固",   w: 18, stats:(p)=>({ def: Math.floor(p*0.75) }) },
  { key:"coreplus",   name:"核心增幅", w: 14, stats:(p)=>({ hpMax: Math.floor(p*0.40) }) },
  { key:"databank",   name:"資料庫", w: 14, stats:(p)=>({ mpMax: Math.floor(p*0.25) }) },
  { key:"synclink",   name:"同心連結", w: 14, stats:(p)=>({ cohMax: Math.floor(p*0.30) }) },
  { key:"marksman",   name:"精準",   w: 11, stats:(p)=>({ acc: round4((p/7000)*1.0) }) },
  { key:"assassin",   name:"刺殺",   w: 11, stats:(p)=>({ crit: round4((p/7000)*1.2) }) },
];

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

function newGameState() {
  return {
    meta: { version: VERSION, createdAt: Date.now(), updatedAt: Date.now() },
    player: {
      lv: 1,
      exeLv: 0,   // ✅ EXE = 升級值（經驗）
      gold: 120,
      scrap: 0,   // ✅ 零件（分解/強化用）
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
    battle: {
      enemy: null,
      enemyType: null,
      auto: false,
      log: [],
      // ✅ Burst Buff（同心率啟動）
      burst: { active:false, turns:0, atkMult:1.0, dmgTakenMult:1.0 }
    }
  };
}

let S = loadOrInit();
migrateIfNeeded();

// -------------------- Migration --------------------
function migrateIfNeeded() {
  if (!S.meta) S.meta = { version: VERSION, createdAt: Date.now(), updatedAt: Date.now() };
  if (!S.meta.version) S.meta.version = VERSION;

  if (!S.player) S.player = newGameState().player;

  // xp -> exeLv
  if (typeof S.player.exeLv !== "number") {
    if (typeof S.player.xp === "number") S.player.exeLv = S.player.xp;
    else S.player.exeLv = 0;
  }
  delete S.player.xp;

  // en -> coh
  if (typeof S.player.coh !== "number") {
    if (typeof S.player.en === "number") S.player.coh = S.player.en;
    else S.player.coh = 0;
  }
  if (typeof S.player.cohMax !== "number") {
    if (typeof S.player.enMax === "number") S.player.cohMax = S.player.enMax;
    else S.player.cohMax = 50;
  }
  delete S.player.en; delete S.player.enMax;

  if (typeof S.player.scrap !== "number") S.player.scrap = 0;

  if (!S.player.equips) S.player.equips = Object.fromEntries(EQUIP_SLOTS.map(s => [s.key, null]));
  for (const s of EQUIP_SLOTS) if (!(s.key in S.player.equips)) S.player.equips[s.key] = null;

  if (!Array.isArray(S.player.bag)) S.player.bag = [];

  if (!S.tower) S.tower = newGameState().tower;
  if (!S.tower.floor) S.tower.floor = 1;
  if (!S.tower.floorState) S.tower.floorState = defaultFloorPlan();

  if (!S.battle) S.battle = newGameState().battle;
  if (!S.battle.burst) S.battle.burst = { active:false, turns:0, atkMult:1.0, dmgTakenMult:1.0 };

  // equip fields migration (enhance/affix)
  for (const it of S.player.bag.concat(Object.values(S.player.equips).filter(Boolean))) {
    if (it?.type === "equip") {
      if (typeof it.enh !== "number") it.enh = 0;
      if (!Array.isArray(it.affixes)) it.affixes = [];
      if (!it.basePower && it.power) it.basePower = it.power; // preserve
    }
  }

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

function loadOrInit() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return newGameState();
  try { return JSON.parse(raw); } catch { return newGameState(); }
}

// -------------------- Core math --------------------
function exeNeed(lv) {
  return Math.floor(120 + (lv - 1) * 70 + Math.pow(lv - 1, 1.35) * 25);
}
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

// recompute max hp/mp/coh with equips
function applyDerivedMax() {
  const p = S.player;
  let hpBonus = 0, mpBonus = 0, cohBonus = 0;

  for (const k of Object.keys(p.equips)) {
    const it = p.equips[k];
    if (!it || it.type !== "equip") continue;
    const st = calcEquipFinalStats(it);
    hpBonus += st.hpMax || 0;
    mpBonus += st.mpMax || 0;
    cohBonus += st.cohMax || 0;
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
    const st = calcEquipFinalStats(it);
    atk  += st.atk || 0;
    def  += st.def || 0;
    crit += st.crit || 0;
    acc  += st.acc || 0;
  }

  crit = clamp(crit, 0, 0.40);
  acc  = clamp(acc, 0.65, 0.99);
  return { atk, def, crit, acc };
}

// -------------------- Burst system (uses COH only) --------------------
function burstCost(){ return 40; }
function startBurst() {
  const p = S.player;
  const b = S.battle.burst;
  if (b.active) { toast("爆發已在啟動中"); return false; }
  if (p.coh < burstCost()) { toast(`同心率不足（需 ${burstCost()}）`); return false; }
  p.coh -= burstCost();

  b.active = true;
  b.turns = 3;          // ✅ 持續 3 回合（你的攻擊回合計）
  b.atkMult = 1.35;     // ✅ 增傷
  b.dmgTakenMult = 0.82;// ✅ 減傷
  log(`🔥 機體爆發啟動！持續 ${b.turns} 回合（同心率-${burstCost()}）`);
  return true;
}
function tickBurstAfterPlayerAction(){
  const b = S.battle.burst;
  if (!b.active) return;
  b.turns -= 1;
  if (b.turns <= 0) {
    b.active = false;
    b.turns = 0;
    b.atkMult = 1.0;
    b.dmgTakenMult = 1.0;
    log("🔥 爆發結束。");
  }
}

// -------------------- Exploration --------------------
function nextEncounterHint() {
  const fs = S.tower.floorState;
  const t = nextEncounterTypeForFloorState(fs);
  if (t === "CLEARED") return "本層已通關";
  if (t === "BOSS_READY") return "Boss（可挑戰）";
  if (t === "MINI") return "Mini Boss";
  if (!fs.eliteDone && fs.normalsDone >= 1 && Math.random() < 0.30) return "可能出現 菁英";
  return "一般怪 / 事件";
}

function exploreNext() {
  if (S.battle.enemy) { toast("正在戰鬥中"); return; }

  const fs = S.tower.floorState;
  if (fs.bossDone) { toast("本層已通關，請前往下一層"); return; }

  // ✅ 事件機率（不影響Boss流程）
  const planType = nextEncounterTypeForFloorState(fs);
  if (planType === "MINI") { spawnTowerEnemy("MINI"); return; }
  if (planType === "BOSS_READY") { toast("本層已可挑戰 Boss（點『挑戰 Boss』）"); return; }

  // 25% 事件（一般探索才觸發）
  if (Math.random() < 0.25) {
    doExploreEvent();
    saveLocal();
    render();
    return;
  }

  if (!fs.eliteDone && fs.normalsDone >= 1 && Math.random() < 0.30) {
    fs.eliteDone = true;
    spawnTowerEnemy("ELITE");
    return;
  }
  spawnTowerEnemy("NORMAL");
}

function doExploreEvent() {
  const p = S.player;
  applyDerivedMax();

  const events = [
    { w: 26, fn: ()=>{ // supply
      const hp = Math.floor(p.hpMax*0.18);
      const mp = Math.floor(p.mpMax*0.15);
      p.hp = clamp(p.hp+hp, 0, p.hpMax);
      p.mp = clamp(p.mp+mp, 0, p.mpMax);
      log(`🧰 補給站：HP+${hp} MP+${mp}`);
    }},
    { w: 18, fn: ()=>{ // trap
      const dmg = Math.max(1, Math.floor(p.hpMax*(0.10 + Math.random()*0.08)));
      p.hp = clamp(p.hp - dmg, 0, p.hpMax);
      log(`⚠️ 陷阱爆裂：HP-${dmg}`);
      if (p.hp <= 0) {
        p.hp = Math.max(1, Math.floor(p.hpMax*0.30));
        p.gold = Math.max(0, p.gold - 20);
        if (S.battle.auto) {
          S.battle.auto = false;
          setAutoButtonText();
          log("⛔ 自動戰鬥已停止（死亡觸發）");
        }
        log("⚠️ 機甲被擊破（事件），已緊急維修到 30% HP");
      }
    }},
    { w: 18, fn: ()=>{ // coherence surge
      const add = Math.floor(p.cohMax*(0.22 + Math.random()*0.12));
      p.coh = clamp(p.coh+add, 0, p.cohMax);
      log(`🧬 同心共鳴：同心率+${add}`);
    }},
    { w: 14, fn: ()=>{ // scrap cache
      const s = 6 + randInt(0, 8) + S.tower.floor*2;
      p.scrap += s;
      log(`🧩 零件箱：零件+${s}`);
    }},
    { w: 12, fn: ()=>{ // ambush
      log("🟥 伏擊！遭遇菁英單位");
      S.tower.floorState.eliteDone = true;
      spawnTowerEnemy("ELITE");
    }},
    { w: 12, fn: ()=>{ // roaming merchant
      const g = 30 + randInt(0, 30);
      p.gold += g;
      log(`🛒 偶遇商販：獲得金幣+${g}`);
    }},
  ];

  const ev = weightedPick(events);
  ev.fn();
}

// -------------------- Tower / Enemies --------------------
function canGoNextFloor() {
  const fs = S.tower.floorState;
  return fs.bossDone && S.tower.floor < TOWER_MAX_FLOOR;
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

// -------------------- Combat --------------------
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

  // ✅ 爆發按鈕：是「啟動爆發狀態」，不是直接加倍率攻擊
  if (kind === "burst") {
    if (!startBurst()) return;
    saveLocal(); render();
    return;
  }

  const hit = Math.random() < st.acc;
  if (!hit) { log("你的攻擊落空！"); enemyTurn(); render(); return; }

  let mult = 1.0;
  if (kind === "skill") mult = 1.40;

  // ✅ Burst Buff 影響你的傷害
  if (S.battle.burst.active) mult *= S.battle.burst.atkMult;

  const isCrit = Math.random() < st.crit;
  const critMult = isCrit ? 1.65 : 1.0;

  const raw = Math.floor(st.atk * mult * critMult);
  const dmg = Math.max(1, raw - e.def);

  e.hp = clamp(e.hp - dmg, 0, e.hpMax);

  // 同心率自然回（不和 EXE 混）
  p.coh = clamp(p.coh + 3, 0, p.cohMax);

  log(`你使用${kindName(kind)}造成 ${dmg} 傷害${isCrit ? "（暴擊）" : ""}！`);

  if (e.hp <= 0) { winBattle(); render(); return; }

  // ✅ 每次你完成一次「攻擊回合」後，消耗爆發回合數
  tickBurstAfterPlayerAction();

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
  let dmg = Math.max(1, raw - st.def);

  // ✅ Burst Buff 減傷（敵方對你）
  if (S.battle.burst.active) dmg = Math.max(1, Math.floor(dmg * S.battle.burst.dmgTakenMult));

  p.hp = clamp(p.hp - dmg, 0, p.hpMax);
  log(`敵人反擊，造成你 ${dmg} 傷害。`);

  if (p.hp <= 0) {
    log("⚠️ 你的機甲被擊破！已自動維修到 30% HP。");
    p.hp = Math.max(1, Math.floor(p.hpMax * 0.30));
    p.gold = Math.max(0, p.gold - 25);

    // 死亡停止自動戰鬥
    if (S.battle.auto) {
      S.battle.auto = false;
      setAutoButtonText();
      log("⛔ 自動戰鬥已停止（死亡觸發）");
    }

    // ✅ EXE 不歸零、同心率不強制歸零（你要求不要混在一起）
    // Burst 狀態結束
    S.battle.burst.active = false;
    S.battle.burst.turns = 0;
    S.battle.burst.atkMult = 1.0;
    S.battle.burst.dmgTakenMult = 1.0;

    S.battle.enemy = null;
    S.battle.enemyType = null;
    saveLocal();
  }
}

function winBattle() {
  const p = S.player;
  const e = S.battle.enemy;
  const et = S.battle.enemyType || "NORMAL";

  const gainEXE  = Math.floor((55 + e.lv * 28) * exeMultByEncounter(et)); // ✅ EXE only
  const gainGold = Math.floor((15 + e.lv * 9)  * goldMultByEncounter(et));
  const gainScrap = Math.floor((2 + e.lv * 0.6) * scrapMultByEncounter(et));

  p.exeLv += gainEXE;
  p.gold += gainGold;
  p.scrap += gainScrap;

  log(`✅ 擊敗 ${e.name}（${labelEncounter(et)}）！EXE+${gainEXE} 金幣+${gainGold} 零件+${gainScrap}`);

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
function scrapMultByEncounter(et){
  if (et==="BOSS") return 1.8;
  if (et==="MINI") return 1.4;
  if (et==="ELITE") return 1.2;
  return 1.0;
}

// -------------------- Loot / Equip generation --------------------
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

function genEquip(lv, encounterType="NORMAL") {
  const slot = pick(EQUIP_SLOTS);
  const r = rollRarity(encounterType);
  const basePower = Math.max(1, Math.floor((lv * 2 + randInt(0, lv+4)) * r.mult));

  const affixCount =
    r.key==="UR" ? randInt(1, 2) :
    r.key==="SR" ? (Math.random()<0.55 ? 1 : 0) :
    r.key==="R"  ? (Math.random()<0.25 ? 1 : 0) : 0;

  const affixes = [];
  for (let i=0;i<affixCount;i++){
    const a = weightedPick(AFFIX_POOL);
    if (affixes.some(x=>x.key===a.key)) continue;
    affixes.push({ key:a.key, name:a.name });
  }

  const stats = baseStatsBySlot(slot.key, basePower);

  const enh = 0;
  const name = buildEquipName(r.key, slot.key, basePower, enh, affixes);

  return {
    id: cryptoId(),
    type: "equip",
    slot: slot.key,
    rarity: r.key,
    basePower,
    power: basePower, // display convenience
    enh,
    affixes,
    name,
    stats, // base stats (before affix+enh scaling)
  };
}

function buildEquipName(rarityKey, slotKey, basePower, enh, affixes){
  const aff = affixes?.length ? `【${affixes.map(a=>a.name).join("・")}】` : "";
  const enhText = enh>0 ? ` +${enh}` : "";
  return `${rarityName(rarityKey)}${aff} ${slotName(slotKey)}-MK${randInt(1, 9)}（強度${basePower}${enhText}）`;
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

// final equip stats = base stats * (enh scaling) + affix stats
function calcEquipFinalStats(it){
  const base = it.stats || {};
  const enh = it.enh || 0;

  // 強化倍率：+0~+10
  const mult = 1 + enh * 0.06; // +10 ≈ +60%
  const st = {
    atk: Math.floor((base.atk||0)*mult),
    def: Math.floor((base.def||0)*mult),
    hpMax: Math.floor((base.hpMax||0)*mult),
    mpMax: Math.floor((base.mpMax||0)*mult),
    cohMax: Math.floor((base.cohMax||0)*mult),
    crit: base.crit || 0,
    acc: base.acc || 0,
  };

  // affix add
  if (Array.isArray(it.affixes)) {
    for (const a of it.affixes) {
      const tmpl = AFFIX_POOL.find(x=>x.key===a.key);
      if (!tmpl) continue;
      const add = tmpl.stats(it.basePower || it.power || 1);
      for (const k of Object.keys(add)) {
        if (k === "crit" || k === "acc") st[k] = (st[k] || 0) + (add[k] || 0);
        else st[k] = (st[k] || 0) + (add[k] || 0);
      }
    }
  }

  st.crit = clamp(st.crit||0, 0, 0.20);
  st.acc  = clamp(st.acc||0,  0, 0.12);
  return st;
}

// -------------------- Inventory actions --------------------
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
  cand.sort((a,b)=> (scoreEquip(b) - scoreEquip(a)));
  equipItemById(cand[0].id);
}

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

// ✅ 分解裝備 → 零件
function dismantleEquip(itemId){
  const p = S.player;
  const it = p.bag.find(x=>x.id===itemId);
  if (!it || it.type!=="equip") return;

  const r = RARITY.find(x=>x.key===it.rarity) || RARITY[0];
  const base = r.scrap;
  const plus = Math.floor((it.basePower||it.power||1) / 10) + (it.enh||0)*2;
  const get = Math.max(1, base + plus);

  p.scrap += get;
  p.bag = p.bag.filter(x=>x.id!==itemId);
  log(`🧩 分解：${it.name} → 零件+${get}`);
  saveLocal(); render();
}

// ✅ 強化裝備（+0~+10）
function enhanceEquip(itemId){
  const p = S.player;
  const it = p.bag.find(x=>x.id===itemId);
  if (!it || it.type!=="equip") return;
  const enh = it.enh||0;
  if (enh >= 10) { toast("已達強化上限 +10"); return; }

  const costGold = 30 + (enh+1)*22 + Math.floor((it.basePower||it.power||1)*0.25);
  const costScrap = 4 + (enh+1)*3;

  if (p.gold < costGold) { toast(`金幣不足（需 ${costGold}）`); return; }
  if (p.scrap < costScrap) { toast(`零件不足（需 ${costScrap}）`); return; }

  p.gold -= costGold;
  p.scrap -= costScrap;

  it.enh = enh + 1;
  it.power = (it.basePower||it.power||1) + it.enh; // display
  it.name = buildEquipName(it.rarity, it.slot, (it.basePower||it.power||1), it.enh, it.affixes);

  log(`🔧 強化成功：${it.name}（-金幣${costGold} / -零件${costScrap}）`);
  applyDerivedMax();
  saveLocal(); render();
}

function scoreEquip(it){
  const st = calcEquipFinalStats(it);
  const rRank = ({N:0,R:1,SR:2,UR:3}[it.rarity] ?? 0);
  return (st.atk||0)*1.2 + (st.def||0)*1.0 + (st.hpMax||0)*0.12 + (st.cohMax||0)*0.10 + rRank*80 + (it.enh||0)*45;
}

function useConsumable(itemId) {
  const p = S.player;
  const it = p.bag.find(x => x.id === itemId);
  if (!it || it.type !== "consumable") return;

  applyDerivedMax();
  if (it.kind === "heal_hp") p.hp = clamp(p.hp + it.amount, 0, p.hpMax);
  if (it.kind === "heal_mp") p.mp = clamp(p.mp + it.amount, 0, p.mpMax);
  if (it.kind === "heal_coh") p.coh = clamp(p.coh + it.amount, 0, p.cohMax);
  if (it.kind === "gain_exe") p.exeLv = clamp(p.exeLv + it.amount, 0, exeNeed(p.lv)); // ✅ EXE only

  p.bag = p.bag.filter(x => x.id !== itemId);
  log(`使用：${it.name}（效果：${consumableDesc(it)}）`);

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

// -------------------- Shop --------------------
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
    { kind:"buy_scrap", price: 40 + lv*4, amount: 10 + lv*2, label:"購買零件（強化用）" },
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
    return;
  }
  if (entry.kind === "buy_scrap") {
    if (p.gold < entry.price) { toast("金幣不足"); return; }
    p.gold -= entry.price;
    p.scrap += entry.amount;
    log(`購買：零件+${entry.amount}（-${entry.price}G）`);
    saveLocal(); render();
  }
}

// -------------------- UI rendering --------------------
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
  el("scrap2").textContent = p.scrap;

  // EXE leveling display
  el("exeLvVal").textContent = p.exeLv;
  el("exeLvNeed").textContent = exeNeed(p.lv);

  // Bars
  setBar(p.hp, p.hpMax, "hpBar", "hpText");
  setBar(p.mp, p.mpMax, "mpBar", "mpText");
  setBar(p.coh, p.cohMax, "cohBar", "cohText");

  el("exeBarText").textContent = `${p.exeLv} / ${exeNeed(p.lv)}`;
  el("exeLvBar").style.width = `${(p.exeLv / exeNeed(p.lv)) * 100}%`;

  // Burst state text
  const b = S.battle.burst;
  el("burstState").textContent = b.active ? `啟動中（剩 ${b.turns} 回合）` : "—";

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

function setBar(cur, max, barId, textId) {
  el(textId).textContent = `${cur} / ${max}`;
  const pct = max<=0 ? 0 : (cur/max)*100;
  el(barId).style.width = `${pct}%`;
}

function floorMapProgressPercent(){
  const fs = S.tower.floorState;
  // 權重：一般 60%（3隻）、菁英 10%、mini 10%、boss 20%
  const normalP = clamp(fs.normalsDone / fs.normalNeed, 0, 1) * 60;
  const eliteP  = fs.eliteDone ? 10 : 0;
  const miniP   = fs.miniBossDone ? 10 : 0;
  const bossP   = fs.bossDone ? 20 : 0;
  return Math.floor(normalP + eliteP + miniP + bossP);
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

  const pct = floorMapProgressPercent();
  el("mapText").textContent = `${pct}%`;
  el("mapBar").style.width = `${pct}%`;

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
      <div class="meta">${it ? formatEquipStats(calcEquipFinalStats(it)) : ""}</div>
      <div class="actions">
        <button class="btnBest">裝最強</button>
        <button class="btnUnequip danger">卸下</button>
      </div>
    `;

    div.querySelector(".btnBest").addEventListener("click", ()=> equipBest(s.key));
    div.querySelector(".btnUnequip").addEventListener("click", ()=> unequip(s.key));

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
      const st = calcEquipFinalStats(it);
      const enh = it.enh||0;
      const gCost = enhanceGoldCost(it);
      const sCost = enhanceScrapCost(it);
      d.innerHTML = `
        <div class="top">
          <div class="name">${it.name}</div>
          <div class="badge">${rarityName(it.rarity)} • +${enh}</div>
        </div>
        <div class="desc">
          部位：${slotName(it.slot)}<br/>
          ${formatEquipStats(st)}<br/>
          詞綴：${it.affixes?.length ? it.affixes.map(a=>a.name).join("、") : "無"}
        </div>
        <div class="btns">
          <button class="btnEquip">裝備</button>
          <button class="btnEnh">強化（-${gCost}G / -${sCost}零件）</button>
          <button class="btnDis">分解（回收零件）</button>
        </div>
      `;
      d.querySelector(".btnEquip").addEventListener("click", ()=> equipItemById(it.id));
      d.querySelector(".btnEnh").addEventListener("click", ()=> enhanceEquip(it.id));
      d.querySelector(".btnDis").addEventListener("click", ()=> dismantleEquip(it.id));
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

function enhanceGoldCost(it){
  const enh = it.enh||0;
  return 30 + (enh+1)*22 + Math.floor((it.basePower||it.power||1)*0.25);
}
function enhanceScrapCost(it){
  const enh = it.enh||0;
  return 4 + (enh+1)*3;
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
    } else if (entry.kind === "buy_box") {
      card.innerHTML = `
        <div class="top">
          <div class="name">${entry.label}</div>
          <div class="badge">${entry.price}G</div>
        </div>
        <div class="desc">隨機掉落 1 件裝備（含詞綴/稀有度）。</div>
        <div class="btns"><button class="btnBuy">購買</button></div>
      `;
      card.querySelector(".btnBuy").addEventListener("click", ()=> buyShopEntry(entry));
    } else if (entry.kind === "buy_scrap") {
      card.innerHTML = `
        <div class="top">
          <div class="name">${entry.label}</div>
          <div class="badge">${entry.price}G</div>
        </div>
        <div class="desc">獲得零件 +${entry.amount}</div>
        <div class="btns"><button class="btnBuy">購買</button></div>
      `;
      card.querySelector(".btnBuy").addEventListener("click", ()=> buyShopEntry(entry));
    }

    wrap.appendChild(card);
  }
}

// ✅ 戰鬥紀錄：最新在最上面
function renderLog() {
  const wrap = el("log");
  wrap.innerHTML = S.battle.log.map(line => `<div>${escapeHtml(line)}</div>`).join("");
  wrap.scrollTop = 0;
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

// -------------------- UX helpers --------------------
function log(msg) {
  const time = new Date().toLocaleTimeString("zh-TW", {hour:"2-digit", minute:"2-digit"});
  S.battle.log.unshift(`[${time}] ${msg}`);
  if (S.battle.log.length > 220) S.battle.log.pop();
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
function weightedPick(arr){
  const sum = arr.reduce((s,x)=>s+(x.w||1),0);
  let r = Math.random()*sum;
  for (const x of arr){
    r -= (x.w||1);
    if (r<=0) return x;
  }
  return arr[arr.length-1];
}

// -------------------- Tabs --------------------
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

// -------------------- DOM events --------------------
window.addEventListener("DOMContentLoaded", ()=>{
  // main tabs
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.addEventListener("click", ()=> setTab(btn.dataset.tab));
  });

  // subtabs
  document.querySelectorAll(".subtab").forEach(btn=>{
    btn.addEventListener("click", ()=> setSubtab(btn.dataset.subtab));
  });

  // settings modal
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
  el("btnRest").addEventListener("click", ()=>{
    const p = S.player;
    applyDerivedMax();
    p.hp = clamp(p.hp + Math.floor(p.hpMax * 0.25), 0, p.hpMax);
    p.mp = clamp(p.mp + Math.floor(p.mpMax * 0.35), 0, p.mpMax);
    p.coh = clamp(p.coh + Math.floor(p.cohMax * 0.35), 0, p.cohMax);
    log(`維修完成：HP/MP/同心率回復（不超過最大值）`);
    saveLocal(); render();
  });

  el("btnExplore").addEventListener("click", ()=>{ exploreNext(); render(); });
  el("btnChallengeBoss").addEventListener("click", ()=>{ challengeBoss(); render(); });
  el("btnNextFloor").addEventListener("click", ()=> goNextFloor());
  el("btnResetTower").addEventListener("click", ()=> resetTower());

  el("btnAttack").addEventListener("click", ()=> attack("basic"));
  el("btnSkill").addEventListener("click", ()=> attack("skill"));
  el("btnBurst").addEventListener("click", ()=> attack("burst")); // start burst state

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
      const ea = a.type==="equip" ? (a.enh||0) : 0;
      const eb = b.type==="equip" ? (b.enh||0) : 0;
      if (eb !== ea) return eb - ea;
      const sa = a.type==="equip" ? scoreEquip(a) : a.amount;
      const sb = b.type==="equip" ? scoreEquip(b) : b.amount;
      return sb - sa;
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

  S.meta.version = VERSION;
  saveLocal();
  render();
});