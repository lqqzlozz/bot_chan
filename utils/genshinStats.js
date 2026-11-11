const { EmbedBuilder } = require('discord.js');
const { isGI } = require('./gi');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..', 'data');
const {valid, description} = require('./genshinStatsView');
const {label,characterGroups,characterMenus,characterIcon,teamSections,characterFields} = require('./genshinStatsDetailsView');
const pickupHistory = require('../data/genshinPickupHistory.json');
const characterSessions = new Map();
const CHARACTER_IDLE_MS = 5 * 60 * 1000;
const characterControl = (action, owner, label, style) => ({
  type:2,style,label,custom_id:'gstats_char_'+action+'_'+owner
});
const deleteControl = owner => characterControl('delete',owner,'🗑️',4);
const closedControls = owner => [{type:1,components:[deleteControl(owner)]}];

function clearCharacterSession(messageId) {
  const session = characterSessions.get(messageId);
  if (!session) return;
  clearTimeout(session.timer);
  characterSessions.delete(messageId);
}
function resetCharacterTimer(session) {
  clearTimeout(session.timer);
  session.timer = setTimeout(async () => {
    clearCharacterSession(session.message.id);
    try {
      await session.message.edit({components:closedControls(session.owner)});
    } catch (error) {
      if (error.code !== 10008) console.error('キャラ統計の自動終了に失敗:',error.message);
    }
  },CHARACTER_IDLE_MS);
  session.timer.unref();
}
async function updateCharacterSession(i,session,payload,close = false) {
  clearTimeout(session.timer);
  session.busy = true;
  try {
    await i.update(payload);
    if (close) clearCharacterSession(session.message.id);
  } finally {
    session.busy = false;
    if (characterSessions.get(session.message.id)===session) resetCharacterTimer(session);
  }
}
function characterSession(i) {
  const session = characterSessions.get(i.message.id);
  if (!session) return i.reply({content:'メニューは閉じています。/stats-char を開き直してください。',ephemeral:true});
  if (session.owner!==i.user.id) return i.reply({content:'コマンドを実行した人だけが操作できます。',ephemeral:true});
  if (session.busy) return i.reply({content:'処理中です。少し待ってから操作してください。',ephemeral:true});
  return session;
}
const TYPES = {
  pull: { title: 'キャラクター所持率', key: 'ownership' },
  usage: { title: '螺旋におけるキャラクター使用率', key: 'usage' },
  team: { title: '螺旋における人気パーティー', key: 'teams' }
};
function snapshot() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT,'genshinStats.json'),'utf8')); }
  catch { return {ownership:[],usage:[],teams:[]}; }
}
const hasDetails = data => valid(data) && data.characters?.length && Array.isArray(data.teams);
function footer(data) {
  const date = value => new Date(value).toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'});
  const period = data.period?.split(' ～ ').map(date).join(' ～ ');
  const sample = data.sample && 'origin ' + data.sample.origin + ' / ref ' + data.sample.reference;
  return ['出典 AZA.GG',period,data.updatedAt && '更新 '+date(data.updatedAt),sample].filter(Boolean).join(' ｜ ');
}
function detailEmbed(data, title) {
  return new EmbedBuilder().setTitle(title).setColor(0x5865f2).setFooter({text:footer(data)});
}
function characterReply(data, groups, owner, group, row, showHistory = false) {
  const title=row ? label(row)+(showHistory?'のピックアップ履歴':'の深境螺旋統計') : 'キャラクター別統計';
  const embed=detailEmbed(data,title);
  const components=characterMenus(groups,group,row?.avatarId);
  const buttons=[];
  if (row) {
    if (showHistory) {
      const records=pickupHistory.characters[row.avatarId] || [];
      const sections=[
        ['イベント祈願','event'],
        ['集録祈願','chronicled']
      ];
      for (const [name,kind] of sections) {
        const periods=records.filter(record=>record.kind===kind);
        if (!periods.length) continue;
        embed.addFields([{name:name+'（'+periods.length+'回）',value:periods.map(period=>
          'Ver.'+period.version+'　'+period.start.replaceAll('-','/')+' 〜 '+period.end.replaceAll('-','/')
        ).join('\n')}]);
      }
      if (!records.length) embed.setDescription('収録されたピックアップ履歴はありません。');
      embed.setFooter({text:'出典 '+pickupHistory.source+' ｜ アジアサーバーの日付'});
    } else {
      embed.addFields(characterFields(data,row));
    }
    const icon=characterIcon(row.avatarId);
    if (icon) embed.setThumbnail(icon);
    buttons.push({
      type:2,style:2,label:showHistory?'統計に戻る':'ピックアップ履歴',
      custom_id:'gstats_char_'+(showHistory?'stats_':'history_')+row.avatarId
    });
  } else {
    embed.setDescription(group?'キャラクターを選んでください。':'名前の最初の行を選んでください。');
  }
  buttons.push(characterControl('close',owner,'メニューを閉じる',2),deleteControl(owner));
  components.push({type:1,components:buttons});
  return {embeds:[embed],components,allowedMentions:{parse:[]}};
}
async function execute(i,type) {
  if (!i.guildId || !isGI(i.guildId)) return i.reply({content:'原神機能がONのサーバーでのみ利用できます。',ephemeral:true});
  await i.deferReply();
  try {
    const data=snapshot();
    if (type==='team' || type==='char') {
      if (!hasDetails(data)) return await i.editReply({content:'統計は準備中です。'});
      if (type==='char') {
        const owner=i.user.id;
        const message=await i.editReply(characterReply(data,characterGroups(data.characters),owner));
        const session={message,owner};
        characterSessions.set(message.id,session);
        resetCharacterTimer(session);
        return;
      }
      const embed=detailEmbed(data,'深境螺旋12層の人気チーム')
        .setDescription('前半・後半それぞれの採用率トップ10')
        .addFields(teamSections(data,10));
      return await i.editReply({embeds:[embed],allowedMentions:{parse:[]}});
    }
    const config=TYPES[type];
    if (!config) throw new Error('Unknown stats type');
    if (!valid(data)) return await i.editReply({content:'検証済みの★5統計は準備中です。'});
    const embeds=description(data,config.key).map((text,index) => {
      const embed=new EmbedBuilder().setTitle(config.title+(index?'（続き）':''))
        .setDescription(text).setColor(0x5865f2);
      if (!index) {
        const period = data.period?.replace(/(\d{4}-\d{2}-\d{2})T[^ ]+/g, '$1');
        const sample = data.sample && 'origin ' + data.sample.origin + ' / ref ' + data.sample.reference;
        embed.setFooter({text:['出典 AZA.GG', period, data.updatedAt && '更新 ' + data.updatedAt.slice(0,10), sample].filter(Boolean).join(' ｜ ')});
      }
      return embed;
    });
    await i.editReply({embeds,allowedMentions:{parse:[]}});
  } catch(error) {
    console.error('原神統計表示エラー:',error);
    await i.editReply({content:'統計を表示できませんでした。管理者にログの確認を依頼してください。'}).catch(()=>null);
  }
}
async function handleSelect(i) {
  if (!i.guildId || !isGI(i.guildId)) return i.reply({content:'原神機能がONのサーバーでのみ利用できます。',ephemeral:true});
  const session=characterSession(i);
  if (typeof session.then==='function') return session;
  const data=snapshot();
  if (!hasDetails(data)) {
    clearCharacterSession(i.message.id);
    return i.update({content:'統計は準備中です。',embeds:[],components:closedControls(session.owner)});
  }
  const groups=characterGroups(data.characters);
  const value=i.values[0];
  if (i.customId==='gstats_char_page') {
    const group=groups.find(item=>item.name===value);
    if (group) return updateCharacterSession(i,session,characterReply(data,groups,session.owner,group));
  }
  if (i.customId.startsWith('gstats_char_pick')) {
    const id=Number(value);
    const group=groups.find(item=>item.characters.some(row=>row.avatarId===id));
    if (group) return updateCharacterSession(i,session,characterReply(data,groups,session.owner,group,group.characters.find(row=>row.avatarId===id)));
  }
  return i.reply({content:'一覧が更新されました。/stats-char を開き直してください。',ephemeral:true});
}
async function handleButton(i) {
  if (!i.customId?.startsWith('gstats_')) return false;
  const control=i.customId.match(/^gstats_char_(close|delete)_(\d+)$/);
  if (control) {
    const [,action,owner]=control;
    if (i.user.id!==owner) {
      await i.reply({content:'コマンドを実行した人だけが操作できます。',ephemeral:true});
      return true;
    }
    const session=characterSessions.get(i.message.id);
    if (session?.busy) {
      await i.reply({content:'処理中です。少し待ってから操作してください。',ephemeral:true});
      return true;
    }
    if (action==='close') {
      const payload={components:closedControls(owner)};
      if (session) await updateCharacterSession(i,session,payload,true);
      else await i.update(payload);
    }
    else {
      if (session) {
        clearTimeout(session.timer);
        session.busy = true;
      }
      try {
        await i.deferUpdate();
        await i.message.delete();
        clearCharacterSession(i.message.id);
      } catch (error) {
        if (error.code===10008) clearCharacterSession(i.message.id);
        else if (i.deferred) await i.followUp({content:'メッセージを削除できませんでした。',ephemeral:true});
        else throw error;
      } finally {
        if (session && characterSessions.get(i.message.id)===session) {
          session.busy = false;
          resetCharacterTimer(session);
        }
      }
    }
    return true;
  }
  const detail=i.customId.match(/^gstats_char_(history|stats)_(\d{8})$/);
  if (detail) {
    if (!i.guildId || !isGI(i.guildId)) {
      await i.reply({content:'原神機能がONのサーバーでのみ利用できます。',ephemeral:true});
      return true;
    }
    const session=characterSession(i);
    if (typeof session.then==='function') {
      await session;
      return true;
    }
    const data=snapshot();
    if (hasDetails(data)) {
      const id=Number(detail[2]);
      const groups=characterGroups(data.characters);
      const group=groups.find(item=>item.characters.some(row=>row.avatarId===id));
      if (group) {
        await updateCharacterSession(i,session,characterReply(data,groups,session.owner,group,group.characters.find(row=>row.avatarId===id),detail[1]==='history'));
        return true;
      }
    }
    await i.reply({content:'一覧が更新されました。/stats-char を開き直してください。',ephemeral:true});
    return true;
  }
  await i.reply({content:'ページ送りは廃止しました。コマンドを再実行してください。',ephemeral:true});
  return true;
}
module.exports={execute,handleButton,handleSelect,TYPES,valid,loadSnapshot:async()=>snapshot()};
