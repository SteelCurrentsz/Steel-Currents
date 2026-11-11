// Claude Opus 5.5 as the infantry's company commander.
//
// Every soldier has his own small brain (shared/infantry.js): he looks round,
// gets into cover, shoots, and learns from what happens to him. Over him is
// his squad's order. On a server that has been given an Anthropic API key,
// those orders come from Opus: every half minute or so, each side's ground
// battle is written up as a brief -- its squads, where they are and what
// state they are in, what has been seen of the enemy, the armour and the
// guns on both sides, and what the side's own men have learned works -- and
// Opus sends back an order for every squad. They stand for as long as it
// said, and then the side's own staff takes over again until the next brief
// is answered. Nothing waits on it: the battle goes on while Opus thinks, and
// if no answer comes the squads simply go on under their own staff.
//
// Turned on by ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) in the server's
// environment, or STEEL_OPUS=1 where the SDK finds its credentials some
// other way. STEEL_OPUS=0 turns it off whatever else is set.
// STEEL_OPUS_EVERY is how many seconds of battle between briefs (default 30).
// STEEL_OPUS_SIDES is which sides it commands: "both" (the default), "0" or "1".

import Anthropic from '@anthropic-ai/sdk';
import { infantryBrief, orderSquads, ORDERS } from '../shared/infantry.js';

const MODEL = 'claude-opus-5-5';

const SYSTEM = [
  'You command one side\'s infantry in a real-time World War II combined-arms battle on a coastline.',
  'Your riflemen carry M1 Garands; each squad is about ten men. Every soldier already handles his own',
  'small-unit drills -- spotting the enemy, taking cover behind folds of ground, houses and tanks, firing,',
  'reloading -- and learns over the battle which drills pay off. You give each squad its order.',
  '',
  'Orders: advance (move on the point), assault (close with it fast), hold (stay and fight from cover),',
  'dig_in (stay put, maximum cover), flank_left / flank_right (work round that side of the point),',
  'follow_tank (move in behind the nearest friendly tank, using it as cover), fall_back (withdraw to the point).',
  'Posture: aggressive, steady or cautious.',
  '',
  'Think like a good company commander: fix the enemy with one squad and flank with another; do not feed',
  'weak squads into the open; keep infantry with the armour when there is armour; take enemy guns and',
  'barracks when they are lightly held; fall back and regroup squads that are nearly spent or out of rounds.',
  'Coordinates are metres. Give every squad you list an order, with the point it applies to.',
].join('\n');

const SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', description: 'One sentence: the plan, as you would say it on the radio.' },
    orders: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          squad: { type: 'integer' },
          order: { type: 'string', enum: ORDERS },
          x: { type: 'number' },
          z: { type: 'number' },
          posture: { type: 'string', enum: ['aggressive', 'steady', 'cautious'] },
          reason: { type: 'string' },
        },
        required: ['squad', 'order', 'x', 'z', 'posture', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['intent', 'orders'],
  additionalProperties: false,
};

/** Whether this server should put Opus in command at all. */
export function opusWanted(env = process.env) {
  if (env.STEEL_OPUS === '0') return false;
  if (env.STEEL_OPUS === '1') return true;
  return !!(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
}

/**
 * A commander for one room. `tick(room)` is called every server tick and
 * does nothing most of the time; when a side is due a brief and is not
 * already waiting on one, it sends it and goes back to the battle.
 */
export class OpusCommander {
  constructor(opts = {}) {
    this.client = opts.client || new Anthropic();
    this.every = Number(opts.every ?? process.env.STEEL_OPUS_EVERY ?? 30) || 30;
    const sides = String(opts.sides ?? process.env.STEEL_OPUS_SIDES ?? 'both');
    this.sides = sides === '0' ? [0] : sides === '1' ? [1] : [0, 1];
    this.due = [8, 11];
    this.busy = [false, false];
    this.log = opts.log || ((...a) => console.log('[opus]', ...a));
  }

  tick(room) {
    const state = room.state;
    if (!state.inf || !state.soldiers?.some((s) => s.alive) || room.phase !== 'battle') return;
    for (const team of this.sides) {
      if (this.busy[team] || state.t < this.due[team]) continue;
      // Nothing of this side's on its feet: nothing to command.
      if (!state.soldiers.some((s) => s.alive && s.team === team)) continue;
      this.due[team] = state.t + this.every;
      this.ask(room, team);
    }
  }

  async ask(room, team) {
    this.busy[team] = true;
    const brief = infantryBrief(room.state, team);
    try {
      const res = await this.client.beta.messages.create({
        model: MODEL,
        max_tokens: 4000,
        // A real-time battle: an answer in a few seconds is worth more than a
        // better one in a minute.
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        // If Opus declines, the request is answered by the fallback model
        // rather than leaving the squads without orders.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: `Situation report for your side (team ${team}):\n${JSON.stringify(brief)}\n\nGive your orders.`,
        }],
      });
      if (room.phase !== 'battle') return;
      if (res.stop_reason === 'refusal') { this.log(`team ${team}: declined`); return; }
      const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      let plan = null;
      try { plan = JSON.parse(text); } catch { this.log(`team ${team}: unreadable answer`); return; }
      const n = orderSquads(room.state, team, plan.orders, 'opus', this.every * 1.6, plan.intent);
      this.log(`team ${team}: ${n} squad orders -- ${String(plan.intent || '').slice(0, 140)}`);
    } catch (err) {
      // Typed errors from the SDK, most specific first: a key that is wrong
      // stops it for good; anything else waits a while and tries again.
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        this.log('no access with the credentials given; the squads stay under their own staff');
        this.sides = [];
      } else if (err instanceof Anthropic.RateLimitError) {
        this.due[team] = room.state.t + this.every * 2;
      } else if (err instanceof Anthropic.APIError) {
        this.log(`team ${team}: API error ${err.status}: ${err.message}`);
        this.due[team] = room.state.t + this.every * 3;
      } else {
        this.log(`team ${team}: ${err?.message || err}`);
        this.due[team] = room.state.t + this.every * 3;
      }
    } finally {
      this.busy[team] = false;
    }
  }
}
