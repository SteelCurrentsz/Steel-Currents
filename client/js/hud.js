// Bridge instruments: telegraph, helm, armament, damage state, plot and feeds.

import { SHIP_CLASSES } from '../../shared/ships.js';
import { MAP_HALF } from '../../shared/world.js';
import { MPS_TO_KNOTS, clamp, wrapAngle } from '../../shared/math.js';
import { getSettings } from './settings.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor({ team, world, onLeave }) {
    this.team = team;
    this.world = world;
    this.el = {
      ownName: $('own-name'), ownHp: $('own-hp'), ownHpText: $('own-hp-text'),
      status: $('status-row'), consumables: $('consumables'), armament: $('armament'),
      tele: $('tele-notches'), speed: $('speed-readout'), rudder: $('rudder-needle'),
      heading: $('heading-readout'), capBar: $('cap-bar'), timer: $('battle-timer'),
      score0: $('score0'), score1: $('score1'), killfeed: $('killfeed'),
      ribbons: $('ribbons'), alerts: $('alerts'), scoreboard: $('scoreboard'),
      scoreTable: $('scoreboard-table'), minimap: $('minimap'), minimapWrap: $('minimap-wrap'),
      sink: $('sink-overlay'), reticle: $('reticle'),
    };
    this.ctx = this.el.minimap.getContext('2d');
    this.built = false;
    this.lastRibbon = 0;
    $('btn-leave').onclick = onLeave;
  }

  buildFor(classId) {
    const cls = SHIP_CLASSES[classId];
    this.cls = cls;
    this.el.tele.innerHTML = '';
    for (let i = 0; i <= 5; i++) {
      const d = document.createElement('div');
      d.className = 'notch' + (i === 0 ? ' astern' : '');
      this.el.tele.appendChild(d);
    }
    this.el.armament.innerHTML = '';
    this.gunCells = cls.turrets.map((t) => {
      const cell = document.createElement('div');
      cell.className = 'gun-cell';
      cell.innerHTML = `<div class="lbl">${t.name}</div><div class="bar"><i></i></div>`;
      this.el.armament.appendChild(cell);
      return cell;
    });
    const toggle = document.createElement('div');
    toggle.className = 'shell-toggle';
    toggle.innerHTML = `<button class="shell-btn clickable" data-shell="ap">AP</button>
                        <button class="shell-btn clickable" data-shell="he">HE</button>`;
    this.el.armament.appendChild(toggle);
    this.shellButtons = [...toggle.querySelectorAll('.shell-btn')];

    this.el.consumables.innerHTML = '';
    const list = [{ k: 'repair', label: 'DAMAGE CTL', key: 'R' }];
    if (cls.smokeCharges) list.push({ k: 'smoke', label: 'SMOKE', key: 'T' });
    if (cls.torpedoes) list.push({ k: 'torp', label: 'TORPEDOES', key: '3' });
    if (cls.planes) list.push({ k: 'air', label: 'AIR STRIKE', key: '4' });
    this.consumables = {};
    for (const c of list) {
      const el = document.createElement('div');
      el.className = 'consumable';
      el.innerHTML = `<b>${c.key}</b>${c.label}<span class="cd"></span>`;
      this.el.consumables.appendChild(el);
      this.consumables[c.k] = el;
    }

    this.el.capBar.innerHTML = '';
    this.capEls = {};
    for (const cap of this.world.caps) {
      const el = document.createElement('div');
      el.className = 'cap';
      el.innerHTML = `<div class="prog"></div>${cap.id}`;
      this.el.capBar.appendChild(el);
      this.capEls[cap.id] = el;
    }
    this.built = true;
  }

  onShellSelect(fn) {
    this.shellButtons.forEach((b) => { b.onclick = () => fn(b.dataset.shell); });
  }

  setShellType(type) {
    this.shellButtons.forEach((b) => b.classList.toggle('on', b.dataset.shell === type));
  }

  formatRange(m) {
    return getSettings().metric ? `${(m / 1000).toFixed(1)} km` : `${(m / 1852).toFixed(1)} nm`;
  }

  update(own, snap) {
    if (!this.built || !own) return;
    const cls = this.cls;

    this.el.ownName.textContent = `${own.n || ''} · ${cls.name} (${cls.type})`;
    const frac = clamp(own.hp / (own.maxHp || cls.hp), 0, 1);
    this.el.ownHp.style.width = `${frac * 100}%`;
    this.el.ownHp.style.background = frac > 0.5
      ? 'linear-gradient(90deg,#4fae7d,#6fd3a0)'
      : frac > 0.22 ? 'linear-gradient(90deg,#c9a13c,#e2c14f)' : 'linear-gradient(90deg,#a23029,#e2564f)';
    this.el.ownHpText.textContent = `${Math.round(own.hp)} / ${Math.round(own.maxHp || cls.hp)}`;

    const chips = [];
    if (own.f) chips.push(`<span class="status-chip fire">FIRE ×${own.f}</span>`);
    if (own.fl) chips.push(`<span class="status-chip flood">FLOODING ×${own.fl}</span>`);
    if (own.eng) chips.push('<span class="status-chip engine">ENGINE</span>');
    if (own.str) chips.push('<span class="status-chip steering">STEERING</span>');
    this.el.status.innerHTML = chips.join('');

    [...this.el.tele.children].forEach((n, i) => {
      n.classList.toggle('on', own.notch === 0 ? i === 0 : i > 0 && i <= own.notch);
    });
    this.el.speed.textContent = `${Math.abs(own.v * MPS_TO_KNOTS).toFixed(1)} kn`;
    this.el.rudder.style.left = `${50 + (own.rud || 0) * 46}%`;
    const deg = ((wrapAngle(own.h) * 180) / Math.PI + 360) % 360;
    this.el.heading.textContent = `${String(Math.round(deg)).padStart(3, '0')}°`;

    if (own.cd) {
      own.cd.forEach((cd, i) => {
        const cell = this.gunCells[i];
        if (!cell) return;
        const reload = cls.gun.reload;
        const pct = clamp(1 - cd / reload, 0, 1);
        cell.querySelector('i').style.width = `${pct * 100}%`;
        cell.classList.toggle('ready', cd <= 0 && !(own.dis && own.dis[i]));
        cell.classList.toggle('blocked', !!(own.dis && own.dis[i]));
      });
    }

    const cd = (el, v, ready) => {
      if (!el) return;
      el.querySelector('.cd').textContent = v > 0 ? `${Math.ceil(v)}s` : '';
      el.classList.toggle('ready', ready);
    };
    cd(this.consumables.repair, own.rc, own.rc <= 0);
    if (this.consumables.smoke) {
      this.consumables.smoke.querySelector('.cd').textContent = `×${own.smk ?? 0}`;
      this.consumables.smoke.classList.toggle('ready', (own.smk ?? 0) > 0);
      this.consumables.smoke.classList.toggle('active', own.sm === 1);
    }
    if (this.consumables.torp && own.tp) {
      const min = Math.min(...own.tp);
      cd(this.consumables.torp, min, min <= 0);
    }
    if (this.consumables.air && own.sq) {
      const ready = own.sq.filter((s) => s === 0).length;
      this.consumables.air.querySelector('.cd').textContent = `×${ready}`;
      this.consumables.air.classList.toggle('ready', ready > 0);
    }

    if (snap) {
      this.el.score0.textContent = snap.score[this.team];
      this.el.score1.textContent = snap.score[1 - this.team];
      const left = Math.max(0, 900 - snap.time);
      this.el.timer.textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
      for (const cap of snap.caps) {
        const el = this.capEls[cap.id];
        if (!el) continue;
        el.classList.toggle('own', cap.o === this.team);
        el.classList.toggle('enemy', cap.o >= 0 && cap.o !== this.team);
        el.classList.toggle('contested', cap.k === 2);
        el.querySelector('.prog').style.height = `${cap.p}%`;
      }
    }
  }

  ribbon(text, cls = '') {
    const el = document.createElement('div');
    el.className = `ribbon ${cls}`;
    el.textContent = text;
    this.el.ribbons.appendChild(el);
    setTimeout(() => el.remove(), 2400);
    while (this.el.ribbons.children.length > 7) this.el.ribbons.firstChild.remove();
  }

  alert(text) {
    const el = document.createElement('div');
    el.className = 'alert';
    el.textContent = text;
    this.el.alerts.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  kill(killerName, killerTeam, victimName, victimTeam) {
    const el = document.createElement('div');
    el.className = 'kill-row';
    el.innerHTML = `<span class="k${killerTeam === this.team ? 0 : 1}">${killerName}</span>
      <span class="muted"> sank </span>
      <span class="k${victimTeam === this.team ? 0 : 1}">${victimName}</span>`;
    this.el.killfeed.appendChild(el);
    setTimeout(() => el.remove(), 9000);
    while (this.el.killfeed.children.length > 6) this.el.killfeed.firstChild.remove();
  }

  showScoreboard(roster, ownId, show) {
    this.el.scoreboard.classList.toggle('show', show);
    if (!show || !roster) return;
    const rows = roster
      .slice()
      .sort((a, b) => a.team - b.team || b.dmg - a.dmg)
      .map((r) => `<tr class="t${r.team === this.team ? 0 : 1}${r.alive ? '' : ' dead'}${r.id === ownId ? ' you' : ''}">
        <td>${r.type}</td><td>${r.name}${r.bot ? ' <span class="muted">AI</span>' : ''}</td>
        <td>${SHIP_CLASSES[r.cls].name}</td><td>${r.kills} kills</td>
        <td>${r.dmg.toLocaleString()} dmg</td><td>${r.hits} hits</td><td>${r.cits} cit</td></tr>`)
      .join('');
    this.el.scoreTable.innerHTML =
      `<tr><th></th><th>Captain</th><th>Ship</th><th></th><th></th><th></th><th></th></tr>${rows}`;
  }

  setSunk(sunk) { this.el.sink.classList.toggle('show', sunk); }

  toggleMap(big) { this.el.minimapWrap.classList.toggle('big', big); }

  /** The plot: own ship, contacts, torpedo tracks, capture zones, islands. */
  drawMinimap(own, ships, snap) {
    const ctx = this.ctx;
    const size = this.el.minimap.width;
    const scale = size / (MAP_HALF * 2);
    const toX = (x) => (x + MAP_HALF) * scale;
    const toY = (z) => size - (z + MAP_HALF) * scale;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(8,24,42,0.75)';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(154,166,178,0.14)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      const p = (size / 8) * i;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
    }

    ctx.fillStyle = 'rgba(56,64,47,0.9)';
    for (const isle of this.world.islands) {
      ctx.beginPath();
      ctx.arc(toX(isle.x), toY(isle.z), isle.r * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const cap of this.world.caps) {
      const snapCap = snap && snap.caps.find((c) => c.id === cap.id);
      const owner = snapCap ? snapCap.o : -1;
      ctx.strokeStyle = owner < 0 ? 'rgba(207,216,224,0.6)'
        : owner === this.team ? 'rgba(111,211,160,0.9)' : 'rgba(226,86,79,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(toX(cap.x), toY(cap.z), cap.r * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(cap.id, toX(cap.x) - 4, toY(cap.z) + 4);
    }

    if (snap) {
      ctx.strokeStyle = 'rgba(226,233,242,0.8)';
      ctx.lineWidth = 1.4;
      for (const tp of snap.torps) {
        ctx.beginPath();
        ctx.moveTo(toX(tp.x), toY(tp.z));
        ctx.lineTo(toX(tp.x + Math.sin(tp.h) * 380), toY(tp.z + Math.cos(tp.h) * 380));
        ctx.stroke();
      }
    }

    for (const s of ships) {
      const self = own && s.i === own.i;
      ctx.fillStyle = self ? '#e6cf9c' : s.tm === this.team ? '#6fd3a0' : '#e2564f';
      const x = toX(s.x), y = toY(s.z);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-s.h);
      ctx.beginPath();
      ctx.moveTo(0, -6); ctx.lineTo(3.4, 5); ctx.lineTo(-3.4, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      if (self) {
        // Firing arc of the main battery, so you can see what will bear.
        ctx.strokeStyle = 'rgba(230,207,156,0.35)';
        ctx.beginPath();
        ctx.arc(x, y, this.cls.gun.range * scale, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}
