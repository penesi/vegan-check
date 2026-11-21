/* Eigene Zutatenliste: ordnet einzelne Zutaten ein, wenn Open Food Facts keine klare Antwort hat.
 *
 * Ergebnis je Zutat:
 *   'meat'   = nicht vegetarisch (Fleisch, Fisch, Gelatine, tierisches Lab, Karmin …)
 *   'animal' = vegetarisch, aber nicht vegan (Milch, Ei, Honig …)
 *   'plant'  = sicher pflanzlich (z. B. Soja-Lecithin, Kakaobutter)
 *   'maybe'  = kann pflanzlich oder tierisch sein (z. B. Aroma, E471)
 *   null     = nichts Auffälliges gefunden
 *
 * Neue Wörter einfach in die passende Liste eintragen (klein geschrieben).
 */
(function () {
  'use strict';

  // Pflanzliche Begriffe, die tierisch klingen. Werden vor der Prüfung entfernt.
  const PLANT_PHRASES = [
    'kokosmilch', 'hafermilch', 'sojamilch', 'mandelmilch', 'reismilch', 'dinkelmilch', 'erbsenmilch',
    'cashewmilch', 'nussmilch', 'pflanzenmilch', 'kokosnussmilch', 'haferdrink', 'sojadrink',
    'kokossahne', 'sojasahne', 'hafersahne', 'pflanzensahne', 'pflanzliche sahne',
    'kakaobutter', 'sheabutter', 'shea-butter', 'erdnussbutter', 'nussbutter', 'mandelbutter',
    'cashewbutter', 'pflanzenbutter', 'kokosbutter', 'mangobutter', 'butterbohne', 'butterpilz',
    'milchsäure', 'milchsaure', 'milchsäurebakterien', 'milchsäurekulturen', 'calciumlactat', 'calciumlaktat',
    'natriumlactat', 'natriumlaktat', 'kaliumlactat', 'laktat', 'lactat',
    'fleischtomate', 'honigmelone', 'wildreis', 'wildkräuter', 'wildheidelbeer', 'wildpreiselbeer',
    'gemüsebrühe', 'hefeextrakt', 'sojajoghurt', 'haferjoghurt', 'kokosjoghurt', 'pflanzenjoghurt',
    'veganer käse', 'vegane', 'veganes', 'veganer', 'pflanzenkäse', 'hefeflocken', 'hühnerfrei',
    'erbseneiweiß', 'weizeneiweiß', 'sojaeiweiß', 'reiseiweiß', 'kartoffeleiweiß', 'lupineneiweiß',
    'pflanzeneiweiß', 'pflanzliches eiweiß', 'hanfeiweiß', 'ackerbohneneiweiß', 'rapseiweiß',
    'mikrobielles lab', 'mikrobielles labaustauschstoff', 'labaustauschstoff', 'pflanzliches lab',
    'eisbergsalat', 'eiscreme-pflanzlich', 'zimtrinde', 'baumrinde', 'rindenmehl',
    'coconut milk', 'oat milk', 'soy milk', 'almond milk', 'cocoa butter', 'peanut butter', 'shea butter',
    'fruchtfleisch', 'kokosfleisch', 'kokosnussfleisch', 'kürbisfleisch', 'mangofleisch', 'blutorange',
    'hirschhornsalz', 'austernpilz', 'muschelnudel', 'veggie', 'fleischlos', 'ohne fleisch',
    'lactic acid', 'butternut'
  ];

  // Nicht vegetarisch: irgendwo im Wort
  const MEAT_ANYWHERE = [
    'fleisch', 'gelatine', 'gelantine', 'schmalz', 'rindertalg', 'talg', 'speck', 'schinken', 'salami',
    'wurst', 'würstchen', 'leberkäse', 'bacon', 'hackfleisch', 'kollagen', 'collagen', 'knochen',
    'fleischbrühe', 'hühnerbrühe', 'rinderbrühe', 'kalbsfond', 'fischfond', 'fleischextrakt',
    'fisch', 'lachs', 'thunfisch', 'sardelle', 'anchovis', 'sardine', 'hering', 'makrele', 'kabeljau',
    'seelachs', 'forelle', 'karpfen', 'zander', 'scholle', 'garnele', 'shrimp', 'krabbe', 'krebs',
    'hummer', 'languste', 'muschel', 'tintenfisch', 'kalmar', 'oktopus', 'kaviar', 'surimi',
    'austern', 'kammmuschel', 'jakobsmuschel', 'karmin', 'cochenille', 'schildlaus', 'kälberlab',
    'tierisches lab', 'hähnchen', 'hühnchen', 'hühnerfleisch', 'putenfleisch', 'truthahn', 'entenbrust',
    'wildschwein', 'hirsch', 'kaninchen', 'innereien', 'blut', 'pancetta', 'chorizo', 'prosciutto',
    'gelatin', 'beef', 'pork', 'chicken', 'anchovy', 'tuna', 'salmon', 'lard', 'tallow', 'bone'
  ];
  // Nicht vegetarisch: nur am Wortanfang (sonst Fehltreffer wie "Pigmente" → "ente")
  const MEAT_WORDSTART = [
    'rind', 'rinder', 'kalb', 'kalbs', 'schwein', 'lamm', 'hammel', 'huhn', 'hühner', 'pute', 'puten',
    'ente', 'enten', 'gans', 'gänse', 'reh', 'leber', 'lab', 'e120', 'e441', 'e542', 'fish', 'meat'
  ];

  // Vegetarisch, aber nicht vegan: irgendwo im Wort
  const ANIMAL_ANYWHERE = [
    'milch', 'sahne', 'rahm', 'butter', 'molke', 'laktose', 'lactose', 'käse', 'kaese', 'quark',
    'joghurt', 'jogurt', 'yoghurt', 'kefir', 'kasein', 'casein', 'caseinat', 'kaseinat', 'ghee', 'schmand',
    'crème fraîche', 'creme fraiche', 'crème fraiche', 'mascarpone', 'mozzarella', 'parmesan', 'gouda',
    'emmentaler', 'cheddar', 'ricotta', 'feta', 'hirtenkäse', 'pecorino', 'grana padano', 'edamer',
    'eigelb', 'eiklar', 'vollei', 'volleipulver', 'trockenei', 'flüssigei', 'eipulver', 'hühnerei',
    'hühnereiweiß', 'eilecithin', 'freilandei', 'bodenhaltungsei', 'eiern',
    'honig', 'gelée royale', 'gelee royale', 'bienenwachs', 'propolis', 'lanolin', 'wollwachs', 'wollfett',
    'lysozym', 'milk', 'cream', 'whey', 'cheese', 'egg', 'honey', 'beeswax', 'yogurt'
  ];
  // Vegetarisch, aber nicht vegan: ganzes Wort
  const ANIMAL_WORDS = ['schellack', 'e904', 'ei', 'eier', 'eiweiß', 'eiweiss', 'eiweißpulver', 'e901', 'e1105', 'e966'];

  // Sicher pflanzlich, obwohl die Datenbank oft "vielleicht" sagt
  const PLANT_ANYWHERE = [
    'lecithin', 'e322', 'kakaobutter', 'kokosfett', 'palmfett', 'sonnenblumenöl', 'rapsöl', 'sojaöl',
    'zucker', 'glukosesirup', 'glucosesirup', 'dextrose', 'stärke', 'maltodextrin', 'kakaomasse',
    'kakaopulver', 'salz', 'pektin', 'guarkernmehl', 'johannisbrotkernmehl', 'xanthan', 'agar',
    'citronensäure', 'zitronensäure', 'ascorbinsäure', 'vanillin', 'vanille', 'hefe', 'gewürz'
  ];

  // Kann tierisch sein – zum Nachprüfen anzeigen
  const MAYBE_ANYWHERE = [
    'aroma', 'e471', 'e472', 'mono- und diglyceride', 'mono und diglyceride', 'monoglyceride',
    'cystein', 'e920', 'vitamin d3', 'e631', 'e627', 'e635', 'e470', 'e473', 'e474', 'e475',
    'e477', 'e481', 'e482', 'e570', 'stearinsäure', 'glycerin', 'e422', 'natural flavour', 'flavouring'
  ];

  const LETTER = 'a-zäöüßéèêàâîôûç0-9';

  function norm(s) {
    return ' ' + String(s || '').toLowerCase().replace(/_/g, '').replace(/\s+/g, ' ') + ' ';
  }

  function stripPlant(t) {
    for (const p of PLANT_PHRASES) if (t.includes(p)) t = t.split(p).join(' ~ ');
    return t;
  }

  function wordStart(t, w) {
    return new RegExp('(^|[^' + LETTER + '])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(t);
  }
  function wholeWord(t, w) {
    return new RegExp('(^|[^' + LETTER + '])' + w + '($|[^' + LETTER + '])', 'i').test(t);
  }

  // Gibt [Einstufung, Auslöser] zurück
  function judge(text) {
    const raw = norm(text);
    const t = stripPlant(raw);

    // Eilecithin ist tierisch, alle anderen Lecithine pflanzlich
    // Hühnerei & Co. sind Ei, kein Fleisch
    for (const w of ['hühnerei', 'hühner-ei', 'enteneier', 'wachteleier']) if (t.includes(w)) return ['animal', w];
    for (const w of MEAT_ANYWHERE) if (t.includes(w)) return ['meat', w];
    for (const w of MEAT_WORDSTART) if (wordStart(t, w)) return ['meat', w];
    for (const w of ANIMAL_ANYWHERE) if (t.includes(w)) return ['animal', w];
    for (const w of ANIMAL_WORDS) if (wholeWord(t, w)) return ['animal', w];
    for (const w of MAYBE_ANYWHERE) if (t.includes(w)) return ['maybe', w];
    for (const w of PLANT_ANYWHERE) if (raw.includes(w)) return ['plant', w];
    if (t.includes('~')) return ['plant', 'pflanzlich'];
    return [null, null];
  }

  // Zutatentext in einzelne Zutaten zerlegen: "Zucker, Milchpulver (Magermilch), Emulgator: Lecithine"
  function splitIngredients(text) {
    const out = [];
    String(text || '')
      .replace(/_/g, '')
      // Spuren-Hinweise zählen nicht als Zutat
      .replace(/(kann|können|könnte)?[^.,;]{0,20}spuren[^.]*(\.|$)/gi, ' ')
      .replace(/hergestellt in einem betrieb[^.]*(\.|$)/gi, ' ')
      .split(/[,;()\[\]{}:•·\n]|\s\/\s|\s-\s|\.\s/)
      .forEach((part) => {
        const s = part.replace(/\d+([.,]\d+)?\s*%/g, '').replace(/\*/g, '').trim().replace(/[.!]+$/, '');
        if (s.length > 1 && !/^(zutaten|ingredients|enthält|kann spuren|spuren von|hergestellt)/i.test(s)) out.push(s);
      });
    return out;
  }

  window.ZutatenCheck = { judge, splitIngredients };
})();
