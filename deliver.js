/*
 * deliver.js — единая отправка результатов формы: на почту и в приложение.
 *
 * Как использовать на новом сайте (3 шага):
 *   1. Скопировать этот файл рядом с index.html.
 *   2. Подключить: <script src="deliver.js"></script>
 *   3. После отправки формы вызвать:
 *        Deliver.send({
 *          'Заголовок формы': 'значение',
 *          'Результат': 'многострочный текст'
 *        });
 *
 * Куда уходит:
 *   - почта (FormSubmit, без ключей и регистрации);
 *   - пуш на телефон (ntfy, тот же канал, что у напоминаний);
 *   - локальный сервер, если страницу отдаёт server.py.
 *
 * Почему так, а не API-ключ:
 *   ключ в JS виден любому, кто откроет страницу. Здесь ключей нет вовсе —
 *   FormSubmit работает по адресу получателя, ntfy — по имени канала.
 *   Это не «защищённее на 100%»: канал ntfy и почта всё равно проходят через
 *   сторонние сервисы. Но красть из кода нечего.
 *
 * Ограничения:
 *   - FormSubmit нужно активировать один раз по ссылке из письма;
 *   - в пуше только первые три поля, длинный текст обрезается;
 *   - ntfy-топик работает как пароль: кто знает имя — читает ленту.
 */
(function (global) {
  'use strict';

  /* ================= НАСТРОЙКИ (менять только здесь) ================= */

  var CONFIG = {
    mail: {
      enabled: true,
      email: 'pavlov.artem2705@yandex.ru',
      subjectPrefix: 'Результат формы'
    },

    push: {
      enabled: true,
      server: 'https://ntfy.sh',
      topic: '',                    // имя канала ntfy; пусто = пуш выключен
      title: 'Новый результат',
      priority: 4,                  // 1..5, 4 = высокий
      tags: ['incoming_envelope']
    },

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
      }).then(function (r) { return r; })
        .catch(function () { return null; });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  function send(fields, extra) {
    var flat = flatten(fields);
    var jobs = { mail: Promise.resolve(null), push: Promise.resolve(null),
                 local: Promise.resolve(null) };

    if (CONFIG.mail.enabled && CONFIG.mail.email) {
      var mailBody = {
        _subject: CONFIG.mail.subjectPrefix + ' — ' +
                  new Date().toLocaleString('ru-RU'),
        _template: 'table'
      };
      Object.keys(flat).forEach(function (k) { mailBody[k] = flat[k]; });
      jobs.mail = post('https://formsubmit.co/ajax/' + CONFIG.mail.email,
        mailBody, { 'Content-Type': 'application/json', 'Accept': 'application/json' });
    }

    if (CONFIG.push.enabled && CONFIG.push.topic) {
      jobs.push = post(CONFIG.push.server, {
        topic: CONFIG.push.topic,
        title: CONFIG.push.title,
        message: buildPushText(flat),
        priority: CONFIG.push.priority,
        tags: CONFIG.push.tags
      }, { 'Content-Type': 'application/json' });
    }

    var isWeb = typeof location !== 'undefined' &&
                /^https?:$/.test(location.protocol) && location.hostname;
    if (CONFIG.local.enabled && isWeb) {
      var payload = { text: buildText(flat), page: location.href };
      if (extra) {
        Object.keys(extra).forEach(function (k) { payload[k] = extra[k]; });
      }
      jobs.local = post(CONFIG.local.path, payload,
                        { 'Content-Type': 'application/json' }, true);
    }

    return Promise.all([jobs.mail, jobs.push, jobs.local])
      .then(function (r) {
        return {
          mail: !!(r[0] && r[0].ok !== false),
          push: !!(r[1] && r[1].ok !== false),
          local: !!(r[2] && r[2].ok !== false)
        };
      });
  }

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
      if (i >= 3) return;
      var v = flat[k];
      if (!v) return;
      parts.push(v.length > 90 ? v.slice(0, 90) + '…' : v);
    });
    return parts.join('\n') || 'Есть результат';
  }

  global.Deliver = { send: send, config: CONFIG };
})(typeof window !== 'undefined' ? window : this);
