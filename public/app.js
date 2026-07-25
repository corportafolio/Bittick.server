/* ============================================
   BITTICK WEB - APP.JS v1.2.0
   Main application logic — Dashboard-first
   ============================================ */
(function(){
'use strict';

/* --- CONFIG --- */
var API_BASE = '';
var POLL_FAST = 60000;
var POLL_SLOW = 300000;
var SESSION_KEY = 'bittick_auth';
var SESSION_EXPIRY = 7 * 24 * 60 * 60 * 1000;
var VERSION = '1.2.0';
var TF_OPTIONS = [
  { label: '1M', value: '1m' }, { label: '5M', value: '5m' },
  { label: '15M', value: '15m' }, { label: '30M', value: '30m' },
  { label: '1H', value: '1h' }, { label: '4H', value: '4h' },
  { label: '1D', value: '1d' }
];

/* --- STATE --- */
var store = {
  state: {
    auth: {
      address: null,
      walletId: null,
      verified: false,
      inscriptions: [],
      selectedInscription: null,
      botNum: null,
      tier: null,
      botImageUrl: null,
      botName: null
    },
    trading: {
      opportunities: [],
      positions: { spot: [], futures: [] },
      botStatus: { spot: null, futures: null },
      currentPrice: 0,
      priceChange24h: 0,
      priceChangePercent: 0,
      klines: [],
      klinesType: 'spot',
      klinesInterval: '15m',
      loading: false,
      error: null,
      lastUpdate: null
    },
    settings: {
      apiKeys: { spot: { hasKey: false }, futures: { hasKey: false } },
      levels: { spot: [], futures: [] },
      preferences: {},
      editing: false,
      saving: false
    },
    ui: {
      currentRoute: '#/dashboard',
      sidebarOpen: false,
      rightPanelOpen: false,
      notifications: []
    }
  },
  subscribers: [],
  subscribe: function(fn) { this.subscribers.push(fn); },
  dispatch: function(action, payload) {
    var s = this.state;
    switch(action) {
      case 'SET_AUTH':
        Object.assign(s.auth, payload);
        break;
      case 'SET_TRADING':
        Object.assign(s.trading, payload);
        break;
      case 'SET_OPPORTUNITIES':
        s.trading.opportunities = payload;
        break;
      case 'SET_POSITIONS':
        if(payload.type === 'spot') s.trading.positions.spot = payload.data;
        else if(payload.type === 'futures') s.trading.positions.futures = payload.data;
        break;
      case 'SET_BOT_STATUS':
        if(payload.type === 'spot') s.trading.botStatus.spot = payload.data;
        else if(payload.type === 'futures') s.trading.botStatus.futures = payload.data;
        break;
      case 'SET_PRICE':
        s.trading.currentPrice = payload.price || 0;
        s.trading.priceChange24h = payload.priceChange || 0;
        s.trading.priceChangePercent = payload.priceChangePercent || 0;
        break;
      case 'SET_KLINES':
        s.trading.klines = payload;
        break;
      case 'SET_SETTINGS':
        Object.assign(s.settings, payload);
        break;
      case 'SET_API_KEYS':
        s.settings.apiKeys = payload;
        break;
      case 'SET_LEVELS':
        s.settings.levels = payload;
        break;
      case 'SET_PREFERENCES':
        s.settings.preferences = payload;
        break;
      case 'SET_ROUTE':
        s.ui.currentRoute = payload;
        break;
      case 'SET_LAST_UPDATE':
        s.trading.lastUpdate = payload;
        break;
    }
    this.notify(action);
  },
  notify: function(actionType) {
    var self = this;
    this.subscribers.forEach(function(fn) { fn(self.state, actionType); });
  }
};

/* --- DOM --- */
var $ = function(id) { return document.getElementById(id); };
var els = {};
function cacheDom() {
  ['header','menu-btn','logo','bot-info','btc-price','notif-btn','notif-badge',
    'right-panel','panel-close','backdrop','main-layout','sidebar','opportunities-list','opp-count',
    'content','account-view','wallet-selector-section','wallet-selector','login-loading','login-status',
    'login-error','login-error-msg','retry-btn','account-screen','wallet-card','preview-card',
    'inscription-count','inscription-list','account-loading','account-status','account-error','account-error-msg','account-retry-btn','account-close-btn',
    'dashboard-view','chart-section','timeframe-selector','chart-container','chart-info',
    'spot-positions-list','futures-positions-list',
    'bot-spot-content','bot-futures-content',
    'settings-view','settings-content',
    'wallet-info','wallet-address','disconnect-btn',
    'modal-overlay','modal-content','toast-container',
    'menu-account-btn','menu-account-text','menu-bot-img','header-bot-image','header-bot-img','header-bot-num'
  ].forEach(function(id) { els[id] = $(id); });
}

/* --- UTILS --- */
function formatPrice(n) { return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatPercent(n) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }
function truncateAddress(a) { return a ? a.slice(0, 8) + '...' + a.slice(-6) : ''; }
function botImage(num) { return '/bots/bot_' + String(num).padStart(2, '0') + '.png'; }

/* --- API CLIENT --- */
var api = {
  request: function(method, endpoint, body, auth) {
    var headers = { 'Content-Type': 'application/json' };
    if (auth && store.state.auth.address) {
      headers['x-wallet-address'] = store.state.auth.address;
    }
    var opts = { method: method, headers: headers };
    if (body) opts.body = JSON.stringify(body);
    return fetch(API_BASE + endpoint, opts)
      .then(function(r) {
        return r.json().then(function(json) {
          if (r.status === 300) return json;
          if (!json.exito) throw new Error(json.error || 'API error');
          return json;
        });
      });
  },
  get: function(ep, auth) { return api.request('GET', ep, null, auth); },
  post: function(ep, body, auth) { return api.request('POST', ep, body, auth); },
  del: function(ep, auth) { return api.request('DELETE', ep, null, auth); }
};

/* --- TOAST --- */
function toast(msg, type) {
  type = type || 'info';
  var t = document.createElement('div');
  t.className = 'toast ' + type;
  var icons = {
    success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>',
    error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F44336" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF9800" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2196F3" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };
  t.innerHTML = '<span class="toast-icon">' + (icons[type] || icons.info) + '</span><span class="toast-msg">' + msg + '</span>';
  els['toast-container'].appendChild(t);
  setTimeout(function() {
    t.style.opacity = '0';
    t.style.transform = 'translateX(24px)';
    setTimeout(function() { t.remove(); }, 300);
  }, 3500);
}

/* --- MODAL --- */
function showModal(html) {
  els['modal-content'].innerHTML = html;
  els['modal-overlay'].classList.remove('hidden');
}
function hideModal() {
  els['modal-overlay'].classList.add('hidden');
  els['modal-content'].innerHTML = '';
}

/* ============================================
   AUTH MODULE — Multi-wallet support
   ============================================ */
function detectInstalledWallets() {
  var unisat = !!window.unisat;
  var xverse = !!(window.XverseProviders || (window.satsconnect && window.satsconnect.Wallet));
  return { unisat: unisat, xverse: xverse };
}

function connectWallet(walletId) {
  if (walletId === 'unisat') {
    return window.unisat.requestAccounts().then(function(accs) {
      if (!accs || !accs.length) throw new Error('No se detectaron cuentas en UniSat');
      return accs[0];
    });
  }
  if (walletId === 'xverse') {
    return new Promise(function(resolve, reject) {
      var provider = window.XverseProviders && window.XverseProviders['xverse'];
      if (!provider) return reject(new Error('Xverse no está instalado'));
      provider.connect().then(function(response) {
        if (response.addresses && response.addresses.length) {
          var ord = response.addresses.find(function(a) { return a.purpose === 'ordinals'; });
          var pay = response.addresses.find(function(a) { return a.purpose === 'payment'; });
          resolve((ord || pay || response.addresses[0]).address);
        } else {
          reject(new Error('Conexión cancelada por el usuario'));
        }
      }).catch(function(err) {
        reject(new Error(err.message || 'Error conectando con Xverse'));
      });
    });
  }
  return Promise.reject(new Error('Wallet no soportada: ' + walletId));
}

function getNonce(address) {
  return api.get('/api/auth/nonce?address=' + encodeURIComponent(address), false)
    .then(function(json) {
      if (!json.exito) throw new Error(json.error || 'Error obteniendo nonce');
      return { nonce: json.data.nonce, message: json.data.message };
    });
}

function signMessage(walletId, message, address) {
  if (walletId === 'unisat') {
    // Detect Taproot (bc1p) and use BIP-322 simple format
    const sigType = address.startsWith('bc1p') ? 'bip322-simple' : 'ecdsa';
    return window.unisat.signMessage(message, sigType);
  }
  if (walletId === 'xverse') {
    return new Promise(function(resolve, reject) {
      var provider = window.XverseProviders && window.XverseProviders['xverse'];
      if (!provider) return reject(new Error('Xverse no está instalado'));
      provider.signMessage(message, address).then(function(response) {
        if (response.signature) {
          resolve(response.signature);
        } else {
          reject(new Error('Firma cancelada por el usuario'));
        }
      }).catch(function(err) {
        reject(new Error(err.message || 'Error firmando con Xverse'));
      });
    });
  }
  return Promise.reject(new Error('Wallet no soportada: ' + walletId));
}

function verifyWallet(address, signature, nonce) {
  return api.post('/api/auth/verify-wallet', { address: address, signature: signature, nonce: nonce }, false)
    .then(function(json) {
      if (!json.exito) throw new Error(json.error || 'Error verificando wallet');
      var d = json.data;
      if (!d.verified || d.count === 0) {
        throw new Error(d.message || 'Wallet no posee un Bittick Agent');
      }
      return d;
    });
}

function selectInscription(inscriptionId) {
  return api.post('/api/auth/select-inscription', { inscriptionId: inscriptionId }, true)
    .then(function(json) {
      if (!json.exito) throw new Error(json.error || 'Error seleccionando inscripción');
      return json.data;
    });
}

function saveSession() {
  var s = store.state;
  var session = {
    address: s.auth.address,
    walletId: s.auth.walletId,
    verified: s.auth.verified,
    inscriptions: s.auth.inscriptions,
    selectedInscription: s.auth.selectedInscription,
    botNum: s.auth.botNum,
    tier: s.auth.tier,
    botImageUrl: s.auth.botImageUrl,
    botName: s.auth.botName,
    expiresAt: Date.now() + SESSION_EXPIRY
  };
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch(e) {}
}

function restoreSession() {
  try {
    var raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    var session = JSON.parse(raw);
    if (Date.now() > session.expiresAt) {
      localStorage.removeItem(SESSION_KEY);
      return false;
    }
    store.dispatch('SET_AUTH', {
      address: session.address,
      walletId: session.walletId || null,
      verified: session.verified,
      inscriptions: session.inscriptions || [],
      selectedInscription: session.selectedInscription,
      botNum: session.botNum,
      tier: session.tier,
      botImageUrl: session.botImageUrl,
      botName: session.botName
    });
    // Update header and menu bot image
    updateHeaderBotImage();
    return true;
  } catch(e) {
    localStorage.removeItem(SESSION_KEY);
    return false;
  }
}

function disconnect() {
  store.dispatch('SET_AUTH', {
    address: null, walletId: null, verified: false, inscriptions: [],
    selectedInscription: null, botNum: null, tier: null,
    botImageUrl: null, botName: null
  });
  localStorage.removeItem(SESSION_KEY);
  polling.stop();
  closePanel();
  window.location.hash = '#/dashboard';
  toast('Wallet desconectada', 'info');
}

/* --- BOT IMAGE CACHE --- */
var BOT_IMAGE_CACHE_KEY = 'bittick_bot_images';
var BOT_IMAGE_CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 días

function getCachedBotImage(botNum) {
  try {
    var cache = JSON.parse(localStorage.getItem(BOT_IMAGE_CACHE_KEY) || '{}');
    var entry = cache[botNum];
    if (entry && Date.now() < entry.expiresAt) {
      return entry.base64;
    }
  } catch(e) {}
  return null;
}

function setCachedBotImage(botNum, base64) {
  try {
    var cache = JSON.parse(localStorage.getItem(BOT_IMAGE_CACHE_KEY) || '{}');
    cache[botNum] = {
      base64: base64,
      expiresAt: Date.now() + BOT_IMAGE_CACHE_EXPIRY
    };
    localStorage.setItem(BOT_IMAGE_CACHE_KEY, JSON.stringify(cache));
  } catch(e) {}
}

function fetchBotImage(botNum) {
  var cached = getCachedBotImage(botNum);
  if (cached) return Promise.resolve(cached);

  return api.get('/api/auth/bot-image/' + botNum + '.png', false)
    .then(function(json) {
      if (json.exito && json.data && json.data.base64) {
        setCachedBotImage(botNum, json.data.base64);
        return json.data.base64;
      }
      return null;
    })
    .catch(function() {
      return null;
    });
}

/* --- ACCOUNT SCREEN RENDER --- */
var previewInscription = null;

function renderAccountScreen() {
  var auth = store.state.auth;
  if (!auth.address || !auth.inscriptions || !auth.inscriptions.length) return;

  // Render wallet card (Burbuja 1)
  renderWalletCard();

  // Render preview card (Burbuja 2) if there's a preview inscription
  if (previewInscription) {
    renderPreviewCard(previewInscription);
  } else {
    var previewEl = els['preview-card'];
    if (previewEl) previewEl.classList.add('hidden');
  }

  // Render inscription list (Burbuja 3)
  renderInscriptionList();
}

function renderWalletCard() {
  var auth = store.state.auth;
  var cardEl = els['wallet-card'];
  if (!cardEl) return;

  var tier = auth.tier || 'STANDARD';
  var isPremium = tier === 'FOUNDER';
  var botNum = auth.botNum || (auth.inscriptions && auth.inscriptions[0] ? auth.inscriptions[0].num : null);
  var address = auth.address || '';
  var truncated = address.length > 18 ? address.substring(0, 8) + '...' + address.substring(address.length - 8) : address;

  var botImageHtml = '';
  if (botNum) {
    var cachedImage = getCachedBotImage(botNum);
    if (cachedImage) {
      botImageHtml = '<img src="data:image/png;base64,' + cachedImage + '" alt="Bot #' + botNum + '" class="wallet-card-bot-img">';
    } else {
      botImageHtml = '<div class="wallet-card-bot-img placeholder">#' + botNum + '</div>';
      // Fetch async
      fetchBotImage(botNum).then(function(base64) {
        if (base64 && store.state.auth.botNum === botNum) {
          var imgEl = cardEl.querySelector('.wallet-card-bot-img');
          if (imgEl) {
            imgEl.outerHTML = '<img src="data:image/png;base64,' + base64 + '" alt="Bot #' + botNum + '" class="wallet-card-bot-img">';
          }
        }
      });
    }
  }

  cardEl.innerHTML =
    '<div class="wallet-card-header">' +
      '<span class="wallet-card-title">Wallet conectada</span>' +
      '<span class="wallet-card-badge ' + (isPremium ? 'premium' : 'free') + '">' + (isPremium ? 'PREMIUM' : 'GRATIS') + '</span>' +
    '</div>' +
    (botNum ? '<div class="wallet-card-bot">' + botImageHtml + '<span class="wallet-card-bot-num">Bot #' + botNum + '</span></div>' : '') +
    '<div class="wallet-card-address">' + truncated + '</div>' +
    '<button id="disconnect-btn-account" class="btn btn-secondary btn-sm">Desconectar</button>';

  // Bind disconnect
  var disconnectBtn = cardEl.querySelector('#disconnect-btn-account');
  if (disconnectBtn) {
    disconnectBtn.onclick = function() { disconnect(); };
  }
}

function renderPreviewCard(insc) {
  var previewEl = els['preview-card'];
  if (!previewEl) return;

  var tier = insc.tier || 'STANDARD';
  var isPremium = tier === 'FOUNDER';
  var botNum = insc.num;
  var isSelected = store.state.auth.selectedInscription === insc.inscriptionId;

  var botImageHtml = '';
  var cachedImage = getCachedBotImage(botNum);
  if (cachedImage) {
    botImageHtml = '<img src="data:image/png;base64,' + cachedImage + '" alt="Bot #' + botNum + '" class="preview-card-bot-img">';
  } else {
    botImageHtml = '<div class="preview-card-bot-img placeholder">#' + botNum + '</div>';
    fetchBotImage(botNum).then(function(base64) {
      if (base64 && previewInscription && previewInscription.num === botNum) {
        var imgEl = previewEl.querySelector('.preview-card-bot-img');
        if (imgEl) {
          imgEl.outerHTML = '<img src="data:image/png;base64,' + base64 + '" alt="Bot #' + botNum + '" class="preview-card-bot-img">';
        }
      }
    });
  }

  previewEl.innerHTML =
    '<div class="preview-card-bot">' + botImageHtml + '</div>' +
    '<div class="preview-card-info">' +
      '<div class="preview-card-bot-num">🤖  Bot #' + botNum + '</div>' +
      '<div class="preview-card-tier ' + tier.toLowerCase() + '">' + tier + '</div>' +
    '</div>' +
    '<div class="preview-card-actions">' +
      '<span class="preview-card-badge ' + (isPremium ? 'premium' : 'free') + '">' + (isPremium ? 'PREMIUM' : 'GRATIS') + '</span>' +
      (isSelected ?
        '<span class="preview-card-selected">SELECCIONADO</span>' :
        '<button class="btn btn-cyan btn-sm" onclick="onUseBot(\'' + insc.inscriptionId + '\')">USAR</button>'
      ) +
    '</div>';

  previewEl.classList.remove('hidden');
}

function renderInscriptionList() {
  var auth = store.state.auth;
  var listEl = els['inscription-list'];
  var countEl = els['inscription-count'];
  if (!listEl || !auth.inscriptions) return;

  var inscriptions = auth.inscriptions;
  countEl.textContent = inscriptions.length + ' inscripción(es)';

  listEl.innerHTML = '';

  inscriptions.forEach(function(insc) {
    var isSelected = auth.selectedInscription === insc.inscriptionId;
    var isPreview = previewInscription && previewInscription.inscriptionId === insc.inscriptionId;

    var card = document.createElement('div');
    card.className = 'account-inscription-item' + (isSelected ? ' selected' : '') + (isPreview ? ' preview' : '');
    card.dataset.inscriptionId = insc.inscriptionId;

    var botNum = insc.num;
    var tier = insc.tier || 'STANDARD';
    var isPremium = tier === 'FOUNDER';

    var botImageHtml = '';
    var cachedImage = getCachedBotImage(botNum);
    if (cachedImage) {
      botImageHtml = '<img src="data:image/png;base64,' + cachedImage + '" alt="Bot #' + botNum + '" class="inscription-item-bot-img">';
    } else {
      botImageHtml = '<div class="inscription-item-bot-img placeholder">#' + botNum + '</div>';
      fetchBotImage(botNum).then(function(base64) {
        var imgEl = card.querySelector('.inscription-item-bot-img');
        if (imgEl && base64) {
          imgEl.outerHTML = '<img src="data:image/png;base64,' + base64 + '" alt="Bot #' + botNum + '" class="inscription-item-bot-img">';
        }
      });
    }

    card.innerHTML =
      '<div class="inscription-item-number">#' + botNum + '</div>' +
      '<div class="inscription-item-info">' +
        '<div class="inscription-item-name">Bot #' + botNum + '</div>' +
        '<div class="inscription-item-tier ' + tier.toLowerCase() + '">' + tier + '</div>' +
      '</div>' +
      (isSelected ? '<span class="inscription-item-check">✓</span>' : '');

    card.onclick = function() {
      setPreviewInscription(insc);
    };

    listEl.appendChild(card);
  });
}

function setPreviewInscription(insc) {
  previewInscription = insc;
  renderAccountScreen();
}

function onUseBot(inscriptionId) {
  var useBtn = document.querySelector('.preview-card-actions .btn-cyan');
  if (useBtn) {
    useBtn.disabled = true;
    useBtn.textContent = 'Seleccionando...';
  }

  selectInscription(inscriptionId)
    .then(function(selData) {
      store.dispatch('SET_AUTH', {
        selectedInscription: selData.selectedInscriptionId,
        botNum: selData.selectedBotNum,
        tier: selData.tier,
        botImageUrl: selData.botImageUrl,
        botName: 'Bot #' + selData.selectedBotNum
      });
      toast('Bot #' + selData.selectedBotNum + ' seleccionado', 'success');
      saveSession();
      previewInscription = null;
      // Update header and menu bot image
      updateHeaderBotImage();
      // Navigate to dashboard
      window.location.hash = '#/dashboard';
      // Start polling
      polling.fetchAll();
      polling.start();
    })
    .catch(function(err) {
      toast(err.message || 'Error seleccionando bot', 'error');
      if (useBtn) {
        useBtn.disabled = false;
        useBtn.textContent = 'USAR';
      }
    });
}

window.onUseBot = onUseBot;

function updateHeaderBotImage() {
  var auth = store.state.auth;
  var botNum = auth.botNum;
  var headerImg = document.getElementById('header-bot-img');
  var headerNum = document.getElementById('header-bot-num');
  var headerContainer = document.getElementById('header-bot-image');
  var menuImg = document.getElementById('menu-bot-img');
  var menuBtn = document.getElementById('menu-account-btn');
  var menuText = document.getElementById('menu-account-text');

  if (botNum) {
    var cachedImage = getCachedBotImage(botNum);
    if (cachedImage) {
      if (headerImg) headerImg.src = 'data:image/png;base64,' + cachedImage;
      if (menuImg) menuImg.src = 'data:image/png;base64,' + cachedImage;
    }
    if (headerContainer) headerContainer.classList.remove('hidden');
    if (menuImg) menuImg.classList.remove('hidden');
    if (headerNum) headerNum.textContent = '#' + botNum;
  } else {
    if (headerContainer) headerContainer.classList.add('hidden');
    if (menuImg) menuImg.classList.add('hidden');
  }
}

/* --- FULL LOGIN FLOW --- */
function fullLoginFlow(walletId) {
  var loading = els['login-loading'];
  var errorEl = els['login-error'];
  var statusEl = els['login-status'];
  var selectorEl = els['wallet-selector'];
  var walletSelectorSection = els['wallet-selector-section'];
  var accountScreen = els['account-screen'];
  var accountView = els['account-view'];

  if (selectorEl) selectorEl.classList.add('hidden');
  if (walletSelectorSection) walletSelectorSection.classList.add('hidden');
  if (accountScreen) accountScreen.classList.remove('hidden');
  if (accountView) accountView.classList.remove('hidden');

  loading.classList.remove('hidden');
  errorEl.classList.add('hidden');

  var address;
  var nonce;

  Promise.resolve()
    .then(function() {
      if (!walletId) throw new Error('Seleccioná una wallet para conectar');
      statusEl.textContent = 'Conectando wallet...';
      return connectWallet(walletId);
    })
    .then(function(addr) {
      address = addr;
      store.dispatch('SET_AUTH', { address: addr, walletId: walletId });
      statusEl.textContent = 'Obteniendo nonce...';
      return getNonce(addr);
    })
    .then(function(nonceData) {
      nonce = nonceData.nonce;
      statusEl.textContent = 'Firmando mensaje...';
      return signMessage(walletId, nonceData.message, address);
    })
    .then(function(signature) {
      statusEl.textContent = 'Verificando wallet...';
      return verifyWallet(address, signature, nonce);
    })
    .then(function(verifyData) {
      store.dispatch('SET_AUTH', {
        verified: verifyData.verified,
        inscriptions: verifyData.inscriptions || [],
        selectedInscription: verifyData.selectedInscriptionId,
        botNum: verifyData.selectedBotNum,
        tier: verifyData.tier,
        botImageUrl: verifyData.botImageUrl
      });

      if (verifyData.count === 1) {
        var insc = verifyData.inscriptions[0];
        statusEl.textContent = 'Seleccionando bot...';
        return selectInscription(insc.inscriptionId)
          .then(function(selData) {
            store.dispatch('SET_AUTH', {
              selectedInscription: selData.selectedInscriptionId,
              botNum: selData.selectedBotNum,
              tier: selData.tier,
              botImageUrl: selData.botImageUrl,
              botName: 'Bot #' + selData.selectedBotNum
            });
          });
      }
      return null;
    })
    .then(function() {
      loading.classList.add('hidden');
      // Render account screen after successful verification
      renderAccountScreen();
      // Update header and menu
      updateHeaderBotImage();
      // Show account screen, hide wallet selector
      if (walletSelectorSection) walletSelectorSection.classList.add('hidden');
      if (accountScreen) accountScreen.classList.remove('hidden');
    })
    .catch(function(err) {
      toast(err.message || 'Error en la conexión', 'error');
      loading.classList.add('hidden');
      if (selectorEl) selectorEl.classList.remove('hidden');
      if (walletSelectorSection) walletSelectorSection.classList.remove('hidden');
      if (accountScreen) accountScreen.classList.add('hidden');
      errorEl.classList.remove('hidden');
      els['login-error-msg'].textContent = err.message || 'Error desconocido';
    });
}

function showInscriptionSelect(inscriptions) {
  var selectEl = els['inscription-select'];
  var listEl = els['inscription-list'];
  var countEl = els['inscription-count'];
  var useBtn = els['use-bot-btn'];

  selectEl.classList.remove('hidden');
  countEl.textContent = inscriptions.length + ' inscripción(es) encontrada(s)';
  listEl.innerHTML = '';

  var selected = null;

  inscriptions.forEach(function(insc) {
    var card = document.createElement('div');
    card.className = 'inscr-item';
    card.dataset.inscriptionId = insc.inscriptionId;
    card.innerHTML =
      '<img src="' + botImage(insc.num) + '" alt="Bot #' + insc.num + '" onerror="this.style.display=\'none\'">' +
      '<div class="inscr-item-info">' +
        '<div class="inscr-item-name">Bot #' + insc.num + '</div>' +
        '<div class="inscr-item-tier ' + insc.tier.toLowerCase() + '">' + insc.tier + '</div>' +
        '<div class="inscr-item-id">' + insc.inscriptionId + '</div>' +
      '</div>';

    card.addEventListener('click', function() {
      listEl.querySelectorAll('.inscr-item').forEach(function(c) { c.classList.remove('selected'); });
      card.classList.add('selected');
      selected = insc.inscriptionId;
      useBtn.disabled = false;
    });

    listEl.appendChild(card);
  });

  useBtn.onclick = function() {
    if (!selected) return;
    useBtn.disabled = true;
    toast('Seleccionando bot...', 'info');
    selectInscription(selected)
      .then(function(selData) {
        store.dispatch('SET_AUTH', {
          selectedInscription: selData.selectedInscriptionId,
          botNum: selData.selectedBotNum,
          tier: selData.tier,
          botImageUrl: selData.botImageUrl,
          botName: 'Bot #' + selData.selectedBotNum
        });
        toast('Bot #' + selData.selectedBotNum + ' seleccionado', 'success');
        saveSession();
        selectEl.classList.add('hidden');
        window.location.hash = '#/dashboard';
      })
      .catch(function(err) {
        toast(err.message || 'Error seleccionando bot', 'error');
        useBtn.disabled = false;
      });
  };
}

/* ============================================
   POLLING
   ============================================ */
var polling = {
  intervals: {},
  active: false,

  start: function() {
    if (this.active) return;
    this.active = true;
    this.fetchAll();
    this.intervals.opportunities = setInterval(this.fetchOpportunities.bind(this), POLL_FAST);
    this.intervals.positions = setInterval(this.fetchPositions.bind(this), POLL_FAST);
    this.intervals.price = setInterval(this.fetchPrice.bind(this), POLL_FAST);
    this.intervals.botStatus = setInterval(this.fetchBotStatus.bind(this), POLL_FAST);
    this.setupAdaptive();
  },

  stop: function() {
    var self = this;
    this.active = false;
    Object.keys(this.intervals).forEach(function(k) {
      clearInterval(self.intervals[k]);
    });
    this.intervals = {};
  },

  setupAdaptive: function() {
    var self = this;
    document.removeEventListener('visibilitychange', self._visHandler);
    self._visHandler = function() {
      if (document.hidden) self.slowDown();
      else self.speedUp();
    };
    document.addEventListener('visibilitychange', self._visHandler);
  },

  slowDown: function() {
    this.stop();
    this.intervals.opportunities = setInterval(this.fetchOpportunities.bind(this), POLL_SLOW);
    this.intervals.positions = setInterval(this.fetchPositions.bind(this), POLL_SLOW);
    this.intervals.price = setInterval(this.fetchPrice.bind(this), POLL_SLOW);
    this.intervals.botStatus = setInterval(this.fetchBotStatus.bind(this), POLL_SLOW);
    this.active = true;
  },

  speedUp: function() {
    this.stop();
    this.start();
  },

  fetchAll: function() {
    this.fetchOpportunities();
    this.fetchPositions();
    this.fetchPrice();
    this.fetchBotStatus();
  },

  fetchOpportunities: function() {
    var auth = !!store.state.auth.address;
    api.get('/api/trading/opportunities?limit=50', auth)
      .then(function(json) {
        store.dispatch('SET_OPPORTUNITIES', json.data || []);
      })
      .catch(function(e) { console.error('Poll opportunities:', e); });
  },

  fetchPositions: function() {
    var types = ['spot', 'futures'];
    var auth = !!store.state.auth.address;
    if (!auth) return;
    types.forEach(function(type) {
      api.get('/api/trading/positions?status=open&type=' + type, true)
        .then(function(json) {
          store.dispatch('SET_POSITIONS', { type: type, data: json.data || [] });
        })
        .catch(function(e) { console.error('Poll positions ' + type + ':', e); });
    });
  },

  fetchPrice: function() {
    api.get('/api/chart/ticker', false)
      .then(function(json) {
        if (json.exito && json.data) {
          store.dispatch('SET_PRICE', {
            price: parseFloat(json.data.price) || 0,
            priceChange: parseFloat(json.data.priceChange) || 0,
            priceChangePercent: parseFloat(json.data.priceChangePercent) || 0
          });
        }
      })
      .catch(function(e) { console.error('Poll price:', e); });
  },

  fetchBotStatus: function() {
    var id = store.state.auth.selectedInscription;
    if (!id) return;
    api.get('/api/trading/bot/status?inscriptionId=' + encodeURIComponent(id), true)
      .then(function(json) {
        if (json.exito && json.data) {
          store.dispatch('SET_BOT_STATUS', { type: 'spot', data: json.data.spot || null });
          store.dispatch('SET_BOT_STATUS', { type: 'futures', data: json.data.futures || null });
        }
        store.dispatch('SET_LAST_UPDATE', new Date());
      })
      .catch(function(e) { console.error('Poll bot status:', e); });
  }
};

/* ============================================
   VIEWS & NAVIGATION
   ============================================ */
function isPremium() {
  return store.state.auth.verified && store.state.auth.selectedInscription;
}

function showView(view) {
  var isAccount = view === 'account';
  var isDashboard = view === 'dashboard';
  var isSettings = view === 'settings';

  if (els['account-view']) els['account-view'].classList.toggle('hidden', !isAccount);
  if (els['dashboard-view']) els['dashboard-view'].classList.toggle('hidden', !isDashboard);
  if (els['settings-view']) els['settings-view'].classList.toggle('hidden', !isSettings);

  /* Update menu text based on auth state */
  updateMenuAuthState();
}

/* Update menu based on auth state */
function updateMenuAuthState() {
  var auth = store.state.auth;
  var isConnected = auth.address && auth.verified;
  var connectText = document.getElementById('menu-account-text');
  var menuBtn = document.getElementById('menu-account-btn');
  var walletInfo = document.getElementById('wallet-info');
  var walletAddress = document.getElementById('wallet-address');

  if (isConnected) {
    if (connectText) connectText.textContent = 'Cuenta Bittick';
    if (menuBtn) menuBtn.setAttribute('data-nav', '#/account');
    if (walletInfo) walletInfo.classList.remove('hidden');
    if (walletAddress) walletAddress.textContent = truncateAddress(auth.address);
  } else {
    if (connectText) connectText.textContent = 'Conectar Wallet';
    if (menuBtn) menuBtn.setAttribute('data-nav', '#/account');
    if (walletInfo) walletInfo.classList.add('hidden');
  }
}

function onHashChange() {
  var hash = window.location.hash || '#/dashboard';
  var route = hash.replace('#/', '') || 'dashboard';

  if (route === 'settings' && !isPremium()) {
    toast('Conecta una wallet para acceder a ajustes', 'warning');
    window.location.hash = '#/dashboard';
    return;
  }

  store.dispatch('SET_ROUTE', hash);
  showView(route);

  if (route === 'dashboard') {
    loadDashboardData();
    polling.start();
  } else if (route === 'settings') {
    loadSettingsData();
    polling.stop();
  } else if (route === 'account') {
    polling.stop();
    // Render account screen if connected
    if (store.state.auth.address && store.state.auth.verified) {
      renderAccountScreen();
    }
  }
}

/* ============================================
   DASHBOARD
   ============================================ */
function loadDashboardData() {
  updateHeader();
  loadChart();
  polling.fetchAll();
}

function updateHeader() {
  var auth = store.state.auth;
  var botInfoEl = els['bot-info'];
  if (auth.botNum) {
    var tierColor = auth.tier === 'FOUNDER' ? 'color:var(--accent)' : '';
    botInfoEl.innerHTML =
      '<img src="' + (auth.botImageUrl || botImage(auth.botNum)) + '" alt="Bot" onerror="this.style.display=\'none\'">' +
      '<span style="' + tierColor + '">Bot #' + auth.botNum + ' · ' + (auth.tier || 'STANDARD') + '</span>';
  } else {
    botInfoEl.innerHTML = '<span style="color:var(--text-muted)">Free Tier</span>';
  }
  renderBtcPrice();
  // Update header bot image and menu
  updateHeaderBotImage();
  updateMenuAuthState();
}

function renderBtcPrice() {
  var el = els['btc-price'];
  if (!el) return;
  var price = store.state.trading.currentPrice;
  if (price) {
    el.textContent = formatPrice(price);
  } else {
    el.textContent = '---';
  }
}

/* --- CHART --- */
function buildTimeframeSelector() {
  var tf = els['timeframe-selector'];
  if (!tf) return;
  tf.innerHTML = TF_OPTIONS.map(function(t) {
    return '<button class="tf-btn' + (t.value === store.state.trading.klinesInterval ? ' active' : '') + '" data-tf="' + t.value + '">' + t.label + '</button>';
  }).join('');
  tf.querySelectorAll('.tf-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      tf.querySelectorAll('.tf-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      store.state.trading.klinesInterval = btn.dataset.tf;
      loadChart();
    });
  });
}

function loadChart() {
  var container = els['chart-container'];
  if (!container) return;

  if (!isPremium()) {
    container.innerHTML =
      '<div class="chart-placeholder">' +
        '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>' +
        '<span>Conecta wallet para ver el gráfico</span>' +
      '</div>';
    els['chart-info'].innerHTML = '';
    return;
  }

  var interval = store.state.trading.klinesInterval;
  var type = store.state.trading.klinesType;
  api.get('/api/chart/klines?interval=' + interval + '&limit=200&type=' + type, false)
    .then(function(json) {
      if (json.exito && json.data) {
        store.dispatch('SET_KLINES', json.data);
        renderChart(json.data);
      }
    })
    .catch(function(e) { console.error('Chart error:', e); });
}

function renderChart(data) {
  if (typeof BittickChart !== 'undefined') {
    BittickChart.render(els['chart-container'], data, {
      upColor: '#4CAF50', downColor: '#F44336',
      borderVisible: false, wickUpColor: '#4CAF50', wickDownColor: '#F44336'
    });
  }
  renderChartInfo(data);
}

function renderChartInfo(data) {
  var info = els['chart-info'];
  if (!info || !data || !data.length) return;
  var last = data[data.length - 1];
  var first = data[0];
  var change = ((last.close - first.open) / first.open * 100).toFixed(2);
  var isUp = last.close >= first.open;
  var color = isUp ? 'var(--positive)' : 'var(--negative)';
  info.innerHTML =
    '<span>BTCUSDT</span>' +
    '<span style="color:' + color + '">O: ' + formatPrice(first.open) + '</span>' +
    '<span style="color:' + color + '">C: ' + formatPrice(last.close) + ' (' + (isUp ? '+' : '') + change + '%)</span>' +
    '<span>V: ' + Number(data.reduce(function(s, k) { return s + k.volume; }, 0)).toLocaleString('en-US', { maximumFractionDigits: 0 }) + '</span>';
}

/* --- OPPORTUNITIES (filtered for free tier) --- */
function renderOpportunities() {
  var list = els['opportunities-list'];
  var countEl = els['opp-count'];
  if (!list) return;

  var opps = store.state.trading.opportunities || [];
  var premium = isPremium();

  if (!premium) {
    opps = opps.filter(function(opp) {
      var score = parseFloat(opp.score || 0);
      var conf = parseFloat(opp.confidence || 0);
      return score >= 5 && score <= 6 && conf >= 5 && conf <= 6;
    });
  }

  if (countEl) countEl.textContent = opps.length;

  if (!opps.length) {
    var msg = premium
      ? 'No hay oportunidades en este momento'
      : 'Conecta un Bittick Agent para ver oportunidades score 7+';
    safeSetHTML(list, '<p class="empty-text" style="padding:32px 0">' + msg + '</p>');
    return;
  }

  var newHTML = opps.map(function(opp) {
    var strategyType = opp.strategyType || '';
    var botType = opp.bot_type || 'futures';
    var asset = opp.asset || '';
    var currentPrice = parseFloat(opp.currentPrice || 0);
    var entryZone = opp.entryZone || '';
    var target = parseFloat(opp.target || 0);
    var stopLoss = parseFloat(opp.stop_loss || 0);
    var score = parseFloat(opp.score || 0);
    var confidence = parseFloat(opp.confidence || 0);
    var isUp = strategyType.indexOf('long') >= 0 || strategyType.indexOf('buy') >= 0;
    var strategyColor = isUp ? 'var(--positive)' : 'var(--negative)';

    var etiqueta = 'LONG';
    if (botType === 'spot') {
      etiqueta = 'SPOT';
    } else if (strategyType.indexOf('short') >= 0) {
      etiqueta = 'SHORT';
    }

    var nivel = Math.min(score, confidence);
    var dotColor = '#e74c3c';
    if (score >= 8 && confidence >= 8) {
      dotColor = '#2ecc71';
    } else if (nivel >= 7) {
      dotColor = '#f39c12';
    }

    var fechaHTML = '';
    if (opp.created_at) {
      var oppDate = new Date(opp.created_at);
      var now = new Date();
      var esHoy = oppDate.toDateString() === now.toDateString();
      var hora = oppDate.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
      var fechaTxt = esHoy ? 'Hoy' : oppDate.toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: '2-digit' });
      fechaHTML = '<div class="opp-card-footer">' +
        '<span class="opp-card-time">' + hora + '</span>' +
        '<span class="opp-card-date">' + fechaTxt + '</span>' +
      '</div>';
    }

    return '<div class="opp-card" data-id="' + (opp.id || '') + '">' +
      '<div class="opp-card-header">' +
        '<span class="opp-card-label" style="' + strategyColor + '">' + etiqueta + '</span>' +
        '<span class="opp-card-symbol">' + asset + '</span>' +
        '<span class="opp-card-dot" style="background:' + dotColor + '"></span>' +
      '</div>' +
      '<div class="opp-card-price">' + formatPrice(currentPrice) + '</div>' +
      '<div class="opp-card-changes">' +
        '<span class="opp-card-change" style="color:var(--accent)">Score: ' + score.toFixed(1) + '</span>' +
        '<span class="opp-card-change" style="color:var(--text-secondary)">Conf: ' + confidence.toFixed(0) + '</span>' +
      '</div>' +
      (entryZone ? '<div class="opp-card-spot">Entry: ' + entryZone + '</div>' : '') +
      (target ? '<div class="opp-card-spot">Target: ' + formatPrice(target) + '</div>' : '') +
      (botType === 'futures' && stopLoss ? '<div class="opp-card-spot">Stop Loss: ' + formatPrice(stopLoss) + '</div>' : '') +
      fechaHTML +
    '</div>';
  }).join('');

  safeSetHTML(list, newHTML);

  list.querySelectorAll('.opp-card').forEach(function(card) {
    card.addEventListener('click', function() {
      list.querySelectorAll('.opp-card').forEach(function(c) { c.classList.remove('active'); });
      card.classList.add('active');
    });
  });
}

/* --- HELPER: skip innerHTML if same --- */
function safeSetHTML(el, html) {
  if (el.innerHTML === html) return;
  el.innerHTML = html;
}

/* --- POSITIONS --- */
function renderSpotPositions() {
  var el = els['spot-positions-list'];
  if (!el) return;
  var positions = store.state.trading.positions.spot || [];
  if (!positions.length) {
    safeSetHTML(el, '<p class="empty-text">Sin posiciones abiertas</p>');
    return;
  }
  safeSetHTML(el, positions.map(renderPositionItem).join(''));
}

function renderFuturesPositions() {
  var el = els['futures-positions-list'];
  if (!el) return;
  var positions = store.state.trading.positions.futures || [];
  if (!positions.length) {
    safeSetHTML(el, '<p class="empty-text">Sin posiciones abiertas</p>');
    return;
  }
  safeSetHTML(el, positions.map(renderPositionItem).join(''));
}

function renderPositionItem(p) {
  var pnl = parseFloat(p.unrealizedProfit || p.pnl || 0);
  var pnlPct = parseFloat(p.unrealizedProfitPercent || p.pnlPct || 0);
  var side = (p.side || 'LONG').toUpperCase();
  var isPos = pnl >= 0;
  return '<div class="pos-item">' +
    '<div class="pos-item-left">' +
      '<span class="pos-item-symbol">' + (p.symbol || '') + '</span>' +
      '<span class="pos-item-side ' + side.toLowerCase() + '">' + side + '</span>' +
    '</div>' +
    '<div class="pos-item-right">' +
      '<span class="pos-item-pnl ' + (isPos ? 'positive' : 'negative') + '">' + (isPos ? '+' : '') + pnl.toFixed(2) + ' USDT</span>' +
      '<span class="pos-item-pnl-pct">(' + (isPos ? '+' : '') + pnlPct.toFixed(2) + '%)</span>' +
      '<div class="pos-item-qty">Qty: ' + (p.quantity || p.qty || '0') + '</div>' +
    '</div>' +
  '</div>';
}

/* --- BOT STATUS --- */
function renderBotStatus() {
  var premium = isPremium();
  if (!premium) {
    var spotEl = els['bot-spot-content'];
    var futuresEl = els['bot-futures-content'];
    var freeBotHTML =
      '<div class="bot-row"><span class="bot-label">Estado</span><span class="bot-value stopped"><span class="status-dot red"></span>Inactivo</span></div>' +
      '<div class="bot-row"><span class="bot-label">API Keys</span><span class="bot-value stopped">Sin configurar</span></div>' +
      '<div class="bot-row"><span class="bot-label">Tier</span><span class="bot-value">Free</span></div>' +
      '<div class="bot-row"><span class="bot-label">Acción</span><span class="bot-value" style="color:var(--accent);font-size:.75rem">Conecta wallet para activar</span></div>';
    if (spotEl) safeSetHTML(spotEl, freeBotHTML);
    if (futuresEl) safeSetHTML(futuresEl, freeBotHTML);
    return;
  }
  renderBotCard('bot-spot-content', store.state.trading.botStatus.spot, 'spot');
  renderBotCard('bot-futures-content', store.state.trading.botStatus.futures, 'futures');
}

function renderBotCard(elId, status, type) {
  var el = els[elId];
  if (!el) return;
  if (!status) {
    safeSetHTML(el, '<p class="empty-text">Conecta wallet para ver estado</p>');
    return;
  }

  var enabled = status.enabled || false;
  var hasApiKey = status.hasApiKey || false;
  var maxPositions = status.maxPositions || 0;
  var positionSize = status.positionSizeUsdt || 0;
  var openPositions = status.openPositions || 0;
  var totalPnl = parseFloat(status.totalPnl || 0);
  var balance = status.balance || {};
  var balanceAvail = balance.available != null ? parseFloat(balance.available) : 0;
  var balanceTotal = balance.total != null ? parseFloat(balance.total) : 0;
  var dotClass = enabled ? 'green' : 'red';
  var valueClass = enabled ? 'running' : 'stopped';
  var modeLabel = enabled ? 'Activo' : 'Detenido';

  safeSetHTML(el,
    '<div class="bot-row"><span class="bot-label">Estado</span><span class="bot-value ' + valueClass + '"><span class="status-dot ' + dotClass + '"></span>' + modeLabel + '</span></div>' +
    '<div class="bot-row"><span class="bot-label">API Keys</span><span class="bot-value ' + (hasApiKey ? 'running' : 'stopped') + '">' + (hasApiKey ? 'Configuradas' : 'Sin configurar') + '</span></div>' +
    '<div class="bot-row"><span class="bot-label">Tier</span><span class="bot-value accent">' + (store.state.auth.tier || 'STANDARD') + '</span></div>' +
    '<div class="bot-row"><span class="bot-label">Posiciones abiertas</span><span class="bot-value">' + openPositions + '/' + maxPositions + '</span></div>' +
    '<div class="bot-row"><span class="bot-label">Tamaño posición</span><span class="bot-value">' + positionSize + ' USDT</span></div>' +
    '<div class="bot-row"><span class="bot-label">PnL total</span><span class="bot-value ' + (totalPnl >= 0 ? 'running' : 'stopped') + '">' + (totalPnl >= 0 ? '+' : '') + totalPnl.toFixed(2) + ' USDT</span></div>' +
    '<div class="bot-row"><span class="bot-label">Balance disponible</span><span class="bot-value">' + (balanceAvail > 0 ? formatPrice(balanceAvail) : '---') + '</span></div>' +
    '<div class="bot-row"><span class="bot-label">Balance total</span><span class="bot-value">' + (balanceTotal > 0 ? formatPrice(balanceTotal) : '---') + '</span></div>'
  );
}

/* ============================================
   SETTINGS
   ============================================ */
function loadSettingsData() {
  var auth = store.state.auth;
  if (!auth.selectedInscription) return;

  Promise.all([
    api.get('/api/trading/bot-apikey/' + auth.selectedInscription + '/status', true),
    api.get('/api/trading/strategies/levels/' + auth.selectedInscription, true),
    api.get('/api/trading/preferences/' + auth.selectedInscription, true)
  ]).then(function(results) {
    if (results[0] && results[0].exito) {
      store.dispatch('SET_API_KEYS', { spot: { hasKey: results[0].data.spot_api_key }, futures: { hasKey: results[0].data.futures_api_key } });
    }
    if (results[1] && results[1].exito) {
      store.dispatch('SET_LEVELS', results[1].data || { spot: [], futures: [] });
    }
    if (results[2] && results[2].exito) {
      store.dispatch('SET_PREFERENCES', results[2].data || {});
    }
    renderSettings();
  }).catch(function(e) {
    console.error('Load settings:', e);
    renderSettings();
  });
}

function renderSettings() {
  var el = els['settings-content'];
  if (!el) return;
  var auth = store.state.auth;
  var settings = store.state.settings;
  var addr = auth.address || '---';
  var inscId = auth.selectedInscription || '---';
  var tier = auth.tier || 'STANDARD';
  var botNum = auth.botNum || '??';

  el.innerHTML =
    '<div class="panel-card settings-card">' +
      '<h3>CUENTA BITTICK</h3>' +
      '<div class="settings-row">' +
        '<span class="settings-label">Bot</span>' +
        '<span class="settings-value"><img src="' + botImage(botNum) + '" alt="Bot" style="width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:6px" onerror="this.style.display=\'none\'">Bot #' + botNum + ' — ' + tier + '</span>' +
      '</div>' +
      '<div class="settings-row"><span class="settings-label">Wallet</span><span class="settings-value">' + truncateAddress(addr) + '</span></div>' +
      '<div class="settings-row"><span class="settings-label">Inscripción</span><span class="settings-value">' + (inscId.length > 20 ? inscId.slice(0, 12) + '...' + inscId.slice(-8) : inscId) + '</span></div>' +
    '</div>' +
    '<div class="panel-card settings-card">' +
      '<h3>PERMISOS</h3>' +
      '<div class="settings-row"><span class="settings-label">Notificaciones</span><span class="settings-value" id="s-notif-status">' + ('Notification' in window ? Notification.permission : 'No soportado') + '</span></div>' +
      '<button class="btn btn-secondary btn-sm" style="margin-top:8px" id="enable-notif-btn">ACTIVAR NOTIFICACIONES</button>' +
    '</div>' +
    '<div class="panel-card settings-card">' +
      '<h3>CLAVES API BINANCE</h3>' +
      '<div class="settings-row"><span class="settings-label">Spot</span><span class="settings-value ' + (settings.apiKeys.spot?.hasKey ? 'positive' : 'negative') + '">' + (settings.apiKeys.spot?.hasKey ? 'Configurada' : 'Sin configurar') + '</span></div>' +
      '<div class="settings-row"><span class="settings-label">Futuros</span><span class="settings-value ' + (settings.apiKeys.futures?.hasKey ? 'positive' : 'negative') + '">' + (settings.apiKeys.futures?.hasKey ? 'Configurada' : 'Sin configurar') + '</span></div>' +
      '<button class="btn btn-secondary btn-sm" style="margin-top:8px" id="edit-apikeys-btn">EDITAR CLAVES</button>' +
      '<div id="apikeys-form" class="hidden">' +
        '<div class="settings-form">' +
          '<label style="color:var(--text-secondary);font-size:.75rem">SPOT</label>' +
          '<input type="text" class="form-input" id="inp-spot-key" placeholder="Spot API Key">' +
          '<input type="password" class="form-input" id="inp-spot-secret" placeholder="Spot Secret Key">' +
          '<label style="color:var(--text-secondary);font-size:.75rem">FUTUROS</label>' +
          '<input type="text" class="form-input" id="inp-futures-key" placeholder="Futures API Key">' +
          '<input type="password" class="form-input" id="inp-futures-secret" placeholder="Futures Secret Key">' +
          '<div class="form-row">' +
            '<button class="btn btn-primary btn-sm" id="save-apikeys-btn">GUARDAR</button>' +
            '<button class="btn btn-secondary btn-sm" id="cancel-apikeys-btn">CANCELAR</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="panel-card settings-card">' +
      '<h3>NIVELES SPOT</h3>' +
      '<div id="spot-levels-content">' + renderLevelsTable(settings.levels.spot || [], 'spot') + '</div>' +
    '</div>' +
    '<div class="panel-card settings-card">' +
      '<h3>NIVELES FUTUROS</h3>' +
      '<div id="futures-levels-content">' + renderLevelsTable(settings.levels.futures || [], 'futures') + '</div>' +
    '</div>' +
    '<div class="panel-card settings-card">' +
      '<h3>PREFERENCIAS</h3>' +
      '<div class="settings-row"><span class="settings-label">Spot habilitado</span><div class="toggle-switch ' + (settings.preferences.spot_enabled ? 'on' : '') + '" data-toggle="spot_enabled"></div></div>' +
      '<div class="settings-row"><span class="settings-label">Futuros habilitado</span><div class="toggle-switch ' + (settings.preferences.futures_enabled ? 'on' : '') + '" data-toggle="futures_enabled"></div></div>' +
      '<div class="settings-row"><span class="settings-label">Tamaño posición Spot</span><span class="settings-value">' + (settings.preferences.spot_position_size || 10) + ' USDT</span></div>' +
      '<div class="settings-row"><span class="settings-label">Tamaño posición Futuros</span><span class="settings-value">' + (settings.preferences.futures_position_size || 10) + ' USDT</span></div>' +
      '<div class="settings-row"><span class="settings-label">Max posiciones Spot</span><span class="settings-value">' + (settings.preferences.spot_max_positions || 5) + '</span></div>' +
      '<div class="settings-row"><span class="settings-label">Max posiciones Futuros</span><span class="settings-value">' + (settings.preferences.futures_max_positions || 5) + '</span></div>' +
      '<div class="settings-row"><span class="settings-label">Min score Spot</span><span class="settings-value">' + (settings.preferences.spot_min_score || 6) + '</span></div>' +
      '<div class="settings-row"><span class="settings-label">Min score Futuros</span><span class="settings-value">' + (settings.preferences.futures_min_score || 7) + '</span></div>' +
      '<button class="btn btn-secondary btn-sm" style="margin-top:8px" id="edit-prefs-btn">EDITAR PREFERENCIAS</button>' +
      '<div id="prefs-form" class="hidden">' +
        '<div class="settings-form">' +
          '<label style="color:var(--text-secondary);font-size:.75rem">SPOT</label>' +
          '<input type="number" class="form-input" id="inp-spot-pos-size" placeholder="Tamaño posición Spot (USDT)" step="1" min="1">' +
          '<input type="number" class="form-input" id="inp-spot-max-pos" placeholder="Max posiciones Spot" step="1" min="1" max="20">' +
          '<input type="number" class="form-input" id="inp-spot-min-score" placeholder="Min score Spot" step="1" min="1" max="10">' +
          '<label style="color:var(--text-secondary);font-size:.75rem">FUTUROS</label>' +
          '<input type="number" class="form-input" id="inp-futures-pos-size" placeholder="Tamaño posición Futuros (USDT)" step="1" min="1">' +
          '<input type="number" class="form-input" id="inp-futures-max-pos" placeholder="Max posiciones Futuros" step="1" min="1" max="20">' +
          '<input type="number" class="form-input" id="inp-futures-min-score" placeholder="Min score Futuros" step="1" min="1" max="10">' +
          '<div class="form-row">' +
            '<button class="btn btn-primary btn-sm" id="save-prefs-btn">GUARDAR</button>' +
            '<button class="btn btn-secondary btn-sm" id="cancel-prefs-btn">CANCELAR</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="panel-card settings-card">' +
      '<h3>INFORMACIÓN</h3>' +
      '<div class="settings-row"><span class="settings-label">Versión</span><span class="settings-value">' + VERSION + '</span></div>' +
      '<div class="settings-row"><span class="settings-label">Última actualización</span><span class="settings-value">' + (store.state.trading.lastUpdate ? store.state.trading.lastUpdate.toLocaleTimeString() : '---') + '</span></div>' +
    '</div>';

  bindSettingsEvents();
}

function renderLevelsTable(levels, mode) {
  if (!levels || !levels.length) {
    levels = [
      { level: 10, enabled: 1, position_size_usdt: 10, min_score: 10, min_confidence: 10, leverage: 3 },
      { level: 9, enabled: 1, position_size_usdt: 20, min_score: 9, min_confidence: 9, leverage: 3 },
      { level: 8, enabled: 1, position_size_usdt: 40, min_score: 8, min_confidence: 8, leverage: 3 },
      { level: 7, enabled: 1, position_size_usdt: 20, min_score: 7, min_confidence: 7, leverage: 2 },
      { level: 6, enabled: 1, position_size_usdt: 10, min_score: 6, min_confidence: 6, leverage: 1 }
    ];
  }
  var html = '<table style="width:100%;font-size:.8rem;border-collapse:collapse">';
  html += '<tr style="color:var(--text-muted);text-align:left"><th>Lvl</th><th>On</th><th>Monto</th><th>Score</th><th>Conf</th><th>Lev</th></tr>';
  levels.forEach(function(l) {
    html += '<tr style="border-top:1px solid var(--border)">' +
      '<td>' + l.level + '</td>' +
      '<td><div class="toggle-switch ' + (l.enabled ? 'on' : '') + '" style="width:32px;height:18px" data-level="' + l.level + '" data-mode="' + mode + '"></div></td>' +
      '<td>' + l.position_size_usdt + '</td>' +
      '<td>' + l.min_score + '</td>' +
      '<td>' + l.min_confidence + '</td>' +
      '<td>' + l.leverage + 'x</td>' +
    '</tr>';
  });
  html += '</table>';
  html += '<button class="btn btn-primary btn-sm" style="margin-top:8px;width:100%" data-save-levels="' + mode + '">GUARDAR ' + mode.toUpperCase() + '</button>';
  return html;
}

function bindSettingsEvents() {
  var el = els['settings-content'];
  var auth = store.state.auth;
  var settings = store.state.settings;

  var notifBtn = el.querySelector('#enable-notif-btn');
  if (notifBtn) {
    notifBtn.addEventListener('click', function() {
      if ('Notification' in window) {
        Notification.requestPermission().then(function(perm) {
          el.querySelector('#s-notif-status').textContent = perm;
        });
      }
    });
  }

  var editApiBtn = el.querySelector('#edit-apikeys-btn');
  var apiForm = el.querySelector('#apikeys-form');
  if (editApiBtn && apiForm) {
    editApiBtn.addEventListener('click', function() { apiForm.classList.toggle('hidden'); });
  }
  var saveApiBtn = el.querySelector('#save-apikeys-btn');
  if (saveApiBtn) {
    saveApiBtn.addEventListener('click', function() {
      var spotKey = el.querySelector('#inp-spot-key')?.value || '';
      var spotSecret = el.querySelector('#inp-spot-secret')?.value || '';
      var futuresKey = el.querySelector('#inp-futures-key')?.value || '';
      var futuresSecret = el.querySelector('#inp-futures-secret')?.value || '';
      api.post('/api/trading/bot-apikey/all', {
        inscription_id: auth.selectedInscription,
        spot_key: spotKey, spot_secret: spotSecret,
        futures_key: futuresKey, futures_secret: futuresSecret
      }, true)
      .then(function() { toast('Claves API guardadas', 'success'); apiForm.classList.add('hidden'); loadSettingsData(); })
      .catch(function(e) { toast('Error: ' + e.message, 'error'); });
    });
  }
  var cancelApiBtn = el.querySelector('#cancel-apikeys-btn');
  if (cancelApiBtn) cancelApiBtn.addEventListener('click', function() { apiForm.classList.add('hidden'); });

  var editPrefsBtn = el.querySelector('#edit-prefs-btn');
  var prefsForm = el.querySelector('#prefs-form');
  if (editPrefsBtn && prefsForm) {
    editPrefsBtn.addEventListener('click', function() {
      prefsForm.classList.toggle('hidden');
      var p = settings.preferences;
      el.querySelector('#inp-spot-pos-size').value = p.spot_position_size || '';
      el.querySelector('#inp-spot-max-pos').value = p.spot_max_positions || '';
      el.querySelector('#inp-spot-min-score').value = p.spot_min_score || '';
      el.querySelector('#inp-futures-pos-size').value = p.futures_position_size || '';
      el.querySelector('#inp-futures-max-pos').value = p.futures_max_positions || '';
      el.querySelector('#inp-futures-min-score').value = p.futures_min_score || '';
    });
  }
  var savePrefsBtn = el.querySelector('#save-prefs-btn');
  if (savePrefsBtn) {
    savePrefsBtn.addEventListener('click', function() {
      var body = {
        inscriptionId: auth.selectedInscription, address: auth.address,
        spot_enabled: settings.preferences.spot_enabled || 1,
        futures_enabled: settings.preferences.futures_enabled || 1,
        spot_position_size: parseFloat(el.querySelector('#inp-spot-pos-size')?.value) || 10,
        futures_position_size: parseFloat(el.querySelector('#inp-futures-pos-size')?.value) || 10,
        spot_max_positions: parseInt(el.querySelector('#inp-spot-max-pos')?.value) || 5,
        futures_max_positions: parseInt(el.querySelector('#inp-futures-max-pos')?.value) || 5,
        spot_min_score: parseInt(el.querySelector('#inp-spot-min-score')?.value) || 6,
        futures_min_score: parseInt(el.querySelector('#inp-futures-min-score')?.value) || 7
      };
      api.post('/api/trading/preferences', body, true)
        .then(function() { toast('Preferencias guardadas', 'success'); prefsForm.classList.add('hidden'); loadSettingsData(); })
        .catch(function(e) { toast('Error: ' + e.message, 'error'); });
    });
  }
  var cancelPrefsBtn = el.querySelector('#cancel-prefs-btn');
  if (cancelPrefsBtn) cancelPrefsBtn.addEventListener('click', function() { prefsForm.classList.add('hidden'); });

  el.querySelectorAll('.toggle-switch[data-toggle]').forEach(function(tog) {
    tog.addEventListener('click', function() {
      var field = tog.dataset.toggle;
      var current = settings.preferences[field] || 0;
      var newVal = current ? 0 : 1;
      var body = { inscriptionId: auth.selectedInscription, address: auth.address };
      body[field] = newVal;
      api.post('/api/trading/preferences', body, true)
        .then(function() { tog.classList.toggle('on'); settings.preferences[field] = newVal; toast(field.replace('_', ' ') + (newVal ? ' activado' : ' desactivado'), 'success'); })
        .catch(function(e) { toast('Error: ' + e.message, 'error'); });
    });
  });

  el.querySelectorAll('[data-save-levels]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var mode = btn.dataset.saveLevels;
      var levels = settings.levels[mode] || [];
      api.post('/api/trading/strategies/levels', { inscription_id: auth.selectedInscription, mode: mode, levels: levels }, true)
        .then(function() { toast('Niveles ' + mode + ' guardados', 'success'); })
        .catch(function(e) { toast('Error: ' + e.message, 'error'); });
    });
  });
}

/* ============================================
   PANEL (menu)
   ============================================ */
function openPanel() {
  els['right-panel'].classList.add('panel-open');
  els['backdrop'].classList.remove('hidden');
}
function closePanel() {
  els['right-panel'].classList.remove('panel-open');
  els['backdrop'].classList.add('hidden');
}

/* ============================================
   STORE SUBSCRIBERS (data → UI reactivity)
   ============================================ */
function setupStoreSubscribers() {
  store.subscribe(function(s, action) {
    if (action === 'SET_PRICE' || action === 'SET_KLINES') renderBtcPrice();
  });
  var _lastOppsJSON = '';
  store.subscribe(function(s, action) {
    if (action === 'SET_OPPORTUNITIES' || action === 'SET_OPPORTUNITIES_FREE') {
      var newJSON = JSON.stringify(s.trading.opportunities);
      if (newJSON !== _lastOppsJSON) {
        _lastOppsJSON = newJSON;
        renderOpportunities();
      }
    }
  });
  store.subscribe(function(s, action) {
    if (action === 'SET_POSITIONS') {
      renderSpotPositions();
      renderFuturesPositions();
    }
  });
  store.subscribe(function(s, action) {
    if (action === 'SET_BOT_STATUS' || action === 'SET_LAST_UPDATE') renderBotStatus();
  });
}

/* ============================================
   EVENT LISTENERS
   ============================================ */
function bindEvents() {
  els['retry-btn']?.addEventListener('click', function() {
    window.location.hash = '#/account';
  });
  els['account-close-btn']?.addEventListener('click', function() {
    window.location.hash = '#/dashboard';
  });
  els['account-retry-btn']?.addEventListener('click', function() {
    window.location.hash = '#/account';
  });
  els['menu-btn']?.addEventListener('click', openPanel);
  els['panel-close']?.addEventListener('click', closePanel);
  els['backdrop']?.addEventListener('click', closePanel);
  els['disconnect-btn']?.addEventListener('click', disconnect);
  els['modal-overlay']?.addEventListener('click', function(e) {
    if (e.target === els['modal-overlay']) hideModal();
  });

  els['right-panel']?.querySelectorAll('.panel-nav-btn[data-nav]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      closePanel();
      window.location.hash = btn.dataset.nav;
    });
  });

  document.querySelectorAll('.wallet-option').forEach(function(opt) {
    opt.addEventListener('click', function() {
      var walletId = opt.dataset.wallet;
      var statusEl = opt.querySelector('.wallet-option-status');
      if (statusEl && statusEl.classList.contains('wallet-not-installed')) {
        var url = walletId === 'unisat' ? 'https://unisat.io/' : 'https://www.xverse.app/';
        window.open(url, '_blank');
        return;
      }
      fullLoginFlow(walletId);
    });
  });

  window.addEventListener('hashchange', onHashChange);
}

function detectWalletUI() {
  var wallets = detectInstalledWallets();
  var unisatOpt = document.getElementById('wallet-opt-unisat');
  var xverseOpt = document.getElementById('wallet-opt-xverse');
  var unisatStatus = document.getElementById('unisat-status');
  var xverseStatus = document.getElementById('xverse-status');

  if (unisatOpt && unisatStatus) {
    if (wallets.unisat) {
      unisatStatus.textContent = 'Detectada';
      unisatStatus.classList.remove('wallet-not-installed');
      unisatOpt.classList.add('wallet-installed');
    } else {
      unisatStatus.textContent = 'No instalada — click para instalar';
      unisatStatus.classList.add('wallet-not-installed');
      unisatOpt.classList.remove('wallet-installed');
    }
  }
  if (xverseOpt && xverseStatus) {
    if (wallets.xverse) {
      xverseStatus.textContent = 'Detectada';
      xverseStatus.classList.remove('wallet-not-installed');
      xverseOpt.classList.add('wallet-installed');
    } else {
      xverseStatus.textContent = 'No instalada — click para instalar';
      xverseStatus.classList.add('wallet-not-installed');
      xverseOpt.classList.remove('wallet-installed');
    }
  }
}

/* ============================================
   INIT (dashboard-first, no auth gate)
   ============================================ */
function init() {
  cacheDom();
  buildTimeframeSelector();
  bindEvents();
  setupStoreSubscribers();

  restoreSession();
  onHashChange();

  window.onerror = function(msg, src, line) {
    toast('Error: ' + msg, 'error');
    return true;
  };
  window.addEventListener('unhandledrejection', function(e) {
    toast('Error: ' + (e.reason?.message || 'Error'), 'error');
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
