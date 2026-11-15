// Dnd Hub: "Список компендиумов" (compendium survey). Read only: changes nothing.
// Foundry VTT 14.370, dnd5e 6.1.0. Run as a GM script macro.
// Downloads dndhub-packs-<date>.json: every compendium with item types, counts and sample names,
// so we can choose which ones go into the app library and check the Russian translation.

(async () => {
  const SAMPLE = 5;
  try {
    if (!game.user.isGM) {
      ui.notifications.warn('Макрос запускает только мастер.');
      return;
    }
    ui.notifications.info('Собираю список компендиумов…');

    const translation = ['babele', 'ru-ru', 'dnd5e_ru', 'ru-ru-dnd5e']
      .map((id) => game.modules.get(id))
      .filter(Boolean)
      .map((m) => ({ id: m.id, title: m.title, version: m.version, active: m.active }));

    const packs = [];
    for (const pack of game.packs) {
      const entry = {
        id: pack.collection,
        label: pack.metadata.label,
        documentName: pack.documentName,
        package: pack.metadata.packageName,
        packageType: pack.metadata.packageType,
        count: pack.index.size,
        types: {},
        sample: [],
      };
      if (pack.documentName === 'Item') {
        const index = await pack.getIndex({ fields: ['type', 'system.type.value', 'system.rarity'] });
        for (const e of index.values()) entry.types[e.type] = (entry.types[e.type] ?? 0) + 1;
        // A few full documents: shows whether names and descriptions come translated
        const docs = await pack.getDocuments({ _id__in: [...index.keys()].slice(0, SAMPLE) }).catch(() => []);
        entry.sample = docs.map((d) => ({
          id: d.id,
          name: d.name,
          originalName: d.flags?.babele?.originalName ?? null,
          type: d.type,
          descriptionStart: String(d.system?.description?.value ?? '').replace(/<[^>]+>/g, ' ').slice(0, 160),
        }));
      }
      packs.push(entry);
    }

    const data = {
      kind: 'dndhub-packs',
      foundryVersion: game.version,
      systemVersion: game.system.version,
      language: game.i18n.lang,
      translation,
      packs,
    };
    const json = JSON.stringify(data, null, 2);
    const filename = `dndhub-packs-${new Date().toISOString().slice(0, 10)}.json`;
    const save = foundry.utils?.saveDataToFile ?? globalThis.saveDataToFile;
    if (typeof save === 'function') save(json, 'application/json', filename);
    ui.notifications.info(`Готово: ${packs.length} компендиумов, файл ${filename}`);
  } catch (e) {
    console.error('Dnd Hub | list packs failed', e);
    ui.notifications.error(`Dnd Hub: список не получился — ${e?.message ?? e}`, { permanent: true });
  }
})();
