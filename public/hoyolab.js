(() => {
  'use strict';
  const token = location.hash.slice(1);
  history.replaceState(null, '', location.pathname);
  const byId = id => document.getElementById(id);
  const status = text => { byId('status').textContent = text; };
  const sections = ['login', 'captcha', 'email-step', 'success'];
  let busy = false, widget;
  function show(id) { for (const section of sections) byId(section).hidden = section !== id; }
  async function post(data) {
    const response = await fetch('/api/hoyolab', { method: 'POST', cache: 'no-store', credentials: 'omit',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(data) });
    let result;
    try { result = await response.json(); }
    catch { throw new Error('連携サーバーに接続できません。少し待ってからDiscordの連携ボタンで開き直してください。'); }
    if (!response.ok) throw new Error(result.error || '処理を完了できませんでした。');
    return result;
  }
  function script(url) {
    return new Promise((resolve, reject) => {
      const element = document.createElement('script'); element.src = url;
      element.onload = resolve; element.onerror = () => reject(new Error('画像認証を読み込めません。通信を確認してやり直してください。'));
      document.head.append(element);
    });
  }
  async function captcha(challenge) {
    show('captcha');
    widget?.destroy?.();
    const success = () => run(() => post({ action: 'captcha', result: widget.getValidate() }));
    if (challenge.version === 4) {
      if (!window.initGeetest4) await script('https://static.geetest.com/v4/gt4.js');
      window.initGeetest4({ captchaId: challenge.gt, product: 'bind', language: 'jpn',
        riskType: challenge.riskType, apiServers: ['gcaptcha4.captchami.com'] }, instance => {
        widget = instance; widget.onSuccess(success).onReady(() => widget.showCaptcha());
        byId('captcha-open').onclick = () => widget.showCaptcha();
      });
    } else {
      if (!window.initGeetest) await script('https://static.geetest.com/static/tools/gt.js');
      window.initGeetest({ gt: challenge.gt, challenge: challenge.challenge, new_captcha: challenge.newCaptcha,
        offline: !challenge.success, product: 'bind', https: true, lang: 'ja' }, instance => {
        widget = instance; widget.onSuccess(success).onReady(() => widget.verify());
        byId('captcha-open').onclick = () => widget.verify();
      });
    }
  }
  async function next(result) {
    if (result.step === 'captcha') return captcha(result.challenge);
    if (result.step === 'email') { show('email-step'); byId('code').focus(); return; }
    if (result.step === 'success') {
      widget?.destroy?.(); show('success');
      byId('account').textContent = 'HoYoLabとの連携が完了しました。';
      byId('complete').textContent = `UID ${result.uid} の所持キャラ${result.count}名を取得して保存しました。`;
    }
  }
  async function run(action) {
    if (busy) return;
    busy = true; status('処理中です…');
    for (const button of document.querySelectorAll('button')) button.disabled = true;
    try { await next(await action()); status(''); }
    catch (error) { status(error.message || '処理を完了できませんでした。'); byId('restart').hidden = false; }
    finally { busy = false; for (const button of document.querySelectorAll('button')) button.disabled = false; }
  }
  byId('login-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!byId('agree').checked) return;
    const email = byId('email').value.trim(), password = byId('password').value;
    // Clear plaintext fields before loading any third-party captcha script.
    byId('password').value = ''; byId('email').value = '';
    run(() => post({ action: 'login', email, password }));
  });
  byId('email-form').addEventListener('submit', event => {
    event.preventDefault(); const code = byId('code').value.trim(); byId('code').value = '';
    run(() => post({ action: 'email', code }));
  });
  byId('restart').addEventListener('click', () => { location.hash = token; location.reload(); });
  if (!/^[a-f0-9]{64}$/.test(token)) { status('Discordで /all-char の連携ボタンから開いてください。'); return; }
  post({ action: 'status' }).then(result => {
    byId('account').textContent = `登録UID ${result.uid} と紐づいているHoYoLabアカウントでログインしてください。`;
    show('login');
  }).catch(error => status(error.message));
})();
