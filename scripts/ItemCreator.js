/**
 * Returns an array of all the compendiums that have the identifier `spell` in their name
 *
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
 *
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
 *
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
 *
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
 *
 * @param actor - owner of the spells
 * @param spells - an array of spell names
 */

const spellsAdder = async (actor, spells) => {
  if (!spells?.length) return;
  const spellList = await _prepareSpellsObject(spells);
  return actor.createEmbeddedDocuments('Item', spellList);
};

/**
 * Removes the to hit value from the damage array
 *
 * @param abilityData - data of the ability currently being cleaned
 * @private
 */
const _cleanAbilityDamage = (abilityData) => {
  if (!abilityData) return abilityData;
  abilityData.forEach((ability) => {
    ability.pop();
  });
  return abilityData;
};

/**
 * Returns a foundry friendly structure for range and target
 *
 * @param abilityRange - ability.data.range data that came from the parser
 * @private
 */
const _makeRangeTargetStructure = (abilityRange) => {
  const structure = {};
  if (!abilityRange) return structure;
  if (abilityRange?.singleRange?.type) {
    structure['target'] = abilityRange.singleRange;
    structure['range'] = {
      value: null,
      long: null,
      units: 'self'
    };
  } else {
    structure['range'] = abilityRange.doubleRange.short ? abilityRange.doubleRange : abilityRange.singleRange;
  }
  return structure;
};

/**
 * Returns the ability that is used for the attack
 *
 * @param ability - ability data
 * @param actorStats - the stats of the actor
 * @private
 */
const _getAttackAbility = (ability, actorStats) => {
  if (!ability?.data?.damage?.[0]) return;
  for (const key in actorStats) {
    if (actorStats.hasOwnProperty(key)) {
      const mod = Math.floor(actorStats[key] / 2 - 5);
      if (Number(ability?.data?.damage[0][2]) === mod) {
        return key.toLowerCase();
      }
    }
  }
};

/**
 * Returns an object for the activation of an attack
 *
 * @param ability - ability to get the activation of
 * @private
 */
const _getActivation = (ability) => {
  const activationObject = {type: '', cost: null, condition: ''};
  if (ability?.cost) {
    activationObject.type = 'legendary';
    activationObject.cost = ability.cost;
  } else if (ability?.data?.damage?.length || ability?.data?.save) {
    activationObject.type = 'action';
    activationObject.cost = 1;
  }
  return activationObject;
};

const makeDiceRollable = (description = "") => {
  return description.replaceAll(/(\dd\d ?[+-]? ?\d?)/g, (match) => {
    return `[[/r ${match}]]{${match}}`;
  });
}

/**
 * Creates the item to be added to the actor
 *
 * @param actor - actor that is the owner of the item
 * @param itemName - the name of the item
 * @param itemData - data of the item from the parser
 * @param actorStats - stats of the actor
 */

const itemCreator = async (actor, itemName, itemData, actorStats) => {
  const hasThirdWTF = !!itemData?.system?.damage?.[0]?.[2];
  let thisItem = {
    name: itemName,
    type: hasThirdWTF ? "weapon" : "feat",
    system: {
      description: {value: makeDiceRollable(itemData.description)},
      activation: _getActivation(itemData),
      ability: _getAttackAbility(itemData, actorStats),
      actionType: hasThirdWTF ? "mwak" : null,
      damage: {parts: _cleanAbilityDamage(itemData?.system?.damage)},
      save: itemData?.system?.save,
      equipped: true
    }
  };
  Object.assign(thisItem.system, _makeRangeTargetStructure(itemData?.system?.range));
  try {
    await Item.implementation.create(thisItem, {parent: actor});
  } catch (e) {
    ui.notifications.error(`There has been an error while creating '${itemName}'.`);
  }
};

/**
 * Adds all abilities to the actor
 *
 * @param actor - owner of the abilities
 * @param abilities - abilities object
 * @param actorStats - stats of the actor
 */
const abilitiesAdder = async (actor, abilities, actorStats) => {
  for (const key in abilities) {
    if (abilities.hasOwnProperty(key))
      await itemCreator(actor, key, abilities[key], actorStats);
  }
};

export {abilitiesAdder, spellsAdder};
