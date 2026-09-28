(function (root) {
  'use strict';
  const ID = /^[a-f0-9]{32}$/;
  const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
  const TEXT_FIELDS = ['title', 'region', 'carrier', 'route', 'cargo', 'summary', 'scheduleNote'];
  const DATE_FIELDS = ['handoverDate', 'firstLegDate', 'secondLegDate'];
  const ALL_DATE_FIELDS = [...DATE_FIELDS, 'validUntil', 'checkedAt', 'cutoffAt'];
  const INQUIRY_NOTE = '具体日期、舱位及接受条件请联系确认';
  const STATUS = {active: '当前在推', inquiry: '询价确认', paused: '已暂停', expired: '已过期', pending: '待确认'};
  function validDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  }
  function validTime(value) {
    return typeof value === 'string' && TIME.test(value) && validDate(value.slice(0, 10)) &&
      Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60 &&
      (value[16] !== ':' || Number(value.slice(17, 19)) < 60) && Number.isFinite(Date.parse(value));
  }
  function effectiveStatus(item, now = Date.now()) {
    if (item.status === 'paused') return 'paused';
    if (item.status === 'expired') return 'expired';
    if (item.status === 'inquiry') return 'inquiry';
    if (item.status !== 'active') return 'pending';
    return validTime(item.validUntil) && Date.parse(item.validUntil) > Number(now) ? 'active' : 'expired';
  }
  function publicProduct(value) {
    if (!value || typeof value !== 'object' || !ID.test(value.id) ||
      !['active', 'inquiry', 'paused', 'expired'].includes(value.status) ||
      !TEXT_FIELDS.every(key => typeof value[key] === 'string') || value.priceText !== '单票询价') return null;
    const noDates = ALL_DATE_FIELDS.every(key => value[key] === '');
    if (value.status === 'inquiry' ? !noDates : !(value.status === 'paused' && noDates) && (
      !DATE_FIELDS.every(key => value[key] === '' || validDate(value[key])) ||
      !DATE_FIELDS.some(key => validDate(value[key])) || !validTime(value.validUntil) || !validTime(value.checkedAt) ||
      !(value.cutoffAt === '' || validTime(value.cutoffAt)) ||
      (value.cutoffAt && Date.parse(value.validUntil) > Date.parse(value.cutoffAt)))) return null;
    const product = {id: value.id, status: value.status, priceText: '单票询价'};
    for (const key of [...TEXT_FIELDS, ...DATE_FIELDS, 'validUntil', 'checkedAt', 'cutoffAt']) product[key] = value[key];
    return product;
  }
  function readCatalog(value) {
    if (!value || value.schemaVersion !== 1 || !Array.isArray(value.items) || typeof value.revision !== 'string' || !validTime(value.generatedAt)) throw Error('产品数据格式不完整');
    return value.items.map(publicProduct).filter(Boolean);
  }
  function filterProducts(items, filters = {}, now = Date.now()) {
    const query = String(filters.search || '').trim().toLocaleLowerCase();
    return items.filter(item => ['active', 'inquiry'].includes(effectiveStatus(item, now)) &&
      (!filters.region || item.region === filters.region) && (!filters.carrier || item.carrier === filters.carrier) &&
      (!query || TEXT_FIELDS.map(key => item[key] || '').join(' ').toLocaleLowerCase().includes(query)));
  }
  function toChinaInput(value) {
    if (!validTime(value)) return '';
    return new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 19);
  }
  function fromChinaInput(value) {
    if (!value) return '';
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value) || !validDate(value.slice(0, 10))) throw Error('请填写完整日期和时间（北京时间）');
    const result = value + (value.length === 16 ? ':00' : '') + '+08:00';
    if (!validTime(result)) throw Error('日期或时间无效');
    return result;
  }
  function formatTime(value) {
    if (!validTime(value)) return '未填写';
    return new Intl.DateTimeFormat('zh-CN', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false}).format(new Date(value)) + '（北京时间）';
  }
  function inquiryTemplate(item, now = Date.now()) {
    const product = publicProduct(item);
    if (!product) return '';
    const lines = ['您好，我想咨询以下空运产品：', '产品编号：' + product.id, '产品：' + product.title,
      '航司：' + product.carrier, '路线：' + product.route, '适用货物：' + product.cargo];
    for (const [key, label] of [['handoverDate', '交货/收货日期'], ['firstLegDate', '头程日期'], ['secondLegDate', '二程日期']]) if (product[key]) lines.push(label + '：' + product[key]);
    if (product.summary) lines.push('产品说明：' + product.summary);
    if (product.scheduleNote) lines.push('计划说明：' + product.scheduleNote);
    if (ALL_DATE_FIELDS.every(key => product[key] === '')) lines.push(INQUIRY_NOTE + '。');
    lines.push('页面状态：' + STATUS[effectiveStatus(product, now)], '价格：单票询价', '',
      '品名：', '件数：', '毛重（kg）：', '尺寸 / 体积（CBM）：', '计划交货日期：', '特殊属性 / 包装：', '',
      ['active', 'inquiry'].includes(effectiveStatus(product, now)) ? '请按以上货物信息确认日期、价格、舱位及接受条件。' : '请重新确认此路线的安排，或提供替代方案。',
      '此模板用于询价，不构成预订。');
    return lines.join('\n');
  }
  const api = {validDate, validTime, effectiveStatus, publicProduct, readCatalog, filterProducts, toChinaInput, fromChinaInput, formatTime, inquiryTemplate};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CargoProducts = api;
  if (typeof document === 'undefined') return;
  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function contact(text = '联系微信询价 ↗') { const link = el('a', text, 'product-contact'); link.href = 'wechat.html'; return link; }
  function detailsLink(product, text = '查看产品详情 ↗') {
    const link = el('a', text); link.href = 'products.html?product=' + encodeURIComponent(product.id); return link;
  }
  function addFact(target, label, value) {
    if (!value) return;
    const row = el('div'); row.append(el('dt', label), el('dd', value)); target.append(row);
  }
  function renderDates(target, item, expanded) {
    if (ALL_DATE_FIELDS.every(key => item[key] === '')) { addFact(target, '安排确认', INQUIRY_NOTE); return; }
    addFact(target, '交货 / 收货', item.handoverDate);
    addFact(target, '头程日期', item.firstLegDate);
    addFact(target, '二程日期', item.secondLegDate);
    if (expanded) addFact(target, '交仓截止', item.cutoffAt ? formatTime(item.cutoffAt) : '按单确认');
    addFact(target, '推荐有效至', formatTime(item.validUntil));
    addFact(target, '最近核对', formatTime(item.checkedAt));
  }
  function card(item, now) {
    const article = el('article', null, 'product-card');
    const top = el('div', null, 'product-card-top'); top.append(el('span', item.region + ' / ' + item.carrier, 'product-kicker'), el('span', STATUS[effectiveStatus(item, now)], 'product-badge'));
    const heading = el('h3'); heading.append(detailsLink(item, item.title));
    article.append(top, heading, el('p', item.route, 'product-route'), el('p', item.cargo, 'product-cargo'));
    if (item.summary) article.append(el('p', item.summary, 'product-summary'));
    const facts = el('dl', null, 'product-facts'); renderDates(facts, item, false); article.append(facts);
    const bottom = el('div', null, 'product-card-bottom'); bottom.append(el('span', '单票询价'), detailsLink(item)); article.append(bottom);
    return article;
  }
  function empty(target, message = '今日产品更新中，可联系询价') {
    const box = el('div', null, 'product-empty'); box.append(el('p', message), contact()); target.append(box);
  }
  async function start() {
    const home = document.querySelector('#home-products');
    const listing = document.querySelector('#product-items');
    const detail = document.querySelector('#product-detail');
    if (!home && !listing) return;
    const filters = document.querySelector('#product-filters');
    const status = document.querySelector('#product-count');
    const queryId = new URLSearchParams(location.search).get('product');
    let items = [], expiryTimer, loading = false, loaded = false, renderedDetailKey;
    const refreshButton = document.querySelector('#product-refresh');
    const loadStatus = document.querySelector('#product-load-status');
    function renderDetail(now) {
      const item = ID.test(queryId || '') && items.find(product => product.id === queryId);
      const state = item ? effectiveStatus(item, now) : null;
      const detailKey = JSON.stringify([item || null, state]);
      if (detailKey === renderedDetailKey) return;
      renderedDetailKey = detailKey;
      detail.replaceChildren();
      if (!item) { detail.append(el('h2', '此产品暂不可用')); empty(detail, '产品尚未公开、已撤回，或链接无效。'); return; }
      document.title = item.title + '｜每日产品｜冯瑞智 空运手记';
      const notice = el('p', state === 'active' ? '当前在推 · 具体价格、舱位与货物接受条件按单确认。' : state === 'inquiry' ? '询价确认 · 展示路线与适用货物；具体日期、舱位及接受条件请联系确认，不构成预订。' : state === 'paused' ? '此产品已暂停推荐。请联系确认替代安排。' : '此产品已过推荐有效期。请重新核对日期与安排。', 'product-notice ' + state);
      detail.append(notice, el('p', item.region + ' / ' + item.carrier, 'product-kicker'), el('h2', item.title), el('p', item.route, 'product-route'));
      if (item.summary) detail.append(el('p', item.summary, 'product-summary'));
      const facts = el('dl', null, 'product-facts product-detail-facts');
      addFact(facts, '适用货物与条件', item.cargo); renderDates(facts, item, true); addFact(facts, '计划说明', item.scheduleNote); addFact(facts, '价格', '单票询价'); addFact(facts, '产品编号', item.id); detail.append(facts);
      const inquiry = el('section', null, 'product-inquiry'); inquiry.append(el('h3', ['active', 'inquiry'].includes(state) ? '咨询此产品' : '咨询后续安排'), el('p', '复制以下模板，补充货物信息后通过微信联系。'));
      const template = el('textarea'); template.id = 'inquiry-template'; template.readOnly = true; template.rows = 12; template.setAttribute('aria-label', '询价模板'); template.value = inquiryTemplate(item, now);
      const copy = el('button', '复制询价模板', 'solid'); copy.type = 'button';
      const feedback = el('p', '', 'product-copy-status'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
      copy.addEventListener('click', async () => {
        template.value = inquiryTemplate(item, Date.now());
        try { if (!navigator.clipboard?.writeText) throw Error(); await navigator.clipboard.writeText(template.value); feedback.textContent = '已复制，可前往微信补充信息并询价。'; }
        catch { template.focus(); template.select(); feedback.textContent = '浏览器未允许自动复制，已选中模板，请手动复制。'; }
      });
      const actions = el('div', null, 'product-actions'); actions.append(copy, contact('打开微信联系入口 ↗')); inquiry.append(template, actions, feedback); detail.append(inquiry);
    }
    function render() {
      clearTimeout(expiryTimer);
      const now = Date.now();
      if (home) {
        home.replaceChildren(); const selected = filterProducts(items, {}, now).slice(0, 3);
        if (!selected.length) empty(home); else selected.forEach(item => home.append(card(item, now)));
      }
      if (listing) {
        if (queryId !== null) {
          filters.hidden = true; listing.hidden = true; status.hidden = true; detail.hidden = false; renderDetail(now);
        } else {
          listing.replaceChildren();
          const selected = filterProducts(items, {search: document.querySelector('#product-search').value, region: document.querySelector('#product-region').value, carrier: document.querySelector('#product-carrier').value}, now);
          status.textContent = '可询产品 ' + selected.length + ' 条';
          if (!selected.length) empty(listing, filterProducts(items, {}, now).length ? '没有符合当前筛选的产品，可调整条件或联系询价。' : undefined);
          else selected.forEach(item => listing.append(card(item, now)));
        }
      }
      const upcoming = items.filter(item => effectiveStatus(item, now) === 'active').map(item => Date.parse(item.validUntil) - now);
      if (upcoming.length) expiryTimer = setTimeout(render, Math.max(25, Math.min(...upcoming, 2147483000) + 25));
    }
    async function refreshCatalog() {
      if (loading) return;
      loading = true;
      if (refreshButton) refreshButton.disabled = true;
      try {
        const response = await fetch('products-data.json', {cache: 'no-store', credentials: 'same-origin'});
        if (!response.ok) throw Error('无法读取产品数据');
        const nextItems = readCatalog(await response.json());
        const changed = !loaded || JSON.stringify(nextItems) !== JSON.stringify(items);
        items = nextItems; loaded = true;
        if (filters) {
          for (const key of ['region', 'carrier']) {
            const select = document.querySelector('#product-' + key);
            const selected = select.value;
            const values = [...new Set(filterProducts(items).map(item => item[key]).filter(Boolean))];
            if (selected && !values.includes(selected)) values.push(selected);
            values.sort((a, b) => a.localeCompare(b, 'zh-CN'));
            const all = el('option', key === 'region' ? '全部地区' : '全部航司'); all.value = '';
            select.replaceChildren(all);
            for (const value of values) { const option = el('option', value); option.value = value; select.append(option); }
            select.value = selected;
          }
        }
        if (changed) render();
        if (loadStatus) loadStatus.textContent = '已读取最新公开版本；页面每分钟自动更新。';
      } catch {
        if (!loaded) {
          for (const target of [home, queryId !== null ? detail : listing].filter(Boolean)) { target.hidden = false; target.replaceChildren(); empty(target, '产品暂时无法加载，请稍后刷新或联系询价。'); }
          if (status) status.textContent = '产品数据暂不可用';
          if (queryId !== null && filters) { filters.hidden = true; listing.hidden = true; }
        }
        if (loadStatus) loadStatus.textContent = loaded ? '暂时无法读取更新，当前为上次读取的版本；请刷新或联系核对。' : '产品数据暂不可用，可点击刷新重试。';
      } finally {
        loading = false;
        if (refreshButton) refreshButton.disabled = false;
      }
    }
    if (filters) {
      filters.addEventListener('input', () => { if (loaded) render(); }); filters.addEventListener('change', () => { if (loaded) render(); }); filters.addEventListener('submit', event => event.preventDefault());
    }
    if (refreshButton) refreshButton.addEventListener('click', refreshCatalog);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (loaded) render(); refreshCatalog(); } });
    setInterval(() => { if (!document.hidden) refreshCatalog(); }, 60000);
    await refreshCatalog();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(typeof globalThis !== 'undefined' ? globalThis : this);
