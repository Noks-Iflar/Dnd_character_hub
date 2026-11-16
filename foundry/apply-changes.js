// Dnd Hub: "Применить правки" (apply player edits). Foundry VTT 14.370, dnd5e 6.1.0. GM script macro.
// Reads dndhub-changes-<date>.json downloaded from the GM screen, shows a preview per character
// and, after confirmation, writes the values to the actors and adds library items from compendiums.

(async () => {
  // Same list as public.is_editable_path() in the app database
  const EDITABLE = [
    /^system\.attributes\.hp\.(value|temp)$/,
    /^system\.attributes\.death\.(success|failure)$/,
    /^system\.attributes\.(exhaustion|inspiration)$/,
    /^system\.spells\.(spell[1-9]|pact)\.value$/,
    /^system\.currency\.(pp|gp|ep|sp|cp)$/,
    /^items\.[A-Za-z0-9]{16}\.system\.(quantity|equipped|uses\.spent|hd\.spent)$/,
  ];
  const ITEM_PATH = /^items\.([A-Za-z0-9]{16})\.(system\..+)$/;
  const BOOLEAN = /(equipped|inspiration)$/;
  const LABEL = {
    'system.attributes.hp.value': 'Хиты',
    'system.attributes.hp.temp': 'Временные хиты',
    'system.attributes.death.success': 'Спасброски от смерти: успехи',
    'system.attributes.death.failure': 'Спасброски от смерти: провалы',
    'system.attributes.exhaustion': 'Истощение',
    'system.attributes.inspiration': 'Вдохновение',
  };
  const ITEM_FIELD = { 'system.quantity': 'количество', 'system.equipped': 'надето', 'system.uses.spent': 'потрачено зарядов', 'system.hd.spent': 'потрачено костей хитов' };
  const esc = (s) => foundry.utils.escapeHTML?.(String(s)) ?? String(s).replace(/[&<>"]/g, '');
  const show = (v) => (v === true ? 'да' : v === false ? 'нет' : v === null || v === undefined ? '—' : String(v));

  function pickFile() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
      input.click();
    });
  }

  /** Where a change goes in Foundry: { doc, key, label } or { error }. */
  function target(actor, path) {
    if (!EDITABLE.some((re) => re.test(path))) return { error: 'поле нельзя менять из приложения' };
    const m = ITEM_PATH.exec(path);
    if (m) {
      const item = actor.items.get(m[1]);
      if (!item) return { error: 'предмета больше нет у персонажа' };
      return { doc: item, key: m[2], label: `${item.name}: ${ITEM_FIELD[m[2]] ?? m[2]}` };
    }
    const spell = /^system\.spells\.(spell(\d)|pact)\.value$/.exec(path);
    const coin = /^system\.currency\.(\w+)$/.exec(path);
    const label = LABEL[path] ?? (spell ? (spell[1] === 'pact' ? 'Ячейки договора' : `Ячейки ${spell[2]} круга`) : coin ? `Монеты: ${coin[1]}` : path);
    return { doc: actor, key: path, label };
  }

  try {
    if (!game.user.isGM) {
      ui.notifications.warn('Макрос запускает только мастер.');
      return;
    }
    const file = await pickFile();
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      throw new Error('файл не читается как JSON');
    }
    if (data?.kind !== 'dndhub-changes' || !Array.isArray(data.characters)) throw new Error('это не файл правок Dnd Hub');

    // ---- plan ----
    const plan = [];
    for (const ch of data.characters) {
      const actor = game.actors.get(ch.actorId);
      const rows = [];
      for (const c of ch.changes ?? []) {
        if (c.kind === 'add_item') {
          const quantity = Math.trunc(Number(c.quantity));
          rows.push(quantity >= 1 ? { kind: 'add', uuid: c.uuid, name: c.name, quantity } : { error: `${c.name}: неверное количество` });
          continue;
        }
        if (!actor) continue;
        const t = target(actor, c.path);
        if (t.error) {
          rows.push({ error: `${c.path}: ${t.error}` });
          continue;
        }
        const wantBoolean = BOOLEAN.test(c.path);
        if (wantBoolean ? typeof c.value !== 'boolean' : typeof c.value !== 'number') {
          rows.push({ error: `${t.label}: неверное значение` });
          continue;
        }
        const current = foundry.utils.getProperty(t.doc, t.key);
        rows.push({ kind: 'set', ...t, value: c.value, was: c.was, current, conflict: c.was !== null && c.was !== undefined && current !== c.was });
      }
      plan.push({ name: ch.name, actor, rows });
    }

    // ---- preview ----
    const html = plan
      .map((p) => {
        if (!p.actor) return `<h3>${esc(p.name)}</h3><p style="color:#b3261e">Актёр не найден в этом мире — пропускаю.</p>`;
        const lines = p.rows
          .map((r) =>
            r.error
              ? `<tr><td colspan="4" style="color:#b3261e">Пропуск: ${esc(r.error)}</td></tr>`
              : r.kind === 'add'
                ? `<tr><td>Добавить предмет</td><td colspan="3"><b>${esc(r.name)}</b> ×${r.quantity}</td></tr>`
                : `<tr${r.conflict ? ' style="background:rgba(179,38,30,0.15)"' : ''}><td>${esc(r.label)}</td><td>${esc(show(r.was))}</td><td>${esc(show(r.current))}</td><td><b>${esc(show(r.value))}</b></td></tr>`,
          )
          .join('');
        return `<h3>${esc(p.name)}</h3><table><tr><th>Поле</th><th>В снимке</th><th>Сейчас</th><th>Станет</th></tr>${lines}</table>`;
      })
      .join('');
    const conflicts = plan.flatMap((p) => p.rows).filter((r) => r.conflict).length;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: 'Dnd Hub: применить правки' },
      position: { width: 560 },
      content:
        (conflicts
          ? `<p style="color:#b3261e">Выделено строк: ${conflicts}. Значение в Foundry уже отличается от снимка — правка игрока его перезапишет.</p>`
          : '') + html,
      rejectClose: false,
    });
    if (!ok) return;

    // ---- apply ----
    let applied = 0;
    const problems = [];
    for (const p of plan) {
      if (!p.actor) {
        problems.push(`${p.name}: актёр не найден`);
        continue;
      }
      const actorUpdate = {};
      const itemUpdates = new Map();
      for (const r of p.rows) {
        if (r.error) {
          problems.push(`${p.name}: ${r.error}`);
          continue;
        }
        if (r.kind === 'set') {
          if (r.doc === p.actor) actorUpdate[r.key] = r.value;
          else itemUpdates.set(r.doc.id, { ...(itemUpdates.get(r.doc.id) ?? { _id: r.doc.id }), [r.key]: r.value });
          applied++;
        }
      }
      if (Object.keys(actorUpdate).length) await p.actor.update(actorUpdate);
      if (itemUpdates.size) await p.actor.updateEmbeddedDocuments('Item', [...itemUpdates.values()]);

      for (const r of p.rows.filter((x) => x.kind === 'add')) {
        try {
          // Same item from the same compendium already carried: just increase the quantity
          const existing = p.actor.items.find((i) => i._stats?.compendiumSource === r.uuid || i.flags?.core?.sourceId === r.uuid);
          if (existing) {
            await existing.update({ 'system.quantity': (existing.system.quantity ?? 1) + r.quantity });
          } else {
            const source = await fromUuid(r.uuid);
            if (!source) throw new Error('нет в компендиуме');
            const itemData = source.toObject();
            delete itemData._id;
            foundry.utils.setProperty(itemData, 'system.quantity', r.quantity);
            foundry.utils.setProperty(itemData, '_stats.compendiumSource', r.uuid);
            await p.actor.createEmbeddedDocuments('Item', [itemData]);
          }
          applied++;
        } catch (e) {
          problems.push(`${p.name}: ${r.name} — ${e?.message ?? e}`);
        }
      }
    }

    const summary = `Применено правок: ${applied}.${problems.length ? ` Не применено: ${problems.length}.` : ''}`;
    if (problems.length) console.warn('Dnd Hub | not applied', problems);
    await foundry.applications.api.DialogV2.prompt({
      window: { title: 'Dnd Hub: готово' },
      content: `<p>${esc(summary)}</p>${problems.length ? `<ul>${problems.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}<p>Теперь в приложении нажми «Всё перенесено — отметить применёнными».</p>`,
      rejectClose: false,
    });
  } catch (e) {
    console.error('Dnd Hub | apply changes failed', e);
    ui.notifications.error(`Dnd Hub: правки не применились — ${e?.message ?? e}`, { permanent: true });
  }
})();
