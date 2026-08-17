/* ── About / Contact Form — Google Apps Script integration ── */
(function () {
  'use strict';

  var SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzIOeOXHQhj6OFbZe9ote9oCOINTfrCwTJzboCkaBdIHtXA2xegCiK2VpKVKF7XqQCL/exec';

  document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('ruangImajinasiForm');
    var btnKirim = document.getElementById('btnKirim');
    var btnLoading = document.getElementById('btnLoading');
    var myAlert = document.getElementById('myAlert');

    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      btnKirim.style.display = 'none';
      btnLoading.style.display = 'block';

      fetch(SCRIPT_URL, { method: 'POST', body: new FormData(form) })
        .then(function (response) {
          btnLoading.style.display = 'none';
          btnKirim.style.display = 'block';
          myAlert.style.display = 'block';
          form.reset();
          setTimeout(function () { myAlert.style.display = 'none'; }, 5000);
        })
        .catch(function (error) {
          console.error('[About] Error:', error.message);
          btnLoading.style.display = 'none';
          btnKirim.style.display = 'block';
        });
    });
  });
})();
