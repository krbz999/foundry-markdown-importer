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
    //this.getSpellcasting(this.text);
    this.getLanguages(this.text);
    this.getVision(this.text);
    const data = this.model.toObject();
    console.warn("FINAL DATA:", deepClone(data));
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
      const [key] = Object.entries(config).find(([a,b])=> b.label.toLowerCase() === skill.name) ?? [];
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
      if(name in CONFIG.DND5E.damageResistanceTypes) arr.push(name);
      else crr.push(name);
      return acc;
    }, {});
    data[`system.traits.ci.value`] = text.conditions?.map(c => c.name) ?? [];
    for(const key in data) if (key.endsWith(".custom")) data[key] = data[key].filterJoin(";");
    console.warn(data);
    this.updateModel(data);
  }

  // Create spell slot data.
  getSpells(text) {
    const regex = /([0-9]+)\w{1,2} level \(([0-9]+) slots?\)/g;
    const {desc} = text.abilities.find(a => [...(a.desc.matchAll(regex))]) || {};
    if(!desc) return;
    this._getSpellcasting(desc);
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
    if(text.isLegendary) {
      const [_, amount = null] = text.legendariesDescription.match(/can take ([0-9]+) legendary actions/) || [];
      const legact = this.constructor.defaultNumber(amount, null);
      console.warn({legact});
      data["system.resources.legact"] = {value: legact, max: legact};
    }

    const ability = text.abilities.reduce((acc, a) => {
      if(acc) return acc;
      const m = a.desc.match(/Legendary Resistance \(([0-9]+)\/Day\)/);
      if(m) return m;
    }, null);
    if(ability) {
      const [__, amountRes = null] = ability;
      const legres = this.constructor.defaultNumber(amountRes, null);
      console.warn({legres});
      data["system.resources.legres"] = {value: legres, max: legact};
    }

    this.updateModel(data);
  }

  _getSpellcasting(text) {
    const spellcastingLevel = [...(text.match(/([0-9]+)\w{1,2}-level spellcaster/) || [])];
    const [_, abi] = [...(text.match(/spell ?casting ability is (\w+)/) || [])];
    const level = this.constructor.defaultNumber(spellcastingLevel[1], 0);
    const [ability] = Object.entries(CONFIG.DND5E.abilities).find(([a, b]) => {
      return (a === abi) || (b.label === abi);
    }) ?? [];

    console.warn({spellLevel: level, spellcasting: ability});
    this.updateModel({
      "system.details.spellLevel": level,
      "system.attributes.spellcasting": ability ? ability : ""
    });
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
      else customLg.push(language);
    });
    if(text.telepathy > 0) customLg.push(`Telepathy ${text.telepathy} ft`);
    console.warn({standardLg, customLg});
    this.updateModel({
      "system.traits.languages.value": standardLg,
      "system.traits.languages.custom": customLg.filterJoin(";")
    });
  }

  getVision(text) {
    const data = {};
    for(const key of ["blindsight", "darkvision", "tremorsense", "truesight"]) {
      data[`system.attributes.senses.${key}`] = this.constructor.defaultNumber(text[key], 0);
    }
    console.warn(data);
    this.updateModel(data);
  }
}

