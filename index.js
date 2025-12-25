console.clear();
const config = () => require('./settings/config');
process.on("uncaughtException", console.error);

let makeWASocket, Browsers, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, jidDecode, downloadContentFromMessage;

const loadBaileys = async () => {
  const baileys = await import('@whiskeysockets/baileys');

  makeWASocket = baileys.default;
  Browsers = baileys.Browsers;
  useMultiFileAuthState = baileys.useMultiFileAuthState;
  DisconnectReason = baileys.DisconnectReason;
  fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
  jidDecode = baileys.jidDecode;
  downloadContentFromMessage = baileys.downloadContentFromMessage;
};

const pino = require('pino');
const FileType = require('file-type');
const fs = require('fs');
const chalk = require("chalk");
const path = require("path");

const { Boom } = require('@hapi/boom');
const { getBuffer } = require('./library/function');
const { smsg } = require('./library/serialize');
const { videoToWebp, writeExifImg, writeExifVid, addExif, toPTT, toAudio } = require('./library/exif');

const clientstart = async () => {
  await loadBaileys();

  const browserOptions = [
    Browsers.macOS('Safari'),
    Browsers.macOS('Chrome'),
    Browsers.windows('Firefox'),
    Browsers.ubuntu('Chrome'),
    Browsers.baileys('Baileys'),
  ];

  const randomBrowser = browserOptions[Math.floor(Math.random() * browserOptions.length)];

  const store = {
    messages: new Map(),
    contacts: new Map(),
    bind: (ev) => {
      ev.on('messages.upsert', ({ messages }) => {
        for (const msg of messages) {
          if (msg.key?.remoteJid && msg.key?.id) {
            store.messages.set(`${msg.key.remoteJid}:${msg.key.id}`, msg);
          }
        }
      });
    }
  };

  const { state, saveCreds } = await useMultiFileAuthState(`./${config().session}`);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    printQRInTerminal: false, // no terminal input
    auth: state,
    version,
    browser: randomBrowser
  });

  store.bind(sock.ev);
  sock.ev.on('creds.update', saveCreds);

  // CONNECTION EVENTS
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'connecting') {
      console.log(chalk.yellow('🔄 Connecting to WhatsApp...'));
    }

    if (connection === 'open') {
      console.log(chalk.green('✅ Connected to WhatsApp successfully!'));

      // AUTO PAIRING FOR RENDER
      if (!sock.authState.creds.registered) {
        const phoneNumber = config().botNumber;
        if (!phoneNumber) {
          console.log(chalk.red("❌ botNumber missing in config"));
          process.exit(1);
        }

        try {
          const code = await sock.requestPairingCode(phoneNumber);
          console.log(chalk.green("🔗 Pairing Code: " + chalk.bold.green(code)));
        } catch (err) {
          console.log(chalk.red("❌ Failed to request pairing code:"), err);
        }
      }

      // Notify owner that bot is online
      const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      sock.sendMessage(botJid, {
        text:
          `👑 *${config().settings.title}* is Online!\n\n` +
          `> 👤 Owner: ${config().owner}\n` +
          `> ⚡ Mode: ${config().status.public ? 'Public' : 'Self'}\n` +
          `> 🤖 Version: 1.0.0\n\n` +
          `✅ Bot connected successfully`
      }).catch(() => {});
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(chalk.red('❌ Connection closed'));
      if (shouldReconnect) {
        console.log(chalk.yellow('🔄 Reconnecting...'));
        setTimeout(clientstart, 5000);
      }
    }
  });

  // MESSAGE HANDLER
  sock.ev.on('messages.upsert', async (chatUpdate) => {
    try {
      const mek = chatUpdate.messages[0];
      if (!mek.message) return;

      mek.message = Object.keys(mek.message)[0] === 'ephemeralMessage'
        ? mek.message.ephemeralMessage.message
        : mek.message;

      if (!sock.public && !mek.key.fromMe) return;

      const m = await smsg(sock, mek, store);
      require("./message")(sock, m, chatUpdate, store);

    } catch (err) {
      console.log(err);
    }
  });

  // OTHER UTILITIES
  sock.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
      const decode = jidDecode(jid) || {};
      return decode.user && decode.server
        ? decode.user + '@' + decode.server
        : jid;
    }
    return jid;
  };

  sock.public = config().status.public;

  sock.sendText = async (jid, text, quoted = '', options = {}) => {
    return sock.sendMessage(jid, { text, ...options }, { quoted });
  };

  sock.downloadMediaMessage = async (message) => {
    const mime = (message.msg || message).mimetype || '';
    const type = mime.split('/')[0];
    const stream = await downloadContentFromMessage(message, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    return buffer;
  };

  return sock;
};

clientstart();

// HANDLE UNHANDLED REJECTIONS
process.on('unhandledRejection', (reason) => {
  console.log('Unhandled Rejection:', reason);
});

// AUTO-RELOAD ON CHANGE
let file = require.resolve(__filename);
fs.watchFile(file, () => {
  delete require.cache[file];
  require(file);
});
