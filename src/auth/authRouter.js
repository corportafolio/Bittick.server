const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { getBotByNum, getBotByInscriptionId, hasInscriptionId, getTier } = require('./bittickCollection');
const logger = require('../logger/logger');

const router = express.Router();

const NONCE_STORE = new Map();
const NONCE_TTL_MS = 5 * 60 * 1000;

function generateNonce() {
  return crypto.randomBytes(16).toString('hex');
}

function storeNonce(address, nonce) {
  NONCE_STORE.set(address.toLowerCase(), { nonce, expiresAt: Date.now() + NONCE_TTL_MS });
}

function validateAndConsumeNonce(address, nonce) {
  const key = address.toLowerCase();
  const stored = NONCE_STORE.get(key);
  if (!stored) return false;
  if (Date.now() > stored.expiresAt) {
    NONCE_STORE.delete(key);
    return false;
  }
  if (stored.nonce !== nonce) return false;
  NONCE_STORE.delete(key);
  return true;
}

function verifyMessageSignature(address, message, signature) {
  try {
    const secp256k1 = require('secp256k1');
    const { hashMessage } = require('ethers');
    const msgHash = hashMessage(message);
    const sig = Buffer.from(signature, 'base64');
    const pubKey = secp256k1.ecdsaRecover(sig.slice(0, 64), sig[64], msgHash, false);
    const recoveredAddress = crypto.createHash('sha256').update(pubKey.slice(1)).digest();
    const recoveredAddressHex = '0x' + recoveredAddress.slice(-20).toString('hex');
    return recoveredAddressHex.toLowerCase() === address.toLowerCase();
  } catch (e) {
    logger.error('auth', `Signature verification error: ${e.message}`);
    return false;
  }
}

async function findAllBittickInscriptions(address) {
  try {
    const ordinalsApiUrl = `https://api.ordiscan.io/v1/address/${address}/inscription-ids`;
    const response = await fetch(ordinalsApiUrl, {
      headers: { 'User-Agent': 'Bittick-Server/1.0' }
    });
    if (!response.ok) {
      logger.warn('auth', `Ordiscan API error: ${response.status} for address ${address}`);
      return { verified: false, inscriptions: [], error: 'API_ERROR' };
    }
    const data = await response.json();
    const userInscriptionIds = data.inscription_ids || [];
    const found = [];
    for (const userId of userInscriptionIds) {
      if (hasInscriptionId(userId)) {
        const bot = getBotByInscriptionId(userId);
        found.push({
          num: bot.num,
          inscriptionId: userId,
          tier: bot.tier,
          botImageUrl: `/api/auth/bot-image/${bot.num.toString().padStart(2, '0')}`
        });
      }
    }
    if (found.length === 0) {
      return { verified: false, inscriptions: [], error: 'NO_BOT_FOUND' };
    }
    return { verified: true, inscriptions: found, error: null };
  } catch (e) {
    logger.error('auth', `Wallet verification failed: ${e.message}`);
    return { verified: false, inscriptions: [], error: 'VERIFICATION_FAILED' };
  }
}

router.get('/nonce', (req, res) => {
  const { address } = req.query;
  if (!address) {
    return res.status(400).json({ exito: false, error: 'address query param required' });
  }
  const nonce = generateNonce();
  storeNonce(address, nonce);
  res.json({ exito: true, data: { nonce, message: 'Conectar a Bittick' } });
});

router.post('/verify-wallet', async (req, res) => {
  try {
    const { address, signature, nonce } = req.body;
    if (!address || !signature || !nonce) {
      return res.status(400).json({ exito: false, error: 'address, signature, nonce required' });
    }
    const message = 'Conectar a Bittick';
    if (!validateAndConsumeNonce(address, nonce)) {
      return res.status(400).json({ exito: false, error: 'Invalid or expired nonce' });
    }
    const sigValid = verifyMessageSignature(address, message, signature);
    if (!sigValid) {
      return res.status(401).json({ exito: false, error: 'Invalid signature' });
    }
    const ownership = await findAllBittickInscriptions(address);
    if (!ownership.verified) {
      return res.json({
        exito: true,
        data: { verified: false, inscriptions: [], count: 0, error: ownership.error, message: 'Wallet no posee un Bittick Agent' }
      });
    }
    const tradingStore = require('../trading/tradingStore');
    const inscriptionsWithSelected = ownership.inscriptions.map((ins, i) => ({
      ...ins,
      selected: i === 0 ? 1 : 0
    }));
    await tradingStore.setUserInscriptions(address, inscriptionsWithSelected);
    await tradingStore.setVerifiedOwner(address, ownership.inscriptions[0].num, ownership.inscriptions[0].inscriptionId);
    const selected = ownership.inscriptions[0];
    res.json({
      exito: true,
      data: {
        verified: true,
        inscriptions: ownership.inscriptions,
        count: ownership.inscriptions.length,
        selectedInscriptionId: selected.inscriptionId,
        selectedBotNum: selected.num,
        tier: selected.tier,
        botImageUrl: selected.botImageUrl,
        message: `${ownership.inscriptions.length} Bittick Agent(s) verificado(s)`
      }
    });
  } catch (e) {
    logger.error('auth', `Verify wallet error: ${e.message}`);
    res.status(500).json({ exito: false, error: 'Internal server error' });
  }
});

router.post('/select-inscription', async (req, res) => {
  try {
    const address = req.headers['x-wallet-address'];
    if (!address) {
      return res.status(400).json({ exito: false, error: 'x-wallet-address header required' });
    }
    const { inscriptionId } = req.body;
    if (!inscriptionId) {
      return res.status(400).json({ exito: false, error: 'inscriptionId required' });
    }
    const tradingStore = require('../trading/tradingStore');
    const inscriptions = tradingStore.getUserInscriptions(address);
    if (inscriptions.length === 0) {
      return res.status(400).json({ exito: false, error: 'No inscriptions found for this address' });
    }
    const match = inscriptions.find(i => i.inscription_id === inscriptionId);
    if (!match) {
      return res.status(400).json({ exito: false, error: 'Inscription not found in user collection' });
    }
    tradingStore.selectInscription(address, inscriptionId);
    await tradingStore.setVerifiedOwner(address, match.bot_num, match.inscription_id);
    res.json({
      exito: true,
      data: {
        selectedInscriptionId: match.inscription_id,
        selectedBotNum: match.bot_num,
        tier: match.tier,
        botImageUrl: `/api/auth/bot-image/${match.bot_num.toString().padStart(2, '0')}`
      }
    });
  } catch (e) {
    logger.error('auth', `Select inscription error: ${e.message}`);
    res.status(500).json({ exito: false, error: 'Internal server error' });
  }
});

router.get('/wallet-inscriptions', async (req, res) => {
  try {
    const address = req.headers['x-wallet-address'] || req.query.address;
    if (!address) {
      return res.status(400).json({ exito: false, error: 'address required' });
    }
    const tradingStore = require('../trading/tradingStore');
    const inscriptions = tradingStore.getUserInscriptions(address);
    const selected = tradingStore.getSelectedInscription(address);
    res.json({
      exito: true,
      data: {
        inscriptions: inscriptions.map(i => ({
          num: i.bot_num,
          inscriptionId: i.inscription_id,
          tier: i.tier,
          isSelected: i.selected === 1,
          botImageUrl: `/api/auth/bot-image/${i.bot_num.toString().padStart(2, '0')}`
        })),
        selectedInscriptionId: selected ? selected.inscription_id : null,
        selectedBotNum: selected ? selected.bot_num : null,
        tier: selected ? selected.tier : null
      }
    });
  } catch (e) {
    logger.error('auth', `Get wallet inscriptions error: ${e.message}`);
    res.status(500).json({ exito: false, error: 'Internal server error' });
  }
});

router.get('/bot-image/:num', (req, res) => {
  const num = parseInt(req.params.num);
  if (isNaN(num) || num < 0 || num > 99) {
    return res.status(404).json({ exito: false, error: 'Bot no encontrado' });
  }
  const bot = getBotByNum(num);
  if (!bot) {
    return res.status(404).json({ exito: false, error: 'Bot no encontrado' });
  }
  const imagePath = path.join(__dirname, '../../public/bots', `bot_${num.toString().padStart(2, '0')}.png`);
  if (!fs.existsSync(imagePath)) {
    return res.status(404).json({ exito: false, error: 'Imagen no disponible' });
  }
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(imagePath);
});

router.get('/verify-status', async (req, res) => {
  const { address } = req.query;
  if (!address) {
    return res.status(400).json({ exito: false, error: 'address required' });
  }
  const tradingStore = require('../trading/tradingStore');
  const owner = tradingStore.getSelectedInscription(address);
  if (!owner) {
    const allInscriptions = tradingStore.getUserInscriptions(address);
    if (allInscriptions.length > 0) {
      return res.json({
        exito: true,
        data: {
          verified: true,
          inscriptions: allInscriptions.map(i => ({
            num: i.bot_num,
            inscriptionId: i.inscription_id,
            tier: i.tier,
            isSelected: i.selected === 1,
            botImageUrl: `/api/auth/bot-image/${i.bot_num.toString().padStart(2, '0')}`
          })),
          selectedInscriptionId: null,
          selectedBotNum: null,
          tier: null,
          needsSelection: true,
          message: 'Multiple inscriptions found, selection required'
        }
      });
    }
    return res.json({ exito: true, data: { verified: false, inscriptions: [], count: 0 } });
  }
  const allInscriptions = tradingStore.getUserInscriptions(address);
  res.json({
    exito: true,
    data: {
      verified: true,
      inscriptions: allInscriptions.map(i => ({
        num: i.bot_num,
        inscriptionId: i.inscription_id,
        tier: i.tier,
        isSelected: i.selected === 1,
        botImageUrl: `/api/auth/bot-image/${i.bot_num.toString().padStart(2, '0')}`
      })),
      selectedInscriptionId: owner.inscription_id,
      selectedBotNum: owner.bot_num,
      tier: owner.tier,
      botImageUrl: `/api/auth/bot-image/${owner.bot_num.toString().padStart(2, '0')}`,
      verifiedAt: owner.verified_at
    }
  });
});

module.exports = router;
