import { edgeUsable } from '../world/graph.js';

// FNAF-1-faithful movement AI. Every animatronic rolls a d20 against its
// per-night aggression at each "movement opportunity" (every 4.8s / speed).
// Success moves it one edge through the real floor-plan graph toward you.

const BASE_INTERVAL = 4.8;

export function createDirector({ universe, graph, rng, night, maxed = false }) {
  const stages = graph.rooms.filter(r => r.type === 'stage');
  const fallbackRoom = stages[0] ?? graph.rooms.find(r => r.type !== 'office') ?? graph.rooms[0];

  const agents = universe.animatronics.map((anim, i) => {
    const stage = stages.length ? stages[i % stages.length] : fallbackRoom;
    return {
      anim,
      idx: i,
      room: stage.id,
      startRoom: stage.id,
      nextOppAt: BASE_INTERVAL / anim.ai.speed * (0.6 + rng.next() * 0.8),
      // when standing at an office entry: {side, attackAt}
      entry: null,
      lastMoveAt: 0,
    };
  });

  // FNAF-style difficulty: base per-night aggression plus a ramp as the
  // night wears on (+1 per hour from 2AM, capped at +4)
  const aggressionOf = (anim, hour = 0) => maxed
    ? 20
    : Math.min(20,
        (anim.ai.aggression[Math.min(night - 1, anim.ai.aggression.length - 1)] ?? 0)
        + Math.max(0, Math.min(4, (hour | 0) - 1)));

  const entrySides = [];
  if (graph.officeEntries.left) entrySides.push({ side: 'left', info: graph.officeEntries.left });
  if (graph.officeEntries.right) entrySides.push({ side: 'right', info: graph.officeEntries.right });

  function entryForRoom(roomId) {
    return entrySides.find(e => e.info.otherRoom === roomId) ?? null;
  }

  function candidateEdges(agent) {
    return graph.edges.filter(e => {
      if (!edgeUsable(e, agent.anim)) return false;
      if (e.a !== agent.room && e.b !== agent.room) return false;
      return true;
    });
  }

  function chooseMove(agent) {
    const pref = agent.anim.ai.routePreference;
    const edges = candidateEdges(agent);
    if (!edges.length) return null;
    const items = edges.map(e => {
      const other = e.a === agent.room ? e.b : e.a;
      let weight = 1;
      const dHere = graph.distToOffice[agent.room];
      const dThere = graph.distToOffice[other];
      if (pref === 'direct') {
        weight = dThere < dHere ? 5 : dThere === dHere ? 1 : 0.4;
      } else if (pref === 'left' || pref === 'right') {
        const cx = graph.rooms[other].centroid[0];
        const hereX = graph.rooms[agent.room].centroid[0];
        const goingLeft = cx < hereX;
        weight = (pref === 'left') === goingLeft ? 3 : 1;
        if (dThere < dHere) weight *= 1.6; // still drift toward the office
      } else if (pref === 'vents') {
        weight = e.kind === 'vent' ? 5 : 1;
        if (dThere < dHere) weight *= 1.5;
      } else {
        weight = dThere < dHere ? 1.8 : 1; // random still creeps forward
      }
      // never walk INTO the office room through the defendable edge — that
      // transition is the attack, handled via entry state
      if (graph.office && other === graph.office.id) weight = 0;
      return { item: { edge: e, other }, weight };
    }).filter(it => it.weight > 0);
    if (!items.length) return null;
    return rng.weighted(items);
  }

  function armNext(agent, factor = 1) {
    agent.nextOppAt += (BASE_INTERVAL / agent.anim.ai.speed) * factor * (0.85 + rng.next() * 0.3);
  }

  function startAttack(agent, side, now) {
    const rusher = agent.anim.ai.abilities.includes('doorRusher');
    const delay = rusher ? 1.5 + rng.next() * 1.5 : 2 + rng.next() * 3;
    agent.entry = { side, attackAt: now + delay };
  }

  function retreat(agent) {
    const rooms = graph.rooms.filter(r =>
      r.id !== graph.office?.id &&
      graph.distToOffice[r.id] >= 2 &&
      graph.distToOffice[r.id] < Infinity);
    const target = rooms.length ? rng.pick(rooms) : graph.rooms[agent.startRoom];
    agent.entry = null;
    agent.room = target.id;
    armNext(agent, 1.6);
  }

  const director = {
    agents,

    // dt-driven; ctx: {now, viewedRoom, isDoorClosed(side), powerOut, onJumpscare, onMove, onDoorBang}
    tick(ctx) {
      for (const agent of agents) {
        const { anim } = agent;
        if (night < anim.ai.stageUntilNight) continue;

        // attack resolution
        if (agent.entry && ctx.now >= agent.entry.attackAt) {
          if (ctx.powerOut || !ctx.isDoorClosed(agent.entry.side)) {
            ctx.onJumpscare?.(agent);
            return;
          }
          ctx.onDoorBang?.(agent);
          retreat(agent);
          continue;
        }

        if (ctx.now < agent.nextOppAt) continue;

        // being watched on camera stalls the hunt
        if (ctx.viewedRoom === agent.room && !ctx.powerOut) {
          armNext(agent, 0.5);
          continue;
        }

        const aggr = ctx.powerOut ? 20 : aggressionOf(anim, ctx.hour);
        if (rng.int(1, 20) > aggr) {
          armNext(agent);
          continue;
        }

        if (agent.entry) { armNext(agent); continue; }

        const move = chooseMove(agent);
        if (!move) { armNext(agent); continue; }
        agent.room = move.other;
        agent.lastMoveAt = ctx.now;
        ctx.onMove?.(agent, move.edge.kind);

        const entry = entryForRoom(agent.room);
        if (entry) {
          startAttack(agent, entry.side, ctx.now);
          ctx.onArriveEntry?.(agent);
        }
        armNext(agent);
      }
    },

    // who is standing at this office entry (door light reveals them)
    atEntry(side) {
      return agents.find(a => a.entry?.side === side) ?? null;
    },

    // camera interference: 0 none, 1 jammed
    jamLevel(viewedRoom) {
      if (viewedRoom == null) return 0;
      for (const a of agents) {
        if (!a.anim.ai.abilities.includes('cameraJammer')) continue;
        if (night < a.anim.ai.stageUntilNight) continue;
        if (a.room === viewedRoom) return 1;
        // adjacent room also crackles
        for (const e of graph.edges) {
          const touches = (e.a === a.room && e.b === viewedRoom) || (e.b === a.room && e.a === viewedRoom);
          if (touches) return 0.55;
        }
      }
      return 0;
    },

    // test hook: teleport an animatronic to an office entry, attack pending
    forceToEntry(idx, side, now) {
      const agent = agents[idx];
      if (!agent) return;
      const e = entrySides.find(s => s.side === side) ?? entrySides[0];
      if (!e) return;
      agent.room = e.info.otherRoom;
      startAttack(agent, e.side, now);
    },
  };

  return director;
}
