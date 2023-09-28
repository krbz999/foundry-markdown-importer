/**
 * Returns an array of all the compendiums that have the identifier `spell` in their name
 * @private
 */
const _getCompendiums = async () => {
  const packKeys = game.packs.keys();
  const spellCompendiums = [];
  for (const key of packKeys) {
    if (key.includes('spell')) {
      const pack = game.packs.get(key);
      await pack.getIndex();
      spellCompendiums.push(pack);
    }
  }
  return spellCompendiums;
};

/**
 * Returns an entity from the compendium
 * @param compendiums - source compendiums
 * @param spellName - name of the spell
 * @private
 */
const _getEntityFromCompendium = async (compendiums, spellName) => {
  for (const compendium of compendiums) {
    const entry = compendium.index.find(e => e.name.toLowerCase() === spellName.toLowerCase());
    if (entry) return compendium.getDocument(entry._id);
  }
  ui.notifications.warn(`${spellName} not found.`);
};

/**
 * Converts the array of names to the array of spell entities for the createEmbeddedEntity
 * @param spells - array of spells
 * @param compendium - a compendium to get the entity structure from
 * @private
 */
const _prepareSpellsArray = async (spells, compendium, key) => {
  if (!spells) return [];
  for (const spell of spells) {
    const index = spells.indexOf(spell);
    const spellFromCompendium = await _getEntityFromCompendium(compendium, spell.toLowerCase().trim());
    if (!spellFromCompendium) continue;
    spells[index] = game.items.fromCompendium(spellFromCompendium);

    if (key.includes('/')) {
      const [value, period] = key.split('/');
      spells[index].system.uses = {value: value, max: value, per: period};
      spells[index].system.preparation = {mode: "innate"};
    } else if (key === 'atWill') spells[index].system.preparation = {mode: "atwill"};
  }

  return spells.filter(el => el);
};

/**
 * Returns an array of all the spells entity
 * @param spells - an object that contains all the spells
 * @private
 */
const _prepareSpellsObject = async (spells) => {
  const compendiums = await _getCompendiums();
  let spellsArray = [];
  for (const key in spells) {
    if (!spells.hasOwnProperty(key)) continue;
    const newSpells = await _prepareSpellsArray(spells[key], compendiums, key);
    spellsArray = [
      ...spellsArray,
      ...newSpells
    ];
  }
  return spellsArray;
};

/**
 * Adds all the spells to the actor object
 * @param actor - owner of the spells
 * @param spells - an array of spell names
 */
const spellsAdder = async (actor, spells) => {
  if (!spells?.length) return;
  const spellList = await _prepareSpellsObject(spells);
  return actor.createEmbeddedDocuments('Item', spellList);
};
