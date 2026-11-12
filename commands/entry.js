const { SlashCommandBuilder } = require('discord.js');
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

    // 💡 誰が使ったか非表示にするため、最初から ephemeral: true でコマンド自体への応答を完了させる
    await interaction.deferReply({ ephemeral: true });

    const text = interaction.options.getString('text');
    const role = interaction.options.getRole('role');
    const channel = interaction.channel;

    try {
      await interaction.guild.members.fetch({ withPresences: false });
    } catch (error) {
      console.error(error);
    }

    const initialParticipants = [];
    const targetRole = await interaction.guild.roles.fetch(role.id);
    
    if (targetRole) {
      targetRole.members.forEach(member => {
        if (!member.user.bot) {
          initialParticipants.push({
            id: member.id,
            name: member.displayName
          });
        }
      });
    }

    const data = {
      text: text,
      roleId: role.id,
      participants: initialParticipants
    };

    await serialize(channel.id, async () => {
      const saved = profiles(interaction.guildId);
      for (const player of initialParticipants) Object.assign(player, saved[player.id]);
      const response = await channel.send(panel(data));
      st.get(interaction.guildId).entry[channel.id] = { ...data, msg: response.id };
      await st.save(interaction.guild);
    });
    await interaction.deleteReply();
  },
};
