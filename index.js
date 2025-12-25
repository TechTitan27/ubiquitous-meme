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
    printQRInTerminal: false,
    auth: state,
    version,
    browser: randomBrowser
  });

  // ✅ AUTO PAIRING FOR RENDER (NO INPUT)
  if (!sock.authState.creds.registered) {
    const phoneNumber = config().botNumber;

    if (!phoneNumber) {
      console.log(chalk.red("❌ botNumber missing in config"));
      process.exit(1);
    }

    const code = await sock.requestPairingCode(phoneNumber);
    console.log(chalk.green("🔗 Pairing Code: " + chalk.bold.green(code)));
  }

  store.bind(sock.ev);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'connecting') {
      console.log(chalk.yellow('🔄 Connecting to WhatsApp...'));
    }

    if (connection === 'open') {
      console.log(chalk.green('✅ Connected to WhatsApp successfully!'));

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
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      console.log(chalk.red('❌ Connection closed'));

      if (shouldReconnect) {
        console.log(chalk.yellow('🔄 Reconnecting...'));
        setTimeout(clientstart, 5000);
      }
    }
  });

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

process.on('unhandledRejection', (reason) => {
  console.log('Unhandled Rejection:', reason);
});

let file = require.resolve(__filename);
fs.watchFile(file, () => {
  delete require.cache[file];
  require(file);
});        groupMetadata: new Map(),
        loadMessage: async (jid, id) => store.messages.get(`${jid}:${id}`) || null,
        bind: (ev) => {
            ev.on('messages.upsert', ({ messages }) => {
                for (const msg of messages) {
                    if (msg.key?.remoteJid && msg.key?.id) {
                        store.messages.set(`${msg.key.remoteJid}:${msg.key.id}`, msg);
                    }
                }
            });
            
            ev.on('lid-mapping.update', ({ mappings }) => {
                console.log(chalk.cyan('📋 LID Mapping Update:'), mappings);
            });
        }
    };
    
    const { state, saveCreds } = await useMultiFileAuthState(`./${config().session}`);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: !config().status.terminal,
        auth: state,
        version: version,
        browser: randomBrowser
    });
    
    if (config().status.terminal && !sock.authState.creds.registered) {
        const phoneNumber = await question('enter your WhatsApp number, starting with 91:\nnumber WhatsApp: ');
        const code = await sock.requestPairingCode(phoneNumber);
        console.log(chalk.green(`your pairing code: ` + chalk.bold.green(code)));
    }
    
    store.bind(sock.ev);
    
    const lidMapping = sock.signalRepository.lidMapping;
    
    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (connection === 'open') {
            const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            sock.sendMessage(botNumber, {
                text:
                    `👑 *${config().settings.title}* is Online!\n\n` +
                    `> 📌 User: ${sock.user.name || 'Unknown'}\n` +
                    `> ⚡ Prefix: [ . ]\n` +
                    `> 🚀 Mode: ${sock.public ? 'Public' : 'Self'}\n` +
                    `> 🤖 Version: 1.0.0\n` +
                    `> 👑 Owner: Desmond Owusu Yeboah\n\n` +
                    `✅ Bot connected successfully\n` +
                    `📢 Join our channel: https://whatsapp.com/channel/0029Vb05NOOLNSZzhqWQbG1Z`,
                forwardingScore: 1,
                isForwarded: true,
                externalAdReply: {
                    title: config().settings.title,
                    body: config().settings.description,
                    thumbnailUrl: config().thumbUrl,
                    sourceUrl: "https://whatsapp.com/channel/0029Vb05NOOLNSZzhqWQbG1Z",
                    mediaType: 1,
                    renderLargerThumbnail: false
                }
            }).catch(console.error);
        }
        
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) {
                setTimeout(clientstart, 5000);
            }
        }
    });

    sock.sendImageAsSticker = async (jid, path, quoted, options = {}) => {
        let buff = Buffer.isBuffer(path) ? 
            path : /^data:.*?\/.*?;base64,/i.test(path) ?
            Buffer.from(path.split(',')[1], 'base64') : /^https?:\/\//.test(path) ?
            await getBuffer(path) : fs.readFileSync(path);

        let buffer = options.packname ? await writeExifImg(buff, options) : await addExif(buff);
        await sock.sendMessage(jid, { sticker: { url: buffer } }, { quoted });
        return buffer;
    };
    
    sock.sendVideoAsSticker = async (jid, path, quoted, options = {}) => {
        let buff = Buffer.isBuffer(path) ? 
            path : /^data:.*?\/.*?;base64,/i.test(path) ?
            Buffer.from(path.split(',')[1], 'base64') : /^https?:\/\//.test(path) ?
            await getBuffer(path) : fs.readFileSync(path);

        let buffer = options.packname ? await writeExifVid(buff, options) : await videoToWebp(buff);
        await sock.sendMessage(jid, { sticker: { url: buffer } }, { quoted });
        return buffer;
    };
    
    sock.getFile = async (PATH, returnAsFilename) => {
        let data = Buffer.isBuffer(PATH) ?
              PATH : /^data:.*?\/.*?;base64,/i.test(PATH) ?
              Buffer.from(PATH.split(',')[1], 'base64') : /^https?:\/\//.test(PATH) ?
              await getBuffer(PATH) : fs.readFileSync(PATH);

        const type = await FileType.fromBuffer(data);
        let filename;
        if (returnAsFilename && type) {
            filename = path.join(__dirname, './tmp/' + Date.now() + '.' + type.ext);
            fs.writeFileSync(filename, data);
        }
        return { data, type, filename };
    };

    return sock;
};

clientstart();

