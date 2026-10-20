import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ContactKind, detectContacts, screenContacts } from './contacts';

const kinds = (text: string) => detectContacts(text).map((m) => m.kind);
const hidden = (text: string) => screenContacts(text, { mask: true, placeholder: '[x]' }).text;

function expectKind(kind: ContactKind, samples: string[]) {
  for (const s of samples) assert.ok(kinds(s).includes(kind), `${kind} not found in: ${s}`);
}

test('phones in KG/KZ/RU formats', () => {
  expectKind('PHONE', [
    '+996 555 123 456',
    '+996(555)12-34-56',
    'звони 0555123456',
    '0700 12 34 56',
    '555 12 34 56',
    '8 (900) 123-45-67',
    '+7 777 123 45 67',
    '0 5 5 5 1 2 3 4 5 6',
    'ноль пять пять пять один два три четыре пять шесть',
    'нуль семь ноль ноль 12 34 56',
  ]);
});

test('emails, including obfuscated', () => {
  expectKind('EMAIL', [
    'ivan.dev@gmail.com',
    'ivan @ mail.ru',
    'ivan собака gmail точка com',
    'ivan [at] gmail [dot] com',
    'ivan(at)yandex(dot)ru',
  ]);
});

test('messenger links and handles', () => {
  expectKind('MESSENGER_LINK', ['t.me/ivan_dev', 'https://wa.me/996555123456', 'instagram.com/ivan', 't . me/ivan']);
  expectKind('HANDLE', ['пиши @ivan_dev', 'мой тг: @ivan_dev', '@IvanDev99']);
});

test('valid card numbers only', () => {
  expectKind('PAYMENT_CARD', ['4111 1111 1111 1111', '4111-1111-1111-1111']);
  assert.ok(!kinds('1234 5678 9012 3456').includes('PAYMENT_CARD'));
});

test('intent to move off the platform', () => {
  expectKind('OFF_PLATFORM_INTENT', [
    'напиши мне в телеграм',
    'Напишите в тг, обсудим',
    'мой ватсап',
    'пиши в т е л е г р а м',
    'Давайте без комиссии',
    'оплачу напрямую на карту',
    'скину на мбанк',
    'переведу через О!Деньги',
    'telegram: ivan',
    'write me on whatsapp',
    'let’s go off-platform',
    'пиши в тeлeграм', // Latin "e" inside a Cyrillic word
    'добавь в телегу',
    'давайте работать напрямую',
    'оплата напрямую мне',
    'можем напрямую договориться? пиши в вотсап',
  ]);
});

test('ordinary project texts stay clean', () => {
  const clean = [
    'Нужен Telegram-бот для записи клиентов, интеграция с WhatsApp Business API',
    'Бюджет 30 000 - 50 000 сом, срок 10 дней',
    'Бюджет 150 000 000 сом',
    'Сделать лендинг за 25000 сом до 20.10.2026',
    'Работаю с 10:00 до 18:00, отгрузка через неделю',
    'Сверстать по макету: @media (max-width: 768px) и @import шрифтов',
    'Декоратор @Injectable() в NestJS',
    'Портфолио: https://github.com/ivan и behance.net/ivan',
    'Опыт 7 лет, сделал 120 проектов',
    'Нужна интеграция с API Mbank',
    'Мой телеграм-бот уже работает у 3 клиентов',
    'Номер заказа 123456789',
    'напрямую подключиться к базе данных',
    'Версия 1.2.3.4.5.6.7.8.9',
    'Сделаю один лендинг и два баннера, три правки бесплатно',
    'I can start directly tomorrow, my experience is 5 years',
  ];
  for (const s of clean) {
    const found = detectContacts(s);
    assert.deepEqual(found, [], `false positive in: ${s} -> ${JSON.stringify(found)}`);
  }
});

test('masks contacts in the original text, keeps the rest', () => {
  assert.equal(hidden('Пиши: +996 555 123 456, жду'), 'Пиши: [x], жду');
  assert.equal(hidden('почта ivan собака gmail точка com!'), 'почта [x]!');
  assert.equal(hidden('тг @ivan_dev и t.me/ivan_dev'), 'тг [x] и [x]');
});

test('intent phrases are flagged but not masked', () => {
  const r = screenContacts('Давайте без комиссии', { mask: true, placeholder: '[x]' });
  assert.equal(r.text, 'Давайте без комиссии');
  assert.equal(r.masked, false);
  assert.equal(r.matches[0].kind, 'OFF_PLATFORM_INTENT');
});

test('mask: false only reports', () => {
  const r = screenContacts('0555123456', { mask: false, placeholder: '[x]' });
  assert.equal(r.text, '0555123456');
  assert.equal(r.masked, false);
  assert.equal(r.matches.length, 1);
});

test('emoji and surrogate pairs do not break offsets', () => {
  assert.equal(hidden('🔥 пиши 0555123456 🔥'), '🔥 пиши [x] 🔥');
});
