import {abilitiesAdder, spellsAdder} from './ItemCreator.js';
import {
  convertResistance,
  getAbilities,
  getChallenge,
  getCreatureACAndSource,
  getCreatureHP,
  getCreatureName,
  getCreatureSizeAndAlignment,
  getCreatureSpeed,
  getCreatureStats,
  getDamageModifiers,
  getLanguages,
  getLegendaryActions,
  getNumberOfLegendaryActions,
  getNumberOfLegendaryResistances,
  getSavingThrowMods,
  getSenses,
  getSkills,
  getSpells,
  getSpellSlots
} from './MarkdownParser.js';

const skillToAbilityMap = {
  'Athletics': 'Str',
  'Acrobatics': 'Dex',
  'Sleight of Hand': 'Dex',
  'Stealth': 'Dex',
  'Arcana': 'Int',
  'History': 'Int',
  'Investigation': 'Int',
  'Nature': 'Int',
  'Religion': 'Int',
  'Animal Handling': 'Wis',
  'Insight': 'Wis',
  'Medicine': 'Wis',
  'Perception': 'Wis',
  'Survival': 'Wis',
  'Deception': 'Cha',
  'Intimidation': 'Cha',
  'Performance': 'Cha',
  'Persuasion': 'Cha'
}

/**
 * Returns the foundry friendly structure for the ability scores
 *
 * @param stats - ability scores
 * @param saves - saves (used to decide if the creatures is proficient in a stat or not
 * @private
 */
const _makeAbilitiesStructure = (stats, saves = {}) => {
  const abilitiesObject = {};
  for (const stat in stats) {
    const [key] = Object.entries(CONFIG.DND5E.abilities).find(([a, b]) => b.label === stat) ?? [];
    if (!key) continue;
    abilitiesObject[key] = {
      max: null,
      bonuses: {check: "", save: ""},
      value: Number(stats[stat]),
      proficient: saves[stat] ? 1 : 0
    };
  }
  return abilitiesObject;
};

/**
 * Returns the foundry friendly structure for skills
 *
 * @param propSkills - object containing all the skills data from the parser
 * @param proficiency - proficiency score
 * @private
 */
const _makeSkillsStructure = (propSkills, proficiency, creatureStats) => {
  const skillsObject = {};
  for (const skill in propSkills.skills) {
    let value = (propSkills.skills[skill] - Math.floor((creatureStats[skillToAbilityMap[skill]] - 10) / 2)) / proficiency;
    if (0 < value < 1) value = 0.5;
    if (!propSkills.skills.hasOwnProperty(skill)) continue;
    const [key] = Object.entries(CONFIG.DND5E.skills).find(([a,b]) => b.label === skill) ?? [];
    if(!key) continue;
    skillsObject[key] = {value, ability: CONFIG.DND5E.skills[key].ability};
  }
  return skillsObject;
};

/**
 * Returns a foundry friendly structure for resistances
 *
 * @param modifiers - an object with all the damage modifiers of the creature
 * @private
 */
const _makeResistancesStructure = (modifiers) => {
  const conditionsDefault = Object.keys(CONFIG.DND5E.conditionTypes);
  const defaultResistances = Object.keys(CONFIG.DND5E.damageResistanceTypes);
  const structure = {};
  for (const key in modifiers) {
    if (!modifiers.hasOwnProperty(key)) continue;
    const modifier = modifiers[key];
    const standardRes = [];
    const customRes = [];
    modifier.split(', ').forEach((mod) => {
      if (conditionsDefault.includes(mod) || defaultResistances.includes(mod)) standardRes.push(mod);
      else customRes.push(mod);
    });
    structure[convertResistance(key)] = {
      value: standardRes,
      custom: customRes.join(';')
    };
  }
  return structure;
};

/**
 * Returns a foundry friendly structure for languages
 *
 * @param languages - a string containing all the known languages of the actor
 * @private
 */
const _makeLanguagesStructure = (languages) => {
  const config = Object.entries(CONFIG.DND5E.languages);
  const standardLg = [];
  const customLg = [];
  languages.split(",").forEach((language) => {
    language = language.trim();
    const [key] = config.find(([a, b]) => b === language) ?? [];
    if (key) standardLg.push(key);
    else customLg.push(language);
  });
  return {value: standardLg, custom: customLg.join(';')};
};

/**
 * Returns a foundry friendly structure for the traits part of the actor
 *
 * @private
 * @param propsTraits - object containing all the traits data extracted from the parser
 */
const _makeTraitsStructure = (propsTraits) => {
  const size = foundry.utils.invertObject(CONFIG.DND5E.actorSizes)[propsTraits.size] ?? "";
  return { ...propsTraits.damageModifiers, size, languages: _makeLanguagesStructure(propsTraits.languages)};
};

/**
 * Returns a foundry friendly structure for the details part
 *
 * @param propsDetails - object containing all the details data from the parser
 * @param abilities - object structure of all abilities to get the spellcasting level if needed
 * @private
 */
const _makeDetailsStructure = (propsDetails, abilities) => {
  return {
    alignment: propsDetails.alignment,
    type: propsDetails.race,
    cr: propsDetails.challenge['CR'],
    xp: {
      value: propsDetails.challenge['XP']
    },
    spellLevel: abilities?.Spellcasting?.data?.level
  };
};

/**
 * Returns a foundry friendly structure for the HP
 *
 * @private
 * @param propsHP - object that contains all the hp data extracted from markdown
 */
const _makeHpStructure = ({HP, formula}) => {
  return {value: Number(HP), max: Number(HP), formula: formula};
};

/**
 * Returns a foundry friendly structure for the attributes tab
 *
 * @param propsAttributes - object containing all the attributes extracted from markdown
 * @param creatureProficiency - creature's proficiency modifier
 * @param abilities - abilities object for extracting the spellcaster abilities of the creature
 * @private
 */
const _makeAttributesStructure = (propsAttributes, creatureProficiency, abilities) => {
  return {
    ac: {
      flat: Number(propsAttributes.armor.AC || 0),
      calc: "default",
      formula: undefined
    },
    hp: _makeHpStructure(propsAttributes.hp),
    movement: propsAttributes.movement,
    senses: propsAttributes.senses
  };
};

/**
 * Returns the resources structure
 *
 * @param propsRes - object that contains the resources from the parser
 * @private
 */
const _makeResourcesStructure = (propsRes = {}) => {
  const {numberOfLegendaryActions: act, numberOfLegendaryResistances: res} = propsRes;
  return {legact: {value: act, max: act}, legres: {value: res, max: res}};
};

/**
 * Returns a foundry friendly structure for the data field of the actor
 *
 * @param propsData - an object that contains all the data extracted from the parser
 * @param creatureProficiency - proficiency of the actor
 * @param creatureAbilities - abilities object of the actor
 * @param creatureStats - stats of the actor
 * @private
 */
const _makeDataStructure = (propsData, creatureProficiency, creatureAbilities, creatureStats) => {
  return {
    abilities: _makeAbilitiesStructure(creatureStats, propsData.savingThrowMods, creatureProficiency),
    attributes: _makeAttributesStructure(propsData.attributes, creatureProficiency, creatureAbilities),
    details: _makeDetailsStructure(propsData.details, creatureAbilities),
    traits: _makeTraitsStructure(propsData.traits),
    skills: _makeSkillsStructure(propsData.skills, creatureProficiency, creatureStats),
    resources: _makeResourcesStructure(propsData.resources),
    spells: propsData.spellslots
  };
};

const makeDamageModifiersStructure = (parsedText) => {
  return Object.keys(parsedText).reduce((prev, key) => {
    const [left, right] = parsedText[key].split('; ');
    const keyComponents = key.toLowerCase().split(' ');
    return {
      ...prev,
      [keyComponents[0][0] + keyComponents[1][0]]: {
        value: [...left.split(', ')],
        custom: right || ''
      }
    };
  }, {
    ci: {custom: '', value: []},
    di: {custom: '', value: []},
    dr: {custom: '', value: []},
    dv: {custom: '', value: []}
  });
};

/**
 * Returns an object of all the data parsed
 *
 * @param markdownText - input text
 * @private
 */
const _makeProps = (markdownText) => {
  const sizeAndAlignment = getCreatureSizeAndAlignment(markdownText);
  const senses = getSenses(markdownText);
  const props = {
    name: getCreatureName(markdownText),
    abilities: getAbilities(markdownText),
    legendaryActions: getLegendaryActions(markdownText),
    spells: getSpells(markdownText),
    stats: getCreatureStats(markdownText),
    data: {
      savingThrowMods: getSavingThrowMods(markdownText),
      attributes: {
        armor: getCreatureACAndSource(markdownText),
        movement: getCreatureSpeed(markdownText),
        senses: senses.vision,
        hp: getCreatureHP(markdownText)
      },
      details: {
        alignment: sizeAndAlignment['alignment'],
        race: sizeAndAlignment['race'],
        challenge: getChallenge(markdownText)
      },
      traits: {
        size: sizeAndAlignment['size'],
        languages: getLanguages(markdownText).toLocaleLowerCase(),
        damageModifiers: makeDamageModifiersStructure(getDamageModifiers(markdownText)),
      },
      skills: {
        skills: getSkills(markdownText)
      },
      resources: {
        numberOfLegendaryActions: getNumberOfLegendaryActions(markdownText),
        numberOfLegendaryResistances: getNumberOfLegendaryResistances(markdownText)
      },
      spellslots: getSpellSlots(markdownText)
    }
  };
  //props['proficiency'] = Math.max(Math.floor((props?.data?.details?.challenge?.CR - 1) / 4) + 2, 2);
  return props;
};

const actorCreator = async (markdownText) => {
  const props = _makeProps(markdownText);

  const actor = await Actor.implementation.create({
    name: props.name,
    type: "npc",
    system: _makeDataStructure(props.data, props.proficiency, props.abilities, props.stats),
    prototypeToken: {
      sight: {enabled: false}
    },
  }, {renderSheet: true});

  if (props.abilities) await abilitiesAdder(actor, props.abilities, props.stats);
  if (props.legendaryActions) await abilitiesAdder(actor, props.legendaryActions, props.stats);
  if (props.spells) await spellsAdder(actor, props.spells);
};

export {actorCreator};
