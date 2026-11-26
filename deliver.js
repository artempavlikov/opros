/*!
 * deliver.js — единая отправка результатов формы на почту и в приложение.
 *
 * Кладётся рядом с index.html и подключается одной строкой:
 *     <script src="deliver.js"></script>
 *
 * Внутри страницы после прохождения достаточно вызвать:
 *     Deliver.send({ 'Заголовок': 'поле', 'Результат': текст });
 *
 * Работает без сервера, без ключей и без токенов в коде.
 * Настраивается в блоке CONFIG ниже — один раз, для всех будущих сайтов.
 */
(function (global) {
  'use strict';

  /* ================= НАСТРОЙКИ (менять только здесь) ================= */

  var CONFIG = {
    // --- Почта: FormSubmit. Ключей не требует, ничего красть со страницы. ---
    // Один раз нужно нажать «Activate» в письме, которое придёт на этот адрес.
    mail: {
      enabled: true,
      email: 'pavlov.artem2705@yandex.ru',
      subjectPrefix: 'Результат формы'
    },

    // --- Приложение-напоминания: ntfy. Приходит пуш на телефон. ---
    // topic — это имя канала, оно работает как пароль. Вписать своё.
    push: {
      enabled: true,
      server: 'https://ntfy.sh',
      topic: '',                    // <-- сюда имя канала
      title: 'Новый результат',
      priority: 4,                  // 1..5, 4 = высокий
      tags: ['incoming_envelope']
    },

    // --- Локальный сервер (server.py), если страницу отдаёт он ---
    local: {
      enabled: true,
      path: 'api/result'
    }
  };

  /* ==================================================================== */

  function post(url, body, headers, keepalive) {
    try {
      return fetch(url, {
        method: 'POST',
        headers: headers,
        body: typeof body === 'string' ? body : JSON.stringify(body),
        keepalive: !!keepalive
      }).catch(function () { return null; });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  /**
   * Отправить данные.
   * @param {Object} fields — пары «подпись → значение», попадут в письмо таблицей
   * @param {Object} [extra] — служебные данные (например, ответы в JSON)
   * @returns {Promise<Object>} статусы: {mail, push, local}
   */
  function send(fields, extra) {
    var out = { mail: false, push: false, local: false };
    var flat = flatten(fields);

    // 1. Почта
    if (CONFIG.mail.enabled && CONFIG.mail.email) {
      var mailBody = {
        _subject: CONFIG.mail.subjectPrefix + ' — ' + new Date().toLocaleString('ru-RU'),
        _template: 'table'
      };
      Object.keys(flat).forEach(function (k) { mailBody[k] = flat[k]; });
      out.mail = post(
        'https://formsubmit.co/ajax/' + CONFIG.mail.email,
        mailBody,
        { 'Content-Type': 'application/json', 'Accept': 'application/json' }
      );
    }

    // 2. Пуш в приложение через ntfy
    if (CONFIG.push.enabled && CONFIG.push.topic) {
      out.push = post(
        CONFIG.push.server,
        {
          topic: CONFIG.push.topic,
          title: CONFIG.push.title,
          message: buildPushText(flat),
          priority: CONFIG.push.priority,
          tags: CONFIG.push.tags
        },
        { 'Content-Type': 'application/json' }
      );
    }

    // 3. Локальный сервер
    if (CONFIG.local.enabled && /^https?:$/.test(location.protocol)
        && location.hostname !== '') {
      var payload = { text: buildText(flat), page: location.href };
      if (extra) {
        Object.keys(extra).forEach(function (k) { payload[k] = extra[k]; });
      }
      out.local = post(CONFIG.local.path,
        payload, { 'Content-Type': 'application/json' }, true);
    }

    return Promise.all([out.mail, out.push, out.local]).then(function (r) {
      return { mail: !!r[0] && r[0].ok !== false, push: !!r[1], local: !!r[2] };
    });
  }

  /* ---------- вспомогательное ---------- */

  function flatten(fields) {
    var flat = {};
    if (!fields) return flat;
    Object.keys(fields).forEach(function (k) {
      var v = fields[k];
      flat[k] = (v === null || v === undefined) ? '' : String(v);
    });
    return flat;
  }

  function buildText(flat) {
    return Object.keys(flat).map(function (k) {
      return k + ': ' + flat[k];
    }).join('\n');
  }

  function buildPushText(flat) {
    var parts = [];
    Object.keys(flat).forEach(function (k, i) {
      if (i >= 3) return;                       // в пуше только главное
      var v = flat[k];
      if (!v) return;
      parts.push(v.length > 90 ? v.slice(0, 90) + '…' : v);
    });
    return parts.join('\n') || 'Есть результат';
  }

  global.Deliver = { send: send, config: CONFIG };

  // Для страницы, где записана отправка через свой код
  if (typeof global.document !== 'undefined') {
    global.document.dispatchEvent &&
      global.document.dispatchEvent(new Event('deliver:ready'));
  }
})(typeof window !== 'undefined' ? window : this);
