export class MarkDownParserClass {
  constructor(text) {
    this.text = text;
    this.model = new Actor.implementation({type: "npc", name: text.name});

    console.warn(text);

    this.execute();
  }

  async execute() {
    this.getCR(this.text);
    this.getSizeRaceAlignment(this.text);
    this.getACSource(this.text);
    this.getHitPoints(this.text);
    this.getMovement(this.text);
    this.getAbilities(this.text);
    this.getSkills(this.text);
    this.getTraits(this.text);
    this.getSpells(this.text);
    this.getResources(this.text);
    this.getSpellcasting(this.text);
    this.getLanguages(this.text);
    this.getVision(this.text);

    const items = new ItemParser(this.model, this.text).create();
    this.model.updateSource({items: items});
    this.model.prepareData();
    const data = this.model.toObject();
    console.warn("FINAL DATA:", foundry.utils.deepClone(data));
    return Actor.implementation.create(data);
  }

  static defaultNumber(value, def = 10) {
    return Number.isNumeric(value) ? Number(value) : def;
  }

  updateModel(data) {
    this.model.updateSource(foundry.utils.expandObject(data));
    this.model.prepareData();
  }

  /* ------------------- */
  /*  EXTRACTOR METHODS  */
  /* ------------------- */

  // Get size, race, alignment.
  getSizeRaceAlignment(text) {
    const [size] = Object.entries(CONFIG.DND5E.actorSizes).find(c => c.map(x => x.toLowerCase()).includes(text.size)) ?? [];
    const [type] = Object.entries(CONFIG.DND5E.creatureTypes).find(c => c.map(x => game.i18n.localize(x)).includes(text.type)) ?? [];
    const alignment = text.alignment || "";
    console.warn({size, type, alignment});
    this.updateModel({
      "system.traits.size": size ?? "med",
      "system.details.type.value": type ?? "",
      "system.details.alignment": alignment ?? ""
    });
  }

  // Get ac, source.
  getACSource(text) {
    let [_, ac = null, acSource = null] = text.otherArmorDesc.match(/([0-9]+)/) ?? [];
    console.warn({_, ac, acSource});
    this.updateModel({
      "system.attributes.ac.flat": this.constructor.defaultNumber(ac, 10),
      "system.attributes.ac.calc": "flat"
    });
  }

  // Get hp.
  getHitPoints(text) {
    let [_, value = null, formula = null] = text.hpText.match(/([0-9]+) \((.*)\)/) ?? [];
    console.warn({_, value, formula});
    value = this.constructor.defaultNumber(value, 10);
    formula = Roll.validate(formula) ? formula : "";
    console.warn({_, value, formula});
    this.updateModel({
      "system.attributes.hp.value": value,
      "system.attributes.hp.max": value,
      "system.attributes.hp.formula": formula
    });
  }

  // Get movement.
  getMovement(text) {
    const {burrowSpeed, climbSpeed, flySpeed, speed, swimSpeed} = text;
    const data = {
      burrow: this.constructor.defaultNumber(burrowSpeed, 0),
      climb: this.constructor.defaultNumber(climbSpeed, 0),
      fly: this.constructor.defaultNumber(flySpeed, 0),
      walk: this.constructor.defaultNumber(speed, 30),
      swim: this.constructor.defaultNumber(swimSpeed, 0),
      hover: !!text.hover
    };
    console.warn(data);
    this.updateModel({"system.attributes.movement": data});
  }

  // Get abilities.
  getAbilities(text) {
    const keys = Object.keys(CONFIG.DND5E.abilities);
    const data = {};
    for (const key of keys) data[`system.abilities.${key}.value`] = this.constructor.defaultNumber(text[`${key}Points`], 10);
    for (const s of text.sthrows) data[`system.abilities.${s}.proficient`] = 1;
    console.warn(data);
    this.updateModel(data);
  }

  // Get skills.
  getSkills(text) {
    const data = {};
    const skills = text.skills ?? [];
    const config = CONFIG.DND5E.skills;
    skills.forEach(skill => {
      const [key] = Object.entries(config).find(([a, b]) => b.label.toLowerCase() === skill.name) ?? [];
      const abi = config[key].ability;
      const value = skill.note === " (ex)" ? 2 : 1;
      data[`system.skills.${key}.value`] = value;
      data[`system.skills.${key}.ability`] = abi;
    });
    console.warn(data);
    this.updateModel(data);
  }

  // Get damage traits and condition immunities.
  getTraits(text) {
    const data = text.damagetypes.reduce((acc, {name, type}) => {
      type = `d${type}`;
      const arr = acc[`system.traits.${type}.value`] ??= [];
      const crr = acc[`system.traits.${type}.custom`] ??= [];
      if (name in CONFIG.DND5E.damageResistanceTypes) arr.push(name);
      else crr.push(name);
      return acc;
    }, {});
    data[`system.traits.ci.value`] = text.conditions?.map(c => c.name) ?? [];
    for (const key in data) if (key.endsWith(".custom")) data[key] = data[key].filterJoin(";");
    console.warn(data);
    this.updateModel(data);
  }

  // Create spell slot data.
  getSpells(text) {
    const regex = /([0-9]+)\w{1,2} level \(([0-9]+) slots?\)/g;
    const {desc} = text.abilities.find(a => [...(a.desc.matchAll(regex))]) || {};
    if (!desc) return;
    const data = {};
    [...desc.matchAll(regex)].forEach(([_, level, value]) => {
      value = this.constructor.defaultNumber(value, null);
      const current = this.model.system.spells[`spell${level}`].max;
      data[`system.spells.spell${level}.value`] = Math.max(current, value);
      if (current !== value) data[`system.spells.spell${level}.override`] = Math.max(current, value);
      console.warn("GET SPELL DATA", {level, value, current});
    });
    this.updateModel(data);
  }

  // Create resources.
  getResources(text) {
    const data = {};
    if (text.isLegendary) {
      const [_, amount = null] = text.legendariesDescription.match(/can take ([0-9]+) legendary actions/) || [];
      const legact = this.constructor.defaultNumber(amount, null);
      console.warn({legact});
      data["system.resources.legact"] = {value: legact, max: legact};
    }

    const ability = text.abilities.reduce((acc, a) => {
      if (acc) return acc;
      const m = a.desc.match(/Legendary Resistance \(([0-9]+)\/Day\)/);
      if (m) return m;
    }, null);
    if (ability) {
      const [__, amountRes = null] = ability;
      const legres = this.constructor.defaultNumber(amountRes, null);
      console.warn({legres});
      data["system.resources.legres"] = {value: legres, max: legact};
    }

    this.updateModel(data);
  }

  getSpellcasting(text) {
    const level = this._getSpellLevel();
    const abi = this._getSpellcasting();
    console.warn({level, abi});
    this.updateModel({"system.details.spellLevel": level, "system.attributes.spellcasting": abi});
  }

  _getSpellcasting() {
    const regex = /spell ?casting ability is (\w+)/;
    const {desc} = this.text.abilities.find(a => a.desc.match(regex)) || {};
    if (!desc) return "";
    const [_, abi] = [...desc.match(regex) || []];
    const [ability] = Object.entries(CONFIG.DND5E.abilities).find(([a, b]) => {
      return (a === abi) || (b.label === abi);
    }) ?? [];
    return ability || "";
  }

  _getSpellLevel() {
    const regex = /([0-9]+)\w{1,2}-level spellcaster/;
    const {desc} = this.text.abilities.find(a => a.desc.match(regex)) || {};
    if (!desc) return null;
    const level = [...desc.match(regex) || []];
    return this.constructor.defaultNumber(level[1], null);
  }

  getCR(text) {
    this.updateModel({"system.details.cr": this.constructor.defaultNumber(text.cr, 0)});
  }

  getLanguages(text) {
    const config = Object.entries(CONFIG.DND5E.languages);
    const standardLg = [];
    const customLg = [];
    text.languages.forEach((language) => {
      const [key] = config.find(c => c.includes(language.name)) ?? [];
      if (key) standardLg.push(key);
      else customLg.push(language.name);
    });
    if (text.telepathy > 0) customLg.push(`Telepathy ${text.telepathy} ft`);
    console.warn({standardLg, customLg});
    this.updateModel({
      "system.traits.languages.value": standardLg,
      "system.traits.languages.custom": customLg.filterJoin(";")
    });
  }

  getVision(text) {
    const data = {};
    for (const key of ["blindsight", "darkvision", "tremorsense", "truesight"]) {
      data[`system.attributes.senses.${key}`] = this.constructor.defaultNumber(text[key], 0);
    }
    console.warn(data);
    this.updateModel(data);
  }
}

class ItemParser {
  constructor(actor, data) {
    this.actor = actor;
    this.data = data;
  }

  static TYPES = {
    abilities: {type: "", cost: null},
    actions: {type: "action", cost: 1},
    bonusActions: {type: "bonus", cost: 1},
    reactions: {type: "reaction", cost: 1},
    legendaries: {type: "legendary", cost: null}
  }
  get TYPES() {
    return this.constructor.TYPES;
  }
  _current = null;

  create() {
    const items = [];
    for (const key of Object.keys(this.TYPES)) {
      this._current = key;
      const array = this.data[key] ?? [];
      for (const {name, desc} of array) {
        if (!name || !desc) continue;
        const item = this._createItem(name, desc);
        items.push(item);
      }
    }
    return items;
  }

  _findAbility(toHit) {
    if (toHit === null) return null;
    const prof = this.actor.system.attributes.prof;
    const diff = toHit - prof;
    const [key] = Object.entries(this.actor.system.abilities).find(([a, b]) => {
      return b.mod === diff;
    }) ?? [];
    return key ? key : null;
  }

  _createItem(name, desc) {
    const {rangeData, targetData} = this.getRange(desc) ?? {};
    const damageData = this.getDamage(desc) ?? [];
    const saveData = this.getSave(desc) ?? {};
    const hitData = this.getHit(desc) ?? null;
    const rechargeData = this.getRecharge(name) ?? {};
    let abi = null;
    let atk = null;

    const type = rechargeData.value ? "feat" : desc.includes("Weapon Attack") ? "weapon" : "feat";

    // case 1: find ability
    if (hitData !== null) {
      const ability = this._findAbility(hitData);
      // case 1.1: ability found
      if (ability) abi = ability;
      // case 1.2: ability not found
      else {
        abi = "none";
        atk = `${hitData} - @prof`;
      }
    }

    // Fix activation cost in case of legendary actions.
    const activation = this.TYPES[this._current];
    if (this._current === "legendaries") {
      const [_, match] = name.match(/\(Costs ([0-9]+) Actions\)/) ?? [];
      activation.cost = MarkDownParserClass.defaultNumber(match, 1);
    }

    const text = desc.toLowerCase();
    const actionType =
      text.includes("melee weapon attack") ? "mwak" :
        text.includes("ranged weapon attack") ? "rwak" :
          text.includes("melee spell attack") ? "msak" :
            text.includes("ranged spell attack") ? "rsak" :
              text.includes("saving throw") ? "save" :
                damageData.length ? "other" : null;

    const data = {
      "name": name,
      "type": type,
      "system.description.value": desc,
      "system.damage.parts": damageData.map(([formula, type]) => [formula, type]),
      "system.range": rangeData ?? {},
      "system.target": targetData ?? {},
      "system.save": saveData,
      "system.ability": abi,
      "system.attackBonus": atk,
      "system.recharge": rechargeData,
      "system.activation": this.TYPES[this._current],
      "system.actionType": actionType,
      "system.type.value": "monster",
      "system.proficient": null,
      "system.equipped": true
    };
    return foundry.utils.expandObject(data);
  }

  getRecharge(name) {
    const match = name.match(/Recharge ([1-6]?)-?6/);
    if (match) return {charged: true, value: Number(match[1] || 6)};
  }

  getRange(text) {
    const single = text.match(/ ([0-9]+)([ \-])(ft|feet|foot)( line| cone| cube| sphere)?/);
    const double = text.match(/ ([0-9]+)\/([0-9]+) (\w+)/);

    const rangeData = {
      value: single ? single[1] : double ? double[1] : null,
      long: double ? double[2] : null,
    };
    const targetData = {
      type: (single && single[4]) ? single[4] : "",
      value: (single && single[2]) ? single[2] : null,
      width: (single && (single[4] === "line")) ? 5 : null
    };
    targetData.value = MarkDownParserClass.defaultNumber(targetData.value, null);
    rangeData.value = MarkDownParserClass.defaultNumber(rangeData.value, null);
    rangeData.long = MarkDownParserClass.defaultNumber(rangeData.long, null);

    if (Object.values(rangeData).some(v => v)) rangeData.units = "ft";
    if (Object.values(targetData).some(v => v)) targetData.units = "ft";
    return {rangeData, targetData};
  }

  getDamage(text) {
    const match = [...(text.matchAll(/\(([0-9]+d[0-9]+)( ?[+-] ?([0-9]+))?\) (\w+) damage/g) || [])];
    const attackObject = [];
    match.forEach((attack) => {
      attackObject.push([`${attack[1]} ${attack[2] ? '+ @mod' : ''}`, attack[4], Number(attack[2]?.replace(/ /g, ''))]);
    });
    return attackObject;
  }

  getSave(text) {
    let match = text.match(/DC ([0-9]+) (\w+)/);
    if (!match) return;
    const [abi] = Object.entries(CONFIG.DND5E.abilities).find(([a, b]) => b.label === match[2]) ?? [];
    return {
      dc: Number(match[1]),
      ability: abi ?? null,
      scaling: "flat"
    };
  }

  getHit(text) {
    const [match] = text.match(/([+-] ?[0-9]+) to hit/) ?? [];
    return Number.isNumeric(match) ? Number(match) : null;
  }

  /**
   * Utility function to get spell names from an item description.
   * Deprecated code. Not currently functional.
   */
  getSpellNames(desc) {
    return;
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
  }
}

