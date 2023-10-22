export class MarkDownParserClass {
  constructor(text) {
    this.text = text;
    this.model = new Actor.implementation({type: "npc", name: text.name});
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

    const items = await new ItemParser(this.model, this.text).create();
    this.updateModel({items: items});

    const data = this.model.toObject();
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
    this.updateModel({
      "system.traits.size": size ?? "med",
      "system.details.type.value": type ?? "",
      "system.details.alignment": alignment ?? ""
    });
  }

  // Get ac, source.
  getACSource(text) {
    const [_, ac] = text.otherArmorDesc.match(/([0-9]+)/) ?? [];
    this.updateModel({
      "system.attributes.ac.flat": this.constructor.defaultNumber(ac, 10),
      "system.attributes.ac.calc": "flat"
    });
  }

  // Get hp.
  getHitPoints(text) {
    const [_, value, formula] = text.hpText.match(/([0-9]+) \((.*)\)/) ?? [];
    const total = this.constructor.defaultNumber(value, 10);
    this.updateModel({
      "system.attributes.hp.value": total,
      "system.attributes.hp.max": total,
      "system.attributes.hp.formula": Roll.validate(formula) ? formula : ""
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
    this.updateModel({"system.attributes.movement": data});
  }

  // Get abilities.
  getAbilities(text) {
    const keys = Object.keys(CONFIG.DND5E.abilities);
    const data = {};
    for (const key of keys) data[`system.abilities.${key}.value`] = this.constructor.defaultNumber(text[`${key}Points`], 10);
    for (const s of text.sthrows) data[`system.abilities.${s}.proficient`] = 1;
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
    });
    this.updateModel(data);
  }

  // Create resources.
  getResources(text) {
    const data = {};
    if (text.isLegendary) {
      const [_, amount] = text.legendariesDescription.match(/can take ([0-9]+) legendary actions/) || [];
      const legact = this.constructor.defaultNumber(amount, null);
      data["system.resources.legact"] = {value: legact, max: legact};
    }

    const ability = text.abilities.reduce((acc, a) => {
      if (acc) return acc;
      const m = a.name?.match(/Legendary Resistance \(([0-9]+)\/.ay\)/);
      if (m) return m;
      else return acc;
    }, null);
    if (ability) {
      const [__, amountRes] = ability;
      const legres = this.constructor.defaultNumber(amountRes, null);
      data["system.resources.legres"] = {value: legres, max: legres};
    }

    this.updateModel(data);
  }

  getSpellcasting(text) {
    const level = this._getSpellLevel();
    const abi = this._getSpellcasting();
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
    this.updateModel(data);
  }
}

class ItemParser {
  constructor(actor, data) {
    this.actor = actor;
    this.data = data;
  }

  static TYPES = {
    abilities: {type: "special", cost: null},
    actions: {type: "action", cost: 1},
    bonusActions: {type: "bonus", cost: 1},
    reactions: {type: "reaction", cost: 1},
    legendaries: {type: "legendary", cost: null}
  }
  get TYPES() {
    return this.constructor.TYPES;
  }
  _current = null;

  async create() {
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

    for (const item of this.data.abilities) {
      const names = this.getSpellNames(item);
      if (names.length) {
        const spells = await this.addSpells(names);
        items.push(...spells);
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
    desc = desc.replaceAll("[MON]", this.actor.name);
    const {rangeData, targetData} = this.getRange(desc) ?? {};
    const damageData = this.getDamage(desc) ?? [];
    const saveData = this.getSave(desc) ?? {};
    const hitData = this.getHit(desc) ?? null;
    const rechargeData = this.getRecharge(name) ?? {};
    const usesData = foundry.utils.isEmpty(rechargeData) ? (this.getUses(name) ?? {}) : {};
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
      "system.equipped": true,
      "system.uses": usesData
    };

    data["system.description.value"] = this._postProcess(desc);
    if (!data["system.damage.parts"].length) data["system.damage.parts"] = this.getDamage(desc) ?? [];

    return foundry.utils.expandObject(data);
  }

  // Post processing of description.
  _postProcess(desc) {
    const keys = Object.keys(CONFIG.DND5E.abilities).map(k => k.toUpperCase());
    const abis = this.actor.system.abilities;
    const prof = this.actor.system.attributes.prof;
    for (const key of keys) desc = desc.replaceAll(`[${key} ATK]`, (abis[key.toLowerCase()].mod + prof).signedString());
    for (const key of keys) desc = desc.replaceAll(`[${key} SAVE]`, (abis[key.toLowerCase()].dc));

    // Replace damage rolls.
    let matches = [...(desc.matchAll(/\[([a-zA-Z]{3}) ([0-9]+[dD][0-9]+)\]/g) ?? [])];
    for (const [str, abilityKeyUpperCase, diceRoll] of matches) {
      const key = abilityKeyUpperCase.toLowerCase();
      if (!(key in abis)) continue;
      const mod = abis[key].mod;
      desc = desc.replaceAll(`[${abilityKeyUpperCase} ${diceRoll}]`, `${diceRoll.toLowerCase()} ${mod >= 0 ? "+" : "-"} ${mod}`);
    }

    // Replace generic rolls in brackets.
    matches = [...(desc.matchAll(/\[([0-9]+[dD][0-9]+)\]/g) ?? [])];
    for (const [str, roll] of matches) desc = desc.replaceAll(`[${roll}]`, `${roll.toLowerCase()}`);

    // Fix italics.
    matches = true;
    while (matches) {
      matches = desc.match(/\_(.*?)\_/);
      if (matches) desc = desc.replace(`_${matches[1]}_`, `<em>${matches[1]}</em>`);
    }

    return desc;
  }

  getRecharge(name) {
    const match = name.match(/Recharge ([1-6]?)-?6/);
    if (match) return {charged: true, value: Number(match[1] || 6)};
  }

  getUses(name) {
    const match = name.toLowerCase().match(/([0-9]+) ?\/ ?(day|lr|long rest|sr|short rest|long|short)/);
    if (match) {
      const per = {
        day: "day",
        lr: "lr",
        "long rest": "lr",
        sr: "sr",
        "short rest": "sr",
        long: "lr",
        short: "sr"
      }[match[2]] ?? "charges";
      const value = match[1];
      return {value: value, max: value, per: per};
    }
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
    const [_, match] = text.match(/([+-] ?[0-9]+) to hit/) ?? [];
    return MarkDownParserClass.defaultNumber(match, null);
  }

  /**
   * Utility function to get spell names from an item description.
   */
  getSpellNames(abi) {
    const desc = abi.desc ?? "";
    const matchedSpells = [...(desc.matchAll(/(Cantrips|([0-9]+)\w{1,2} level) \(.*\): _?(.*)_?/g) || [])];
    const atWillSpells = [...(desc.matchAll(/At will: _?(.*)_?(?:<br>)?/g) || [])];
    const repeatableSpells = [...(desc.matchAll(/[0-9]+\/day: (.*)/g) || [])];

    const names = [];

    const clean = (str) => str.split(",").map(n => n.replaceAll("_", "").trim()).filter(u => u);

    matchedSpells.forEach(spell => {
      const spellNames = clean(spell[3] || "");
      if (spellNames.length) names.push(...spellNames);
    });

    atWillSpells.forEach(spell => {
      const spellNames = clean(spell[1] || "");
      if (spellNames.length) names.push(...spellNames);
    });

    repeatableSpells.forEach(spell => {
      const spellNames = clean(spell[1] || "");
      if (spellNames.length) names.push(...spellNames);
    });

    return names;
  }

  /**
   * Retrieve a spell from a pack.
   * @param {Pack[]} packs              The compendiums.
   * @param {string} name               The name of the spell.
   * @returns {Promise<Item|null>}      The spell, if found.
   */
  async _getSpellFromName(packs, name) {
    let entry = null;
    for (const pack of packs) {
      if (entry) continue;
      entry = pack.index.find(idx => {
        return (idx.type === "spell") && (idx.name.toLowerCase() === name.toLowerCase());
      }) ?? null;
    }
    if (!entry) {
      ui.notifications.warn(`The spell '${name}' was not found.`);
      return null;
    }
    return fromUuid(entry.uuid);
  }

  /**
   * Create the item data for the spells to be added.
   * @param {string[]} names          An array of spell names.
   * @returns {Promise<object[]>}     The spell item data.
   */
  async addSpells(names) {
    const packs = game.packs.filter(pack => {
      const isSpell = pack.metadata.id.includes("spell") || pack.metadata.label.toLowerCase().includes("spell");
      const isItem = pack.metadata.type === "Item";
      return isSpell && isItem;
    });

    const items = await Promise.all(names.map(n => this._getSpellFromName(packs, n.trim())));
    const itemData = items.reduce((acc, item) => {
      if (item) acc.push(game.items.fromCompendium(item));
      return acc;
    }, []);

    return itemData;
  }
}
