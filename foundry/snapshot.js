// Dnd Hub: "Снимок персонажа" (character snapshot)
// Foundry VTT 14.370, dnd5e 6.1.0. Run as a GM script macro.
// Downloads a JSON snapshot of one character or of the whole party.
// Format: see CLAUDE.md, "Формат снимка".

(async () => {
  const SCHEMA_VERSION = 1;
  const EXPECTED = { foundry: '14.370', system: '6.1.0' };
  const PORTRAIT_SIZE = 256;
  const DEFAULT_IMG = /icons\/svg\/(actors\/character|mystery-man)\.svg$/;

  /** Runs fn, returns its value or null if it throws or returns undefined. */
  const safe = (fn) => {
    try {
      const v = fn();
      return v === undefined ? null : v;
    } catch (e) {
      return null;
    }
  };

  /** Plain-data copy of derived values (own enumerable props), cycle- and depth-safe. */
  const SKIP_KEYS = new Set(['parent', 'actor', 'item', 'document', 'collection', 'apps', '_source']);
  function plain(value, depth = 0, seen = new WeakSet()) {
    if (value === null || value === undefined) return null;
    const t = typeof value;
    if (t === 'string' || t === 'boolean') return value;
    if (t === 'number') return Number.isFinite(value) ? value : null;
    if (t !== 'object') return null; // functions, symbols, bigint
    if (depth > 10 || seen.has(value)) return null;
    seen.add(value);
    if (Array.isArray(value)) return value.map((v) => plain(v, depth + 1, seen));
    if (value instanceof Set) return [...value].map((v) => plain(v, depth + 1, seen));
    if (value instanceof Map) {
      const out = {};
      for (const [k, v] of value) out[String(k)] = plain(v, depth + 1, seen);
      return out;
    }
    const out = {};
    for (const key of Object.keys(value)) {
      if (SKIP_KEYS.has(key)) continue;
      const v = safe(() => value[key]);
      if (typeof v === 'function') continue;
      out[key] = plain(v, depth + 1, seen);
    }
    return out;
  }

  // ---- computed values --------------------------------------------------

  function computeActor(actor) {
    const sys = actor.system;
    const attr = sys.attributes ?? {};

    const abilities = {};
    for (const [key, a] of Object.entries(sys.abilities ?? {})) {
      abilities[key] = {
        value: safe(() => a.value),
        mod: safe(() => a.mod),
        save: safe(() => (typeof a.save === 'object' ? a.save.value : a.save)),
        proficient: safe(() => a.proficient),
        dc: safe(() => a.dc),
      };
    }

    const skills = {};
    for (const [key, s] of Object.entries(sys.skills ?? {})) {
      skills[key] = {
        ability: safe(() => s.ability),
        total: safe(() => s.total),
        passive: safe(() => s.passive),
        proficient: safe(() => s.value),
      };
    }

    const spellSlots = {};
    for (const [key, s] of Object.entries(sys.spells ?? {})) {
      spellSlots[key] = { value: safe(() => s.value), max: safe(() => s.max), level: safe(() => s.level) };
    }

    const items = [];
    for (const item of actor.items) {
      const activities = [];
      const acts = safe(() => item.system.activities);
      if (acts) {
        for (const act of acts) {
          activities.push({
            id: safe(() => act.id),
            type: safe(() => act.type),
            name: safe(() => act.name),
            labels: plain(safe(() => act.labels)),
          });
        }
      }
      items.push({
        id: item.id,
        name: item.name,
        type: item.type,
        uses: plain(safe(() => item.system.uses)),
        labels: plain(safe(() => item.labels)),
        activities,
      });
    }

    return {
      ac: safe(() => attr.ac.value),
      hp: {
        value: safe(() => attr.hp.value),
        max: safe(() => attr.hp.max),
        temp: safe(() => attr.hp.temp),
        tempmax: safe(() => attr.hp.tempmax),
      },
      init: safe(() => attr.init.total),
      movement: plain(safe(() => attr.movement)),
      prof: safe(() => attr.prof),
      spell: plain(safe(() => attr.spell)),
      spellcasting: safe(() => attr.spellcasting),
      level: safe(() => sys.details.level),
      abilities,
      skills,
      spellSlots,
      items,
      // Full copy of derived data, used to verify field locations. May be removed later.
      derived: plain(sys),
    };
  }

  // ---- portrait -----------------------------------------------------------

  async function portraitDataUrl(src) {
    if (!src || DEFAULT_IMG.test(src)) return null;
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = src;
      await img.decode();
      const scale = Math.min(1, PORTRAIT_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/webp', 0.85);
    } catch (e) {
      console.warn('Dnd Hub | portrait failed', src, e);
      return null;
    }
  }

  // ---- snapshot -----------------------------------------------------------

  async function snapshot(actor) {
    return {
      schemaVersion: SCHEMA_VERSION,
      meta: {
        foundryVersion: game.version,
        systemVersion: game.system.version,
        actorId: actor.id,
        actorName: actor.name,
        exportedAt: new Date().toISOString(),
      },
      source: actor.toObject(),
      computed: computeActor(actor),
      portrait: await portraitDataUrl(actor.img),
    };
  }

  function download(data, filename) {
    const json = JSON.stringify(data);
    const save = foundry.utils?.saveDataToFile ?? globalThis.saveDataToFile;
    if (typeof save === 'function') {
      save(json, 'application/json', filename);
      return;
    }
    // Fallback: plain browser download
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Reads the chosen actor id from the dialog, whatever the callback receives. */
  function readActorChoice(event, button, dialog) {
    const root = dialog?.element ?? button?.closest?.('.application, dialog') ?? document;
    const select = button?.form?.elements?.actor ?? root.querySelector?.('select[name="actor"]');
    return select?.value ?? null;
  }

  const slug = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'actor';
  const today = new Date().toISOString().slice(0, 10);

  // ---- UI ---------------------------------------------------------------

  try {

  if (!game.user.isGM) {
    ui.notifications.warn('Снимок делает только мастер.');
    return;
  }
  if (game.version !== EXPECTED.foundry || game.system.version !== EXPECTED.system) {
    ui.notifications.warn(
      `Макрос проверен на Foundry ${EXPECTED.foundry} и dnd5e ${EXPECTED.system}, а у вас ${game.version} и ${game.system.version}.`,
    );
  }

  // Party = characters owned by at least one non-GM player
  const party = game.actors.filter(
    (a) => a.type === 'character' && game.users.some((u) => !u.isGM && a.testUserPermission(u, 'OWNER')),
  );
  const characters = game.actors.filter((a) => a.type === 'character');
  if (!characters.length) {
    ui.notifications.warn('В мире нет персонажей.');
    return;
  }

  const options = characters
    .map((a) => `<option value="${a.id}">${foundry.utils.escapeHTML?.(a.name) ?? a.name}</option>`)
    .join('');
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: 'Dnd Hub: снимок персонажа' },
    content: `<div class="form-group"><label>Персонаж</label><select name="actor">${options}</select></div>
      <p>Партия: ${party.length ? party.map((a) => a.name).join(', ') : 'нет персонажей с владельцем-игроком'}</p>`,
    buttons: [
      { action: 'one', label: 'Снимок персонажа', default: true, callback: readActorChoice },
      { action: 'party', label: 'Вся партия', callback: () => 'party' },
    ],
    rejectClose: false,
  });
  if (!choice) return;

  if (choice === 'party') {
    if (!party.length) {
      ui.notifications.warn('Нет персонажей, которыми владеют игроки.');
      return;
    }
    ui.notifications.info('Собираю снимок партии…');
    const snapshots = [];
    for (const actor of party) snapshots.push(await snapshot(actor));
    download({ schemaVersion: SCHEMA_VERSION, kind: 'party', exportedAt: new Date().toISOString(), snapshots }, `dndhub-party-${today}.json`);
    ui.notifications.info(`Снимок партии готов: ${snapshots.length} перс.`);
  } else {
    const actor = game.actors.get(choice);
    if (!actor) throw new Error(`не нашёл персонажа (выбор: ${choice})`);
    ui.notifications.info(`Собираю снимок «${actor.name}»…`);
    download(await snapshot(actor), `dndhub-${slug(actor.name)}-${today}.json`);
    ui.notifications.info(`Снимок «${actor.name}» готов.`);
  }
  } catch (e) {
    console.error('Dnd Hub | snapshot failed', e);
    ui.notifications.error(`Dnd Hub: снимок не получился — ${e?.message ?? e}`, { permanent: true });
  }
})();
