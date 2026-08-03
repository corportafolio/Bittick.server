const axios = require('axios');
const crypto = require('crypto');
const logger = require('../logger/logger');
const pool = require('../engine/poolStore');

const SPOT_BASE = 'https://testnet.binance.vision';
const FUTURES_BASE = 'https://testnet.binancefuture.com';
const MAINNET_SPOT_BASE = 'https://api.binance.com';
const MAINNET_FUTURES_BASE = 'https://fapi.binance.com';

function sign(queryString, secret) {
  return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
}

function getPublicBase(type) {
  return type === 'futures' ? MAINNET_FUTURES_BASE : MAINNET_SPOT_BASE;
}

function getBase(type) {
  return type === 'futures' ? FUTURES_BASE : SPOT_BASE;
}

function getApiKey(type, inscriptionId) {
  if (inscriptionId) {
    const keys = pool.getBotApiKey(inscriptionId, type);
    if (keys) return keys.api_key;
  }
  return type === 'futures'
    ? process.env.BINANCE_FUTURES_API_KEY
    : process.env.BINANCE_SPOT_API_KEY;
}

function getApiSecret(type, inscriptionId) {
  if (inscriptionId) {
    const keys = pool.getBotApiKey(inscriptionId, type);
    if (keys) return keys.api_secret;
  }
  return type === 'futures'
    ? process.env.BINANCE_FUTURES_API_SECRET
    : process.env.BINANCE_SPOT_API_SECRET;
}

function apiPrefix(type) {
  return type === 'futures' ? '/fapi' : '/api';
}

async function publicRequest(type, path, params = {}) {
  const base = getPublicBase(type);
  const prefix = apiPrefix(type);
  const { data } = await axios.get(`${base}${prefix}${path}`, { params });
  return data;
}

async function signedRequest(type, method, path, params = {}, inscriptionId = null) {
  const base = getBase(type);
  const prefix = apiPrefix(type);
  const apiKey = getApiKey(type, inscriptionId);
  const apiSecret = getApiSecret(type, inscriptionId);
  if (!apiKey || !apiSecret) {
    throw new Error(`Binance ${type} API keys not configured`);
  }
  params.timestamp = Date.now();
  const queryString = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const signature = sign(queryString, apiSecret);

  const url = `${base}${prefix}${path}`;
  const config = {
    headers: { 'X-MBX-APIKEY': apiKey }
  };

  let data;
  if (method === 'GET') {
    const resp = await axios.get(url, { ...config, params: { ...params, signature } });
    data = resp.data;
  } else if (method === 'POST') {
    const resp = await axios.post(url, null, { ...config, params: { ...params, signature } });
    data = resp.data;
  } else if (method === 'DELETE') {
    const resp = await axios.delete(url, { ...config, params: { ...params, signature } });
    data = resp.data;
  }
  return data;
}

async function getKlines(symbol = 'BTCUSDT', interval = '1h', limit = 100, type = 'spot', options = {}) {
  const base = getPublicBase(type);
  const prefix = apiPrefix(type);
  const v = type === 'futures' ? 'v1' : 'v3';
  const params = { symbol, interval, limit };
  if (options.startTime) params.startTime = options.startTime;
  if (options.endTime) params.endTime = options.endTime;
  const { data } = await axios.get(`${base}${prefix}/${v}/klines`, { params });
  return data.map(k => ({
    openTime: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]),
    low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]),
    closeTime: k[6]
  }));
}

async function getTickerPrice(symbol = 'BTCUSDT', type = 'spot') {
  const path = type === 'futures' ? '/v1/ticker/price' : '/v3/ticker/price';
  const data = await publicRequest(type, path, { symbol });
  return { symbol: data.symbol, price: parseFloat(data.price) };
}

async function get24hrTicker(symbol = 'BTCUSDT', type = 'spot') {
  const path = type === 'futures' ? '/v1/ticker/24hr' : '/v3/ticker/24hr';
  const data = await publicRequest(type, path, { symbol });
  return {
    symbol: data.symbol, priceChange: parseFloat(data.priceChange),
    priceChangePercent: parseFloat(data.priceChangePercent),
    highPrice: parseFloat(data.highPrice), lowPrice: parseFloat(data.lowPrice),
    volume: parseFloat(data.volume), quoteVolume: parseFloat(data.quoteVolume)
  };
}

async function placeOrder(type, symbol, side, quantity, options = {}, inscriptionId = null) {
  const params = {
    symbol,
    side,
    type: options.type || 'MARKET',
    quantity
  };
  if (options.type === 'LIMIT') {
    params.price = options.price;
    params.timeInForce = 'GTC';
  }
  if (type === 'futures') {
    params.positionSide = options.positionSide || 'BOTH';
  }
  const path = type === 'futures' ? '/v1/order' : '/v3/order';
  return signedRequest(type, 'POST', path, params, inscriptionId);
}

async function cancelOrder(type, symbol, orderId, inscriptionId = null) {
  const path = type === 'futures' ? '/v1/order' : '/v3/order';
  return signedRequest(type, 'DELETE', path, { symbol, orderId }, inscriptionId);
}

async function getAccountInfo(type, inscriptionId = null) {
  const path = type === 'futures' ? '/v2/account' : '/v3/account';
  return signedRequest(type, 'GET', path, {}, inscriptionId);
}

async function getPositionRisk(type, inscriptionId = null) {
  if (type !== 'futures') return [];
  return signedRequest(type, 'GET', '/v2/positionRisk', {}, inscriptionId);
}

async function getOpenOrders(type, symbol, inscriptionId = null) {
  const path = type === 'futures' ? '/v1/openOrders' : '/v3/openOrders';
  return signedRequest(type, 'GET', path, { symbol }, inscriptionId);
}

async function setLeverage(symbol, leverage, inscriptionId = null) {
  return signedRequest('futures', 'POST', '/v1/leverage', { symbol, leverage }, inscriptionId);
}

async function getBalance(type, inscriptionId = null) {
  if (type === 'futures') {
    const acc = await getAccountInfo('futures', inscriptionId);
    const usdt = acc.assets?.find(a => a.asset === 'USDT');
    return { total: parseFloat(usdt?.walletBalance || 0), available: parseFloat(usdt?.availableBalance || 0) };
  }
  const acc = await getAccountInfo('spot', inscriptionId);
  const usdt = acc.balances?.find(b => b.asset === 'USDT');
  return { total: parseFloat(usdt?.free || 0) + parseFloat(usdt?.locked || 0), available: parseFloat(usdt?.free || 0) };
}

async function getOpenInterestHist(symbol = 'BTCUSDT', period = '1h', limit = 100) {
  const { data } = await axios.get(
    `${MAINNET_FUTURES_BASE}/futures/data/openInterestHist`,
    { params: { symbol, period, limit } }
  );
  return data.map(d => ({
    timestamp: parseInt(d.timestamp),
    openInterest: parseFloat(d.sumOpenInterest),
    openInterestValue: parseFloat(d.sumOpenInterestValue)
  }));
}

module.exports = {
  getKlines, getTickerPrice, get24hrTicker,
  placeOrder, cancelOrder, getAccountInfo, getPositionRisk, getOpenOrders, getBalance, setLeverage,
  getOpenInterestHist
};
