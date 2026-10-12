'use strict';

// Base d'aliments intégrée : [noms séparés par |, kcal pour une portion habituelle, portion]
// Valeurs moyennes arrondies (sources : tables Ciqual / étiquettes courantes). Le but est
// une estimation rapide, pas une pesée au gramme près.
const FOOD_DB = [
  // Petit-déjeuner, boulangerie
  ['croissant', 230, '1 pièce'],
  ['pain au chocolat|chocolatine', 270, '1 pièce'],
  ['pain aux raisins', 300, '1 pièce'],
  ['brioche', 180, '1 part'],
  ['pain|tranche de pain|morceau de pain|tranche de baguette', 90, '1 tranche (35 g)'],
  ['baguette', 700, '1 baguette'],
  ['pain de mie', 70, '1 tranche'],
  ['pain complet|pain aux cereales', 85, '1 tranche'],
  ['biscotte', 40, '1 biscotte'],
  ['tartine|tartine beurre confiture|tartine beurree', 180, '1 tartine garnie'],
  ['beurre', 75, '1 noisette (10 g)'],
  ['confiture', 50, '1 cuillère'],
  ['nutella|pate a tartiner', 110, '1 cuillère (20 g)'],
  ['miel', 65, '1 cuillère'],
  ['cereales|bol de cereales', 230, '1 bol avec lait'],
  ['muesli|granola', 250, '1 bol avec lait'],
  ['porridge|flocons d avoine', 250, '1 bol'],
  ['yaourt|yaourt nature|yogourt', 60, '1 pot'],
  ['yaourt aux fruits|yaourt sucre|yaourt a boire', 110, '1 pot'],
  ['yaourt grec', 140, '1 pot'],
  ['skyr', 90, '1 pot'],
  ['fromage blanc', 110, '1 portion (100 g)'],
  ['petit suisse', 50, '1 pot'],
  ['oeuf|oeuf dur|oeuf a la coque', 75, '1 œuf'],
  ['oeuf au plat|oeuf sur le plat', 90, '1 œuf'],
  ['oeufs brouilles', 110, '1 œuf'],
  ['omelette', 250, '2-3 œufs'],
  ['bacon', 90, '2 tranches'],
  ['pancake', 130, '1 pancake'],
  ['crepe', 130, '1 crêpe nature'],
  ['crepe au nutella|crepe chocolat', 250, '1 crêpe'],
  ['crepe au sucre', 170, '1 crêpe'],
  ['gaufre', 300, '1 gaufre'],
  ['jus d orange|jus de fruit|jus de pomme', 110, '1 verre (25 cl)'],
  ['smoothie', 180, '1 verre'],
  ['cafe|expresso|espresso|cafe noir', 3, '1 tasse'],
  ['cafe au lait|cafe creme', 60, '1 tasse'],
  ['cappuccino', 110, '1 tasse'],
  ['latte|cafe latte', 150, '1 grand verre'],
  ['chocolat chaud', 200, '1 tasse'],
  ['the|infusion|tisane', 2, '1 tasse'],
  ['lait|verre de lait', 115, '1 verre (25 cl)'],
  ['sucre|morceau de sucre', 20, '1 morceau'],

  // Fruits
  ['pomme', 80, '1 fruit'],
  ['banane', 105, '1 fruit'],
  ['orange', 70, '1 fruit'],
  ['poire', 85, '1 fruit'],
  ['kiwi', 45, '1 fruit'],
  ['clementine|mandarine', 35, '1 fruit'],
  ['peche|nectarine', 50, '1 fruit'],
  ['abricot', 20, '1 fruit'],
  ['prune', 30, '1 fruit'],
  ['fraise|fraises', 50, '1 bol (150 g)'],
  ['framboise|myrtille', 60, '1 bol'],
  ['raisin', 100, '1 grappe'],
  ['cerise', 90, '1 bol'],
  ['mangue', 150, '1/2 mangue'],
  ['ananas', 60, '1 portion'],
  ['melon', 50, '1 tranche'],
  ['pastèque|pasteque', 60, '1 tranche'],
  ['compote', 70, '1 pot'],
  ['salade de fruits', 100, '1 bol'],
  ['avocat', 240, '1 avocat'],
  ['amande|noix|noisettes|noix de cajou|fruits secs|pistache|cacahuete|cacahuetes', 175, '1 poignée (30 g)'],
  ['datte', 70, '3 dattes'],

  // Plats de pâtes, riz, céréales
  ['pates|spaghetti|tagliatelle|penne|macaroni|coquillettes|fusilli', 360, '1 assiette nature'],
  ['pates bolognaise|spaghetti bolognaise|bolognaise', 600, '1 assiette'],
  ['pates carbonara|spaghetti carbonara|carbonara', 750, '1 assiette'],
  ['pates au pesto|pesto', 600, '1 assiette'],
  ['pates au fromage|pates beurre fromage|pates au beurre', 500, '1 assiette'],
  ['pates au saumon', 650, '1 assiette'],
  ['pates au thon', 550, '1 assiette'],
  ['pates a la creme|pates jambon creme', 650, '1 assiette'],
  ['lasagne|lasagnes', 550, '1 part'],
  ['ravioli|raviolis', 450, '1 assiette'],
  ['gnocchi|gnocchis', 450, '1 assiette'],
  ['mac and cheese|gratin de pates', 600, '1 assiette'],
  ['riz|riz blanc|riz basmati', 260, '1 assiette'],
  ['riz cantonais|riz saute|riz frit', 550, '1 assiette'],
  ['risotto', 500, '1 assiette'],
  ['paella', 600, '1 assiette'],
  ['couscous', 700, '1 assiette'],
  ['semoule', 250, '1 assiette'],
  ['quinoa|boulgour|ble', 240, '1 assiette'],
  ['taboule', 250, '1 portion'],
  ['tajine', 550, '1 assiette'],

  // Pizzas, fast-food, sandwichs
  ['pizza', 900, '1 pizza entière'],
  ['part de pizza|tranche de pizza|parts de pizza', 280, '1 part'],
  ['burger|hamburger|cheeseburger maison', 600, '1 burger'],
  ['cheeseburger', 300, '1 cheeseburger fast-food'],
  ['big mac', 510, '1 burger'],
  ['frite|frites', 350, '1 portion moyenne'],
  ['nuggets|nugget', 280, '6 nuggets'],
  ['kebab|doner|grec', 750, '1 sandwich'],
  ['kebab frites|grec frites', 1100, '1 menu'],
  ['tacos', 900, '1 tacos (français)'],
  ['menu mcdo|menu burger|menu fast food', 1100, 'burger + frites + soda'],
  ['hot dog', 300, '1 hot-dog'],
  ['sandwich|jambon beurre|sandwich jambon', 400, '1 demi-baguette'],
  ['sandwich poulet|sandwich thon|sandwich crudites', 450, '1 demi-baguette'],
  ['club sandwich', 500, '1 sandwich'],
  ['panini', 550, '1 panini'],
  ['croque monsieur', 400, '1 croque'],
  ['croque madame', 480, '1 croque'],
  ['wrap', 450, '1 wrap'],
  ['bagel', 450, '1 bagel garni'],
  ['quiche|quiche lorraine|tarte salee', 400, '1 part'],
  ['burrito', 700, '1 burrito'],
  ['fajitas', 450, '2 fajitas'],
  ['empanada|samoussa|samosa', 200, '1 pièce'],
  ['friand|feuillete', 300, '1 pièce'],

  // Viandes, poissons, œufs
  ['steak|bifteck|entrecote|boeuf', 280, '1 pièce (150 g)'],
  ['steak hache', 220, '1 steak (100 g)'],
  ['poulet|blanc de poulet|escalope de poulet|filet de poulet', 180, '1 blanc (120 g)'],
  ['cuisse de poulet|pilon', 250, '1 cuisse'],
  ['poulet roti', 300, '1 portion'],
  ['poulet pane|escalope panee|cordon bleu|schnitzel', 350, '1 pièce'],
  ['poulet curry|curry de poulet|poulet au curry|curry', 500, '1 portion (sans riz)'],
  ['poulet basquaise|poulet a la creme', 450, '1 portion'],
  ['dinde|escalope de dinde', 150, '1 escalope'],
  ['escalope', 200, '1 escalope'],
  ['cote de porc|porc|filet mignon', 280, '1 pièce'],
  ['roti de porc|roti de boeuf|roti', 250, '1 portion'],
  ['agneau|gigot|cotelette', 300, '1 portion'],
  ['saucisse|chipolata|saucisse de toulouse', 250, '1 saucisse'],
  ['merguez', 200, '1 merguez'],
  ['jambon|tranche de jambon', 50, '1 tranche'],
  ['saucisson|charcuterie|chorizo', 200, '1 portion (50 g)'],
  ['pate de campagne|terrine|rillettes|foie gras', 150, '1 portion'],
  ['poisson|cabillaud|colin|merlu|lieu|poisson blanc', 150, '1 filet'],
  ['saumon|pave de saumon', 280, '1 pavé'],
  ['thon|thon en boite', 130, '1 petite boîte'],
  ['poisson pane|pane de poisson|fish and chips', 200, '2 pièces'],
  ['crevette|crevettes|gambas', 100, '1 portion'],
  ['moules|moules marinieres', 350, '1 casserole'],
  ['moules frites', 900, '1 portion'],
  ['sardine|sardines|maquereau', 200, '1 boîte'],
  ['sushi|maki|california', 45, '1 pièce'],
  ['sashimi', 35, '1 pièce'],
  ['plateau de sushi|plateau sushi|sushis', 550, '12 pièces'],
  ['tofu', 150, '1 portion'],

  // Plats cuisinés
  ['lentilles', 230, '1 assiette'],
  ['pois chiches|haricots rouges|haricots blancs|flageolets', 250, '1 assiette'],
  ['chili|chili con carne', 500, '1 assiette'],
  ['hachis parmentier', 500, '1 assiette'],
  ['boeuf bourguignon|bourguignon', 550, '1 assiette'],
  ['blanquette|blanquette de veau', 550, '1 assiette'],
  ['pot au feu', 450, '1 assiette'],
  ['choucroute', 800, '1 assiette'],
  ['cassoulet', 700, '1 assiette'],
  ['raclette', 1000, '1 repas'],
  ['fondue|fondue savoyarde', 1000, '1 repas'],
  ['tartiflette', 900, '1 assiette'],
  ['gratin dauphinois|gratin', 350, '1 portion'],
  ['ratatouille', 120, '1 portion'],
  ['puree|puree de pommes de terre', 220, '1 portion'],
  ['pomme de terre|pommes de terre|patate|patates|pommes vapeur', 170, '1 portion'],
  ['pommes sautees|pommes de terre sautees|potatoes', 300, '1 portion'],
  ['legumes|legumes verts|haricots verts|brocoli|courgette|epinards|carottes|petits pois', 70, '1 portion'],
  ['soupe|potage|veloute|gaspacho', 120, '1 bol'],
  ['soupe de lentilles|soupe au potiron|minestrone', 180, '1 bol'],
  ['ramen', 600, '1 bol'],
  ['pho|soupe pho', 450, '1 bol'],
  ['pad thai', 650, '1 assiette'],
  ['nouilles|nouilles sautees|wok|chow mein', 550, '1 assiette'],
  ['bo bun', 550, '1 bol'],
  ['nem|nems|rouleau de printemps', 90, '1 pièce'],
  ['poke|poke bowl|buddha bowl|bowl', 600, '1 bowl'],
  ['dahl|dal', 350, '1 portion'],
  ['falafel', 60, '1 boulette'],
  ['houmous|hummus', 100, '2 cuillères'],
  ['guacamole', 120, '1 portion'],

  // Salades
  ['salade|salade verte', 30, '1 portion sans sauce'],
  ['salade composee|grande salade', 350, '1 assiette'],
  ['salade cesar', 500, '1 assiette'],
  ['salade nicoise', 400, '1 assiette'],
  ['salade de pates|salade de riz', 450, '1 assiette'],
  ['salade de chevre chaud|chevre chaud', 500, '1 assiette'],
  ['crudites|carottes rapees|tomate|tomates|concombre', 50, '1 portion'],

  // Fromages, laitages
  ['fromage|camembert|comte|emmental|brie|chevre|gruyere|cheddar|roquefort|reblochon', 110, '1 portion (30 g)'],
  ['mozzarella|burrata', 250, '1 boule'],
  ['feta', 80, '1 portion'],

  // Sauces, matières grasses
  ['mayonnaise|mayo', 95, '1 cuillère'],
  ['ketchup', 20, '1 cuillère'],
  ['vinaigrette|sauce salade', 70, '1 cuillère'],
  ['huile|huile d olive', 90, '1 cuillère'],
  ['sauce|sauce barbecue|sauce burger|sauce samourai|sauce blanche', 80, '1 portion'],
  ['creme fraiche', 60, '1 cuillère'],

  // Desserts, sucré
  ['chocolat', 110, '4 carrés (20 g)'],
  ['carre de chocolat', 28, '1 carré'],
  ['tablette de chocolat', 540, '1 tablette'],
  ['gateau|part de gateau|gateau au chocolat', 350, '1 part'],
  ['fondant au chocolat|moelleux au chocolat', 400, '1 part'],
  ['tarte|tarte aux pommes|tarte aux fraises|tarte au citron', 300, '1 part'],
  ['eclair|religieuse', 260, '1 pièce'],
  ['mousse au chocolat', 200, '1 pot'],
  ['creme dessert|danette|flan|creme caramel', 150, '1 pot'],
  ['creme brulee', 300, '1 pot'],
  ['tiramisu', 400, '1 part'],
  ['cheesecake', 400, '1 part'],
  ['glace|crème glacée|creme glacee', 200, '2 boules'],
  ['boule de glace', 100, '1 boule'],
  ['magnum|cornetto|esquimau', 260, '1 glace'],
  ['cookie', 200, '1 grand cookie'],
  ['biscuit|petit beurre|sable', 50, '1 biscuit'],
  ['madeleine', 100, '1 madeleine'],
  ['muffin', 400, '1 muffin'],
  ['donut|beignet', 270, '1 pièce'],
  ['brownie', 250, '1 part'],
  ['macaron', 90, '1 macaron'],
  ['barre chocolatee|snickers|mars|twix|kinder bueno|bounty|kitkat', 250, '1 barre'],
  ['barre de cereales|barre proteinee', 150, '1 barre'],
  ['bonbon|bonbons|haribo', 100, '1 poignée'],
  ['chips', 240, '1 paquet (45 g)'],
  ['pop corn|popcorn', 200, '1 portion'],
  ['gateau aperitif|biscuits aperitif|crackers', 150, '1 poignée'],
  ['olive|olives', 60, '10 olives'],

  // Boissons
  ['eau|eau gazeuse|perrier', 0, '1 verre'],
  ['coca|coca cola|soda|pepsi|fanta|sprite|orangina|limonade', 140, '1 canette (33 cl)'],
  ['coca zero|coca light|pepsi max|soda zero|soda light', 1, '1 canette'],
  ['ice tea|the glace', 110, '1 canette'],
  ['red bull|monster|boisson energisante', 115, '1 canette'],
  ['sirop|diabolo', 60, '1 verre'],
  ['biere', 140, '1 demi (25 cl)'],
  ['pinte|pinte de biere', 280, '1 pinte (50 cl)'],
  ['vin|vin rouge|vin blanc|rose|verre de vin', 120, '1 verre (15 cl)'],
  ['champagne|prosecco', 90, '1 coupe'],
  ['cocktail|mojito|spritz|pina colada|margarita', 200, '1 verre'],
  ['whisky|vodka|rhum|gin|tequila|pastis|shot', 70, '1 dose (3 cl)'],
  ['cidre', 100, '1 bolée'],
  ['proteine|shaker|whey', 120, '1 shaker'],
];

// ---------- Analyse du texte saisi ----------

function normalize(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/['’]/g, ' ')
    .replace(/[^a-z0-9.,/ ]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Singulier approximatif : « oeufs » → « oeuf », « gateaux » → « gateau »
const stem = w => (w.length > 3 && /[sx]$/.test(w) ? w.slice(0, -1) : w);
const words = s => normalize(s).split(' ').filter(Boolean).map(stem);

const NUMBER_WORDS = {
  un: 1, une: 1, deu: 2, troi: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
  douze: 12, douzaine: 12, demi: 0.5, moitie: 0.5, quelque: 3, plusieur: 3, quart: 0.25,
};
const SIZE_WORDS = {
  petit: 0.7, petite: 0.7, mini: 0.5, leger: 0.8, legere: 0.8,
  grand: 1.4, grande: 1.4, gro: 1.4, grosse: 1.4, big: 1.4, xl: 1.6, maxi: 1.6,
  enorme: 1.8, double: 2, copieu: 1.4, copieuse: 1.4, bonne: 1.2, bon: 1.2,
};
// Mots vides, retirés des noms de la base
const STOP = new Set(['de', 'du', 'des', 'd', 'la', 'le', 'les', 'l', 'au', 'aux', 'a', 'avec', 'en', 'sur', 'et', 'un', 'une']);
// Mots qu'on peut sauter dans la saisie entre deux mots d'un nom
const FILLER = new Set([...STOP,
  'assiette', 'bol', 'portion', 'verre', 'tasse', 'plat', 'paquet', 'boite', 'canette', 'bouteille', 'morceau', 'part', 'tranche',
  'cuillere', 'peu', 'beaucoup', 'maison', 'fait', 'moyen', 'moyenne', 'normal', 'normale']);

// Index : chaque nom de la base, découpé en mots
let INDEX = null;
function buildIndex(custom) {
  const idx = [];
  FOOD_DB.forEach(([names, kcal, portion]) => {
    const all = names.split('|');
    all.forEach(n => idx.push({ key: words(n).filter(w => !STOP.has(w)), label: all[0], kcal, portion, custom: false }));
  });
  Object.entries(custom || {}).forEach(([name, kcal]) => {
    idx.push({ key: words(name).filter(w => !STOP.has(w)), label: name, kcal, portion: 'ta valeur', custom: true });
  });
  // Les noms les plus longs (plus précis) d'abord ; les aliments personnels gagnent à égalité
  idx.sort((a, b) => b.key.length - a.key.length || (b.custom - a.custom));
  return idx;
}

// Cherche la séquence `key` dans `toks` (mots consécutifs, en sautant les mots vides)
function findSeq(toks, key) {
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].used || toks[i].w !== key[0]) continue;
    let j = i, k = 0;
    const hit = [];
    while (j < toks.length && k < key.length) {
      if (!toks[j].used && toks[j].w === key[k]) { hit.push(j); k++; j++; }
      else if (FILLER.has(toks[j].w) && k > 0) { j++; }
      else break;
    }
    if (k === key.length) return hit;
  }
  return null;
}

const UNITS = /^(\d+(?:[.,]\d+)?)?(g|gr|gramme|kg|cl|ml|l|litre)$/;

// Les mots sont déjà au singulier approximatif (« deux » → « deu », « gros » → « gro »).
// Quantité (« 2 », « deux », « x3 », « demi ») et taille (« petit », « grande ») parmi les mots restants.
// Les poids et volumes (« 200 g », « 33cl ») sont ignorés : la portion habituelle sert de référence.
function parseFactor(toks) {
  let qty = 1, size = 1;
  toks.forEach((t, i) => {
    if (t.used) return;
    const w = t.w;
    const next = toks[i + 1] && toks[i + 1].w;
    let m;
    if (UNITS.test(w)) return;
    if ((m = w.match(/^x?(\d+(?:[.,]\d+)?)x?$/))) { if (!(next && UNITS.test(next))) qty = parseFloat(m[1].replace(',', '.')); }
    else if (w === '1/2') qty = 0.5;
    else if (NUMBER_WORDS[w] !== undefined) { if (w !== 'un' && w !== 'une') qty = NUMBER_WORDS[w]; }
    else if (SIZE_WORDS[w] !== undefined) size = SIZE_WORDS[w];
  });
  return { qty, size };
}

// Découpe « pâtes carbonara, 2 croissants et un coca » en morceaux
function splitSegments(text) {
  return text
    .split(/[\n,;+]|\bet\b|\bpuis\b/i)
    .map(s => s.trim())
    .filter(Boolean);
}

function estimateLocal(text, custom) {
  INDEX = buildIndex(custom);
  const results = [];
  splitSegments(text).forEach(seg => {
    const toks = words(seg).map(w => ({ w, used: false }));
    const found = [];
    for (const entry of INDEX) {
      if (!entry.key.length) continue;
      const hit = findSeq(toks, entry.key);
      if (hit) {
        hit.forEach(i => { toks[i].used = true; });
        found.push(entry);
      }
    }
    const { qty, size } = parseFactor(toks);
    const factor = qty * size;
    if (found.length) {
      found.forEach(e => results.push({
        name: found.length === 1 ? seg : e.label,
        kcal: Math.round(e.kcal * factor),
        detail: `${e.label} · ${e.portion}${factor !== 1 ? ` × ${+factor.toFixed(2)}` : ''}`,
        source: e.custom ? 'perso' : 'base',
      }));
    } else {
      results.push({ name: seg, kcal: null, detail: 'Non reconnu : touche pour saisir les kcal', source: 'inconnu' });
    }
  });
  return results;
}

// ---------- Estimation par ChatGPT (avec l'abonnement, via l'app ChatGPT) ----------
// L'abonnement ChatGPT ne donne pas accès à l'API : on passe par l'app ChatGPT (raccourci iOS
// « Demander à ChatGPT ») ou par le site, puis on recolle la réponse dans l'app.

const CHATGPT_SHORTCUT = 'Calories ChatGPT';

function chatgptPrompt(text) {
  return 'Estime les calories de ce repas. Si les quantités ne sont pas précisées, suppose des portions habituelles en France. ' +
    'Réponds uniquement avec une ligne par aliment ou plat, au format : nom | portion | kcal (un nombre entier), sans titre, sans total, sans autre texte.\n' +
    `Repas : ${text}`;
}

// Lit « Pâtes carbonara | 1 assiette | 750 », y compris dans un tableau Markdown ou une liste à puces
function parseChatGPT(answer) {
  const items = [];
  answer.split(/\r?\n/).forEach(line => {
    const clean = line.trim().replace(/^[-*•]\s*|^\d+[.)]\s*/, '').replace(/^\||\|$/g, '').replace(/\*\*/g, '');
    const parts = clean.split('|').map(x => x.trim()).filter(Boolean);
    if (parts.length < 2 || /^:?-{2,}/.test(parts[0]) || /^(nom|aliment|plat|total)\b/i.test(parts[0])) return;
    const nums = (parts[parts.length - 1].match(/\d[\d\s\u202f\u00a0]*/g) || [])
      .map(n => parseInt(n.replace(/\D/g, ''), 10)).filter(n => !isNaN(n));
    if (!nums.length) return;
    const kcal = nums.length > 1 ? Math.round((nums[0] + nums[1]) / 2) : nums[0]; // « 400-500 » → 450
    const portion = parts.length > 2 ? parts.slice(1, -1).join(' · ') : '';
    items.push({ name: parts[0], kcal, detail: `${portion ? `${portion} · ` : ''}estimation ChatGPT`, source: 'ia' });
  });
  return items;
}
