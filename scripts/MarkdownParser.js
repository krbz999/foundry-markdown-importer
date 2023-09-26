const _resistanceMap = {
  'Damage Immunities': 'di',
  'Damage Vulnerabilities': 'dv',
  'Damage Resistances': 'dr',
  'Condition Immunities': 'ci'
};

const convertResistance = (resistance) => _resistanceMap[resistance];

const _clearText = (text) => {
  text = text.replace(/_/g, '');
  return text;
};

/**
 * Returns a creature's name
 *
 * @param text - markdown text
 */
const getCreatureName = (text) => {
  const match = text.match(/>\s*##\s*(.+)/);
  if (!match) return;
  return match[1];
};

const getCreatureSizeAndAlignment = (text) => {
  const match = text.match(/\*(\w+) (\w+).*, (.*?)\*/);
  if (!match) return;
  return {size: match[1], race: match[2], alignment: match[3]};
};

/**
 * Returns an object that contains the creatures AC and the source of that armor class
 *
 * @Fields: AC, source
 *
 * @param text - markdown text
 */
const getCreatureACAndSource = (text) => {
  const match = text.match(/ \*\*Armor Class\*\* ([0-9]+) ?(.*)?/);
  if (!match) return;
  return {AC: match[1], source: match[2]};
};

/**
 * Returns an object that contains the creatures HP and the formula to calculate it
 *
 * @Fields: HP, formula
 *
 * @param text - markdown text
 */
const getCreatureHP = (text) => {
  const match = text.match(/ \*\*Hit Points\*\* ([0-9]+)(?: \((.*?)\))?/);
  if (!match) return;
  return {HP: match[1], formula: match[2]};
};

const specialSpeed = (special) => {
  if (!special) return;
  const matched = [...(special.matchAll(/(\w+) ([0-9]+)/g) || [])];
  const out = {
    'burrow': 0,
    'climb': 0,
    'fly': 0,
    'hover': false,
    'swim': 0
  };
  matched.forEach(match => {
    const value = Number.isNumeric(match[2]) ? Number(match[2]) : 0;
    out[match[1]] = value;
  });
  out.hover = !!out.hover;
  return out;
};

/**
 * Returns an object that contains a creature's speed
 *
 * @Fields: value, special
 *
 * @param text - markdown text
 */
const getCreatureSpeed = (text) => {
  const speedMatch = text.match(/\*\*Speed\*\* ([0-9]+) ft.,? ?(.*)?/);
  if (!speedMatch) return;
  return {
    walk: Number(speedMatch[1]),
    ...specialSpeed(speedMatch[2]),
    units: 'ft'
  };
};

/**
 * Returns a creature's stats
 *
 * @Fields: Str, Dex, Con, Int, Wis, Cha
 *
 * @param text - markdown text
 */
const getCreatureStats = (text) => {
  const stats = [...(text.matchAll(/\|([0-9]+) \([+-][0-9]+\)/g) || [])];
  const updatedStats = {Str: 0, Dex: 0, Con: 0, Int: 0, Wis: 0, Cha: 0};
  stats.forEach((stat, index) => {
    updatedStats[Object.keys(updatedStats)[index]] = Number(stat[1]);
  });
  return updatedStats;
};

/**
 * Returns a creature's saving throws as an object
 *
 * @ExampleFields: Str, Dex
 *
 * @param text - markdown text
 */
const getSavingThrowMods = (text) => {
  const savesObject = {};
  const match = text.match(/\*\*Saving Throws\*\* (.*)/);
  if (!match) return;
  const savesMatch = [...(match[1].matchAll(/(\w{3}) \+([0-9]+)/g) || [])];
  savesMatch.forEach(save => savesObject[save[1]] = Number(save[2]));
  return savesObject;
};

/**
 * Returns a creature's skills
 *
 * @ExampleFields: Perception, Insist
 *
 * @param text - markdown text
 */
const getSkills = (text) => {
  const skillsObject = {};
  const match = text.match(/\*\*Skills\*\* (.*)/);
  if (!match) return;
  const skills = [...(match[0].matchAll(/(\w+) \+([0-9]+)/g) || [])];
  skills.forEach((skill) => skillsObject[skill[1]] = Number(skill[2]));
  return skillsObject;
};

/**
 * Returns a creature's damage modifiers (Vulnerability, Resistance, Immunity)
 *
 * @ExampleFields: Immunity, Vulnerability
 *
 * @param text - markdown text
 */
const getDamageModifiers = (text) => {
  const modifiersObject = {};
  const damageMatch = [...(text.matchAll(/\*\*(Damage \w+)\*\* (.*)/g) || [])];
  const conditionMatch = [...(text.matchAll(/\*\*(Condition Immunities)\*\* (.*)/g) || [])];
  damageMatch.forEach((modifier) => modifiersObject[modifier[1]] = modifier[2]);
  conditionMatch.forEach((modifier) => modifiersObject[modifier[1]] = modifier[2]);
  return modifiersObject;
};

const getVision = (visionText) => {
  if (!visionText) return;
  const matched = [...(visionText.matchAll(/(\w+) ([0-9]+)/g) || [])];
  const out = {
    'blindsight': 0,
    'darkvision': 0,
    'special': '',
    'tremorsense': 0,
    'truesight': 0,
    'units': 'ft'
  };
  matched.forEach((match) => out[match[1]] = Number(match[2]));
  return out;
};

/**
 * Returns a creature's senses
 *
 * @ExampleFields: vision, passive Perception
 *
 * @param text - markdown text
 */
const getSenses = (text) => {
  const sensesObject = {};
  const match = [...(text.match(/\*\*Senses\*\* ?(.*)?,? (passive Perception) ([0-9]+)/) || [])];
  sensesObject['vision'] = getVision(match[1]);
  sensesObject[match[2]] = match[3];
  return sensesObject;
};

/**
 * Returns a creature's languages as a string
 *
 * @param text - markdown text
 */
const getLanguages = (text) => [...(text.match(/\*\*Languages\*\* (.*)/) || [])][1];


/**
 * Returns a creature's challange rating
 *
 * @Fields: CR, XP
 *
 * @param text - markdown text
 */
const getChallenge = (text) => {
  const match = text.match(/\*\*Challenge\*\* (([0-9]+\/[0-9]+)|([0-9]+)) \((.*) XP\)/);
  return {CR: eval(match[1]), XP: Number(match[4].replace(',', ''))};
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
 * Returns a creature's spellcasting details
 *
 * @Fields: level -> spellcaster level, modifier -> spellcasting ability modifier
 *
 * @param text - markdown text
 */
const getSpellcastingStats = (text) => {
  const spellcastingLevel = [...(text.match(/([0-9]+)\w{1,2}-level spellcaster/) || [])];
  const spellcastingModifier = [...(text.match(/spell ?casting ability is (\w+)/) || [])];
  return {level: Number(spellcastingLevel[1]) || 0, modifier: spellcastingModifier[1]};
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
 * Returns the number of legendary actions from an actor
 *
 * @param text - markdown text
 */
const getNumberOfLegendaryActions = (text) => {
  const legendaryActionDescription = text.match(/> .* can take ([0-9]+) legendary actions, .*/) || [];
  return Number(legendaryActionDescription[1] ?? []);
};

/**
 * Returns the number of legendary resistances from an actor
 *
 * @param text - markdown text
 */
const getNumberOfLegendaryResistances = (text) => {
  const legendaryRes = text.match(/> \*\*\*Legendary Resistance \(([0-9]+)\/Day\)\.\*\*\*/) || [];
  return Number(legendaryRes[1] ?? 0);
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

/**
 * Returns a creature's number of available spellslots
 *
 * @param text - markdown text
 */
const getSpellSlots = (text) => {
  const matchedSlots = [...(text.matchAll(/([0-9]+)\w{1,2} level \(([0-9]+) slots?\)/g) || [])];
  const slotsObject = {};
  matchedSlots.forEach((slot) => {
    slotsObject[`spell${slot[1]}`] = {
      value: Number(slot[2]),
      max: Number(slot[2])
    };
  });
  return slotsObject;
};

export {
  convertResistance,
  getCreatureSizeAndAlignment,
  getCreatureName,
  getAbilities,
  getLegendaryActions,
  getSpells,
  getCreatureStats,
  getSavingThrowMods,
  getCreatureACAndSource,
  getCreatureSpeed,
  getCreatureHP,
  getChallenge,
  getLanguages,
  getSenses,
  getDamageModifiers,
  getSkills,
  getNumberOfLegendaryActions,
  getNumberOfLegendaryResistances,
  getSpellSlots
};
