const { ChannelType, ComponentType, MessageFlags, PermissionFlagsBits: P } = require('discord.js');

const read = P.ViewChannel | P.ReadMessageHistory;
const channelTypes = new Set([ChannelType.GuildText, ChannelType.GuildAnnouncement,
  ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread]);

function messageLinks(content, guildId) {
  const plain = content.replace(/`{3}[\s\S]*?(?:`{3}|$)|`[^`\n]*(?:`|$)|\|\|[\s\S]*?(?:\|\||$)|<https?:\/\/[^>\s]+>/gi, ' ');
  const pattern = /https?:\/\/(?:(?:canary|ptb|www)\.)?discord(?:app)?\.com\/channels\/(\d{17,20})\/(\d{17,20})\/(\d{17,20})(?![\w/])/gi;
  const found = new Map();
  for (const [, guild, channel, id] of plain.matchAll(pattern)) {
    if (guild === guildId) found.set(id, { channel, id });
    if (found.size === 3) break;
  }
  return found.values();
}

async function canQuote(source, destination, member) {
  if (!member || !channelTypes.has(source.type) || !channelTypes.has(destination.type)) return false;
  const from = source.isThread() ? source.parent : source;
  const to = destination.isThread() ? destination.parent : destination;
  if (!from || !to || (from.nsfw && !to.nsfw)) return false;
  const permissions = from.permissionsFor(member);
  if (!permissions?.has(read)) return false;
  if (source.type === ChannelType.PrivateThread && source.id !== destination.id && !permissions.has(P.ManageThreads)) {
    const membership = await source.members.fetch({ member: member.id, force: true });
    return membership.id === member.id;
  }
  return true;
}

function componentText(components) {
  return (components || []).flatMap(c => {
    if (c.spoiler || c.data?.spoiler) return [];
    if (c.type === ComponentType.TextDisplay) return [c.content];
    return c.components ? componentText(c.components) : [];
  }).filter(Boolean);
}

function preview(original) {
  const attachment = original.attachments.find(a => !a.spoiler && a.contentType?.startsWith('image/'));
  const body = original.content || componentText(original.components).join('\n') ||
    original.embeds.map(e => [e.title, e.description].filter(Boolean).join('\n')).filter(Boolean).join('\n') ||
    original.attachments.map(a => a.spoiler ? '添付ファイル（スポイラー）' : a.name).join('\n') ||
    original.stickers.map(s => s.name).join('\n');
  // Truncating inside a spoiler could expose its contents as ordinary text.
  const safeBody = body.replace(/\|\|[\s\S]*?(?:\|\||$)/g, '（スポイラー）');
  const description = safeBody.length > 1500 ? safeBody.slice(0, 1499) + '…' : safeBody;
  return {
    color: 0x5865F2,
    author: { name: original.member?.displayName || original.author.displayName || original.author.username,
      icon_url: original.author.displayAvatarURL() },
    title: '元のメッセージを見る', url: original.url,
    description: description || undefined,
    footer: { text: '#' + original.channel.name }, timestamp: original.createdAt.toISOString(),
    image: attachment ? { url: attachment.url } : undefined
  };
}

async function onMessage(message) {
  if (!message.guild || message.author.bot || message.webhookId || !message.content?.includes('/channels/')) return;
  const embeds = [];
  for (const { channel, id } of messageLinks(message.content, message.guildId)) {
    if (id === message.id) continue;
    try {
      const source = channel === message.channelId ? message.channel : await message.guild.channels.fetch(channel);
      if (!source || !await canQuote(source, message.channel, message.member)) continue;
      const original = await source.messages.fetch({ message: id, force: true });
      if (!original.flags.has(MessageFlags.Ephemeral)) embeds.push(preview(original));
    } catch (error) {
      if (![10003, 10007, 10008, 50001, 50013].includes(error.code)) console.warn('メッセージリンクの取得に失敗:', error.code || error.name);
    }
  }
  if (embeds.length) await message.reply({ embeds, allowedMentions: { parse: [], repliedUser: false } });
}

module.exports = { onMessage };
