
const _clearText = (text) => {
  text = text.replace(/_/g, '');
  return text;
};

/**
 * Returns an attack's range.
 *
 * The object contains 2 fields, one for the ranges represented by a single number and one for ranges
 * represented with in the short/long style.
 *
 * @Fields: singleRange -> value, units, shape ; doubleRange -> short, long, units
 *
 * @param text - markdown text
 */
const getAttackRange = (text) => {
  let singleRangeMatch = text.match(/ ([0-9]+)([ \-])(ft|feet|foot)( line| cone| cube| sphere)?/);
  let doubleRangeMatch = text.match(/ ([0-9]+)\/([0-9]+) (\w+)/);
  const rangeObject = {
    singleRange: {value: null, units: null, type: null},
    doubleRange: {value: null, long: null, units: null}
  };

  if (singleRangeMatch) {
    if (singleRangeMatch[4]) singleRangeMatch[4] = singleRangeMatch[4].replace(' ', '');
    rangeObject.singleRange.value = singleRangeMatch[1];
    rangeObject.singleRange.units = 'ft';
    rangeObject.singleRange.type = singleRangeMatch[4];
  }
  if (doubleRangeMatch) {
    rangeObject.doubleRange.value = doubleRangeMatch[1];
    rangeObject.doubleRange.long = doubleRangeMatch[2];
    rangeObject.doubleRange.units = 'ft';
  }

  return rangeObject;
};

/**
 * Returns an attack's damage
 *
 * @param text - markdown text
 */
const getAttackDamage = (text) => {
  const match = [...(text.matchAll(/\(([0-9]+d[0-9]+)( ?[+-] ?([0-9]+))?\) (\w+) damage/g) || [])];
  const attackObject = [];
  match.forEach((attack) => {
    attackObject.push([`${attack[1]} ${attack[2] ? '+ @mod' : ''}`, attack[4], Number(attack[2]?.replace(/ /g, ''))]);
  });
  return attackObject;
};

/**
 * Returns an attack's save DC and ability
 *
 * @Fields: DC, ability
 *
 * @param text - markdown text
 */
const getAttackSave = (text) => {
  let match = text.match(/DC ([0-9]+) (\w+)/);
  if (!match) return;
  const abi = Object.entries(CONFIG.DND5E.abilities).find(([a, b]) => b.label === match[2]) ?? [];
  return {
    'dc': Number(match[1]),
    'ability': abi ?? null
  };
};

/**
 * Returns an attacks to hit modifier
 *
 * @param text - markdown text
 */
const getAttackHit = (text) => {
  const match = text.match(/([+-] ?[0-9]+) to hit/);
  if (match) return Number(match[1].replace(' ', ''));
};

/**
 * Returns an attack
 *
 * @Fields: damage, range, save, hit, target
 *
 * @param text - markdown text
 */
const getAttack = (text) => {
  return {
    'damage': getAttackDamage(text),
    'range': getAttackRange(text),
    'save': getAttackSave(text),
    'hit': getAttackHit(text),
    'target': 1
  };
};

/**
 * Returns a creature's abilities
 * A creature's abilities could be for example attacks or features
 *
 * @Fields: description, data
 * @Note: `data` field may vary depending on the type of ability that is parsed
 *
 * @param text - markdown text
 */
const getAbilities = (text) => {
  const match = [...(text.matchAll(/\*\*\*(.*?)\.\*\*\* (.*)/g) || [])];
  const extraMatch = [...(text.matchAll(/(&nbsp;)+\*\*(.*?)\.\*\* (.*)/g) || [])];
  const abilitiesObject = {};

  match.forEach((ability) => {
    abilitiesObject[ability[1]] = {description: _clearText(ability[2]), data: {}};
    if (["Spellcasting", "Innate Spellcasting"].includes(ability[1])) {
      abilitiesObject[ability[1]].data = getSpellcastingStats(ability[2]);
    } else abilitiesObject[ability[1]].data = getAttack(ability[2]);
  });

  extraMatch.forEach((extraAbility) => {
    abilitiesObject[extraAbility[2]] = {
      description: _clearText(extraAbility[3]),
      data: {}
    };
    abilitiesObject[extraAbility[2]].data = getAttack(extraAbility[3]);
  });
  return abilitiesObject;
};

/**
 * Returns a creature's legendary actions
 *
 * @Field description, data, cost
 * @Note1 data field may vary depending on the type of action parsed
 * @Note2 cost field is by default 1, will be modified if the name of the action has a (Costs x Actions) structure
 *
 * @param text
 */
const getLegendaryActions = (text) => {
  const match = [...(text.matchAll(/> \*\*(.*?)( \(Costs ([0-9]+) Actions\))?\.\*\* (.*)/g) || [])];

  const actionObject = {};
  match.forEach((action) => {
    actionObject[action[1]] = {
      description: action[4],
      data: {},
      cost: 1
    };
    actionObject[action[1]].data = getAttack(action[4]);
    actionObject[action[1]].cost = action[3] ? action[3] : 1;
  });

  return actionObject;
};

/**
 * Returns a creature's spell list
 *
 * @ExampleFields: Cantrips, 1, 2, 3, 4
 * @Note: The function only returns the spell name because 5e stat block have only the names of the spells i guess...
 *
 * @param text - markdown text
 */
const getSpells = (text) => {
  const matchedSpells = [...(text.matchAll(/(Cantrips|([0-9]+)\w{1,2} level) \(.*\): _?(.*)_?/g) || [])];
  const atWillSpells = [...(text.matchAll(/At will: _?(.*)_?(?:<br>)?/g) || [])];
  const reapeatableSpells = [...(text.matchAll(/([0-9]+\/day)(?: each)?: _?(.*)_?/g) || [])];
  let spellsObject = {};
  matchedSpells.forEach((spell) => {
    const typeOfSpell = spell[2] ? spell[2] : spell[1];
    spellsObject[typeOfSpell] = spell[3].replace(/\*|_|<br>/g, '').split(',');
  });
  if (atWillSpells)
    spellsObject = {
      ...spellsObject,
      atWill: atWillSpells?.[0]?.[1]?.replaceAll?.(/\*|_|<br>/g, '')?.split?.(', ')
    };
  if (reapeatableSpells)
    reapeatableSpells.forEach((spell) => {
      spellsObject[spell[1]] = spell[2].replaceAll(/\*|_|<br>/g, '').split(', ');
    });

  return spellsObject;
};

export {
  getAbilities,
  getLegendaryActions,
  getSpells
};
