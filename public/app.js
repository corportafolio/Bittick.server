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
  { label: '1D', value: '1d' }, { label: '1S', value: '1w' },
  { label: '1ME', value: '1M' }
];

/* --- I18N --- */
var currentLang = localStorage.getItem('bittick_lang') || 'en';
var strings = {};

function t(key) {
  return strings[key] !== undefined ? strings[key] : key;
}

var ANALISIS_ES_EN = {
  'Alta probabilidad de continuacion bajista': 'High probability of bearish continuation',
  'Alta probabilidad de continuación bajista': 'High probability of bearish continuation',
  'Alta probabilidad de continuacion alcista': 'High probability of bullish continuation',
  'Alta probabilidad de continuación alcista': 'High probability of bullish continuation',
  'Trade válido pero zona gris; esperar confirmación.': 'Valid trade but gray zone; wait for confirmation.',
  'Trade valido pero zona gris; esperar confirmacion.': 'Valid trade but gray zone; wait for confirmation.',
  'EVITAR: Resistencia inmediata y soporte débil.': 'AVOID: Immediate resistance and weak support.',
  'EVITAR: Resistencia inmediata y soporte debil.': 'AVOID: Immediate resistance and weak support.',
  'Señal débil': 'Weak signal',
  'Señal debil': 'Weak signal',
  'Señal moderada': 'Moderate signal',
  'Señal fuerte': 'Strong signal',
  'Zona de soporte': 'Support zone',
  'Zona de resistencia': 'Resistance zone',
  'Soporte débil': 'Weak support',
  'Soporte debil': 'Weak support',
  'Resistencia inmediata': 'Immediate resistance',
  'Alta probabilidad': 'High probability',
  'continuacion bajista': 'bearish continuation',
  'continuación bajista': 'bearish continuation',
  'continuacion alcista': 'bullish continuation',
  'continuación alcista': 'bullish continuation',
  'esperar confirmación': 'wait for confirmation',
  'esperar confirmacion': 'wait for confirmation',
  'zona gris': 'gray zone',
  'volumen bajo': 'low volume',
  'volumen alto': 'high volume',
  'tendencia alcista': 'uptrend',
  'tendencia bajista': 'downtrend',
  'oportunidad': 'opportunity',
  'entrada': 'entry',
  'salida': 'exit',
  'precio actual': 'current price',
  'soporte': 'support',
  'resistencia': 'resistance',
  'débil': 'weak',
  'debil': 'weak',
  'fuerte': 'strong',
  'confirmado': 'confirmed',
  'válido': 'valid',
  'valido': 'valid',
  'alerta': 'alert',
  'toma de beneficios': 'take profit',
  'stop loss': 'stop loss'
};

function traducirAnalisis(texto) {
  if (currentLang === 'en' && typeof texto === 'string' && texto) {
    var resultado = texto;
    for (var frase in ANALISIS_ES_EN) {
      if (resultado.indexOf(frase) >= 0) {
        resultado = resultado.split(frase).join(ANALISIS_ES_EN[frase]);
      }
    }
    return resultado;
  }
  return texto;
}

function loadStrings(lang, cb) {
  lang = lang || 'en';
  fetch('/i18n/' + lang + '.json')
    .then(function(r) { if (!r.ok) throw new Error('i18n ' + r.status); return r.json(); })
    .then(function(data) {
      strings = data || {};
      currentLang = lang;
      localStorage.setItem('bittick_lang', lang);
      document.documentElement.lang = lang;
      applyTranslations();
      if (cb) cb();
    })
    .catch(function(e) {
      if (lang !== 'en') loadStrings('en', cb);
      else if (cb) cb();
    });
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(function(el) {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
  });
  document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
    el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
  });
  if (typeof renderCurrentViewTranslations === 'function') renderCurrentViewTranslations();
}

function renderCurrentViewTranslations() {
  var route = store.state.ui.currentRoute ? store.state.ui.currentRoute.replace('#/', '') : 'dashboard';
  if (route === 'dashboard') {
    renderOpportunities();
    renderSpotPositions();
    renderFuturesPositions();
    renderBotStatus();
    if (typeof loadChart === 'function') loadChart();
  } else if (route === 'settings') {
    renderSettings();
  } else if (route === 'account') {
    renderAccountScreen();
  }
  detectWalletUI();
}

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
      positions: { spot: { open: [], closed: [] }, futures: { open: [], closed: [] } },
      botStatus: { spot: null, futures: null },
      currentPrice: 0,
      priceChange24h: 0,
      priceChangePercent: 0,
      klines: [],
      klinesInterval: '15m',
      tradingZones: [],
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
        if(payload.type === 'spot') s.trading.positions.spot.open = payload.data;
        else if(payload.type === 'futures') s.trading.positions.futures.open = payload.data;
        break;
      case 'SET_CLOSED_POSITIONS':
        if(payload.type === 'spot') s.trading.positions.spot.closed = payload.data;
        else if(payload.type === 'futures') s.trading.positions.futures.closed = payload.data;
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
      case 'SET_TRADING_ZONES':
        s.trading.tradingZones = payload;
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
    'opp-toggle-btn','sidebar-backdrop',
    'indicator-menu','indicator-btn','indicator-dropdown','rsi-container',
    'ind-rsi','ind-sma','ind-ema',
    'ind-oi','oi-container'
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
      if (!accs || !accs.length) throw new Error(t('no_accounts_detected'));
      return accs[0];
    });
  }
  if (walletId === 'xverse') {
    return new Promise(function(resolve, reject) {
      var provider = window.XverseProviders && window.XverseProviders['xverse'];
      if (!provider) return reject(new Error(t('xverse_not_installed')));
      provider.connect().then(function(response) {
        if (response.addresses && response.addresses.length) {
          var ord = response.addresses.find(function(a) { return a.purpose === 'ordinals'; });
          var pay = response.addresses.find(function(a) { return a.purpose === 'payment'; });
          resolve((ord || pay || response.addresses[0]).address);
        } else {
          reject(new Error(t('connection_cancelled')));
        }
      }).catch(function(err) {
        reject(new Error(err.message || t('error_connecting_xverse')));
      });
    });
  }
  return Promise.reject(new Error(t('error_wallet_not_supported') + ': ' + walletId));
}

function getNonce(address) {
  return api.get('/api/auth/nonce?address=' + encodeURIComponent(address), false)
    .then(function(json) {
      if (!json.exito) throw new Error(json.error || t('error_nonce'));
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
      if (!provider) return reject(new Error(t('xverse_not_installed')));
      provider.signMessage(message, address).then(function(response) {
        if (response.signature) {
          resolve(response.signature);
        } else {
          reject(new Error(t('signature_cancelled')));
        }
      }).catch(function(err) {
        reject(new Error(err.message || t('error_signing_xverse')));
      });
    });
  }
  return Promise.reject(new Error(t('error_wallet_not_supported') + ': ' + walletId));
}

function verifyWallet(address, signature, nonce) {
  return api.post('/api/auth/verify-wallet', { address: address, signature: signature, nonce: nonce }, false)
    .then(function(json) {
      if (!json.exito) throw new Error(json.error || t('error_verifying_wallet'));
      var d = json.data;
      if (!d.verified || d.count === 0) {
        throw new Error(d.message || t('error_no_agent'));
      }
      return d;
    });
}

function selectInscription(inscriptionId) {
  return api.post('/api/auth/select-inscription', { inscriptionId: inscriptionId }, true)
    .then(function(json) {
      if (!json.exito) throw new Error(json.error || t('error_selecting_inscription'));
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
    
    // Auto-select inscription if only one exists and none selected
    var auth = store.state.auth;
    if (!auth.selectedInscription && auth.inscriptions && auth.inscriptions.length === 1) {
      selectInscription(auth.inscriptions[0].inscriptionId);
    }
    
    // If no selectedInscription but user is verified and has inscriptions, fetch from server
    if (!auth.selectedInscription && auth.verified && auth.inscriptions && auth.inscriptions.length > 0) {
      fetchSelectedInscriptionFromServer(auth.address);
    }
    return true;
  } catch(e) {
    localStorage.removeItem(SESSION_KEY);
    return false;
  }
}

function fetchSelectedInscriptionFromServer(address) {
  return api.get('/api/auth/selected-inscription', true)
    .then(function(json) {
      if (json.exito && json.data) {
        var sel = json.data;
        store.dispatch('SET_AUTH', {
          selectedInscription: sel.inscriptionId,
          botNum: sel.botNum,
          tier: sel.tier,
          botImageUrl: sel.botImageUrl,
          botName: 'Bot #' + sel.botNum
        });
        saveSession();
        updateHeaderBotImage();
        // Trigger chart reload if on dashboard
        if (window.location.hash === '#/dashboard' || window.location.hash === '') {
          loadChart();
        }
      }
    })
    .catch(function(e) {
      console.warn('Failed to fetch selected inscription from server:', e);
    });
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
  toast(t('wallet_disconnected'), 'info');
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
      '<span class="wallet-card-title">' + t('wallet_connected') + '</span>' +
      '<span class="wallet-card-badge ' + (isPremium ? 'premium' : 'free') + '">' + (isPremium ? 'PREMIUM' : 'GRATIS') + '</span>' +
    '</div>' +
    (botNum ? '<div class="wallet-card-bot">' + botImageHtml + '<span class="wallet-card-bot-num">Bot #' + botNum + '</span></div>' : '') +
    '<div class="wallet-card-address">' + truncated + '</div>' +
    '<button id="disconnect-btn-account" class="btn btn-secondary btn-sm">' + t('disconnect') + '</button>';

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
  countEl.textContent = inscriptions.length + ' ' + t('inscriptions_label');

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
      toast('Bot #' + selData.selectedBotNum + ' ' + t('bot_selected'), 'success');
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
      toast(err.message || t('error_selecting_bot'), 'error');
      if (useBtn) {
        useBtn.disabled = false;
        useBtn.textContent = t('use');
      }
    });
}

window.onUseBot = onUseBot;

function updateHeaderBotImage() {
  var auth = store.state.auth;
  var botNum = auth.botNum;
  var menuImg = document.getElementById('menu-bot-img');
  var menuBtn = document.getElementById('menu-account-btn');
  var menuText = document.getElementById('menu-account-text');

  if (botNum) {
    var cachedImage = getCachedBotImage(botNum);
    if (cachedImage) {
      if (menuImg) menuImg.src = 'data:image/png;base64,' + cachedImage;
    }
    if (menuImg) menuImg.classList.remove('hidden');
  } else {
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
      if (!walletId) throw new Error(t('select_wallet_to_connect'));
      statusEl.textContent = t('connecting_wallet');
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
      toast(err.message || t('connection_error'), 'error');
      loading.classList.add('hidden');
      if (selectorEl) selectorEl.classList.remove('hidden');
      if (walletSelectorSection) walletSelectorSection.classList.remove('hidden');
      if (accountScreen) accountScreen.classList.add('hidden');
      errorEl.classList.remove('hidden');
      els['login-error-msg'].textContent = err.message || t('unknown_error');
    });
}

function showInscriptionSelect(inscriptions) {
  var selectEl = els['inscription-select'];
  var listEl = els['inscription-list'];
  var countEl = els['inscription-count'];
  var useBtn = els['use-bot-btn'];

  selectEl.classList.remove('hidden');
  countEl.textContent = inscriptions.length + ' ' + t('inscriptions_found');
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
    toast(t('selecting_bot'), 'info');
    selectInscription(selected)
      .then(function(selData) {
        store.dispatch('SET_AUTH', {
          selectedInscription: selData.selectedInscriptionId,
          botNum: selData.selectedBotNum,
          tier: selData.tier,
          botImageUrl: selData.botImageUrl,
          botName: 'Bot #' + selData.selectedBotNum
        });
        toast('Bot #' + selData.selectedBotNum + ' ' + t('bot_selected'), 'success');
        saveSession();
        selectEl.classList.add('hidden');
        window.location.hash = '#/dashboard';
      })
      .catch(function(err) {
        toast(err.message || t('error_selecting_bot'), 'error');
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
      api.get('/api/trading/positions?include_closed=true&type=' + type, true)
        .then(function(json) {
          var open = (json.data || []).filter(function(p) { return p.status === 'open'; });
          var closed = (json.data || []).filter(function(p) { return p.status === 'closed'; });
          store.dispatch('SET_POSITIONS', { type: type, data: open });
          store.dispatch('SET_CLOSED_POSITIONS', { type: type, data: closed });
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
  var walletInfo = document.getElementById('wallet-info');
  var walletAddress = document.getElementById('wallet-address');

  if (isConnected) {
    if (walletInfo) walletInfo.classList.remove('hidden');
    if (walletAddress) walletAddress.textContent = truncateAddress(auth.address);
  } else {
    if (walletInfo) walletInfo.classList.add('hidden');
  }
}

function onHashChange() {
  var hash = window.location.hash || '#/dashboard';
  var route = hash.replace('#/', '') || 'dashboard';

  if (route === 'settings' && !isPremium()) {
    toast(t('connect_wallet_settings'), 'warning');
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
    botInfoEl.innerHTML = '<span style="color:var(--text-muted)">' + t('free_tier') + '</span>';
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

  var auth = store.state.auth;
  var hasAnyInscription = auth.verified && auth.inscriptions && auth.inscriptions.length > 0;

  // Si NO tiene ningún bot/inscripción conectado -> mostrar aviso
  if (!hasAnyInscription) {
    container.innerHTML =
      '<div class="chart-placeholder">' +
        '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>' +
        '<span>' + t('connect_wallet_chart') + '</span>' +
      '</div>';
    els['chart-info'].innerHTML = '';
    return;
  }

  // Si tiene cualquier bot -> intentar restaurar selectedInscription desde servidor (si falta)
  if (!auth.selectedInscription) {
    api.get('/api/auth/selected-inscription', true)
      .then(function(json) {
        if (json.exito && json.data) {
          var sel = json.data;
          store.dispatch('SET_AUTH', {
            selectedInscription: sel.inscriptionId,
            botNum: sel.botNum,
            tier: sel.tier,
            botImageUrl: sel.botImageUrl,
            botName: 'Bot #' + sel.botNum
          });
          saveSession();
          updateHeaderBotImage();
        }
        // Cargar chart de todas formas (con o sin selección)
        doLoadChart();
      })
      .catch(function(e) {
        console.warn('Failed to fetch selected inscription from server in loadChart:', e);
        doLoadChart();
      });
    return;
  }

  doLoadChart();
}

function doLoadChart() {
  var container = els['chart-container'];
  if (!container) return;

  // Limpiar placeholder/aviso antes de renderizar chart
  container.innerHTML = '';

  var interval = store.state.trading.klinesInterval;
  api.get('/api/chart/klines?interval=' + interval + '&limit=500', false)
    .then(function(json) {
      if (json.exito && json.data) {
        store.dispatch('SET_KLINES', json.data);
        renderChart(json.data);
        loadTradingZones();
      }
    })
    .catch(function(e) { console.error('Chart error:', e); });
}

function updateChart() {
  var interval = store.state.trading.klinesInterval;
  api.get('/api/chart/klines?interval=' + interval + '&limit=500', false)
    .then(function(json) {
      if (json.exito && json.data && json.data.length) {
        var lastKline = json.data[json.data.length - 1];
        if (typeof BittickChart !== 'undefined' && BittickChart.updateLastCandle) {
          BittickChart.updateLastCandle(lastKline);
        }
        loadTradingZones();
      }
    })
    .catch(function(e) { console.error('Chart update error:', e); });
}

function loadTradingZones() {
  var price = store.state.trading.currentPrice;
  if (!price) return;
  var klines = store.state.trading.klines || [];
  var lastTime = klines.length ? Math.floor((klines[klines.length - 1].openTime || 0) / 1000) : 0;
  api.get('/api/chart/trading-zones?price=' + price, false)
    .then(function(json) {
      if (json.exito && json.data) {
        store.dispatch('SET_TRADING_ZONES', json.data);
        if (typeof BittickChart !== 'undefined' && BittickChart.setTradingZones) {
          BittickChart.setTradingZones(json.data, lastTime);
        }
      }
    })
    .catch(function(e) { console.error('Trading zones error:', e); });
}

function renderChart(data) {
  var container = els['chart-container'];
  if (container) container.innerHTML = '';
  if (typeof BittickChart !== 'undefined') {
    BittickChart.render(els['chart-container'], data, {
      upColor: '#4CAF50', downColor: '#F44336',
      borderVisible: false, wickUpColor: '#4CAF50', wickDownColor: '#F44336'
    });
    if (isRSIEnabled()) {
      renderRSI(data);
    }
    if (isSMAEnabled()) {
      BittickChart.addSMA && BittickChart.addSMA(data, 20);
    }
    if (isEMAEnabled()) {
      BittickChart.addEMA && BittickChart.addEMA(data, 50);
    }
    if (isOIEnabled()) {
      renderOI(data);
    }
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

/* --- RSI --- */
var rsiChart = null;
var oiChart = null;

function isRSIEnabled() {
  var cb = els['ind-rsi'];
  return cb && cb.checked;
}

function isSMAEnabled() {
  var cb = els['ind-sma'];
  return cb && cb.checked;
}

function isEMAEnabled() {
  var cb = els['ind-ema'];
  return cb && cb.checked;
}

function isOIEnabled() {
  var cb = els['ind-oi'];
  return cb && cb.checked;
}

function isOIEnabled() {
  var cb = els['ind-oi'];
  return cb && cb.checked;
}

function calculateRSI(closes, period) {
  if (closes.length < period + 1) return [];
  var gains = 0;
  var losses = 0;
  for (var i = 1; i <= period; i++) {
    var diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  var avgGain = gains / period;
  var avgLoss = losses / period;
  var rsi = [];
  rsi.push(100 - (100 / (1 + (avgGain / (avgLoss || 0.0001)))));
  for (var j = period + 1; j < closes.length; j++) {
    var d = closes[j] - closes[j - 1];
    var gain = d >= 0 ? d : 0;
    var loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi.push(100 - (100 / (1 + (avgGain / (avgLoss || 0.0001)))));
  }
  return rsi;
}

function renderRSI(data) {
  var container = els['rsi-container'];
  if (!container || !window.LightweightCharts) return;
  container.classList.remove('hidden');

  var closes = data.map(function(d) { return parseFloat(d.close); });
  var times = data.map(function(d) { return Math.floor((d.openTime || d.time || 0) / 1000); });
  var rsiValues = calculateRSI(closes, 14);
  if (!rsiValues.length) { container.classList.add('hidden'); return; }

  var offset = closes.length - rsiValues.length;
  var rsiData = rsiValues.map(function(v, i) {
    return { time: times[i + offset], value: v };
  });

  if (rsiChart) {
    rsiChart.remove();
    rsiChart = null;
  }

  var w = container.clientWidth || container.offsetWidth || 0;
  var h = container.clientHeight || container.offsetHeight || 120;
  if (w === 0 || h === 0) {
    requestAnimationFrame(function() { renderRSI(data); });
    return;
  }

  try {
    rsiChart = LightweightCharts.createChart(container, {
      width: w, height: h,
      layout: {
        background: { color: '#1A1A1A' },
        textColor: '#999999',
        fontSize: 10
      },
      grid: {
        vertLines: { color: '#252525' },
        horzLines: { color: '#252525' }
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { color: '#F7931A', width: 1, style: 0, labelBackgroundColor: '#F7931A' },
        horzLine: { color: '#F7931A', width: 1, style: 0, labelBackgroundColor: '#F7931A' }
      },
      rightPriceScale: {
        borderColor: '#2A2A2A',
        scaleMargins: { top: 0.1, bottom: 0.1 },
        autoScale: true
      },
      timeScale: {
        borderColor: '#2A2A2A',
        timeVisible: false,
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true
      },
      handleScale: { axisPressedMouseMove: true },
      handleScroll: { mouseWheel: true, pressedMouseMove: true }
    });

    var rsiLine = rsiChart.addLineSeries({
      color: '#F7931A',
      lineWidth: 1,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      priceFormat: { type: 'price', precision: 1, minMove: 0.1 }
    });
    rsiLine.setData(rsiData);

    var h70 = rsiChart.addLineSeries({
      color: 'rgba(244,67,54,0.5)',
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      priceFormat: { type: 'price', precision: 0 }
    });
    h70.setData([{ time: times[offset], value: 70 }, { time: times[times.length - 1], value: 70 }]);

    var h30 = rsiChart.addLineSeries({
      color: 'rgba(76,175,80,0.5)',
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      priceFormat: { type: 'price', precision: 0 }
    });
    h30.setData([{ time: times[offset], value: 30 }, { time: times[times.length - 1], value: 30 }]);

    var h50 = rsiChart.addLineSeries({
      color: 'rgba(255,255,255,0.1)',
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dotted,
      lastValueVisible: false,
      crosshairMarkerVisible: false
    });
    h50.setData([{ time: times[offset], value: 50 }, { time: times[times.length - 1], value: 50 }]);

    var ro = new ResizeObserver(function(entries) {
      if (rsiChart && entries[0]) {
        rsiChart.applyOptions({ width: entries[0].contentRect.width, height: entries[0].contentRect.height });
      }
    });
    ro.observe(container);

    if (window.rsiChartsSync) window.rsiChartsSync();
  } catch (e) {
    console.error('RSI chart error:', e);
    container.classList.add('hidden');
  }
}

function getOIPeriod() {
  var tf = store.state.trading.klinesInterval || '1h';
  if (tf === '1m' || tf === '5m') return '5m';
  if (tf === '15m' || tf === '30m') return '15m';
  if (tf === '1h' || tf === '4h') return '1h';
  return '1d';
}

function renderOI(data) {
  var container = els['oi-container'];
  if (!container || !window.LightweightCharts) return;
  container.classList.remove('hidden');

  var period = getOIPeriod();
  fetch('/api/chart/openInterest?period=' + period + '&limit=100')
    .then(function(r) { return r.json(); })
    .then(function(json) {
      if (!json.exito || !json.data || !json.data.length) {
        container.classList.add('hidden');
        return;
      }
      var oiData = json.data.map(function(d) {
        return { time: Math.floor(d.timestamp / 1000), value: d.openInterest };
      });
      if (!oiData.length) { container.classList.add('hidden'); return; }

      if (oiChart) {
        oiChart.remove();
        oiChart = null;
      }

      var w = container.clientWidth || container.offsetWidth || 0;
      var h = container.clientHeight || container.offsetHeight || 100;
      if (w === 0 || h === 0) {
        requestAnimationFrame(function() { renderOI(data); });
        return;
      }

      try {
        oiChart = LightweightCharts.createChart(container, {
          width: w, height: h,
          layout: {
            background: { color: '#1A1A1A' },
            textColor: '#999999',
            fontSize: 10
          },
          grid: {
            vertLines: { color: '#252525' },
            horzLines: { color: '#252525' }
          },
          crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: { color: '#F7931A', width: 1, style: 0, labelBackgroundColor: '#F7931A' },
            horzLine: { color: '#F7931A', width: 1, style: 0, labelBackgroundColor: '#F7931A' }
          },
          rightPriceScale: {
            borderColor: '#2A2A2A',
            scaleMargins: { top: 0.1, bottom: 0.1 },
            autoScale: true
          },
          timeScale: {
            borderColor: '#2A2A2A',
            timeVisible: false,
            secondsVisible: false,
            fixLeftEdge: true,
            fixRightEdge: true
          },
          handleScale: { axisPressedMouseMove: true },
          handleScroll: { mouseWheel: true, pressedMouseMove: true }
        });

        var oiLine = oiChart.addLineSeries({
          color: '#F7931A',
          lineWidth: 1,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          priceFormat: { type: 'price', precision: 2, minMove: 0.01 }
        });
        oiLine.setData(oiData);

        var ro = new ResizeObserver(function(entries) {
          if (oiChart && entries[0]) {
            oiChart.applyOptions({ width: entries[0].contentRect.width, height: entries[0].contentRect.height });
          }
        });
        ro.observe(container);

      } catch (e) {
        console.error('OI chart error:', e);
        container.classList.add('hidden');
      }
    })
    .catch(function(e) {
      console.error('OI fetch error:', e);
      container.classList.add('hidden');
    });
}

/* --- OPPORTUNITIES (filtered for free tier) --- */
function renderOpportunities() {
  var list = els['opportunities-list'];
  var countEl = els['opp-count'];
  if (!list) return;

  var opps = store.state.trading.opportunities || [];

  opps = opps.filter(function(opp) {
    var score = parseFloat(opp.score || 0);
    var conf = parseFloat(opp.confidence || 0);
    return score >= 5 && conf >= 5;
  });

  if (countEl) countEl.textContent = opps.length;

  if (!opps.length) {
    safeSetHTML(list, '<p class="empty-text" style="padding:32px 0">' + t('no_opportunities') + '</p>');
    return;
  }

  var newHTML = opps.map(function(opp) {
    var strategyType = opp.strategyType || '';
    var botType = opp.bot_type || 'futures';
    var asset = opp.asset || '';
    var currentPrice = parseFloat(opp.price || 0);
    var entryZone = opp.entry_zone || '';
    var target = parseFloat(opp.target || 0);
    var stopLoss = parseFloat(opp.stop_loss || 0);
    var score = parseFloat(opp.score || 0);
    var confidence = parseFloat(opp.confidence || 0);
    var isUp = true;
    var strategyColor = isUp ? 'var(--positive)' : 'var(--negative)';

    var entryPrice = 0;
    var margenPct = null;
    if (entryZone) {
      var nums = entryZone.split('-').map(function(p) { return parseFloat(p.trim()) || 0; });
      if (nums.length === 2) entryPrice = (nums[0] + nums[1]) / 2;
      else if (nums.length === 1) entryPrice = nums[0];

      // Dirección REAL: entry < target = LONG, entry > target = SHORT
      isUp = entryPrice < target;

      // Calcular margen con peor caso según dirección REAL
      var low = Math.min(nums[0], nums[1]);
      var high = Math.max(nums[0], nums[1]);
      var worstEntry = isUp ? high : low;
      if (target > 0 && worstEntry > 0) {
        margenPct = isUp
          ? ((target - worstEntry) / worstEntry) * 100
          : ((worstEntry - target) / worstEntry) * 100;
      }
    }

    var etiqueta = 'LONG';
    if (botType === 'spot') {
      etiqueta = 'SPOT';
    } else if (!isUp) {
      etiqueta = 'SHORT';
    }
    var strategyColor = isUp ? 'var(--positive)' : 'var(--negative)';

    var nivel = Math.min(score, confidence);
    var dotColor = '#e74c3c';
    var semaforo = 'ROJO';
    if (score >= 8 && confidence >= 8) {
      dotColor = '#2ecc71';
      semaforo = 'VERDE';
    } else if (nivel >= 7) {
      dotColor = '#f39c12';
      semaforo = 'AMARILLO';
    }

    var fechaHTML = '';
    if (opp.created_at) {
      try {
        var oppDate = new Date(opp.created_at);
        if (!isNaN(oppDate.getTime())) {
          var now = new Date();
          var esHoy = oppDate.toDateString() === now.toDateString();
          var locale = currentLang === 'es' ? 'es-AR' : 'en-US';
          var hora = oppDate.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
          var fechaTxt = esHoy ? t('today') : oppDate.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' });
          fechaHTML = '<div class="opp-card-footer">' +
            '<span class="opp-card-time">' + hora + '</span>' +
            '<span class="opp-card-date">' + fechaTxt + '</span>' +
          '</div>';
        }
      } catch(e) {}
    }

    function val(v) { return (v !== undefined && v !== null && v !== 'undefined' && v !== 'null') ? v : null; }

    var firstLine = [];
    if (val(opp.sma_20)) firstLine.push('SMA20 ' + opp.sma_20);
    if (val(opp.support_zone)) firstLine.push(t('support') + ' ' + opp.support_zone);
    if (val(opp.resistance_zone)) firstLine.push(t('resistance') + ' ' + opp.resistance_zone);
    var firstLineText = firstLine.length > 0 ? firstLine.join(', ') + '.' : '';

    var detailParts = [];
    if (val(opp.rsi)) detailParts.push('RSI ' + opp.rsi);
    if (val(opp.sma_ema)) detailParts.push(opp.sma_ema);
    if (val(opp.atr)) detailParts.push('ATR ' + opp.atr);
    if (val(opp.ema_50)) detailParts.push('EMA 50: ' + opp.ema_50);
    if (val(opp.sma_50)) detailParts.push('SMA 50: ' + opp.sma_50);
    if (val(opp.drop_pct)) detailParts.push(t('drop') + ' ' + opp.drop_pct + '%');
    if (val(opp.rise_pct)) detailParts.push(t('rise') + ' ' + opp.rise_pct + '%');
    if (val(opp.drop_percent)) detailParts.push(t('drop') + ' ' + opp.drop_percent + '%');
    if (val(opp.distance_from_sma)) detailParts.push(t('distance_sma') + ' ' + opp.distance_from_sma + '%');
    if (val(opp.distance_pct)) detailParts.push(t('distance') + ' ' + opp.distance_pct + '%');
    if (val(opp.fib_levels)) detailParts.push(t('fib_level') + ' ' + opp.fib_levels);
    if (val(opp.zone_type)) detailParts.push(t('zone') + ' ' + (opp.zone_type === 'soporte' ? t('support') : opp.zone_type === 'resistencia' ? t('resistance') : opp.zone_type) + (val(opp.zone_strength) ? ' (' + t('strength') + ' x' + opp.zone_strength + ')' : ''));
    if (val(opp.zone_mid)) detailParts.push(t('mid_zone') + ' ' + opp.zone_mid);
    if (val(opp.through_back)) detailParts.push(t('breakout') + ' ' + (opp.through_back === 1 ? t('confirmed') : t('not_confirmed')));
    if (val(opp.volume_ratio)) detailParts.push(t('volume') + ' x' + opp.volume_ratio);
    if (val(opp.zona_actual)) detailParts.push(traducirAnalisis(opp.zona_actual));
    if (opp.ai_explanation) detailParts.push(traducirAnalisis(opp.ai_explanation));
    try {
      var parsedFactors = typeof opp.factors === 'string' ? JSON.parse(opp.factors) : opp.factors;
      if (parsedFactors && parsedFactors.length) detailParts.push(t('factors') + ': ' + parsedFactors.map(traducirAnalisis).join(', '));
    } catch (_) {}
    try {
      var parsedRisks = typeof opp.risks === 'string' ? JSON.parse(opp.risks) : opp.risks;
      if (parsedRisks && parsedRisks.length) detailParts.push(t('risks') + ': ' + parsedRisks.map(traducirAnalisis).join(', '));
    } catch (_) {}
    detailParts.push(t('traffic_light') + ': ' + t('light_' + semaforo.toLowerCase()) + (semaforo === 'ROJO' ? ' — ' + t('caution') : semaforo === 'AMARILLO' ? ' — ' + t('have_caution') : ' — ' + t('good_opportunity')));

    var detailText = detailParts.join(', ');

    function truncateText(str, max) {
      str = String(str || '');
      return str.length > max ? str.slice(0, max - 1).trimEnd() + '…' : str;
    }

    var collapsedText = truncateText(traducirAnalisis(opp.ai_explanation || ''), 50) || firstLineText || detailText;

    var analysisHTML = '';
    if (collapsedText) {
      analysisHTML = '<div class="opp-card-analysis">' +
        '<span class="analysis-text">' + collapsedText + '</span>' +
        (detailText && collapsedText !== detailText ? '<span class="analysis-expand" data-opp-id="' + (opp.id || '') + '">🔍</span>' : '') +
        (collapsedText !== detailText ? '<span class="analysis-detail">' + detailText + '</span>' : '') +
      '</div>';
    }

    return '<div class="opp-card" data-id="' + (opp.id || '') + '">' +
      '<div class="opp-card-header">' +
        '<span class="opp-card-label" style="' + strategyColor + '">' + etiqueta + '</span>' +
        '<span class="opp-card-symbol">' + asset + '</span>' +
        (margenPct !== null && margenPct < 0.8 ? '<span class="opp-card-badge" style="color:#e74c3c;font-size:10px;margin-left:6px;">descartada margen -0.8%</span>' : '') +
        '<span class="opp-card-dot" style="background:' + dotColor + '"></span>' +
      '</div>' +
      '<div class="opp-card-changes">' +
        '<span class="opp-card-change" style="color:var(--accent)">Score: ' + score.toFixed(1) + '</span>' +
        '<span class="opp-card-change" style="color:var(--text-secondary)">Conf: ' + confidence.toFixed(0) + '</span>' +
      '</div>' +
      '<div class="opp-card-row">' +
        '<span class="label">' + t('entry') + '</span><span class="value">' + formatPrice(entryPrice) + '</span>' +
        '<span class="label">' + t('current') + '</span><span class="value">' + formatPrice(currentPrice) + '</span>' +
        '<span class="label">' + t('target') + '</span><span class="value">' + formatPrice(target) + '</span>' +
        (botType === 'futures' && stopLoss ? '<span class="label">' + t('stop') + '</span><span class="value">' + formatPrice(stopLoss) + '</span>' : '') +
      '</div>' +
      analysisHTML +
      fechaHTML +
    '</div>';
  }).join('');

  safeSetHTML(list, newHTML);

  list.querySelectorAll('.opp-card').forEach(function(card) {
    card.addEventListener('click', function(e) {
      if (e.target.closest('.analysis-expand')) return;
      list.querySelectorAll('.opp-card').forEach(function(c) { c.classList.remove('active'); });
      card.classList.add('active');
    });
  });

  list.querySelectorAll('.analysis-expand').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var card = e.target.closest('.opp-card');
      var detail = card.querySelector('.analysis-detail');
      var analysis = card.querySelector('.opp-card-analysis');
      if (detail) {
        var isOpen = detail.style.display !== 'none';
        detail.style.display = isOpen ? 'none' : 'block';
        if (analysis) analysis.classList.toggle('expanded', !isOpen);
      }
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
  var positions = store.state.trading.positions.spot || { open: [], closed: [] };
  var open = positions.open || [];
  var closed = positions.closed || [];
  
  if (!open.length && !closed.length) {
    safeSetHTML(el, '<p class="empty-text">' + t('no_positions') + '</p>');
    return;
  }
  
  var html = '<div class="open-positions">' + open.map(renderPositionItem).join('') + '</div>';
  if (closed.length) {
    html += '<div class="closed-positions-section"><h4>' + t('closed_positions') + '</h4>' + 
      closed.map(function(p) { return renderPositionItem(p) + '<div class="position-closed-badge">' + t('closed_badge') + '</div>'; }).join('') + 
      '</div>';
  }
  
  safeSetHTML(el, html);
  bindPositionActions(el, 'spot');
}

function renderFuturesPositions() {
  var el = els['futures-positions-list'];
  if (!el) return;
  var positions = store.state.trading.positions.futures || { open: [], closed: [] };
  var open = positions.open || [];
  var closed = positions.closed || [];
  
  if (!open.length && !closed.length) {
    safeSetHTML(el, '<p class="empty-text">' + t('no_positions') + '</p>');
    return;
  }
  
  var html = '<div class="open-positions">' + open.map(renderPositionItem).join('') + '</div>';
  if (closed.length) {
    html += '<div class="closed-positions-section"><h4>' + t('closed_positions') + '</h4>' + 
      closed.map(function(p) { return renderPositionItem(p) + '<div class="position-closed-badge">' + t('closed_badge') + '</div>'; }).join('') + 
      '</div>';
  }
  safeSetHTML(el, html);
  bindPositionActions(el, 'futures');
}

function bindPositionActions(container, type) {
  container.querySelectorAll('.position-actions .btn-danger[data-pos-id]').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var posId = this.getAttribute('data-pos-id');
      if (posId) closePosition(posId, type);
    });
  });
  container.querySelectorAll('.position-actions .btn-secondary[data-pos-id]').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var posId = this.getAttribute('data-pos-id');
      if (posId) dismissPosition(posId, type);
    });
  });
}

async function closePosition(posId, type) {
  var confirmed = await confirmModal(t('confirm_close_position'));
  if (!confirmed) return;
  try {
    var res = await api.post('/api/trading/positions/' + posId + '/close', {
      type: type
    }, true);
    if (res.exito) {
      toast(t('position_closed'), 'success');
      polling.fetchAll();
    } else {
      toast('Error: ' + (res.error || t('could_not_close')), 'error');
    }
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function dismissPosition(posId, type) {
  var confirmed = await confirmModal(t('confirm_dismiss'));
  if (!confirmed) return;
  try {
    var res = await api.post('/api/trading/positions/dismiss', {
      positionId: posId,
      type: type
    }, true);
    if (res.exito) {
      toast(t('position_dismissed'), 'success');
      polling.fetchAll();
    } else {
      toast('Error: ' + (res.error || t('could_not_dismiss')), 'error');
    }
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

function confirmModal(message) {
  return new Promise(function(resolve) {
    var confirmBtnId = 'confirm-modal-yes';
    var cancelBtnId = 'confirm-modal-no';
    showModal(
      '<div style="padding:24px;text-align:center">' +
        '<h3 style="margin-bottom:16px">' + message + '</h3>' +
        '<div style="display:flex;gap:12px;justify-content:center">' +
          '<button id="' + confirmBtnId + '" class="btn btn-danger">' + t('confirm') + '</button>' +
          '<button id="' + cancelBtnId + '" class="btn btn-secondary">' + t('cancel') + '</button>' +
        '</div>' +
      '</div>'
    );
    document.getElementById(confirmBtnId).addEventListener('click', function() {
      hideModal();
      resolve(true);
    }, { once: true });
    document.getElementById(cancelBtnId).addEventListener('click', function() {
      hideModal();
      resolve(false);
    }, { once: true });
  });
}

function renderPositionItem(p) {
  // Normalize field names from API (snake_case) to frontend (camelCase)
  var entryPrice = p.entry_price;
  var currentPrice = p.current_price;
  var targetPrice = p.target;
  var stopPrice = p.stop_loss;
  var investedUsdt = p.usd_amount;
  var symbol = p.asset;
  var side = (p.strategy_type || 'LONG').toUpperCase();
  var type = (p.bot_type || 'spot').toLowerCase();
  var status = p.status || 'open';
  var isOpen = status !== 'closed';
  var pnl = parseFloat(p.pnl || 0);
  var pnlPct = parseFloat(p.pnl_percent || 0);
  var isPos = pnl >= 0;

  var badgeTypeClass = type === 'futures' ? (side === 'SHORT' ? 'badge-short' : 'badge-long') : 'badge-spot';
  var badgeTypeLabel = type === 'futures' ? '[' + side + ']' : '[SPOT]';
  var badgeStatusClass = isOpen ? 'badge-open' : 'badge-closed';
  var badgeStatusLabel = isOpen ? t('open_badge') : t('closed');

  var entryPriceFmt = entryPrice != null ? formatPrice(entryPrice) : '—';
  var currentPriceFmt = currentPrice != null ? formatPrice(currentPrice) : '—';
  var targetPriceFmt = targetPrice != null ? formatPrice(targetPrice) : '—';
  var stopPriceFmt = stopPrice != null ? formatPrice(stopPrice) : '—';
  var investedUsdtFmt = investedUsdt != null ? parseFloat(investedUsdt).toFixed(2) : '—';
  var score = p.score != null ? p.score : '—';
  var confidence = p.confidence != null ? p.confidence : '—';

  var openedAt = p.opened_at != null ? formatDateTimeLocal(p.opened_at) : '—';
  var closedAt = p.closed_at != null ? formatDateTimeLocal(p.closed_at) : '—';

  var html = '<div class="position-card">' +
    '<div class="position-header">' +
      '<span class="badge-type ' + badgeTypeClass + '">' + badgeTypeLabel + '</span>' +
      '<span class="position-symbol">' + (symbol || '') + '</span>' +
      '<span class="badge-status ' + badgeStatusClass + '">' + badgeStatusLabel + '</span>' +
      '<span class="position-pnl ' + (isPos ? 'positive' : 'negative') + '" style="margin-left:auto">' + (isPos ? '+' : '') + pnl.toFixed(2) + ' USDT' + (isOpen ? '' : ' (' + pnlPct.toFixed(2) + '%)') + '</span>' +
    '</div>' +
    '<div class="position-details">' +
      '<span class="position-id-label">' + t('id') + ': ' + (type === 'futures' ? 'F' : 'S') + (p.id || '?') + '</span>' +
      '<span class="position-lvl-label">' + t('lvl') + ': ' + (type === 'futures' ? 'F' : 'S') + (p.level != null ? p.level : '?') + '</span>' +
      '<span>' + t('score') + ': ' + score + '/10</span>' +
      '<span>' + t('confidence') + ': ' + confidence + '/10</span>' +
      (investedUsdtFmt !== '—' ? '<span>' + t('invested') + ': $' + investedUsdtFmt + '</span>' : '') +
    '</div>' +
    '<div class="position-prices">';

  if (isOpen) {
    html +=
      '<div class="price-item"><span class="price-label">' + t('entry') + '</span><span class="price-value">' + entryPriceFmt + '</span></div>' +
      '<div class="price-item"><span class="price-label">' + t('current') + '</span><span class="price-value">' + currentPriceFmt + '</span></div>' +
      '<div class="price-item"><span class="price-label">' + t('target') + '</span><span class="price-value">' + targetPriceFmt + '</span></div>';
    if (type === 'futures' && stopPriceFmt !== '—') {
      html += '<div class="price-item"><span class="price-label">' + t('stop') + '</span><span class="price-value stop">' + stopPriceFmt + '</span></div>';
    }
    if (type === 'spot') {
      html += '<div class="price-item"><span class="price-label">' + t('stop') + '</span><span class="price-value spot-warning">' + t('no_stop_manual') + '</span></div>';
    }
  } else {
    var closedPriceFmt = p.current_price ? formatPrice(p.current_price) : currentPriceFmt;
    var leverageStr = p.leverage ? p.leverage + 'x' : '1x';
    html +=
      '<div class="price-item"><span class="price-label">' + t('entry') + '</span><span class="price-value">' + entryPriceFmt + '</span></div>' +
      '<div class="price-item"><span class="price-label">' + t('closed') + '</span><span class="price-value">' + closedPriceFmt + '</span></div>' +
      '<div class="price-item"><span class="price-label">' + t('target') + '</span><span class="price-value">' + targetPriceFmt + '</span></div>' +
      '<div class="price-item"><span class="price-label">' + t('leverage') + '</span><span class="price-value">' + leverageStr + '</span></div>';
  }

  html += '</div>' +
    '<div class="timestamp-bubbles">';

  if (isOpen) {
    html +=
      '<span class="timestamp-bubble"><span class="timestamp-label">' + t('started') + '</span><span class="timestamp-value">' + openedAt + '</span></span>' +
      '<span class="timestamp-bubble"><span class="timestamp-label">' + t('finished') + '</span><span class="timestamp-value">' + (closedAt || '—') + '</span></span>';
  } else {
    html +=
      '<span class="timestamp-bubble"><span class="timestamp-label">' + t('started') + '</span><span class="timestamp-value">' + openedAt + '</span></span>' +
      '<span class="timestamp-bubble"><span class="timestamp-label">' + t('finished') + '</span><span class="timestamp-value">' + closedAt + '</span></span>';
  }

  html += '</div>';

  if (isOpen) {
    var closeBtnId = 'close-pos-' + (p.id || 'unknown');
    html +=
      '<div class="position-actions">' +
        '<button class="btn btn-danger btn-sm" id="' + closeBtnId + '" data-pos-id="' + (p.id || '') + '" data-type="' + type + '">' + t('close_position_btn') + '</button>' +
      '</div>';
  } else {
    var dismissBtnId = 'dismiss-pos-' + (p.id || 'unknown');
    html +=
      '<div class="position-actions">' +
        '<button class="btn btn-secondary btn-sm" id="' + dismissBtnId + '" data-pos-id="' + (p.id || '') + '" data-type="' + type + '" style="background:transparent;border:1px solid var(--border);color:var(--text-secondary)">[🗑] ' + t('dismiss') + '</button>' +
      '</div>';
  }

  html += '</div>';
  return html;
}

function formatPrice(price) {
  var num = parseFloat(price);
  if (isNaN(num)) return '—';
  if (num >= 1000) return num.toLocaleString(undefined, {maximumFractionDigits: 0});
  if (num >= 1) return num.toLocaleString(undefined, {maximumFractionDigits: 2});
  return num.toLocaleString(undefined, {maximumFractionDigits: 6});
}

function formatDateTimeLocal(isoString) {
  try {
    var d = new Date(isoString);
    var day = String(d.getDate()).padStart(2, '0');
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var year = d.getFullYear();
    var hours = String(d.getHours()).padStart(2, '0');
    var minutes = String(d.getMinutes()).padStart(2, '0');
    return day + '/' + month + '/' + year + ' ' + hours + ':' + minutes;
  } catch(e) {
    return '—';
  }
}

/* --- BOT STATUS --- */
function renderBotStatus() {
  var premium = isPremium();
  if (!premium) {
    var spotEl = els['bot-spot-content'];
    var futuresEl = els['bot-futures-content'];
    var freeBotHTML =
      '<div class="bot-row"><span class="bot-label">' + t('status') + '</span><span class="bot-value stopped"><span class="status-dot red"></span>' + t('inactive') + '</span></div>' +
      '<div class="bot-row"><span class="bot-label">API Keys</span><span class="bot-value stopped">' + t('not_configured') + '</span></div>' +
      '<div class="bot-row"><span class="bot-label">Tier</span><span class="bot-value">Free</span></div>' +
      '<div class="bot-row"><span class="bot-label">' + t('action') + '</span><span class="bot-value" style="color:var(--accent);font-size:.75rem">' + t('connect_wallet_activate') + '</span></div>';
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
    safeSetHTML(el, '<p class="empty-text">' + t('connect_wallet_activate') + '</p>');
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
  var modeLabel = enabled ? t('active') : t('stopped');

  safeSetHTML(el,
    '<div class="bot-row"><span class="bot-label">' + t('status') + '</span><span class="bot-value ' + valueClass + '"><span class="status-dot ' + dotClass + '"></span>' + modeLabel + '</span></div>' +
    '<div class="bot-row"><span class="bot-label">API Keys</span><span class="bot-value ' + (hasApiKey ? 'running' : 'stopped') + '">' + (hasApiKey ? t('configured') : t('not_configured')) + '</span></div>' +
    '<div class="bot-row"><span class="bot-label">Tier</span><span class="bot-value accent">' + (store.state.auth.tier || 'STANDARD') + '</span></div>' +
    '<div class="bot-row"><span class="bot-label">' + t('open_positions_label') + '</span><span class="bot-value">' + openPositions + '/' + maxPositions + '</span></div>' +
    '<div class="bot-row"><span class="bot-label">' + t('position_size') + '</span><span class="bot-value">' + positionSize + ' USDT</span></div>' +
    '<div class="bot-row"><span class="bot-label">PnL total</span><span class="bot-value ' + (totalPnl >= 0 ? 'running' : 'stopped') + '">' + (totalPnl >= 0 ? '+' : '') + totalPnl.toFixed(2) + ' USDT</span></div>' +
    '<div class="bot-row"><span class="bot-label">' + t('balance_available') + '</span><span class="bot-value">' + (balanceAvail > 0 ? formatPrice(balanceAvail) : '---') + '</span></div>' +
    '<div class="bot-row"><span class="bot-label">' + t('balance_total') + '</span><span class="bot-value">' + (balanceTotal > 0 ? formatPrice(balanceTotal) : '---') + '</span></div>'
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
      var serverLang = results[2].data.language;
      if (serverLang && serverLang !== currentLang) {
        loadStrings(serverLang, renderSettings);
        return;
      }
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
    '<div class="two-col-grid">' +
    '<div class="panel-card settings-card">' +
      '<h3>' + t('settings_account') + '</h3>' +
      '<div class="account-grid">' +
        '<div class="account-avatar">' +
          '<img src="' + botImage(botNum) + '" alt="Bot" style="width:48px;height:48px;border-radius:50%;object-fit:cover" onerror="this.style.display=\'none\'">' +
        '</div>' +
        '<div class="account-info">' +
          '<div class="settings-row"><span class="settings-label">' + t('bot') + '</span><span class="settings-value">Bot #' + botNum + ' — ' + tier + '</span></div>' +
          '<div class="settings-row"><span class="settings-label">' + t('wallet') + '</span><span class="settings-value">' + truncateAddress(addr) + '</span></div>' +
          '<div class="settings-row"><span class="settings-label">' + t('inscription') + '</span><span class="settings-value">' + (inscId.length > 20 ? inscId.slice(0, 12) + '...' + inscId.slice(-8) : inscId) + '</span></div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="panel-card settings-card">' +
      '<h3>' + t('settings_preferences') + '</h3>' +
      '<div class="settings-row"><span class="settings-label">' + t('language') + '</span>' +
        '<span class="settings-value"><select id="lang-select" class="form-input" style="width:auto;padding:6px 8px">' +
          '<option value="en"' + (currentLang === 'en' ? ' selected' : '') + '>' + t('english') + '</option>' +
          '<option value="es"' + (currentLang === 'es' ? ' selected' : '') + '>' + t('spanish') + '</option>' +
        '</select></span>' +
      '</div>' +
      '<div class="settings-row"><span class="settings-label">' + t('notifications') + '</span><span class="settings-value" id="s-notif-status">' + ('Notification' in window ? Notification.permission : t('not_supported')) + '</span></div>' +
      '<button class="btn btn-secondary btn-sm" style="margin-top:8px" id="enable-notif-btn">' + t('enable_notifications') + '</button>' +
    '</div>' +
    '</div>' +
    '<div class="panel-card settings-card">' +
      '<h3>' + t('api_keys_binance') + '</h3>' +
      '<div class="settings-row"><span class="settings-label">' + t('spot') + '</span><span class="settings-value ' + (settings.apiKeys.spot?.hasKey ? 'positive' : 'negative') + '">' + (settings.apiKeys.spot?.hasKey ? t('configured') : t('not_configured')) + '</span></div>' +
      '<div class="settings-row"><span class="settings-label">' + t('futures') + '</span><span class="settings-value ' + (settings.apiKeys.futures?.hasKey ? 'positive' : 'negative') + '">' + (settings.apiKeys.futures?.hasKey ? t('configured') : t('not_configured')) + '</span></div>' +
      '<button class="btn btn-secondary btn-sm" style="margin-top:8px" id="edit-apikeys-btn">' + t('edit_keys') + '</button>' +
      '<div id="apikeys-form" class="hidden">' +
        '<div class="settings-form">' +
          '<label style="color:var(--text-secondary);font-size:.75rem">' + t('spot') + '</label>' +
          '<input type="text" class="form-input" id="inp-spot-key" placeholder="Spot API Key">' +
          '<input type="password" class="form-input" id="inp-spot-secret" placeholder="Spot Secret Key">' +
          '<label style="color:var(--text-secondary);font-size:.75rem">' + t('futures') + '</label>' +
          '<input type="text" class="form-input" id="inp-futures-key" placeholder="Futures API Key">' +
          '<input type="password" class="form-input" id="inp-futures-secret" placeholder="Futures Secret Key">' +
          '<div class="form-row">' +
            '<button class="btn btn-primary btn-sm" id="save-apikeys-btn">' + t('save') + '</button>' +
            '<button class="btn btn-secondary btn-sm" id="cancel-apikeys-btn">' + t('cancel') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="two-col-grid">' +
    '<div class="panel-card settings-card">' +
      '<h3 class="bot-card-header"><span>' + t('levels_spot') + '</span><span class="bot-header-controls"><select class="budget-select" data-mode="spot"><option value="100"' + ((settings.preferences.spot_budget || 100) == 100 ? ' selected' : '') + '>$100</option><option value="1000"' + ((settings.preferences.spot_budget || 100) == 1000 ? ' selected' : '') + '>$1,000</option><option value="10000"' + ((settings.preferences.spot_budget || 100) == 10000 ? ' selected' : '') + '>$10,000</option></select><button class="toggle-bot-btn ' + (settings.preferences.spot_enabled ? 'active' : 'inactive') + '" data-mode="spot">' + (settings.preferences.spot_enabled ? t('active') : t('inactive')) + '</button></span></h3>' +
      '<div id="spot-levels-content">' + renderLevelsTable(settings.levels.spot || [], 'spot') + '</div>' +
    '</div>' +
    '<div class="panel-card settings-card">' +
      '<h3 class="bot-card-header"><span>' + t('levels_futures') + '</span><span class="bot-header-controls"><select class="budget-select" data-mode="futures"><option value="200"' + ((settings.preferences.futures_budget || 200) == 200 ? ' selected' : '') + '>$200</option><option value="1000"' + ((settings.preferences.futures_budget || 200) == 1000 ? ' selected' : '') + '>$1,000</option><option value="10000"' + ((settings.preferences.futures_budget || 200) == 10000 ? ' selected' : '') + '>$10,000</option></select><button class="toggle-bot-btn ' + (settings.preferences.futures_enabled ? 'active' : 'inactive') + '" data-mode="futures">' + (settings.preferences.futures_enabled ? t('active') : t('inactive')) + '</button></span></h3>' +
      '<div id="futures-levels-content">' + renderLevelsTable(settings.levels.futures || [], 'futures') + '</div>' +
    '</div>' +
    '</div>' +
    '<div class="panel-card settings-card">' +
      '<h3>' + t('info') + '</h3>' +
      '<div class="settings-row"><span class="settings-label">' + t('version') + '</span><span class="settings-value">' + VERSION + '</span></div>' +
      '<div class="settings-row"><span class="settings-label">' + t('last_update') + '</span><span class="settings-value">' + (store.state.trading.lastUpdate ? store.state.trading.lastUpdate.toLocaleTimeString() : '---') + '</span></div>' +
    '</div>';

  bindSettingsEvents();
}

function getDefaultLevels(mode) {
  var isSpot = mode === 'spot';
  return [
    { level: 10, enabled: 1, position_size_usdt: 10, min_score: 10, min_confidence: 10, leverage: 10 },
    { level: 9,  enabled: 1, position_size_usdt: 20, min_score: 9,  min_confidence: 9,  leverage: 10 },
    { level: 8,  enabled: 1, position_size_usdt: 40, min_score: 8,  min_confidence: 8,  leverage: 10 },
    { level: 7,  enabled: 1, position_size_usdt: 20, min_score: 7,  min_confidence: 7,  leverage: 5  },
    { level: 6,  enabled: 1, position_size_usdt: 10, min_score: isSpot ? 7 : 8, min_confidence: 6, leverage: 3 },
    { level: 5,  enabled: 1, position_size_usdt: 0,  min_score: 0,  min_confidence: 0,  leverage: 1 },
    { level: 4,  enabled: 1, position_size_usdt: 0,  min_score: 0,  min_confidence: 0,  leverage: 1 },
    { level: 3,  enabled: 1, position_size_usdt: 0,  min_score: 0,  min_confidence: 0,  leverage: 1 },
    { level: 2,  enabled: 1, position_size_usdt: 0,  min_score: 0,  min_confidence: 0,  leverage: 1 },
    { level: 1,  enabled: 1, position_size_usdt: 0,  min_score: 0,  min_confidence: 0,  leverage: 1 }
  ];
}

function renderLevelsTable(levels, mode) {
  var rows = getDefaultLevels(mode);
  if (levels && levels.length) {
    rows.forEach(function(row) {
      var saved = levels.find(function(l) { return l.level === row.level; });
      if (saved) {
        row.enabled = saved.enabled;
        row.min_score = saved.min_score;
        row.min_confidence = saved.min_confidence;
        row.position_size_usdt = saved.position_size_usdt;
        row.leverage = saved.leverage;
      }
    });
  }
  levels = rows;
  var html = '<table style="width:100%;font-size:.78rem;border-collapse:collapse">';
  html += '<tr style="color:var(--text-muted);text-align:center;font-size:.7rem;text-transform:uppercase;letter-spacing:.5px">';
  html += '<th style="text-align:left">' + t('id') + '</th>';
  html += '<th style="text-align:left">' + t('lvl') + '</th>';
  html += '<th>' + t('score') + '</th>';
  html += '<th>' + t('conf') + '</th>';
  html += '<th>' + t('usd_amount') + '</th>';
  html += '<th>' + t('leverage') + '</th>';
  html += '<th>' + t('on') + '</th>';
  html += '</tr>';
  levels.forEach(function(l) {
    var hasValues = (l.min_score > 0 || l.min_confidence > 0 || l.position_size_usdt > 0);
    var lvlPrefix = mode === 'spot' ? 'S' : 'F';
    var idNum = 11 - l.level;
    var idPrefix = mode === 'spot' ? 'S' : 'F';
    html += '<tr style="border-top:1px solid var(--border)">';
    html += '<td style="text-align:left;font-weight:600;color:' + (hasValues ? 'var(--text-primary)' : 'var(--text-muted)') + '">' + idPrefix + idNum + '</td>';
    html += '<td style="text-align:left;font-weight:600;color:' + (hasValues ? 'var(--text-primary)' : 'var(--text-muted)') + '">' + lvlPrefix + l.level + '</td>';
    html += '<td><input class="level-input" type="number" min="1" max="10" step="1" value="' + (l.min_score || '') + '" placeholder="—" data-mode="' + mode + '" data-level="' + l.level + '" data-field="min_score"></td>';
    html += '<td><input class="level-input" type="number" min="1" max="10" step="1" value="' + (l.min_confidence || '') + '" placeholder="—" data-mode="' + mode + '" data-level="' + l.level + '" data-field="min_confidence"></td>';
    html += '<td><input class="level-input" type="number" min="0" step="1" value="' + (l.position_size_usdt || '') + '" placeholder="—" data-mode="' + mode + '" data-level="' + l.level + '" data-field="position_size_usdt"></td>';
    html += '<td><input class="level-input" type="number" min="1" max="125" step="1" value="' + (l.leverage || 1) + '" placeholder="1" data-mode="' + mode + '" data-level="' + l.level + '" data-field="leverage"></td>';
    html += '<td style="text-align:center"><div class="toggle-switch ' + (l.enabled ? 'on' : '') + '" style="width:32px;height:18px;cursor:pointer" data-level-toggle="' + l.level + '" data-mode="' + mode + '"></div></td>';
    html += '</tr>';
  });
  html += '</table>';
  html += '<button class="btn btn-primary btn-sm" style="margin-top:10px;width:100%" data-save-levels="' + mode + '">' + (mode === 'spot' ? t('save_levels') : t('save_levels_futures')) + '</button>';
  return html;
}

function bindSettingsEvents() {
  var el = els['settings-content'];
  var auth = store.state.auth;
  var settings = store.state.settings;

  var langSelect = el.querySelector('#lang-select');
  if (langSelect) {
    langSelect.addEventListener('change', function() {
      var newLang = this.value;
      loadStrings(newLang, renderSettings);
      if (auth.selectedInscription && auth.address) {
        api.post('/api/trading/preferences', {
          inscriptionId: auth.selectedInscription,
          address: auth.address,
          language: newLang
        }, true).catch(function(e) { console.error('Save language:', e); });
      }
    });
  }

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
      .then(function() { toast(t('api_keys_saved'), 'success'); apiForm.classList.add('hidden'); loadSettingsData(); })
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
        .then(function() { toast(t('prefs_saved'), 'success'); prefsForm.classList.add('hidden'); loadSettingsData(); })
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
        .then(function() { tog.classList.toggle('on'); settings.preferences[field] = newVal; toast(field.replace('_', ' ') + ' ' + (newVal ? t('activated') : t('deactivated')), 'success'); })
        .catch(function(e) { toast('Error: ' + e.message, 'error'); });
    });
  });

  el.querySelectorAll('[data-level-toggle]').forEach(function(tog) {
    tog.addEventListener('click', function() {
      tog.classList.toggle('on');
    });
  });

  el.querySelectorAll('[data-save-levels]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var mode = btn.dataset.saveLevels;
      var levels = [];
      for (var i = 1; i <= 10; i++) {
        var scoreInput = el.querySelector('[data-mode="' + mode + '"][data-level="' + i + '"][data-field="min_score"]');
        var confInput = el.querySelector('[data-mode="' + mode + '"][data-level="' + i + '"][data-field="min_confidence"]');
        var amountInput = el.querySelector('[data-mode="' + mode + '"][data-level="' + i + '"][data-field="position_size_usdt"]');
        var levInput = el.querySelector('[data-mode="' + mode + '"][data-level="' + i + '"][data-field="leverage"]');
        var togEl = el.querySelector('[data-level-toggle="' + i + '"][data-mode="' + mode + '"]');
        levels.push({
          level: i,
          enabled: togEl && togEl.classList.contains('on') ? 1 : 0,
          min_score: parseInt(scoreInput && scoreInput.value) || 0,
          min_confidence: parseInt(confInput && confInput.value) || 0,
          position_size_usdt: parseFloat(amountInput && amountInput.value) || 0,
          leverage: parseInt(levInput && levInput.value) || 1
        });
      }
      api.post('/api/trading/strategies/levels', { inscription_id: auth.selectedInscription, mode: mode, levels: levels }, true)
        .then(function() { toast(t('levels_saved') + ' ' + mode.toUpperCase(), 'success'); settings.levels[mode] = levels; })
        .catch(function(e) { toast('Error: ' + e.message, 'error'); });
    });
  });

  el.querySelectorAll('.budget-select').forEach(function(sel) {
    sel.addEventListener('change', function() {
      var mode = sel.dataset.mode;
      var budget = parseFloat(sel.value);
      api.post('/api/trading/budget', { inscriptionId: auth.selectedInscription, mode: mode, budget: budget }, true)
        .then(function() {
          settings.preferences[mode + '_budget'] = budget;
          toast(t('budget_updated') + budget.toLocaleString(), 'success');
        })
        .catch(function(e) { toast('Error: ' + e.message, 'error'); });
    });
  });

  el.querySelectorAll('.toggle-bot-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var mode = btn.dataset.mode;
      var field = mode + '_enabled';
      var current = settings.preferences[field] || 0;
      if (current) {
        if (!confirm(t('confirm_disable_bot') + ' ' + mode.toUpperCase() + '?')) return;
      }
      var newVal = current ? 0 : 1;
      var body = { inscriptionId: auth.selectedInscription, address: auth.address };
      body[field] = newVal;
      api.post('/api/trading/preferences', body, true)
        .then(function() {
          settings.preferences[field] = newVal;
          btn.classList.toggle('active', !!newVal);
          btn.classList.toggle('inactive', !newVal);
          btn.textContent = newVal ? t('active') : t('inactive');
          btn.style.background = newVal ? '#4CAF50' : '#333333';
          btn.style.color = newVal ? '#fff' : '#666';
          toast(mode.toUpperCase() + ' ' + (newVal ? t('enabled') : t('disabled')), 'success');
          loadSettingsData();
        })
        .catch(function(e) { toast('Error: ' + e.message, 'error'); });
    });
  });
}

/* ============================================
   PANEL (menu)
   ============================================ */
function openPanel() {
  if (window.innerWidth <= 1024) {
    els['sidebar']?.classList.add('sidebar-open');
    els['sidebar-backdrop']?.classList.remove('hidden');
  } else {
    els['right-panel'].classList.add('panel-open');
    els['backdrop'].classList.remove('hidden');
  }
}
function closePanel() {
  els['right-panel'].classList.remove('panel-open');
  els['backdrop'].classList.add('hidden');
  els['sidebar']?.classList.remove('sidebar-open');
  els['sidebar-backdrop']?.classList.add('hidden');
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
  els['menu-btn']?.addEventListener('click', function() {
    if (window.innerWidth <= 1024) {
      els['sidebar']?.classList.toggle('sidebar-open');
      els['sidebar-backdrop']?.classList.toggle('visible');
    } else {
      openPanel();
    }
  });
  els['opp-toggle-btn']?.addEventListener('click', function() {
    if (window.innerWidth <= 1024) {
      els['sidebar']?.classList.toggle('sidebar-open');
      els['sidebar-backdrop']?.classList.toggle('visible');
    } else {
      els['sidebar']?.classList.toggle('collapsed');
    }
  });
  els['panel-close']?.addEventListener('click', closePanel);
  els['backdrop']?.addEventListener('click', closePanel);
  els['sidebar-backdrop']?.addEventListener('click', function() {
    els['sidebar']?.classList.remove('sidebar-open');
    this.classList.remove('visible');
  });
  els['disconnect-btn']?.addEventListener('click', disconnect);
  els['modal-overlay']?.addEventListener('click', function(e) {
    if (e.target === els['modal-overlay']) hideModal();
  });

  // Indicator menu toggle
  els['indicator-btn']?.addEventListener('click', function(e) {
    e.stopPropagation();
    els['indicator-dropdown']?.classList.toggle('hidden');
  });

  // Indicator checkboxes
  ['ind-rsi', 'ind-sma', 'ind-ema', 'ind-oi'].forEach(function(id) {
    var el = els[id];
    if (el) {
      el.addEventListener('change', function() {
        var indicator = this.dataset.indicator;
        var data = store.state.trading.klines || [];
        if (indicator === 'rsi') {
          if (this.checked) {
            renderRSI(data);
            els['rsi-container']?.classList.remove('hidden');
          } else {
            BittickChart.removeRSI && BittickChart.removeRSI();
            els['rsi-container']?.classList.add('hidden');
          }
        } else if (indicator === 'sma') {
          if (this.checked) BittickChart.addSMA && BittickChart.addSMA(data, 20);
          else BittickChart.removeSMA && BittickChart.removeSMA();
        } else if (indicator === 'ema') {
          if (this.checked) BittickChart.addEMA && BittickChart.addEMA(data, 50);
          else BittickChart.removeEMA && BittickChart.removeEMA();
        } else if (indicator === 'oi') {
          if (this.checked) {
            renderOI(data);
            els['oi-container']?.classList.remove('hidden');
          } else {
            BittickChart.removeOI && BittickChart.removeOI();
            els['oi-container']?.classList.add('hidden');
          }
        }
      });
    }
  });

  // Close dropdown on click outside
  document.addEventListener('click', function(e) {
    if (!els['indicator-menu']?.contains(e.target)) {
      els['indicator-dropdown']?.classList.add('hidden');
    }
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

  loadStrings(currentLang, function() {
    restoreSession();
    // Auto-save session on page unload to persist selectedInscription
    window.addEventListener('beforeunload', saveSession);
    onHashChange();
  });

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
