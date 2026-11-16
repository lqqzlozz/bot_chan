const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const st = require('../utils/store');
const { panel, serialize, profiles } = require('../utils/entryPanel');
const { isOwner, deny } = require('../utils/perm');

// このサーバー専用
const { GUILD, isEnabled } = require('../utils/entryScope');

module.exports = {
  guild: GUILD,
  data: new SlashCommandBuilder()
    .setName('entry')
    .setDescription('大会の参戦募集を開始します')
    .addStringOption(option =>
      option.setName('text')
        .setDescription('募集本文を入力してください')
        .setRequired(true)
        .setMaxLength(4096)
    )
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('参加者に付与するロールを選択してください')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!isEnabled(interaction.guildId)) {
      return interaction.reply({ content: '❌ このサーバーではこのコマンドを使用できません。', ephemeral: true });
    }
    if (!isOwner(interaction)) return deny(interaction);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let posted;
    try {
      const text = interaction.options.getString('text', true);
      const role = interaction.options.getRole('role', true);
      const channel = interaction.channel;
      const replyError = description => interaction.editReply({ embeds: [{ description, color: 0x5865F2 }] });

      await serialize(channel.id, async () => {
        const targetRole = await interaction.guild.roles.fetch(role.id);
        if (!targetRole || targetRole.id === interaction.guildId || targetRole.managed || !targetRole.editable) {
          await replyError('Botが付与・解除できる参加者ロールを選んでください。');
          return;
        }

        const config = st.get(interaction.guildId);
        const previous = config.entry[channel.id];
        const saved = profiles(interaction.guildId);
        const participants = new Map();
        // Keep known participants from the current recruitment when reusing its role.
        if (previous?.roleId === role.id) {
          for (const player of previous.participants) participants.set(player.id, player);
        }
        // Use cached role members without waiting for a server-wide Gateway request.
        for (const member of targetRole.members.values()) {
          if (member.user.bot || participants.has(member.id)) continue;
          participants.set(member.id, { id: member.id, name: member.displayName, ...saved[member.id] });
        }
        const data = { text, roleId: role.id, participants: [...participants.values()] };
        posted = await channel.send(panel(data));
        config.entry[channel.id] = { ...data, msg: posted.id };
        if (!await st.save(interaction.guild)) {
          // Preserve the previous configuration if this message can be rolled back.
          await posted.delete();
          if (previous) config.entry[channel.id] = previous;
          else delete config.entry[channel.id];
          posted = undefined;
          await replyError('募集を保存できませんでした。#bot-config にBotが投稿・ファイル添付できるか確認してください。');
          return;
        }
        await interaction.deleteReply().catch(error => console.error('/entry の処理中表示を消せませんでした:', error));
      });
    } catch (error) {
      console.error('/entry の募集作成に失敗:', error);
      const description = posted
        ? '募集は投稿されましたが、設定を保存できませんでした。#bot-config の権限を確認してください。'
        : '募集を投稿できませんでした。Botの投稿・埋め込み権限と、参加者ロールの設定を確認してください。';
      await interaction.editReply({ embeds: [{ description, color: 0x5865F2 }] });
    }
  },
};
