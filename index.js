const http = require('http');
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection } = require('discord.js');

// Botクライアントの設定（必要な権限の有効化）
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

// コマンド格納用のコレクション
client.commands = new Collection();

// 画像生成用のフォント登録（来場予約機能で使用）
const { GlobalFonts } = require('@napi-rs/canvas');
const fontBase = path.join(__dirname, 'node_modules', '@fontsource', 'noto-sans-jp', 'files');
try {
  GlobalFonts.registerFromPath(path.join(fontBase, 'noto-sans-jp-japanese-900-normal.woff'), 'NotoSansJP-Black');
  GlobalFonts.registerFromPath(path.join(fontBase, 'noto-sans-jp-japanese-100-normal.woff'), 'NotoSansJP-Thin');
  console.log('フォントの読み込みが完了しました。');
} catch (err) {
  console.warn(`フォントの読み込みに失敗しました: ${err.message}`);
}

// eventsフォルダ内のイベントファイルを自動読み込み
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
  }
}

// commandsフォルダ内のコマンドファイルを自動読み込み
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
    }
  }
}

// Render・UptimeRobotの常時起動用HTTPサーバー（ポート3000）
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
}).listen(PORT, () => {
  console.log(`サーバー起動：ポート ${PORT}`);
});

// Discordへのログイン
client.login(process.env.DISCORD_TOKEN);
