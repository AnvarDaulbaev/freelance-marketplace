/**
 * Finds attempts to move a deal off the platform: phone numbers, emails,
 * messenger links and handles, card numbers, and phrases like "без комиссии".
 *
 * Text is normalized first so that common obfuscations still match:
 * look-alike Latin/Cyrillic letters, "собака"/"точка" instead of "@"/".",
 * digits written as words ("ноль пять пять пять") and spaced-out words
 * ("т е л е г р а м"). Every normalized character remembers which part of the
 * original it came from, so matches can be masked in the original text.
 */

export type ContactKind =
  | 'PHONE'
  | 'EMAIL'
  | 'MESSENGER_LINK'
  | 'HANDLE'
  | 'PAYMENT_CARD'
  | 'OFF_PLATFORM_INTENT';

/** Concrete contact details; these get masked. Intent phrases are only flagged. */
export const MASKED_KINDS: readonly ContactKind[] = ['PHONE', 'EMAIL', 'MESSENGER_LINK', 'HANDLE', 'PAYMENT_CARD'];

export interface ContactMatch {
  kind: ContactKind;
  /** Range in the original text, end exclusive. */
  start: number;
  end: number;
  /** The original fragment. */
  value: string;
}

export interface ScreenResult {
  matches: ContactMatch[];
  /** Original text with MASKED_KINDS replaced by the placeholder (if masking was requested). */
  text: string;
  masked: boolean;
}

// --- Normalization -----------------------------------------------------------

/** Cyrillic letters that look like Latin ones, folded so "tеlеgram" (mixed) matches. */
const HOMOGLYPHS: Record<string, string> = {
  а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x',
  і: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ӏ: 'l',
};

/** Whole words replaced before matching. Keys are lower-case, before folding. */
const WORD_SUBSTITUTES: Record<string, string> = {
  собака: '@', собачка: '@', at: '@',
  точка: '.', dot: '.',
  ноль: '0', нуль: '0', zero: '0',
  один: '1', одна: '1', one: '1',
  два: '2', две: '2', two: '2',
  три: '3', three: '3',
  четыре: '4', four: '4',
  пять: '5', five: '5',
  шесть: '6', six: '6',
  семь: '7', seven: '7',
  восемь: '8', eight: '8',
  девять: '9', nine: '9',
};

/** "at"/"dot" are ordinary English words; substitute them only between [brackets] or (parens). */
const BRACKET_ONLY = new Set(['at', 'dot']);

interface Normalized {
  text: string;
  /** For each char of `text`: [start, end) in the original. */
  spans: [number, number][];
}

function foldChar(ch: string): string {
  const lower = ch.toLowerCase();
  return HOMOGLYPHS[lower] ?? lower;
}

function normalize(input: string): Normalized {
  const out: string[] = [];
  const spans: [number, number][] = [];
  const push = (s: string, start: number, end: number) => {
    // Per UTF-16 unit, so indices in `text` line up with `spans`.
    for (let k = 0; k < s.length; k++) {
      out.push(s[k]);
      spans.push([start, end]);
    }
  };

  const word = /[\p{L}]+/uy;
  let i = 0;
  while (i < input.length) {
    word.lastIndex = i;
    const m = word.exec(input);
    if (m) {
      const w = m[0];
      const lower = w.toLowerCase();
      const sub = WORD_SUBSTITUTES[lower];
      const bracketed = /[[(]\s*$/.test(input.slice(Math.max(0, i - 2), i));
      if (sub && (!BRACKET_ONLY.has(lower) || bracketed)) {
        push(sub, i, i + w.length);
      } else {
        for (let k = 0; k < w.length; k++) push(foldChar(w[k]), i + k, i + k + 1);
      }
      i += w.length;
      continue;
    }
    // Surrogate pairs (emoji) are kept as one unit so spans stay valid.
    const cp = input.codePointAt(i)!;
    const len = cp > 0xffff ? 2 : 1;
    push(foldChar(input.slice(i, i + len)), i, i + len);
    i += len;
  }
  return { text: out.join(''), spans };
}

/**
 * Same text with separators removed, for spaced-out words. Only used for long
 * keywords: short ones would match across word boundaries ("о[тг]рузка").
 */
function compact(n: Normalized): Normalized {
  const out: string[] = [];
  const spans: [number, number][] = [];
  for (let k = 0; k < n.text.length; k++) {
    if (/[\p{L}\p{N}]/u.test(n.text[k])) {
      out.push(n.text[k]);
      spans.push(n.spans[k]);
    }
  }
  return { text: out.join(''), spans };
}

/** Patterns are written in natural form and folded the same way as the text. */
function fold(s: string): string {
  return [...s].map(foldChar).join('');
}

// --- Rules -------------------------------------------------------------------

const SEP = String.raw`[\s.\-()_/\\]{0,2}`;
// Digits with up to two separators between them: "+996 (555) 12-34-56", "0 5 5 5 ...".
const PHONE = new RegExp(String.raw`\+?\d(?:${SEP}\d){7,15}`, 'g');
const NOT_PHONE_BEFORE = new RegExp(
  fold(String.raw`(?:№|#|заказ\S*|order|id|инн|счет\S*|счёт\S*|артикул\S*|верси\S*|version|v)\s*[:.]?\s*$`),
);
const MONEY_AFTER = new RegExp(
  fold(String.raw`^\s*(?:сом|сомов|с\b|kgs|руб|р\.|₽|\$|usd|eur|€|тыс|тг\b|тенге|kzt|k\b|%)`),
);

// "@" and "." may come wrapped as "[at]" / "(dot)" (already substituted, brackets kept).
const AT = String.raw`\s?[[(]?\s?@\s?[\])]?\s?`;
const DOT = String.raw`\s?[[(]?\s?\.\s?[\])]?\s?`;
const EMAIL = new RegExp(String.raw`[a-z0-9._%+-]+${AT}[a-z0-9-]+(?:${DOT}[a-z0-9-]+)*${DOT}[a-z]{2,}`, 'g');

const MESSENGER_DOMAINS = [
  't.me', 'telegram.me', 'telegram.dog', 'wa.me', 'whatsapp.com', 'chat.whatsapp.com', 'viber.click',
  'instagram.com', 'instagr.am', 'vk.com', 'vk.me', 'facebook.com', 'fb.com', 'fb.me', 'm.me',
  'ok.ru', 'discord.gg', 'discord.com', 'skype.com', 'join.skype.com', 'tiktok.com',
];
const MESSENGER_LINK = new RegExp(
  String.raw`(?<![a-z0-9.-])(?:https?://)?(?:www\.)?(?:${MESSENGER_DOMAINS.map((d) => d.replace(/\./g, String.raw`\s?\.\s?`)).join('|')})(?![a-z0-9-])(?:/[^\s]*)?`,
  'g',
);

// Telegram/Instagram-style handle. Needs a non-word char before "@" so emails don't match.
const HANDLE = /(?:^|[^\p{L}\p{N}_.])@\s?([a-z][a-z0-9_.]{3,31})/gu;
/** Things developers type with "@" that are not handles. */
const HANDLE_STOPLIST = new Set(
  ['media', 'import', 'keyframes', 'font-face', 'supports', 'component', 'injectable', 'module', 'override',
    'param', 'return', 'returns', 'type', 'typedef', 'deprecated', 'example', 'see', 'throws', 'input', 'output',
    'controller', 'entity', 'column', 'test', 'mixin', 'include', 'extend', 'apply', 'tailwind', 'layer',
    'container', 'property', 'next', 'prisma', 'nestjs', 'types', 'babel', 'angular', 'vue', 'react', 'here',
    'everyone', 'channel', 'admin'].map(fold),
);

const CARD = new RegExp(String.raw`\d(?:[\s-]?\d){15,18}`, 'g');

const MESSENGERS = [
  'telegram', 'телеграм', 'телеграмм', 'телега', 'телегу', 'телеге', 'тг', 'tg', 'тгк',
  'whatsapp', 'ватсап', 'вотсап', 'вацап', 'ватсапп', 'вотсапп', 'ватс', 'вотс', 'wa',
  'viber', 'вайбер', 'вибер', 'skype', 'скайп', 'instagram', 'инстаграм', 'инста', 'insta', 'инсту',
  'discord', 'дискорд', 'vk', 'вк', 'вконтакте', 'лс', 'личку', 'личке', 'директ',
  'почту', 'почта', 'email', 'e-mail', 'мейл', 'имейл', 'gmail', 'гмейл',
];
// Long enough to be safe to look for in the compacted (separator-free) text.
const SPACED_MESSENGERS = ['telegram', 'телеграм', 'whatsapp', 'ватсап', 'вотсап', 'вайбер', 'instagram', 'инстаграм', 'дискорд', 'discord', 'skype', 'скайп'];

const CONTACT_VERBS = [
  'пиши', 'напиши', 'пишите', 'напишите', 'отпиши', 'отпишись', 'черкни', 'стукни', 'стучи', 'маякни',
  'свяж', 'связаться', 'связь', 'звони', 'позвони', 'позвоните', 'звоните', 'набери', 'наберите',
  'добавь', 'добавьте', 'добавлю', 'добавляйся', 'скинь', 'скиньте', 'кинь', 'киньте', 'скину', 'перейдем',
  'перейдём', 'переходи', 'перейти', 'мой', 'моя', 'мою', 'мне в', 'меня в', 'найди', 'найдите', 'есть в',
  'обсудим в', 'общаться в', 'общение в', 'продолжим в', 'контакт',
  'write me', 'text me', 'message me', 'contact me', 'call me', 'add me', 'ping me', 'reach me', 'dm me',
  'my', 'find me', "let's move to", 'switch to',
];

const OFF_PLATFORM_PHRASES = [
  'без комиссии', 'без комиссий', 'без посредник', 'мимо площадки', 'мимо сайта', 'мимо биржи', 'вне площадки',
  'вне сайта', 'вне биржи', 'не через сайт', 'не через площадку', 'не через биржу', 'минуя сайт', 'минуя площадку',
  'обойти комиссию', 'в обход', 'на карту', 'на карточку', 'переводом на', 'перевод на',
  'скину на', 'скинете на', 'оплачу на', 'оплата на', 'наличными', 'наличкой', 'налом',
  'without commission', 'no commission', 'avoid the fee', 'avoid fees', 'outside the platform', 'off platform',
  'off-platform', 'pay directly', 'directly to my', 'bank transfer', 'wire transfer',
];

// "напрямую" alone is common ("подключиться напрямую к базе"); only about working or paying.
const DIRECT_WORDS = ['напрямую', 'на прямую', 'directly', 'direct'];
const DIRECT_CONTEXT = [
  'работать', 'работаем', 'поработаем', 'сотрудничать', 'оплачу', 'оплата', 'оплатить', 'заплачу', 'платить',
  'переведу', 'договоримся', 'договориться', 'давай', 'давайте', 'со мной', 'с вами', 'мне', 'общаться', 'связаться',
  'work', 'pay', 'deal', 'contact', 'hire', 'me',
];

// Payment apps are also legit integration topics ("API Mbank"), so only with a payment verb in front.
const PAYMENT_APPS = [
  'мбанк', 'mbank', 'о!деньги', 'о деньги', 'оденьги', 'odengi', 'элсом', 'elsom', 'balance.kg', 'megapay',
  'kaspi', 'каспи', 'сбер', 'сбербанк', 'тинькофф', 'тинькоф', 'т-банк', 'qiwi', 'киви', 'юмани', 'yoomoney',
  'paypal', 'western union', 'золотая корона', 'крипту', 'крипта', 'криптой', 'usdt', 'binance',
];
const PAYMENT_VERBS = [
  'на', 'через', 'по', 'переведу', 'переведи', 'переведите', 'перевожу', 'перевод', 'переводом', 'скину', 'скинь',
  'скиньте', 'оплачу', 'оплата', 'оплатить', 'оплачу через', 'заплачу', 'плачу', 'кину', 'pay', 'via', 'by', 'to my',
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
const words = (list: string[]) => list.map((w) => esc(fold(w))).join('|');
// Word boundaries that understand Cyrillic (\b does not).
const L = String.raw`(?<![\p{L}\p{N}])`;
const R = String.raw`(?![\p{L}\p{N}])`;

// Messenger as the subject of the work, not a contact: "мой телеграм-бот", "WhatsApp API".
const PRODUCT_AFTER = [
  'бот', 'бота', 'боты', 'ботов', 'bot', 'bots', 'канал', 'канала', 'channel', 'api', 'business', 'mini', 'app',
  'web', 'групп', 'чат', 'интеграц', 'магазин', 'shop', 'реклам', 'аккаунт', 'профил', 'страниц',
];
const NOT_PRODUCT = String.raw`(?![\s-]*(?:${words(PRODUCT_AFTER)}))`;

// "напиши мне в телеграм", "мой ватсап", "в тг ...", "telegram: ..."
const MESSENGER_INTENT = new RegExp(
  String.raw`${L}(?:${words(CONTACT_VERBS)})[^.!?\n]{0,25}?${L}(?:${words(MESSENGERS)})${R}${NOT_PRODUCT}` +
    String.raw`|${L}(?:${words(MESSENGERS)})\s*[:=]\s*\S`,
  'gu',
);
const SPACED_MESSENGER = new RegExp(words(SPACED_MESSENGERS), 'g');
// Off-platform phrases start on a word boundary but may end mid-word ("посредник|ов").
const OFF_PLATFORM = new RegExp(String.raw`${L}(?:${words(OFF_PLATFORM_PHRASES)})`, 'gu');
const DIRECT = new RegExp(
  String.raw`${L}(?:${words(DIRECT_CONTEXT)})\s+(?:${words(DIRECT_WORDS)})${R}` +
    String.raw`|${L}(?:${words(DIRECT_WORDS)})\s+(?:${words(DIRECT_CONTEXT)})${R}`,
  'gu',
);
const PAYMENT_APP = new RegExp(
  String.raw`${L}(?:${words(PAYMENT_VERBS)})\s+(?:(?:мой|мою|мои|my)\s+)?(?:${words(PAYMENT_APPS)})${R}`,
  'gu',
);

function luhn(digits: string): boolean {
  let sum = 0;
  for (let k = 0; k < digits.length; k++) {
    let d = Number(digits[digits.length - 1 - k]);
    if (k % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

interface Hit {
  kind: ContactKind;
  start: number; // in normalized text
  end: number;
}

function findAll(re: RegExp, text: string, kind: ContactKind, accept: (m: RegExpExecArray) => Hit | null = (m) => ({ kind, start: m.index, end: m.index + m[0].length })): Hit[] {
  const hits: Hit[] = [];
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const h = accept(m);
    if (h) hits.push(h);
    if (m[0].length === 0) re.lastIndex++;
  }
  return hits;
}

function toOriginal(n: Normalized, start: number, end: number): [number, number] {
  return [n.spans[start][0], n.spans[end - 1][1]];
}

// --- Public API --------------------------------------------------------------

export function detectContacts(input: string): ContactMatch[] {
  const n = normalize(input);
  const t = n.text;
  const ranges: { kind: ContactKind; start: number; end: number }[] = [];
  const add = (src: Normalized, hits: Hit[]) => {
    for (const h of hits) {
      const [start, end] = toOriginal(src, h.start, h.end);
      ranges.push({ kind: h.kind, start, end });
    }
  };

  add(n, findAll(EMAIL, t, 'EMAIL'));
  add(n, findAll(MESSENGER_LINK, t, 'MESSENGER_LINK'));
  add(n, findAll(HANDLE, t, 'HANDLE', (m) => {
    if (HANDLE_STOPLIST.has(m[1].replace(/[._]+$/, ''))) return null;
    const at = m.index + m[0].indexOf('@');
    return { kind: 'HANDLE', start: at, end: m.index + m[0].length };
  }));
  add(n, findAll(CARD, t, 'PAYMENT_CARD', (m) => {
    const digits = m[0].replace(/\D/g, '');
    return digits.length >= 16 && digits.length <= 19 && luhn(digits)
      ? { kind: 'PAYMENT_CARD', start: m.index, end: m.index + m[0].length }
      : null;
  }));
  add(n, findAll(PHONE, t, 'PHONE', (m) => {
    const digits = m[0].replace(/\D/g, '').length;
    if (digits < 9 || digits > 13) return null;
    // A bare 9-digit run is more often an id than a phone; grouped "555 12 34 56" is a phone.
    if (digits === 9 && !/^\+|[\s\-()]/.test(m[0])) return null;
    if ((m[0].match(/\./g) ?? []).length >= 3) return null; // versions, IPs
    const end = m.index + m[0].length;
    if (MONEY_AFTER.test(t.slice(end, end + 8))) return null; // "50 000 000 сом"
    if (NOT_PHONE_BEFORE.test(t.slice(Math.max(0, m.index - 20), m.index))) return null; // "заказ 123456789"
    return { kind: 'PHONE', start: m.index, end };
  }));
  add(n, findAll(MESSENGER_INTENT, t, 'OFF_PLATFORM_INTENT'));
  add(n, findAll(OFF_PLATFORM, t, 'OFF_PLATFORM_INTENT'));
  add(n, findAll(PAYMENT_APP, t, 'OFF_PLATFORM_INTENT'));
  add(n, findAll(DIRECT, t, 'OFF_PLATFORM_INTENT'));
  const c = compact(n);
  add(c, findAll(SPACED_MESSENGER, c.text, 'OFF_PLATFORM_INTENT', (m) => {
    // Written as one plain word -> only intent phrases count, so "Telegram-бот" stays clean.
    const [s, e] = toOriginal(c, m.index, m.index + m[0].length);
    return /[^\p{L}]/u.test(input.slice(s, e)) ? { kind: 'OFF_PLATFORM_INTENT', start: m.index, end: m.index + m[0].length } : null;
  }));

  return mergeRanges(ranges).map((r) => ({ ...r, value: input.slice(r.start, r.end) }));
}

/**
 * Overlapping hits are merged; a concrete contact wins over an intent phrase
 * and the earlier rule wins among concrete kinds (a card is not also a phone).
 */
function mergeRanges(ranges: { kind: ContactKind; start: number; end: number }[]) {
  const rank = (k: ContactKind) => (MASKED_KINDS.includes(k) ? 0 : 1);
  const sorted = ranges
    .map((r, order) => ({ ...r, order }))
    .sort((a, b) => rank(a.kind) - rank(b.kind) || a.order - b.order);
  const kept: { kind: ContactKind; start: number; end: number }[] = [];
  for (const r of sorted) {
    const overlap = kept.find((k) => r.start < k.end && k.start < r.end);
    if (!overlap) kept.push({ kind: r.kind, start: r.start, end: r.end });
    else if (overlap.kind === r.kind) {
      overlap.start = Math.min(overlap.start, r.start);
      overlap.end = Math.max(overlap.end, r.end);
    }
  }
  return kept.sort((a, b) => a.start - b.start);
}

export function maskContacts(input: string, matches: ContactMatch[], placeholder: string): string {
  let out = '';
  let pos = 0;
  for (const m of matches) {
    if (!MASKED_KINDS.includes(m.kind)) continue;
    out += input.slice(pos, m.start) + placeholder;
    pos = m.end;
  }
  return out + input.slice(pos);
}

export function screenContacts(input: string, opts: { mask: boolean; placeholder: string }): ScreenResult {
  const matches = detectContacts(input);
  const text = opts.mask ? maskContacts(input, matches, opts.placeholder) : input;
  return { matches, text, masked: text !== input };
}
