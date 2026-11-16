// Dnd Hub: "Выгрузка библиотеки" (library export). Read only: changes nothing in the world.
// Foundry VTT 14.370, dnd5e 6.1.0, Babele + ru-ru. Run as a GM script macro.
// Downloads dndhub-library-<date>.json with catalogue entries from the chosen compendiums
// (names and descriptions as the translation module shows them). Duplicates are removed by the app.

(async () => {
  // Priority order: earlier packs win when the same entry exists in several.
  const PACKS = [
    // AG Fifthpendium (D&D 2024)
    'ag-fifthpendium.equipment',
    'ag-fifthpendium.spells',
    'ag-fifthpendium.feats',
    'ag-fifthpendium.origins',
    'ag-fifthpendium.classes',
    'ag-fifthpendium.bastions',
    'ag-fifthpendium-eberron.items',
    'ag-fifthpendium-eberron.options',
    'ag-fifthpendium-eberron.bastions',
    'ag-fifthpendium-forgotten-realms.items',
    'ag-fifthpendium-forgotten-realms.options',
    'ag-fifthpendium-ravenloft.items',
    'ag-fifthpendium-ravenloft.options',
    'ag-fifthpendium-ravenloft.bastions',
    // Laaru (D&D 2014)
    'laaru-dnd5-hw.items',
    'laaru-dnd5-hw.spells',
    'laaru-dnd5-hw.backgrounds',
    'laaru-dnd5-hw.races',
    'laaru-dnd5-hw.racesMPMM',
    'laaru-dnd5-hw.classes',
    'laaru-dnd5-hw.subclasses',
    'laaru-dnd5-hw.classfeatures',
    'laaru-dnd5-hw.actions',
    'laaru-dnd5-hw.conditions',
  ];

  const safe = (fn) => {
    try {
      const v = fn();
      return v === undefined ? null : v;
    } catch {
      return null;
    }
  };
  const list = (v) => (v instanceof Set ? [...v] : Array.isArray(v) ? v : []);

  function entry(doc, pack, priority) {
    const sys = doc.system ?? {};
    const weight = safe(() => (typeof sys.weight === 'object' ? sys.weight.value : sys.weight));
    return {
      uuid: doc.uuid,
      pack: pack.collection,
      packLabel: pack.metadata.label,
      packageName: pack.metadata.packageName,
      priority,
      type: doc.type,
      subtype: safe(() => sys.type.value),
      baseItem: safe(() => sys.type.baseItem),
      name: doc.name,
      originalName: safe(() => doc.flags.babele.originalName),
      identifier: safe(() => sys.identifier),
      classIdentifier: safe(() => sys.classIdentifier),
      rarity: safe(() => sys.rarity) || null,
      attunement: safe(() => sys.attunement) || null,
      level: safe(() => (doc.type === 'spell' ? sys.level : null)),
      school: safe(() => sys.school) || null,
      price: safe(() => (sys.price ? { value: sys.price.value, denomination: sys.price.denomination } : null)),
      weight: typeof weight === 'number' ? weight : null,
      properties: list(safe(() => sys.properties)),
      requirements: safe(() => sys.requirements) || null,
      description: safe(() => sys.description.value) || '',
    };
  }

  try {
    if (!game.user.isGM) {
      ui.notifications.warn('Макрос запускает только мастер.');
      return;
    }
    const entries = [];
    const packs = [];
    const missing = [];
    for (const [priority, id] of PACKS.entries()) {
      const pack = game.packs.get(id);
      if (!pack || pack.documentName !== 'Item') {
        missing.push(id);
        continue;
      }
      ui.notifications.info(`Выгружаю «${pack.metadata.label}» (${pack.index.size})…`);
      const docs = await pack.getDocuments();
      for (const doc of docs) entries.push(entry(doc, pack, priority));
      packs.push({ id, label: pack.metadata.label, packageName: pack.metadata.packageName, count: docs.length });
    }
    const data = {
      kind: 'dndhub-library',
      version: 1,
      exportedAt: new Date().toISOString(),
      foundryVersion: game.version,
      systemVersion: game.system.version,
      packs,
      missing,
      entries,
    };
    const json = JSON.stringify(data);
    const filename = `dndhub-library-${new Date().toISOString().slice(0, 10)}.json`;
    const save = foundry.utils?.saveDataToFile ?? globalThis.saveDataToFile;
    save(json, 'application/json', filename);
    ui.notifications.info(
      `Готово: ${entries.length} записей из ${packs.length} компендиумов${missing.length ? `, не найдено: ${missing.length}` : ''}. Файл ${filename}`,
      { permanent: true },
    );
  } catch (e) {
    console.error('Dnd Hub | library export failed', e);
    ui.notifications.error(`Dnd Hub: выгрузка не получилась — ${e?.message ?? e}`, { permanent: true });
  }
})();
