// Combat du joueur : attaques de base, compétences, ultimes, projectiles, zones, effets.
// Règles clés :
//  - attaques de base : endurance (physiques) ou mana (magie) ; aucune munition ;
//  - maîtrise gagnée uniquement par les dégâts réels infligés aux ennemis (plafonnés à leurs PV) ;
//  - jauge d'ultime partagée entre familles, alimentée par les dégâts réels infligés et subis ;
//  - les recharges sont propres à chaque compétence et continuent quand l'arme n'est pas en main.
import { ENEMY, PLAYER, TILE } from '../config/balance';
import { BUILDING_BY_ID } from '../data/buildings';
import { ENEMIES } from '../data/enemies';
import { item } from '../data/items';
import {
  FAMILY, MASTERY_XP, SKILL, SUMMON, ULTS, ULT_GAUGE, masteryLevel, type Family, type ProjKind, type SkillId,
} from '../data/weapons';
import type { Game } from './game';
import { enemiesNear } from './enemies';
import {
  armorReduction, currentFamily, currentWeapon, damageMul, loadout, maxHp, skillUnlocked, ultChargeMul, ultUnlocked, weaponProcs,
} from './profile';
import type { Enemy, InputState, ProjFx, Projectile, Statuses, Zone, ZoneKind } from './types';
import { onEnemyKilled, killPlayer } from './travel';

const DEG = Math.PI / 180;

function facingOf(dx: number, dy: number): 'up' | 'down' | 'left' | 'right' {
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
}

function face(g: Game, dx: number, dy: number): void {
  const p = g.player;
  const d = Math.hypot(dx, dy) || 1;
  p.aimX = dx / d;
  p.aimY = dy / d;
  p.facing = facingOf(p.aimX, p.aimY);
}

/** Ligne de vue libre (murs, grands obstacles) entre deux points (px). */
export function clearShot(g: Game, x0: number, y0: number, x1: number, y1: number): boolean {
  const w = g.world;
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (TILE / 3));
  for (let i = 1; i < steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const y = y0 + ((y1 - y0) * i) / steps;
    if (w.blocksSight(Math.floor(x / TILE), Math.floor(y / TILE))) return false;
  }
  return true;
}

/**
 * Aide à la visée légère : priorité à l'avant, correction limitée (cône), jamais derrière,
 * jamais à travers un obstacle.
 */
export function autoAim(g: Game, range: number, coneDeg = 55): Enemy | null {
  const p = g.player;
  let best: Enemy | null = null;
  let bestScore = Infinity;
  const cos = Math.cos(coneDeg * DEG);
  for (const e of enemiesNear(g, p.x, p.y, range)) {
    if (e.dying > 0 || e.state === 'hidden' || e.burrowed) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const dot = (dx * p.aimX + dy * p.aimY) / d;
    // de très près, un ennemi sur le côté reste visé ; jamais derrière
    if (dot < cos && !(d < 34 && dot > -0.2)) continue;
    if (!clearShot(g, p.x, p.y - 12, e.x, e.y - 12)) continue;
    const score = d * (2 - dot);
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

function resourceOf(g: Game): 'stamina' | 'mana' {
  const f = currentFamily(g);
  return f ? FAMILY[f].resource : 'stamina';
}

function spend(g: Game, cost: number): boolean {
  const p = g.player;
  if (resourceOf(g) === 'mana') {
    if (p.mana < cost) return false;
    p.mana -= cost;
    p.manaDelay = PLAYER.manaRegenDelay;
  } else {
    if (p.stamina < cost) return false;
    p.stamina -= cost;
    p.staminaDelay = PLAYER.staminaRegenDelay;
  }
  return true;
}

// ------------------------------------------------------------ tour de jeu du joueur
export function tickPlayerCombat(g: Game, dt: number, input: InputState, wantAttack: boolean): 'attack' | 'harvest' | 'none' {
  const p = g.player;
  const fam = currentFamily(g);
  p.parryT = Math.max(0, p.parryT - dt);
  p.rapidT = Math.max(0, p.rapidT - dt);
  if (p.shieldT > 0) {
    p.shieldT -= dt;
    if (p.shieldT <= 0) p.shield = 0;
  }
  // arbalète : le rechargement n'avance que si l'arbalète est en main (changer d'arme ne recharge pas)
  if (fam === 'crossbow' && !p.xbowLoaded) {
    const st = currentWeapon(g);
    p.reloadT += dt * (p.rapidT > 0 ? 4 : 1);
    if (p.reloadT >= (st.reload ?? 1)) {
      p.xbowLoaded = true;
      p.reloadT = 0;
      g.emit({ type: 'sound', key: 'reload' });
    }
  }
  // invocations : disparaissent si l'on change de famille
  if (g.allies.length && fam !== 'occult') g.allies = [];

  if (p.pendingHit > 0) {
    p.pendingHit -= dt;
    if (p.pendingHit <= 0) resolveMelee(g, p.pendingMul);
  }
  if (p.dashT > 0) updateDash(g, dt);
  if (p.combo) updateCombo(g, dt);
  const busy = p.st.stunT > 0 || !!p.combo || p.dashT > 0 || p.dodgeT > 0;

  // compétences
  for (const i of [0, 1] as const) {
    if (input.skillTap[i]) {
      input.skillTap[i] = false;
      if (!busy) useSkill(g, i);
    }
  }
  // ultime : visée manuelle, lancement au relâchement, annulation possible
  if (input.ultCancel) {
    input.ultCancel = false;
    input.ultRelease = false;
  }
  if (input.ultRelease) {
    input.ultRelease = false;
    if (!busy) castUlt(g, input.ultX, input.ultY);
  }
  if (busy || !wantAttack || p.attackCd > 0 || p.actionT > 0) return 'none';
  return basicAttack(g);
}

// ------------------------------------------------------------ attaque de base
function basicAttack(g: Game): 'attack' | 'harvest' | 'none' {
  const p = g.player;
  const fam = currentFamily(g);
  const w = currentWeapon(g);
  const ranged = !!fam && FAMILY[fam].ranged;
  const near = enemiesNear(g, p.x, p.y, ranged ? w.reach : w.reach + 40).some((e) => e.dying <= 0 && e.state !== 'hidden');
  if (!near && g.target && g.target.kind === 'harvest') return 'harvest';
  const aim = autoAim(g, ranged ? w.reach : w.reach + 36, ranged ? 50 : 60);
  if (aim) face(g, aim.x - p.x, aim.y - p.y);

  if (fam === 'crossbow' && !p.xbowLoaded) {
    g.emit({ type: 'float', x: p.x, y: p.y - 46, text: 'Rechargement…', color: '#cfd8e3' });
    p.attackCd = 0.25;
    return 'attack';
  }
  const paid = spend(g, w.cost);
  if (!paid && resourceOf(g) === 'mana') {
    g.emit({ type: 'float', x: p.x, y: p.y - 46, text: 'Mana insuffisante', color: '#8fb8ff' });
    p.attackCd = 0.3;
    return 'attack';
  }
  const tired = !paid;
  p.attackCd = w.cooldown * (tired ? 1.7 : 1);
  const mul = damageMul(g, fam) * (tired ? 0.6 : 1);
  const look = lookOf(g);
  if (!fam || !FAMILY[fam].ranged) {
    p.action = fam ? (FAMILY[fam].anim as 'slash') : 'slash';
    p.actionLook = look;
    p.actionT = fam === 'dagger' ? 0.26 : fam === 'mace' ? 0.45 : 0.36;
    p.pendingHit = fam === 'mace' ? 0.2 : 0.12;
    p.pendingMul = mul;
    g.emit({ type: 'sound', key: fam === 'dagger' ? 'knife' : fam === 'mace' ? 'swing_heavy' : fam === 'sword' ? 'swing_sword' : `swing_${g.rng.int(0, 1)}` });
    g.emit({ type: 'swing', x: p.x + p.aimX * 22, y: p.y - 16 + p.aimY * 18, angle: Math.atan2(p.aimY, p.aimX) });
  } else {
    p.action = FAMILY[fam].anim;
    p.actionLook = look;
    p.actionT = fam === 'bow' ? 0.4 : fam === 'crossbow' ? 0.3 : 0.42;
    const fx: ProjFx | undefined = undefined;
    shoot(g, w.projKind!, w.damage * mul, w.reach, w.projSpeed!, { family: fam, knockback: w.knockback, aoe: w.splash, fx });
    if (fam === 'crossbow') {
      p.xbowLoaded = false;
      p.reloadT = 0;
    }
    g.emit({ type: 'sound', key: fam === 'bow' || fam === 'crossbow' ? 'bow' : fam === 'elemental' ? `spell_${g.rng.int(0, 1)}` : 'magic' });
  }
  return 'attack';
}

export function lookOf(g: Game): string | null {
  const w = g.player.equip.weapon;
  if (!w) return null;
  const d = item(w.id);
  return FAMILY[d.weapon!.family].look[(d.tier ?? 1) - 1];
}

/** Coup au corps à corps de l'arme en main (appliqué un court instant après le geste). */
function resolveMelee(g: Game, mul: number): void {
  const p = g.player;
  if (p.dead) return;
  const fam = currentFamily(g);
  const w = currentWeapon(g);
  let hit = 0;
  const procs = weaponProcs(g);
  for (const e of enemiesNear(g, p.x, p.y, w.reach + 30)) {
    if (e.dying > 0 || e.state === 'hidden' || e.burrowed) continue;
    const dx = e.x - p.x;
    const dy = e.y - (p.y - 4);
    const d = Math.hypot(dx, dy) || 1;
    if (d > w.reach + ENEMIES[e.type].radius + 4) continue;
    const dot = (dx * p.aimX + dy * p.aimY) / d;
    if (dot < 0.2 && d > 20) continue;
    const fx: ProjFx = {};
    if (p.poisonBlade > 0) fx.poison = 4;
    if (procs.poison && g.rng.chance(procs.poison)) fx.poison = 3;
    if (procs.burn && g.rng.chance(procs.burn)) fx.burn = 3;
    if (procs.slow && g.rng.chance(procs.slow)) fx.slow = 2;
    damageEnemy(g, e, w.damage * mul, { family: fam, kx: (dx / d) * w.knockback, ky: (dy / d) * w.knockback, fx, basic: true });
    hit++;
  }
  hit += hitDummies(g, p.x + p.aimX * (w.reach * 0.6), p.y - 4 + p.aimY * (w.reach * 0.6), w.reach * 0.7, w.damage * mul);
  if (hit && p.poisonBlade > 0) p.poisonBlade--;
  if (hit) {
    g.noise(p.x, p.y, 7 * TILE);
    g.emit({ type: 'sound', key: `hit_${g.rng.int(0, 2)}`, x: p.x, y: p.y });
  }
}

/** Mannequin d'entraînement : affiche les dégâts, sans maîtrise ni charge d'ultime. */
export function hitDummies(g: Game, x: number, y: number, r: number, dmg: number): number {
  if (!g.atCamp) return 0;
  let n = 0;
  for (const b of g.nearbyBuildings(x, y, r + TILE)) {
    if (!BUILDING_BY_ID[b.type].dummy) continue;
    const c = g.world.buildingCenter(b);
    if (Math.hypot(c.x - x, c.y - y) > r + 18) continue;
    g.emit({ type: 'float', x: c.x, y: c.y - 40, text: `${Math.round(dmg)}`, color: '#e9e2cf' });
    g.emit({ type: 'fx', kind: 'spark', x: c.x, y: c.y - 20 });
    g.emit({ type: 'sound', key: 'thud', x: c.x, y: c.y });
    g.stats.dummyHits++;
    n++;
  }
  return n;
}

interface ShotOpts {
  family?: Family | null;
  knockback?: number;
  pierce?: number;
  aoe?: number;
  fx?: ProjFx;
  angle?: number; // décalage (radians)
  radius?: number;
}

export function shoot(g: Game, kind: ProjKind, damage: number, range: number, speed: number, o: ShotOpts = {}): Projectile {
  const p = g.player;
  const a = Math.atan2(p.aimY, p.aimX) + (o.angle ?? 0);
  const vx = Math.cos(a) * speed;
  const vy = Math.sin(a) * speed;
  const pr: Projectile = {
    id: g.newId(), x: p.x + Math.cos(a) * 12, y: p.y - 18 + Math.sin(a) * 12, vx, vy, life: range / speed, damage, owner: 'player', kind,
    pierce: o.pierce ?? 0, hit: [], radius: o.radius ?? 14, aoe: o.aoe, fx: o.fx, family: o.family ?? undefined, knockback: o.knockback ?? 60,
  };
  g.projectiles.push(pr);
  return pr;
}

// ------------------------------------------------------------ dégâts
interface DamageOpts {
  family?: Family | null;
  kx?: number;
  ky?: number;
  fx?: ProjFx;
  source?: 'player' | 'ally' | 'dot';
  ignoreArmor?: boolean;
  basic?: boolean;
  noFloat?: boolean;
}

export function damageEnemy(g: Game, e: Enemy, raw: number, o: DamageOpts = {}): number {
  if (e.dying > 0 || e.burrowed) return 0;
  const d = ENEMIES[e.type];
  let mult = 1;
  if (!o.ignoreArmor) mult *= 1 - (d.armor ?? 0);
  if (e.st.curseT > 0) mult *= 1.3;
  if (e.st.brokenT > 0) mult *= 1.25;
  // fenêtre de riposte des boss et des brutes : plus vulnérables juste après un gros coup
  if (e.atk && e.atk.phase === 'recover' && (d.boss || d.ai === 'brute')) mult *= 1.2;
  const dmg = Math.max(1, Math.round(raw * mult));
  const before = e.hp;
  e.hp -= dmg;
  const effective = Math.min(dmg, Math.max(0, before));
  const source = o.source ?? 'player';
  // maîtrise et jauge d'ultime : dégâts réels du joueur uniquement (pas les invocations)
  if (source !== 'ally' && o.family) gainMastery(g, o.family, effective);
  if (source !== 'ally') addUlt(g, effective * ULT_GAUGE.perDamageDealt);
  if (source === 'player') {
    const leech = weaponProcs(g).leech;
    if (leech && o.basic) g.player.hp = Math.min(maxHp(g), g.player.hp + effective * leech);
  }
  if (o.fx) applyFx(g, e, o.fx, o.family ?? null);
  const kr = 1 - d.knockbackResist;
  e.kbx += (o.kx ?? 0) * kr;
  e.kby += (o.ky ?? 0) * kr;
  e.hurtT = 0.18;
  if (e.state !== 'chase' && e.state !== 'hidden' && d.ai !== 'prey' && d.ai !== 'static') {
    e.state = d.ai === 'skittish' && e.hp < e.maxHp * 0.5 ? 'flee' : 'chase';
    e.repathT = 0;
  }
  if (d.ai === 'prey') e.state = 'flee';
  e.aggro = true;
  if (!o.noFloat) g.emit({ type: 'float', x: e.x, y: e.y - 48 * (d.sprite.scale ?? 1), text: `${dmg}`, color: source === 'dot' ? '#b6e38a' : '#ffffff' });
  if (source !== 'dot') {
    g.emit({ type: 'fx', kind: d.animal ? 'blood' : 'spark', x: e.x, y: e.y - 20 });
    g.emit({ type: 'sound', key: d.sound?.hurt ?? `hit_${g.rng.int(0, 2)}`, x: e.x, y: e.y });
  }
  if (e.hp <= 0 && e.dying <= 0) {
    e.dying = 0.8;
    e.atk = null;
    onEnemyKilled(g, e);
  }
  return dmg;
}

function applyFx(g: Game, e: Enemy, fx: ProjFx, family: Family | null): void {
  const d = ENEMIES[e.type];
  const cc = 1 - d.ccResist;
  if (fx.slow) {
    e.st.slowT = Math.max(e.st.slowT, fx.slow);
    e.st.slowMul = Math.min(e.st.slowMul < 1 && e.st.slowT > 0 ? e.st.slowMul : 1, 0.5 + 0.2 * d.ccResist);
  }
  if (fx.root) {
    // boss et grosses créatures : ralentis au lieu d'être immobilisés
    if (d.ccResist >= 0.5) {
      e.st.slowT = Math.max(e.st.slowT, fx.root * 2);
      e.st.slowMul = 0.6;
    } else e.st.rootT = Math.max(e.st.rootT, fx.root * cc);
    g.emit({ type: 'fx', kind: 'ice', x: e.x, y: e.y - 16 });
  }
  if (fx.stun) {
    const t = fx.stun * cc;
    if (t > 0.05) {
      e.st.stunT = Math.max(e.st.stunT, t);
      if (e.atk && e.atk.phase === 'windup') {
        const kind = d.attacks[e.atk.index].kind;
        const heavy = kind === 'charge' || kind === 'slam' || kind === 'burrow' || kind === 'rockfall' || kind === 'roar';
        if (!(d.boss && heavy)) {
          e.atk = null;
          e.burrowed = false;
        } else e.st.stunT = 0; // les boss ne sont jamais bloqués pendant un grand coup
      }
    }
  }
  if (fx.interrupt && e.atk && e.atk.phase === 'windup') {
    const kind = d.attacks[e.atk.index].kind;
    const heavy = kind === 'charge' || kind === 'slam' || kind === 'burrow' || kind === 'rockfall' || kind === 'roar';
    if (!d.boss || !heavy) {
      e.atk = null;
      e.burrowed = false;
      e.cds.forEach((_, i) => (e.cds[i] = Math.max(e.cds[i], 1)));
      g.emit({ type: 'float', x: e.x, y: e.y - 60, text: 'Interrompu !', color: '#ffe08a' });
    }
  }
  if (fx.poison) {
    e.st.poisonT = 5;
    e.st.poisonDps = Math.max(e.st.poisonDps, fx.poison);
    g.emit({ type: 'fx', kind: 'poison', x: e.x, y: e.y - 20 });
  }
  if (fx.burn) {
    e.st.burnT = 4;
    e.st.burnDps = Math.max(e.st.burnDps, fx.burn);
  }
  if (fx.curse) {
    e.st.curseT = 8;
    g.emit({ type: 'fx', kind: 'curse', x: e.x, y: e.y - 30 });
  }
  if (family) dotFamily.set(e.id, family);
}

const dotFamily = new Map<number, Family>();

/** Effets dans le temps (poison, brûlure) et durées des contrôles. */
export function tickStatuses(g: Game, st: Statuses, dt: number, e: Enemy | null): void {
  st.slowT = Math.max(0, st.slowT - dt);
  if (st.slowT <= 0) st.slowMul = 1;
  st.rootT = Math.max(0, st.rootT - dt);
  st.stunT = Math.max(0, st.stunT - dt);
  st.curseT = Math.max(0, st.curseT - dt);
  st.brokenT = Math.max(0, st.brokenT - dt);
  let dot = 0;
  if (st.poisonT > 0) {
    st.poisonT -= dt;
    dot += st.poisonDps * dt;
    if (st.poisonT <= 0) st.poisonDps = 0;
  }
  if (st.burnT > 0) {
    st.burnT -= dt;
    dot += st.burnDps * dt;
    if (st.burnT <= 0) st.burnDps = 0;
  }
  if (!dot) return;
  if (e) {
    // les petits dégâts s'accumulent et s'affichent par paliers
    (e as Enemy & { dotAcc?: number }).dotAcc = ((e as Enemy & { dotAcc?: number }).dotAcc ?? 0) + dot;
    const acc = (e as Enemy & { dotAcc?: number }).dotAcc!;
    if (acc >= 2) {
      (e as Enemy & { dotAcc?: number }).dotAcc = acc - Math.floor(acc);
      damageEnemy(g, e, Math.floor(acc), { family: dotFamily.get(e.id) ?? null, source: 'dot', ignoreArmor: true });
    }
  } else {
    const p = g.player;
    if (!p.dead) {
      p.hp -= dot;
      if (p.hp <= 0) killPlayer(g, 'Le poison a eu raison de vous.');
    }
  }
}

export function gainMastery(g: Game, f: Family, amount: number): void {
  if (amount <= 0) return;
  const before = masteryLevel(g.mastery[f]);
  g.mastery[f] = Math.min(MASTERY_XP[MASTERY_XP.length - 1], (g.mastery[f] ?? 0) + amount);
  const after = masteryLevel(g.mastery[f]);
  if (after > before) {
    g.emit({ type: 'mastery', family: f, level: after });
    g.emit({ type: 'sound', key: 'achieve' });
    g.log(`Maîtrise ${FAMILY[f].short} : niveau ${after}.`);
  }
}

export function addUlt(g: Game, amount: number): void {
  if (amount <= 0) return;
  g.ult = Math.min(100, g.ult + amount * ultChargeMul(g));
}

/** Coup reçu par le joueur (esquive, parade, bouclier, protection, puis PV). */
export function hurtPlayer(g: Game, amount: number, fromX: number, fromY: number, source: string, o: { attacker?: Enemy; knock?: number } = {}): void {
  const p = g.player;
  if (p.dead || p.invuln > 0 || p.dodgeT > 0 || p.combo?.kind === 'dagger') return;
  // parade : le coup est annulé et renvoyé
  if (p.parryT > 0 && o.attacker && o.attacker.dying <= 0) {
    p.parryT = 0;
    const w = currentWeapon(g);
    const a = o.attacker;
    damageEnemy(g, a, w.damage * damageMul(g, 'sword') * 2.5, { family: 'sword', fx: { stun: 1.2 }, kx: (a.x - p.x) * 3, ky: (a.y - p.y) * 3 });
    p.invuln = 0.3;
    g.emit({ type: 'sound', key: 'clang' });
    g.emit({ type: 'fx', kind: 'spark', x: (a.x + p.x) / 2, y: (a.y + p.y) / 2 - 20, scale: 1.5 });
    g.emit({ type: 'float', x: p.x, y: p.y - 50, text: 'Parade !', color: '#ffe08a' });
    return;
  }
  let dmg = Math.max(1, Math.round(amount * (1 - armorReduction(g))));
  if (p.shield > 0) {
    const absorbed = Math.min(p.shield, dmg);
    p.shield -= absorbed;
    dmg -= absorbed;
    g.emit({ type: 'fx', kind: 'turtleshell', x: p.x, y: p.y - 20 });
    if (dmg <= 0) return;
  }
  const before = p.hp;
  p.hp -= dmg;
  addUlt(g, Math.min(dmg, Math.max(0, before)) * ULT_GAUGE.perDamageTaken);
  p.invuln = PLAYER.hurtInvuln;
  p.sinceHurt = 0;
  const d = Math.hypot(p.x - fromX, p.y - fromY) || 1;
  const k = o.knock ?? 14;
  g.movePlayer(((p.x - fromX) / d) * k, 0);
  g.movePlayer(0, ((p.y - fromY) / d) * k);
  g.emit({ type: 'float', x: p.x, y: p.y - 40, text: `-${dmg}`, color: '#ff6b5b' });
  g.emit({ type: 'sound', key: 'hurt' });
  g.emit({ type: 'shake', strength: dmg > 18 ? 0.01 : 0.006 });
  g.emit({ type: 'flash', color: 0xff0000 });
  if (p.hp <= 0) killPlayer(g, source);
}

// ------------------------------------------------------------ compétences
export function skillState(g: Game, slot: 0 | 1): { id: SkillId | null; cd: number; ok: boolean; reason?: string } {
  const f = currentFamily(g);
  if (!f) return { id: null, cd: 0, ok: false, reason: 'Aucune arme' };
  const id = loadout(g, f)[slot];
  if (!id) return { id: null, cd: 0, ok: false, reason: 'À débloquer' };
  const cd = g.cooldowns[id] ?? 0;
  const s = SKILL[id];
  const p = g.player;
  const res = FAMILY[f].resource === 'mana' ? p.mana : p.stamina;
  if (cd > 0) return { id, cd, ok: false, reason: 'Recharge' };
  if (res < s.cost) return { id, cd, ok: false, reason: FAMILY[f].resource === 'mana' ? 'Mana' : 'Endurance' };
  return { id, cd, ok: true };
}

export function useSkill(g: Game, slot: 0 | 1): boolean {
  const p = g.player;
  const st = skillState(g, slot);
  if (!st.id) return false;
  const s = SKILL[st.id];
  if (!skillUnlocked(g, st.id)) return false;
  if (!st.ok) {
    g.emit({ type: 'float', x: p.x, y: p.y - 46, text: st.reason === 'Recharge' ? `${s.name} : ${Math.ceil(st.cd)} s` : `${st.reason} insuffisante`, color: '#f5d76e' });
    return false;
  }
  if (!spend(g, s.cost)) return false;
  g.cooldowns[s.id] = s.cooldown;
  g.stats.skillsUsed++;
  const fam = s.family;
  const w = currentWeapon(g);
  const mul = damageMul(g, fam);
  const aim = autoAim(g, FAMILY[fam].ranged ? w.reach : 110, 70);
  if (aim) face(g, aim.x - p.x, aim.y - p.y);
  const look = lookOf(g);
  p.actionLook = look;
  switch (s.id) {
    case 'd_lunge':
      p.dashT = 0.22;
      p.dashVx = p.aimX * 440;
      p.dashVy = p.aimY * 440;
      p.dashMul = mul * 1.6;
      p.dashHit = [];
      p.invuln = Math.max(p.invuln, 0.2);
      p.action = 'thrust';
      p.actionT = 0.26;
      g.emit({ type: 'sound', key: 'knife' });
      break;
    case 'd_poison':
      p.poisonBlade = 5;
      g.emit({ type: 'fx', kind: 'poison', x: p.x, y: p.y - 26 });
      g.emit({ type: 'sound', key: 'bubble' });
      break;
    case 'd_backstab': {
      const t = aim ?? autoAim(g, 90, 180);
      if (!t) {
        g.emit({ type: 'float', x: p.x, y: p.y - 46, text: 'Aucune cible proche', color: '#f5d76e' });
        g.cooldowns[s.id] = 1;
        return false;
      }
      const dx = t.x - p.x;
      const dy = t.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const bx = t.x + (dx / d) * 26;
      const by = t.y + (dy / d) * 26;
      if (g.world.passableForPlayer(Math.floor(bx / TILE), Math.floor(by / TILE))) {
        p.x = bx;
        p.y = by;
      }
      face(g, t.x - p.x, t.y - p.y);
      const unaware = !t.aggro || (t.atk === null && t.state !== 'chase');
      damageEnemy(g, t, w.damage * mul * (unaware ? 3.4 : 2.6), { family: fam, fx: p.poisonBlade > 0 ? { poison: 4 } : undefined });
      p.action = 'slash';
      p.actionT = 0.3;
      g.emit({ type: 'fx', kind: 'dark', x: t.x, y: t.y - 20 });
      g.emit({ type: 'sound', key: 'knife' });
      break;
    }
    case 's_sweep':
      arcHit(g, w.reach + 16, 100, w.damage * mul * 1.4, fam, w.knockback * 1.6);
      p.action = 'slash';
      p.actionT = 0.36;
      g.emit({ type: 'swing', x: p.x + p.aimX * 22, y: p.y - 16 + p.aimY * 18, angle: Math.atan2(p.aimY, p.aimX) });
      g.emit({ type: 'sound', key: 'swing_sword' });
      break;
    case 's_parry':
      p.parryT = 0.6;
      p.action = 'slash';
      p.actionT = 0.5;
      g.emit({ type: 'fx', kind: 'rays', x: p.x, y: p.y - 24 });
      g.emit({ type: 'sound', key: 'sword_draw' });
      break;
    case 's_thrust':
      lineHit(g, (w.reach + 20) * 1.9, 18, w.damage * mul * 1.9, fam, w.knockback, true);
      p.action = 'thrust';
      p.actionT = 0.4;
      g.emit({ type: 'sound', key: 'swing_sword' });
      break;
    case 'm_crush':
      p.action = 'slash';
      p.actionT = 0.55;
      g.zones.push(makeZone(g, 'quake', p.x + p.aimX * (w.reach - 4), p.y + p.aimY * (w.reach - 4), 40, 0.35, 0, 'player', w.damage * mul * 2.3, 0, { stun: 0.6 }, fam));
      g.emit({ type: 'sound', key: 'swing_heavy' });
      break;
    case 'm_break': {
      const t = aim ?? autoAim(g, w.reach + 30, 90);
      p.action = 'slash';
      p.actionT = 0.4;
      if (t) {
        damageEnemy(g, t, w.damage * mul * 1.1, { family: fam, fx: { interrupt: true } });
        t.st.brokenT = 5;
        g.emit({ type: 'fx', kind: 'shock', x: t.x, y: t.y - 24 });
      }
      g.emit({ type: 'sound', key: 'clang' });
      break;
    }
    case 'm_whirl':
      arcHit(g, w.reach + 18, 180, w.damage * mul * 1.5, fam, 260);
      p.action = 'slash';
      p.actionT = 0.5;
      g.emit({ type: 'fx', kind: 'dust', x: p.x, y: p.y - 10, scale: 2 });
      g.emit({ type: 'sound', key: 'swing_heavy' });
      break;
    case 'b_pierce':
      shoot(g, 'arrow', w.damage * mul * 1.6, w.reach + 60, 560, { family: fam, pierce: 99, knockback: 80 });
      p.action = 'shoot';
      p.actionT = 0.4;
      g.emit({ type: 'sound', key: 'bow' });
      break;
    case 'b_slow':
      shoot(g, 'arrow', w.damage * mul * 1.2, w.reach, 500, { family: fam, fx: { slow: 4 } });
      p.action = 'shoot';
      p.actionT = 0.4;
      g.emit({ type: 'sound', key: 'bow' });
      break;
    case 'b_volley':
      for (let i = -2; i <= 2; i++) shoot(g, 'arrow', w.damage * mul * 0.8, w.reach, 470, { family: fam, angle: i * 10 * DEG });
      p.action = 'shoot';
      p.actionT = 0.45;
      g.emit({ type: 'sound', key: 'bow' });
      break;
    case 'x_pierce':
      shoot(g, 'bolt', w.damage * mul * 1.7, w.reach + 60, 640, { family: fam, pierce: 99, knockback: 160 });
      p.action = 'thrust';
      p.actionT = 0.3;
      g.emit({ type: 'sound', key: 'bow' });
      break;
    case 'x_heavy':
      shoot(g, 'bolt', w.damage * mul * 1.4, w.reach, 520, { family: fam, knockback: 330, fx: { interrupt: true, stun: 0.5 } });
      p.action = 'thrust';
      p.actionT = 0.35;
      g.emit({ type: 'sound', key: 'bow' });
      break;
    case 'x_rapid':
      p.rapidT = 6;
      g.emit({ type: 'fx', kind: 'rays', x: p.x, y: p.y - 24 });
      g.emit({ type: 'sound', key: 'reload' });
      break;
    case 'e_fire':
      shoot(g, 'fire', w.damage * mul * 2, w.reach, 320, { family: fam, aoe: 48, fx: { burn: 3 }, radius: 18, knockback: 120 });
      p.action = 'spellcast';
      p.actionT = 0.5;
      g.emit({ type: 'sound', key: 'spell_2' });
      break;
    case 'e_ice':
      shoot(g, 'ice', w.damage * mul * 0.8, w.reach, 360, { family: fam, fx: { root: 1.5, slow: 3 } });
      p.action = 'spellcast';
      p.actionT = 0.45;
      g.emit({ type: 'sound', key: 'glass' });
      break;
    case 'e_stone':
      p.shield = 45;
      p.shieldT = 6;
      for (const e of enemiesNear(g, p.x, p.y, 56)) {
        if (e.dying > 0) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
        damageEnemy(g, e, w.damage * mul * 0.6, { family: fam, kx: ((e.x - p.x) / d) * 260, ky: ((e.y - p.y) / d) * 260 });
      }
      p.action = 'spellcast';
      p.actionT = 0.45;
      g.emit({ type: 'fx', kind: 'turtleshell', x: p.x, y: p.y - 20, scale: 1.2 });
      g.emit({ type: 'sound', key: 'rock_hit' });
      break;
    case 'o_zone': {
      const t = aim ?? autoAim(g, 240, 90);
      const zx = t ? t.x : p.x + p.aimX * 110;
      const zy = t ? t.y : p.y + p.aimY * 110;
      g.zones.push(makeZone(g, 'dark', zx, zy, 44, 0.2, 4, 'player', 3 * mul, 0.5, { slow: 1 }, fam));
      p.action = 'thrust';
      p.actionT = 0.4;
      g.emit({ type: 'sound', key: 'shade_0' });
      break;
    }
    case 'o_curse': {
      const t = aim ?? autoAim(g, 240, 90);
      p.action = 'thrust';
      p.actionT = 0.4;
      if (!t) {
        g.emit({ type: 'float', x: p.x, y: p.y - 46, text: 'Aucune cible', color: '#f5d76e' });
        g.cooldowns[s.id] = 1;
        return false;
      }
      applyFx(g, t, { curse: true }, fam);
      g.emit({ type: 'sound', key: 'shade_1' });
      break;
    }
    case 'o_summon': {
      g.allies = [];
      g.allies.push({ id: g.newId(), x: p.x + p.aimX * 20, y: p.y + p.aimY * 20, t: SUMMON.duration, cd: 0.5, facing: p.facing, moving: false, targetId: -1 });
      p.action = 'thrust';
      p.actionT = 0.4;
      g.emit({ type: 'fx', kind: 'spirit', x: p.x + p.aimX * 20, y: p.y - 20 });
      g.emit({ type: 'sound', key: 'shade_1' });
      break;
    }
  }
  g.noise(p.x, p.y, 8 * TILE);
  return true;
}

/** Frappe en arc devant le joueur (demi-angle en degrés). */
function arcHit(g: Game, reach: number, halfDeg: number, dmg: number, fam: Family, knock: number): number {
  const p = g.player;
  const cos = Math.cos(halfDeg * DEG);
  let n = 0;
  for (const e of enemiesNear(g, p.x, p.y, reach + 24)) {
    if (e.dying > 0 || e.state === 'hidden' || e.burrowed) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > reach + ENEMIES[e.type].radius) continue;
    if ((dx * p.aimX + dy * p.aimY) / d < cos && d > 18) continue;
    damageEnemy(g, e, dmg, { family: fam, kx: (dx / d) * knock, ky: (dy / d) * knock });
    n++;
  }
  n += hitDummies(g, p.x, p.y, reach, dmg);
  return n;
}

/** Frappe en ligne droite (perçante). */
function lineHit(g: Game, len: number, width: number, dmg: number, fam: Family, knock: number, ignoreArmor = false): number {
  const p = g.player;
  let n = 0;
  for (const e of enemiesNear(g, p.x, p.y, len + 20)) {
    if (e.dying > 0 || e.state === 'hidden' || e.burrowed) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const along = dx * p.aimX + dy * p.aimY;
    if (along < 0 || along > len) continue;
    const perp = Math.abs(dx * p.aimY - dy * p.aimX);
    if (perp > width + ENEMIES[e.type].radius) continue;
    damageEnemy(g, e, dmg, { family: fam, kx: p.aimX * knock, ky: p.aimY * knock, ignoreArmor });
    n++;
  }
  n += hitDummies(g, p.x + p.aimX * len * 0.5, p.y + p.aimY * len * 0.5, len * 0.5, dmg);
  return n;
}

function updateDash(g: Game, dt: number): void {
  const p = g.player;
  p.dashT -= dt;
  g.movePlayer(p.dashVx * dt, 0);
  g.movePlayer(0, p.dashVy * dt);
  const w = currentWeapon(g);
  for (const e of enemiesNear(g, p.x, p.y, 30)) {
    if (e.dying > 0 || p.dashHit.includes(e.id) || e.state === 'hidden') continue;
    p.dashHit.push(e.id);
    damageEnemy(g, e, w.damage * p.dashMul, { family: 'dagger', kx: p.dashVx * 0.3, ky: p.dashVy * 0.3, fx: p.poisonBlade > 0 ? { poison: 4 } : undefined });
  }
  hitDummies(g, p.x, p.y, 20, w.damage * p.dashMul);
}

// ------------------------------------------------------------ ultimes
export function ultReady(g: Game): boolean {
  const f = currentFamily(g);
  return !!f && ultUnlocked(g, f) && g.ult >= 100;
}

/** Lance l'ultime dans la direction visée (ax, ay dans −1..1 ; nul = cible auto ou regard). */
export function castUlt(g: Game, ax: number, ay: number): boolean {
  const p = g.player;
  const f = currentFamily(g);
  if (!f) return false;
  if (!ultUnlocked(g, f)) {
    g.emit({ type: 'float', x: p.x, y: p.y - 46, text: `Ultime : maîtrise ${ULTS[f].unlock} requise`, color: '#f5d76e' });
    return false;
  }
  if (g.ult < 100) {
    g.emit({ type: 'float', x: p.x, y: p.y - 46, text: `Ultime : ${Math.floor(g.ult)} %`, color: '#f5d76e' });
    return false;
  }
  const u = ULTS[f];
  let len = Math.hypot(ax, ay);
  if (len < 0.2) {
    const t = autoAim(g, u.range, 180);
    if (t) {
      ax = (t.x - p.x) / u.range;
      ay = (t.y - p.y) / u.range;
    } else {
      ax = p.aimX * 0.6;
      ay = p.aimY * 0.6;
    }
    len = Math.hypot(ax, ay);
  }
  const k = Math.min(1, len);
  const dx = ax / (len || 1);
  const dy = ay / (len || 1);
  face(g, dx, dy);
  g.ult = 0;
  g.stats.ultsUsed++;
  const w = currentWeapon(g);
  const mul = damageMul(g, f);
  const tx = p.x + dx * u.range * k;
  const ty = p.y + dy * u.range * k;
  p.actionLook = lookOf(g);
  g.emit({ type: 'sound', key: 'roar_1' });
  g.emit({ type: 'flash', color: 0xffe0a0 });
  switch (f) {
    case 'dagger':
      p.combo = { kind: 'dagger', step: 0, t: 0, dx, dy, hit: [] };
      p.invuln = Math.max(p.invuln, 1.2);
      break;
    case 'sword':
      p.combo = { kind: 'sword', step: 0, t: 0, dx, dy, hit: [] };
      break;
    case 'mace':
      g.zones.push(makeZone(g, 'quake', tx, ty, u.radius, 0.45, 0, 'player', w.damage * mul * 4, 0, { stun: 1.2 }, f));
      p.action = 'slash';
      p.actionT = 0.6;
      break;
    case 'bow':
      g.zones.push(makeZone(g, 'rain', tx, ty, u.radius, 0.35, 2.5, 'player', w.damage * mul * 0.75, 0.25, undefined, f));
      p.action = 'shoot';
      p.actionT = 0.6;
      break;
    case 'crossbow': {
      shoot(g, 'bolt', w.damage * mul * 4.5, u.range, 760, { family: f, pierce: 99, knockback: 420, radius: 22 });
      p.action = 'thrust';
      p.actionT = 0.5;
      p.xbowLoaded = true;
      g.emit({ type: 'shake', strength: 0.008 });
      break;
    }
    case 'elemental':
      g.zones.push(makeZone(g, 'fire', tx, ty, u.radius, 0.25, 0, 'player', w.damage * mul * 3, 0, { burn: 4 }, f));
      g.zones.push(makeZone(g, 'ice', tx, ty, u.radius * 0.9, 0.9, 0, 'player', w.damage * mul * 1, 0, { root: 2 }, f));
      g.zones.push(makeZone(g, 'stone', tx, ty, u.radius * 0.8, 1.5, 0, 'player', w.damage * mul * 2, 0, { knock: 280 }, f));
      p.action = 'spellcast';
      p.actionT = 0.8;
      break;
    case 'occult': {
      const z = makeZone(g, 'tentacle', tx, ty, u.radius, 0.3, 4, 'player', w.damage * mul * 0.8, 0.4, { slow: 0.6 }, f);
      z.pull = 60;
      g.zones.push(z);
      p.action = 'thrust';
      p.actionT = 0.6;
      break;
    }
  }
  return true;
}

function updateCombo(g: Game, dt: number): void {
  const p = g.player;
  const c = p.combo!;
  c.t -= dt;
  if (c.t > 0) return;
  const w = currentWeapon(g);
  const fam = currentFamily(g);
  const mul = damageMul(g, fam);
  if (c.kind === 'dagger') {
    // danse des ombres : six frappes d'ennemi en ennemi, dans la direction visée
    c.t = 0.13;
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of enemiesNear(g, p.x, p.y, 150)) {
      if (e.dying > 0 || e.state === 'hidden' || e.burrowed) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const dot = (dx * c.dx + dy * c.dy) / d;
      if (dot < -0.3 && d > 40) continue;
      const score = d + (c.hit.includes(e.id) ? 90 : 0) - dot * 30;
      if (score < bd) {
        bd = score;
        best = e;
      }
    }
    if (best) {
      const dx = best.x - p.x;
      const dy = best.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = best.x - (dx / d) * 20;
      const ny = best.y - (dy / d) * 20;
      if (g.world.passableForPlayer(Math.floor(nx / TILE), Math.floor(ny / TILE))) {
        p.x = nx;
        p.y = ny;
      }
      face(g, dx, dy);
      damageEnemy(g, best, w.damage * mul * 1.6, { family: fam, fx: p.poisonBlade > 0 ? { poison: 4 } : undefined });
      c.hit.push(best.id);
      g.emit({ type: 'fx', kind: 'dark', x: best.x, y: best.y - 20 });
    } else {
      g.movePlayer(c.dx * 26, 0);
      g.movePlayer(0, c.dy * 26);
      hitDummies(g, p.x, p.y, 40, w.damage * mul * 1.6);
    }
    p.action = 'slash';
    p.actionT = 0.12;
    g.emit({ type: 'sound', key: 'knife' });
    c.step++;
    if (c.step >= 6) p.combo = null;
  } else {
    // tempête d'acier : quatre tailles en avançant, la dernière repousse violemment
    c.t = 0.22;
    g.movePlayer(c.dx * 20, 0);
    g.movePlayer(0, c.dy * 20);
    face(g, c.dx, c.dy);
    const last = c.step === 3;
    arcHit(g, 56, 80, w.damage * mul * (last ? 2.4 : 1.6), 'sword', last ? 320 : 90);
    p.action = 'slash';
    p.actionT = 0.2;
    g.emit({ type: 'swing', x: p.x + c.dx * 24, y: p.y - 16 + c.dy * 20, angle: Math.atan2(c.dy, c.dx) });
    g.emit({ type: 'sound', key: last ? 'swing_heavy' : 'swing_sword' });
    c.step++;
    if (c.step >= 4) p.combo = null;
  }
}

// ------------------------------------------------------------ zones
export function makeZone(g: Game, kind: ZoneKind, x: number, y: number, r: number, delay: number, dur: number, owner: 'player' | 'enemy', damage: number, every: number, fx?: ProjFx, family?: Family | null): Zone {
  return { id: g.newId(), kind, x, y, r, delay, dur, t: 0, owner, damage, every, tickT: 0, fx, family: family ?? undefined, hitOnce: [] };
}

export function updateZones(g: Game, dt: number): void {
  const p = g.player;
  g.zones = g.zones.filter((z) => {
    const was = z.t;
    z.t += dt;
    if (z.t < z.delay) return true;
    const first = was < z.delay;
    if (first) onZoneStart(g, z);
    let pulse = false;
    if (z.every <= 0) pulse = first;
    else {
      z.tickT -= dt;
      if (first || z.tickT <= 0) {
        pulse = true;
        z.tickT = z.every;
      }
    }
    if (z.owner === 'player') {
      if (z.pull) {
        for (const e of enemiesNear(g, z.x, z.y, z.r + 20)) {
          if (e.dying > 0) continue;
          const dx = z.x - e.x;
          const dy = z.y - e.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d > 8 && ENEMIES[e.type].knockbackResist < 0.9) {
            e.x += (dx / d) * z.pull * dt;
            e.y += (dy / d) * z.pull * dt;
          }
        }
      }
      if (pulse) {
        for (const e of enemiesNear(g, z.x, z.y, z.r + 24)) {
          if (e.dying > 0 || e.state === 'hidden') continue;
          if (Math.hypot(e.x - z.x, e.y - z.y) > z.r + ENEMIES[e.type].radius) continue;
          const d = Math.hypot(e.x - z.x, e.y - z.y) || 1;
          const knock = z.fx?.knock ?? (z.kind === 'quake' ? 140 : 30);
          damageEnemy(g, e, z.damage, { family: z.family ?? null, fx: z.fx, kx: ((e.x - z.x) / d) * knock, ky: ((e.y - z.y) / d) * knock });
        }
        hitDummies(g, z.x, z.y, z.r, z.damage);
      }
    } else if (pulse && !p.dead) {
      if (Math.hypot(p.x - z.x, p.y - 8 - z.y) <= z.r + 8) {
        if (z.kind === 'roar') {
          p.st.slowT = Math.max(p.st.slowT, 2.5);
          p.st.slowMul = 0.55;
        }
        if (z.damage > 0) hurtPlayer(g, z.damage, z.x, z.y, 'Vous avez été pris dans une attaque de zone.', { knock: 22 });
      }
    }
    return z.t < z.delay + Math.max(z.dur, 0.05);
  });
}

function onZoneStart(g: Game, z: Zone): void {
  const fx: Record<string, [string, string]> = {
    quake: ['dust', 'rock_hit'], rain: ['rays', 'bow'], fire: ['firelion', 'spell_2'], ice: ['iceshield', 'glass'], stone: ['turtleshell', 'rock_hit'],
    tentacle: ['torrentacle', 'shade_1'], dark: ['dark', 'shade_0'], enemy_blast: ['dark', 'shade_1'], rock: ['dust', 'rock_hit'], roar: ['shock', 'roar_0'],
  };
  const f = fx[z.kind];
  if (f) {
    g.emit({ type: 'fx', kind: f[0] as never, x: z.x, y: z.y, scale: z.r / 48 });
    g.emit({ type: 'sound', key: f[1], x: z.x, y: z.y });
  }
  if (z.kind === 'quake' || z.kind === 'rock') g.emit({ type: 'shake', strength: 0.007 });
}

// ------------------------------------------------------------ projectiles
export function updateProjectiles(g: Game, dt: number): void {
  const w = g.world;
  const p = g.player;
  g.projectiles = g.projectiles.filter((pr) => {
    if (pr.arc) {
      // bombe lancée : trajectoire en cloche vers le point visé
      pr.arc.t += dt;
      const k = Math.min(1, pr.arc.t / pr.arc.dur);
      pr.x = pr.arc.sx + (pr.arc.tx - pr.arc.sx) * k;
      pr.y = pr.arc.sy + (pr.arc.ty - pr.arc.sy) * k - Math.sin(k * Math.PI) * 40;
      if (k >= 1) {
        explode(g, pr, pr.arc.tx, pr.arc.ty);
        return false;
      }
      return true;
    }
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.life -= dt;
    if (pr.life <= 0) {
      if (pr.aoe) explode(g, pr, pr.x, pr.y + 18);
      return false;
    }
    if (w.blocksSight(Math.floor(pr.x / TILE), Math.floor((pr.y + 18) / TILE))) {
      if (pr.aoe) explode(g, pr, pr.x, pr.y + 18);
      else g.emit({ type: 'fx', kind: 'spark', x: pr.x, y: pr.y });
      return false;
    }
    if (pr.owner === 'player') {
      // mannequin
      const b = w.buildingAtTile(Math.floor(pr.x / TILE), Math.floor((pr.y + 18) / TILE));
      if (b && BUILDING_BY_ID[b.type].dummy) {
        hitDummies(g, pr.x, pr.y + 18, 20, pr.damage);
        if (pr.aoe) explode(g, pr, pr.x, pr.y + 18);
        return false;
      }
      for (const e of enemiesNear(g, pr.x, pr.y + 18, 40)) {
        if (e.dying > 0 || pr.hit.includes(e.id) || e.state === 'hidden' || e.burrowed) continue;
        const rr = pr.radius + ENEMIES[e.type].radius * 0.6;
        if (Math.hypot(e.x - pr.x, e.y - 16 - pr.y) > rr) continue;
        pr.hit.push(e.id);
        if (pr.aoe) {
          explode(g, pr, pr.x, pr.y + 18);
          return false;
        }
        const sp = Math.hypot(pr.vx, pr.vy) || 1;
        const procs = weaponProcs(g);
        const fx: ProjFx = { ...(pr.fx ?? {}) };
        if (procs.burn && g.rng.chance(procs.burn)) fx.burn = 3;
        if (procs.slow && g.rng.chance(procs.slow)) fx.slow = 2;
        if (procs.poison && g.rng.chance(procs.poison)) fx.poison = 3;
        damageEnemy(g, e, pr.damage, { family: pr.family ?? null, fx, kx: (pr.vx / sp) * pr.knockback, ky: (pr.vy / sp) * pr.knockback, basic: true });
        if (pr.kind === 'fire') g.emit({ type: 'fx', kind: 'fire', x: e.x, y: e.y - 20 });
        else if (pr.kind === 'shadow') g.emit({ type: 'fx', kind: 'dark', x: e.x, y: e.y - 20 });
        else if (pr.kind === 'ice') g.emit({ type: 'fx', kind: 'ice', x: e.x, y: e.y - 20 });
        pr.pierce--;
        if (pr.pierce < 0) return false;
      }
    } else if (!p.dead) {
      if (Math.hypot(p.x - pr.x, p.y - 16 - pr.y) < pr.radius + 8) {
        if (p.dodgeT > 0) return true; // l'esquive traverse les projectiles
        hurtPlayer(g, pr.damage, pr.x - pr.vx * 0.05, pr.y - pr.vy * 0.05, 'Vous avez été abattu à distance.', { knock: 12 });
        return false;
      }
    }
    return true;
  });
}

function explode(g: Game, pr: Projectile, x: number, y: number): void {
  const r = pr.aoe ?? 40;
  g.emit({ type: 'fx', kind: pr.kind === 'fire' ? 'fire' : pr.kind === 'bomb' ? 'fire' : 'dust', x, y: y - 10, scale: r / 30 });
  g.emit({ type: 'sound', key: pr.kind === 'bomb' ? 'trap' : 'spell_2', x, y });
  if (pr.owner === 'player') {
    for (const e of enemiesNear(g, x, y, r + 24)) {
      if (e.dying > 0 || e.state === 'hidden') continue;
      const d = Math.hypot(e.x - x, e.y - y) || 1;
      if (d > r + ENEMIES[e.type].radius) continue;
      damageEnemy(g, e, pr.damage, { family: pr.family ?? null, fx: pr.fx, kx: ((e.x - x) / d) * pr.knockback, ky: ((e.y - y) / d) * pr.knockback });
    }
    hitDummies(g, x, y, r, pr.damage);
  } else {
    const p = g.player;
    if (Math.hypot(p.x - x, p.y - y) <= r + 6) hurtPlayer(g, pr.damage, x, y, 'Une explosion vous a fauché.', { knock: 30 });
  }
}

/** Bombe artisanale (consommable) : lancée devant soi, explose à l'impact. */
export function throwBomb(g: Game, damage: number, radius: number, knockback: number): void {
  const p = g.player;
  const t = autoAim(g, 200, 60);
  const tx = t ? t.x : p.x + p.aimX * 130;
  const ty = t ? t.y : p.y + p.aimY * 130;
  g.projectiles.push({
    id: g.newId(), x: p.x, y: p.y - 18, vx: 0, vy: 0, life: 2, damage, owner: 'player', kind: 'bomb', pierce: 0, hit: [], radius: 10,
    aoe: radius, knockback, arc: { tx, ty, t: 0, dur: 0.5, sx: p.x, sy: p.y - 18 },
  });
  g.emit({ type: 'sound', key: 'swing_0' });
}

/** Projectile ennemi. */
export function enemyShot(g: Game, e: Enemy, kind: ProjKind, damage: number, speed: number, angle: number, range = 360): void {
  g.projectiles.push({
    id: g.newId(), x: e.x, y: e.y - 20, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: range / speed, damage, owner: 'enemy', kind,
    pierce: 0, hit: [], radius: 10, knockback: 0,
  });
}

/** Bombe ennemie (chef des mercenaires) : cercle annoncé au sol puis explosion. */
export function enemyBomb(g: Game, e: Enemy, tx: number, ty: number, damage: number, radius: number, flight: number): void {
  g.projectiles.push({
    id: g.newId(), x: e.x, y: e.y - 20, vx: 0, vy: 0, life: 3, damage, owner: 'enemy', kind: 'bomb', pierce: 0, hit: [], radius: 10, aoe: radius, knockback: 0,
    arc: { tx, ty, t: 0, dur: flight, sx: e.x, sy: e.y - 20 },
  });
}

// ------------------------------------------------------------ invocations
export function updateAllies(g: Game, dt: number): void {
  if (!g.allies.length) return;
  const p = g.player;
  g.allies = g.allies.filter((a) => {
    a.t -= dt;
    if (a.t <= 0) {
      g.emit({ type: 'fx', kind: 'spirit', x: a.x, y: a.y - 16 });
      return false;
    }
    a.cd = Math.max(0, a.cd - dt);
    let target: Enemy | null = null;
    let bd = Infinity;
    for (const e of enemiesNear(g, p.x, p.y, 8 * TILE)) {
      if (e.dying > 0 || e.state === 'hidden' || e.burrowed) continue;
      const d = Math.hypot(e.x - a.x, e.y - a.y);
      if (d < bd) {
        bd = d;
        target = e;
      }
    }
    let gx = p.x - p.aimX * 24;
    let gy = p.y - p.aimY * 24;
    if (target) {
      gx = target.x;
      gy = target.y;
    }
    const dx = gx - a.x;
    const dy = gy - a.y;
    const d = Math.hypot(dx, dy) || 1;
    a.moving = d > (target ? SUMMON.reach : 30);
    if (a.moving) {
      // le serviteur flotte : il ne bloque aucun passage et traverse les obstacles bas
      a.x += (dx / d) * SUMMON.speed * dt;
      a.y += (dy / d) * SUMMON.speed * dt;
      a.facing = facingOf(dx, dy);
    }
    if (target && d <= SUMMON.reach + ENEMIES[target.type].radius && a.cd <= 0) {
      a.cd = SUMMON.cooldown;
      damageEnemy(g, target, SUMMON.damage * damageMul(g, 'occult'), { source: 'ally', family: null, kx: (dx / d) * 40, ky: (dy / d) * 40 });
      g.emit({ type: 'fx', kind: 'dark', x: target.x, y: target.y - 20 });
    }
    return true;
  });
  if (g.allies.length > ENEMY.maxSummons) g.allies.length = ENEMY.maxSummons;
}
