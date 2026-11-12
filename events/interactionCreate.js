const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder } = require('discord.js');
const st = require('../utils/store');
const { annRows } = require('../utils/annRows');
const intro = require('../utils/intro');
const art = require('../utils/artifact');
const gift = require('../utils/gift');
const buildPanel = require('../utils/buildPanel');
const { dismiss } = require('../utils/feedback');
const dict = require('../utils/dict');
const off = require('../utils/off');
const gn = require('../utils/gnews');
const inactive = require('../utils/inactive');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if ((interaction.isButton() || interaction.isModalSubmit() || interaction.isUserSelectMenu() || interaction.isStringSelectMenu()) && interaction.customId?.startsWith('entry_')) {
      try { await require('../utils/entryPanel').handle(interaction); }
      catch (error) {
        console.error('参加募集の操作に失敗:', error);
        const content = '操作できませんでした。参加者ロールの設定を確認してから、もう一度お試しください。';
        if (interaction.deferred) await interaction.editReply(content).catch(() => null);
        else if (!interaction.replied) await interaction.reply({ content, ephemeral: true }).catch(() => null);
      }
      return;
    }
    if ((interaction.isButton() || interaction.isModalSubmit()) && interaction.customId?.startsWith('season_')) {
      try { await require('../utils/seasonPanel').handle(interaction); }
      catch (error) {
        console.error('日程表示エラー:', error);
        const payload = { content: '日程を表示できませんでした。もう一度お試しください。' };
        if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => null);
        else await interaction.reply({ ...payload, ephemeral: true }).catch(() => null);
      }
      return;
    }
    if ((interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) && interaction.customId?.startsWith('wel_')) {
      try { await require('../utils/welcomePanel').handle(interaction); }
      catch(e) {
        console.error('Welcome操作エラー:',e);
        const text='処理に失敗しました。もう一度お試しください。';
        const privateV2=interaction.message?.flags?.has(MessageFlags.Ephemeral)&&interaction.message.flags.has(MessageFlags.IsComponentsV2);
        const payload=privateV2?{components:[new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(text))],flags:MessageFlags.IsComponentsV2}:{content:text,components:[]};
        if(interaction.deferred||interaction.replied)await interaction.editReply(payload).catch(()=>null);
        else if(privateV2)await interaction.update(payload).catch(()=>null);
        else await interaction.reply({...payload,flags:MessageFlags.Ephemeral}).catch(()=>null);
      }
      return;
    }
    if (interaction.isStringSelectMenu() && interaction.customId?.startsWith('gstats_char_')) {
      try { await require('../utils/genshinStats').handleSelect(interaction); }
      catch (error) { console.error('原神統計の選択エラー:',error); }
      return;
    }

    if (interaction.isButton() && interaction.customId?.startsWith('gstats_')) {
      try { await require('../utils/genshinStats').handleButton(interaction); }
      catch (error) {
        console.error('原神統計ページ送りエラー:', error);
        if (!interaction.deferred && !interaction.replied) await interaction.reply({content:'ページを切り替えられませんでした。', ephemeral:true}).catch(() => null);
      }
      return;
    }
    if (interaction.isButton() && interaction.customId?.startsWith('servers_')) {
      try { await require('../commands/servers').handleButton(interaction); }
      catch(e) {
        console.error('サーバー一覧ページ送りエラー:',e);
        if (!interaction.deferred && !interaction.replied) await interaction.reply({content:'ページを切り替えられませんでした。',ephemeral:true}).catch(()=>null);
      }
      return;
    }
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      if (interaction.guild && !['setup', 'setgenshin', 'servers'].includes(interaction.commandName) && !st.findCh(interaction.guild)) {
        return interaction.reply({ content: '⚠️ このBotは設定保存用の #bot-config が必要です。サーバー管理者が `/setup` を実行してください。原神サーバーとして登録する場合は `/setgenshin` でも準備できます。操作は #bot-config の管理パネルから行ってください。', allowedMentions: { parse: [] } });
      }
      try { await command.execute(interaction, client); } catch (error) { console.error(error); }
      return;
    }

    if ((interaction.isButton() || interaction.isStringSelectMenu() || interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu() || interaction.isModalSubmit()) && interaction.customId?.startsWith('pt_')) {
      try { await require('../utils/panelTestPreview').handle(interaction); }
      catch (error) {
        console.error('パネルプレビューエラー:', error);
        if (!interaction.deferred && !interaction.replied) await interaction.reply({content:'プレビューを表示できませんでした。',ephemeral:true}).catch(()=>null);
      }
      return;
    }

    if (interaction.isButton() && interaction.customId?.startsWith('ik_')) {
      try { await inactive.handleApproval(interaction); }
      catch(e){console.error('管理者キック承認エラー:',e);if(!interaction.deferred&&!interaction.replied)await interaction.reply({content:'操作できませんでした。',ephemeral:true}).catch(()=>null);}
      return;
    }

    if (interaction.isButton() && interaction.customId?.startsWith('ia_')) {
      try { await inactive.handleButton(interaction, client); } catch (e) {
        console.error('参加意思確認エラー:', e);
        const payload = { content: '処理できませんでした。サーバー管理者へお問い合わせください。', embeds: [], components: [] };
        if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => null);
        else await interaction.reply({ ...payload, ephemeral: true }).catch(() => null);
      }
      return;
    }

    if (interaction.customId?.startsWith('bc_')) {
      try { await buildPanel.handle(interaction); } catch (e) {
        console.error('ビルドカードエラー:', e);
        const payload = { content: 'カードを作成できませんでした。もう一度試してね。', embeds: [], attachments: [], components: [] };
        if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => null);
        else await interaction.reply({ ...payload, ephemeral: true }).catch(() => null);
      }
      return;
    }

    // お知らせのロール選択
    if (interaction.isRoleSelectMenu() && interaction.customId === 'gn_role') return gn.pick(interaction).catch(e => console.error('お知らせ設定エラー:', e.message));

    // キャラ展示・聖遺物自慢のメニュー
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith('intro_char_')) return intro.showCharacter(interaction).catch(e => console.error('キャラクター展示エラー:', e.message));
      const run = { art_c: art.pickChar, art_b: art.pickBase, art_p: art.pickPart }[interaction.customId.slice(0, 5)];
      if (interaction.customId.startsWith('dic_')) return dict.pick(interaction).catch(e => console.error('辞典エラー:', e.message));
      if (interaction.customId.startsWith('off_')) return off.pick(interaction).catch(e => console.error('解除エラー:', e.message));
      if (run) return run(interaction).catch(e => console.error('聖遺物エラー:', e.message));
      return;
    }

    if (interaction.isButton()) {
      // UID登録
      if (interaction.customId.startsWith('intro_open_')) return intro.open(interaction).catch(e => console.error(e));
      if (interaction.customId === 'gift_open') return gift.open(interaction).catch(e => console.error(e));
      if (interaction.customId === 'gn_none') return gn.pick(interaction).catch(e => console.error('お知らせ設定エラー:', e.message));
      // 押すたびに付く/外れる
      if (interaction.customId.startsWith('ann_tg_')) {
        const id = interaction.customId.slice(7);
        const role = await interaction.guild.roles.fetch(id).catch(() => null);
        const mem = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (!role || !mem) return interaction.reply({ content: 'エラーが発生しました。', ephemeral: true });

        if (mem.roles.cache.has(id)) {
          await mem.roles.remove(role).catch(() => null);
          await interaction.reply({ content: `🗑️ <@&${id}> を外しました。`, ephemeral: true });
          dismiss(interaction);
          return;
        }
        await mem.roles.add(role).catch(() => null);
        await interaction.reply({ content: `✅ <@&${id}> を付けました！`, ephemeral: true });
        dismiss(interaction);
        return;
      }

      // 前の形式のボタン（古いアナウンス用に残してる）
      if (interaction.customId.startsWith('ann_btn_')) {
        const [_, __, action, roleId] = interaction.customId.split('_');
        const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (!role || !member) return interaction.reply({ content: 'エラーが発生しました。', ephemeral: true });

        if (action === 'add') {
          await member.roles.add(role).catch(() => null);
          await interaction.reply({ content: `✅ <@&${roleId}> を付与しました！`, ephemeral: true });
          dismiss(interaction);
          return;
        } else {
          await member.roles.remove(role).catch(() => null);
          await interaction.reply({ content: `🗑️ <@&${roleId}> を解除しました。`, ephemeral: true });
          dismiss(interaction);
          return;
        }
      }

    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('intro_mdl_')) return intro.submit(interaction).catch(e => console.error('UID登録エラー:', e.message));
      if (interaction.customId === 'gift_mdl') return gift.submit(interaction).catch(e => console.error('ギフトコードエラー:', e.message));
      if (interaction.customId.startsWith('ann_mdl_')) {
        const pend = client.commands.get('announce').pend;
        const p = pend.get(interaction.customId.slice(8));
        const box = t => ({ embeds: [new EmbedBuilder().setColor('#5865F2').setDescription(t)], ephemeral: true });
        if (!p) return interaction.reply(box('時間が経ちすぎたので、もう一度 /announce からお願いします。'));
        pend.delete(interaction.customId.slice(8));
        await interaction.deferReply({ ephemeral: true });

        const text = interaction.fields.getTextInputValue('announce_text');
        const embed = new EmbedBuilder().setColor('#5865F2').setDescription(text);

        // 画像があれば落として付け直す（CDNのURLは期限切れになるので）
        const files = [];
        const up = interaction.fields.getUploadedFiles('announce_img')?.first();
        if (up && /^image\//.test(up.contentType || '')) {
          const b = await fetch(up.url).then(r => r.arrayBuffer()).catch(() => null);
          if (b) {
            const nm = `ann.${(up.name.split('.').pop() || 'png').toLowerCase()}`;
            files.push(new AttachmentBuilder(Buffer.from(b), { name: nm }));
            embed.setImage(`attachment://${nm}`);
          }
        }

        const msg = await interaction.channel.send({ embeds: [embed], components: annRows(interaction.guild, p.ids), files });
        if (up && !files.length) await interaction.editReply(box('⚠️ 画像を読み込めなかったため、文章だけ送信しました。'));
        else await interaction.deleteReply();

        if (p.sticky) {
          st.get(interaction.guildId).sticky[interaction.channelId] = { messageId: msg.id, text, roles: p.ids };
          await st.save(interaction.guild);
        }
      }
    }
  },
};
