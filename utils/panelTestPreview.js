const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, EmbedBuilder, AttachmentBuilder, LabelBuilder, FileUploadBuilder,
  StringSelectMenuBuilder, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder } = require('discord.js');
const ROOT='pt_';
const announcements=new Map();
function draft(gid){const x=announcements.get(gid);if(x&&Date.now()-x.updated<3600000)return x;const d={ch:null,roles:[],sticky:false,updated:Date.now()};announcements.set(gid,d);return d;}
const testGuild='1341988738074542111';
const { isGI } = require('./gi');
const st = require('./store');
const button=(id,label,style=ButtonStyle.Secondary)=>new ButtonBuilder().setCustomId(ROOT+id).setLabel(label).setStyle(style);
const row=(...items)=>new ActionRowBuilder().addComponents(...items);
const screen={
 announce:['📢 アナウンスを作る','投稿先・本文・画像・通知ロールの設定画面（プレビューのみ）'],
 notifications:['🛎️ 通知設定','VC参加通知・VCランキング・Bump通知'],
 vc:['🔊 VC参加通知','通知先の設定画面（プレビューのみ）'],
 ranking:['🏆 VCランキング','ランキングの設定画面（プレビューのみ）'],
 bump:['🔔 Bump通知','Bump通知の設定画面（プレビューのみ）'],
 analytics:['📊 サーバー分析','メンバー分析・VC分析（プレビューのみ）'],
 members:['👥 メンバー管理','未活動メンバー管理'],
 inactive:['👥 未活動メンバー管理','判定月数・対象ロール・除外ロール・ON/OFF（プレビューのみ）'],
 genshin:['🎮 原神設定','原神のお知らせ・UID登録・ビルドカード・ギフトコード（プレビューのみ）'],
 enable:['🎮 原神機能を有効化','後から原神サーバーとして利用できます。（テスト中は変更不可）'],
 contact:['🗨️ お問い合わせ','デバッグ・不具合報告・ご要望などを制作者にお問い合わせ（テスト中は送信不可）'],
 uid:['UID登録','登録パネルの表示先と、必要な場合だけ付与するロールを設定します。'],
 build:['ビルドカード','ビルドカードの常駐パネルを置くチャンネルを選択します。'],
 gift:['ギフトコード','ギフトコードを案内するチャンネルを選択します。'],
 gnews:['原神のお知らせ','お知らせの表示先と通知ロールを選択します。'],
 annchannel:['投稿先','アナウンスの投稿先を選択します。'],
 annroles:['ロール設定','通知・付与するロールを選択します。'],
 anncontent:['本文・画像','本文を入力し、必要に応じて画像を添付します。'],
 annsticky:['常駐設定','投稿を常駐させるか選択します。'],
 inmonths:['判定期間','1〜12か月から活動がない期間を選択します。'],
 inrole:['対象ロール','活動状況を確認する対象ロールを設定します。'],
 inexclude:['除外ロール','未活動メンバー管理から除外するロールを設定します。'],
 inon:['有効化・停止','未活動メンバー管理の有効化・停止を設定します。'],
 analyticsmembers:['メンバー分析','人数・加入・退出の履歴と期間比較を表示します。'],
 analyticsvc:['VC分析','通話回数・通話時間の履歴と期間比較を表示します。'],
 reset:['すべての設定を初期化','UID情報・分析履歴・管理ログも削除され、取り消せません。\n原神の常駐パネルや通知も停止します。\n\nテスト中は初期化できません。']
};
function choices(mode){
 return [
  ['announce','📢 アナウンスを作る','投稿先や本文・画像を設定してEmbed形式で投稿'],
  ['notifications','🛎️ 通知設定','VC参加通知・VCランキングのON/OFF・Bump通知設定'],
  ...(mode==='on'?[['genshin','🎮 原神設定','原神のお知らせ・UID登録・ビルドカード・ギフトコードの表示先を設定']]:[]),
  ['analytics','📊 サーバー分析','メンバー数とVC活動の推移'],
  ['inactive','👥 未活動メンバー管理','一定期間活動がないメンバーを管理'],
  ...(mode==='off'?[['enable','🎮 原神機能を有効化','原神サーバーとして利用する']]:[]),
  ['contact','🗨️ お問い合わせ','不具合報告・デバッグ・ご要望など'],
  ['reset','すべての設定を初期化','このサーバーの設定・ログを消去し、導入時の状態にリセット']
 ];
}
function back(page){
 return ['vc','ranking','bump'].includes(page)?'notifications':(['uid','build','gift','gnews'].includes(page)?'genshin':(['annchannel','annroles','anncontent','annsticky'].includes(page)?'announce':(['inmonths','inrole','inexclude','inon'].includes(page)?'inactive':(['analyticsmembers','analyticsvc'].includes(page)?'analytics':page==='inactive'?'home':'home'))));
}
function select(id,placeholder,items) {
 return new StringSelectMenuBuilder().setCustomId(ROOT+id).setPlaceholder(placeholder)
  .addOptions(items.map(([value,label,description])=>({value,label,...(description?{description}:{})})));
}
function render(page='home',mode='pending',guildId=null) {
 if(!screen[page])page='home';
 const container=new ContainerBuilder().addTextDisplayComponents(
  new TextDisplayBuilder().setContent(page==='home'?'## ⚙️ BOT 管理パネル':'## '+screen[page][0])
 );
 if(page==='home'){
  if(mode==='pending'){
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**原神サーバーとして利用しますか？**'));
   container.addActionRowComponents(row(button('gen_on','原神設定：ON',ButtonStyle.Success),button('gen_off','原神設定：OFF',ButtonStyle.Danger)));
  }
  container.addActionRowComponents(row(select('pick','機能を選択してください',choices(mode))));

 }else{
  if(page==='announce'){
   const a=draft(guildId);
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    '**投稿先**\n'+(a.ch?'<#'+a.ch+'>':'未設定')+
    '\n\n**付与・解除ロール**\n'+(a.roles.length?a.roles.map(x=>'<@&'+x+'>').join('、'):'なし')+
    '\n\n**常駐**\n'+(a.sticky?'ON':'OFF')+
    '\n\n-# 投稿先とロールを選び、本文・画像を入力して投稿します。'
   ));
   container.addActionRowComponents(row(new ChannelSelectMenuBuilder().setCustomId(ROOT+'ann_pick_channel').setPlaceholder('投稿先を選択').addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement)));
   container.addActionRowComponents(row(new RoleSelectMenuBuilder().setCustomId(ROOT+'ann_pick_roles').setPlaceholder('付与・解除ロール（最大5つ・任意）').setMinValues(0).setMaxValues(5)));
   container.addActionRowComponents(row(button('ann_sticky_on','常駐 ON',a.sticky?ButtonStyle.Success:ButtonStyle.Secondary),button('ann_sticky_off','常駐 OFF',!a.sticky?ButtonStyle.Primary:ButtonStyle.Secondary)));
   container.addActionRowComponents(row(button('ann_open_modal','本文・画像を入力して投稿',ButtonStyle.Primary)));
  }else if(page==='annchannel'){
   const a=draft(guildId);
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('投稿先：'+(a.ch?'<#'+a.ch+'>':'未設定')));
   container.addActionRowComponents(row(new ChannelSelectMenuBuilder().setCustomId(ROOT+'ann_pick_channel').setPlaceholder('投稿先を選択').addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement)));
  }else if(page==='annroles'){
   const a=draft(guildId);
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('選択中：'+(a.roles.length?a.roles.map(x=>'<@&'+x+'>').join('、'):'なし')));
   container.addActionRowComponents(row(new RoleSelectMenuBuilder().setCustomId(ROOT+'ann_pick_roles').setPlaceholder('ロールを選択（最大5つ・なしも可）').setMinValues(0).setMaxValues(5)));
  }else if(page==='annsticky'){
   const a=draft(guildId);
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('常駐：'+(a.sticky?'ON':'OFF')));
   container.addActionRowComponents(row(button('ann_sticky_on','ON',ButtonStyle.Success),button('ann_sticky_off','OFF')));
  }else if(page==='anncontent'){
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('本文と画像を入力して、そのまま投稿できます。'));
   container.addActionRowComponents(row(button('ann_open_modal','本文・画像を入力して投稿',ButtonStyle.Primary)));
  }else if(page==='notifications'){
   const d=guildId ? st.get(guildId) : {};
   const target=d.vc ? '<#'+d.vc+'>' : '未設定';
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**VC参加通知**\n-# 通知先：'+target+'\n\n**VCランキング**\n-# 集計とランキング投稿の管理\n\n**Bump通知**\n-# リマインドと通知先の管理'));
  }else if(page==='vc'){
   const d=guildId ? st.get(guildId) : {};
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**現在の通知先**\n'+(d.vc?'<#'+d.vc+'>':'未設定')+'\n\n通知先を変更すると、VCランキングでも同じ投稿先を使用します。'));
   container.addActionRowComponents(row(new ChannelSelectMenuBuilder().setCustomId(ROOT+'vc_select').setPlaceholder('VC通知先チャンネルを選択').addChannelTypes(ChannelType.GuildText)));
  }else if(page==='ranking'){
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**VCランキング**\n状態：'+(st.get(guildId).rkOff?'OFF':'ON')+'\n投稿先：'+(st.get(guildId).vc?'<#'+st.get(guildId).vc+'>':'未設定')+'\n\n-# 投稿先はVC参加通知と共通です。'));
   container.addActionRowComponents(row(button('ranking_on','ON',ButtonStyle.Success),button('ranking_off','OFF',ButtonStyle.Danger)));
  }else if(page==='bump'){
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**Bump通知**\n通知先：'+(st.get(guildId).bump?.ch?'<#'+st.get(guildId).bump.ch+'>':'未設定')+'\n@here：'+(st.get(guildId).bump?.here?'ON':'OFF')+'\n\n-# 通知先の設定では案内メッセージも投稿されます。'));
   container.addActionRowComponents(row(new ChannelSelectMenuBuilder().setCustomId(ROOT+'bump_channel').setPlaceholder('Bump通知先を選択').addChannelTypes(ChannelType.GuildText)));
   container.addActionRowComponents(row(button('bump_here_on','@here ON',ButtonStyle.Success),button('bump_here_off','@here OFF',ButtonStyle.Secondary)));
  }else if(['uid','build','gift','gnews'].includes(page)){
   const d=st.get(guildId);
   const entries={uid:d.introP,build:{ch:Object.keys(d.buildPanels||{})[0]},gift:d.giftP,gnews:d.gnews};
   const current=entries[page];
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('現在の設置先：'+(current?.ch?'<#'+current.ch+'>':'未設定')+(page==='uid'?'\n付与ロール：'+(d.introP?.role?'<@&'+d.introP.role+'>':'なし（UID登録のみ）'):'')+(page==='gnews'?'\n通知ロール：'+(d.gnews?.role?'<@&'+d.gnews.role+'>':'なし'):'')+'\n\n-# 設置先を選択すると、実際にパネルまたは通知設定を保存します。'));
   container.addActionRowComponents(row(new ChannelSelectMenuBuilder().setCustomId(ROOT+'gi_channel_'+page).setPlaceholder('設置先チャンネルを選択').addChannelTypes(ChannelType.GuildText)));
   if(page==='uid'||page==='gnews'){
    container.addActionRowComponents(row(new RoleSelectMenuBuilder().setCustomId(ROOT+'gi_role_'+page).setPlaceholder('任意のロールを選択').setMinValues(0).setMaxValues(1)));

   }
  }else if(page==='enable'){
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('このサーバーで原神機能を有効化します。\n-# 設定は保存されます。'));
   container.addActionRowComponents(row(button('enable_genshin','原神設定を表示',ButtonStyle.Success)));
  }else if(page==='contact'){
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('不具合報告・デバッグの相談・機能のご要望などを制作者へ送信します。\n-# お問い合わせ専用の非公開チャンネルに、案件ごとの非公開スレッドを作成します。'));
   container.addActionRowComponents(row(button('contact_write','お問い合わせを作成',ButtonStyle.Primary)));
  }else if(page==='inrole'||page==='inexclude'){
   const d=st.get(guildId),settings=d.inactiveSettings||{},excluded=page==='inexclude';
   const current=excluded?settings.exclude||d.inactive?.exclude:settings.role||d.inactive?.role;
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('現在：'+(current?'<@&'+current+'>':'未設定')+'\n-# '+(excluded?'除外ロールは未設定にも戻せます。':'対象ロールを指定してください。')));
   container.addActionRowComponents(row(new RoleSelectMenuBuilder().setCustomId(ROOT+(excluded?'inactive_exclude':'inactive_role')).setPlaceholder(excluded?'除外ロールを選択（選択なしも可）':'対象ロールを選択').setMinValues(excluded?0:1).setMaxValues(1)));
  }else if(page==='analyticsmembers'){
   const d=st.get(guildId);
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('現在のメンバー数は、サーバー分析の正式版で表示します。\n-# 保存済みの日次記録がない過去期間は集計できません。'));
  }else if(page==='analyticsvc'){
   const v=st.get(guildId).vcr?.cur;
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**今週のVC集計**\n通話回数：'+(v?.calls||0)+'回\n累計通話時間：'+Math.round((v?.total||0)/360)/10+'時間\n\n-# BOTが記録したデータのみ表示しています。'));
  }else if(page==='inmonths'){
   const d=st.get(guildId);
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('現在：**'+(d.inactiveMonths||d.inactive?.months||3)+'か月**\n-# 月数の変更では自動キックは有効になりません。'));
   container.addActionRowComponents(row(select('months','判定期間を選択',Array.from({length:12},(_,n)=>[String(n+1),(n+1)+'か月']))));
  }else container.addTextDisplayComponents(new TextDisplayBuilder().setContent(screen[page][1]));
  if(page==='genshin'){
   const d=st.get(guildId);
   const ch=v=>v?'<#'+v+'>':'未設定';
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    '**原神のお知らせ**\n-# '+ch(d.gnews?.ch)+' / 通知ロール：'+(d.gnews?.role?'<@&'+d.gnews.role+'>':'なし')+
    '\n\n**UID登録**\n-# '+ch(d.introP?.ch)+' / 付与ロール：'+(d.introP?.role?'<@&'+d.introP.role+'>':'なし')+
    '\n\n**ビルドカード**\n-# '+(Object.keys(d.buildPanels||{}).length?Object.keys(d.buildPanels).map(ch).join('、'):'未設定')+
    '\n\n**ギフトコード**\n-# '+ch(d.giftP?.ch)
   ));
  }
  const next=page==='notifications'?[['vc','🔊 VC参加通知','参加通知を送るチャンネル'],['ranking','🏆 VCランキング','ランキングのON/OFF・投稿先'],['bump','🔔 Bump通知','通知先・リマインド設定']]:
    page==='genshin'?[['gnews','原神のお知らせ','表示先と通知ロール'],['uid','UID登録','登録先と任意の付与ロール'],['build','ビルドカード','パネルの表示先'],['gift','ギフトコード','表示先']]:
    page==='announce'?[]:
    page==='inactive'?[['inmonths','判定期間','1〜12か月'],['inrole','対象ロール','管理対象を指定'],['inexclude','除外ロール','対象外にするロール'],['inon','有効化・停止','7日間の確認猶予']]:
    page==='analytics'?[['analyticsmembers','メンバー分析','人数・加入・退出'],['analyticsvc','VC分析','通話回数・時間']]:[];
  if(next.length)container.addActionRowComponents(row(select('sub','設定項目を選択',next)));
  container.addActionRowComponents(row(button('back_'+back(page),'← 戻る'),...(back(page)==='home'?[]:[button('back_home','最初に戻る')])));
 }
 return {components:[container],flags:MessageFlags.IsComponentsV2,allowedMentions:{parse:[]}};
}
async function handle(i){
 if(!(i.isButton()||i.isStringSelectMenu()||i.isChannelSelectMenu()||i.isRoleSelectMenu()||i.isModalSubmit())||!i.customId?.startsWith(ROOT))return false;
 if(i.guildId!==testGuild||i.user.id!==i.guild?.ownerId||i.channel?.name!=='bot-config'){
  await i.reply({content:'このテストは指定サーバーの所有者専用です。',flags:MessageFlags.Ephemeral});return true;
 }
 const id=i.customId.slice(ROOT.length);
 const testMode=st.get(i.guildId).panelTestGenshin;
 const mode=isGI(i.guildId)||testMode===true?'on':testMode===false?'off':'pending';
 if(id==='ann_pick_channel'){
  const cid=i.values?.[0],ch=cid&&await i.guild.channels.fetch(cid).catch(()=>null);
  const me=i.guild.members.me||await i.guild.members.fetchMe();
  if(!ch?.isTextBased()||ch.id===i.channelId||!ch.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.AttachFiles]))
   return i.reply({content:'BOTが投稿できるテキストチャンネルを選択してください。',flags:MessageFlags.Ephemeral});
  const a=draft(i.guildId);a.ch=cid;a.updated=Date.now();
  return i.update(render('announce',mode,i.guildId));
 }
 if(id==='ann_pick_roles'){
  const a=draft(i.guildId);a.roles=i.values||[];a.updated=Date.now();
  return i.update(render('announce',mode,i.guildId));
 }
 if(id==='ann_sticky_on'||id==='ann_sticky_off'){
  const a=draft(i.guildId);a.sticky=id==='ann_sticky_on';a.updated=Date.now();
  return i.update(render('announce',mode,i.guildId));
 }
 if(id==='ann_open_modal'){
  const a=draft(i.guildId);
  if(!a.ch)return i.reply({content:'先に投稿先を選択してください。',flags:MessageFlags.Ephemeral});
  const modal=new ModalBuilder().setCustomId(ROOT+'ann_submit').setTitle('アナウンスを投稿');
  modal.addLabelComponents(
   new LabelBuilder().setLabel('アナウンス本文').setTextInputComponent(new TextInputBuilder().setCustomId('body').setStyle(TextInputStyle.Paragraph).setMaxLength(4000).setRequired(true)),
   new LabelBuilder().setLabel('画像（任意・最大10枚）').setFileUploadComponent(new FileUploadBuilder().setCustomId('images').setRequired(false).setMaxValues(10))
  );
  await i.showModal(modal);return true;
 }
 if(id==='ann_submit'){
  const a=draft(i.guildId),ch=a.ch&&await i.guild.channels.fetch(a.ch).catch(()=>null);
  if(!ch?.send)return i.reply({content:'投稿先が見つかりません。もう一度選んでください。',flags:MessageFlags.Ephemeral});
  const body=i.fields.getTextInputValue('body').trim();
  if(!body)return i.reply({content:'本文を入力してください。',flags:MessageFlags.Ephemeral});
  await i.deferReply({flags:MessageFlags.Ephemeral});
  try{
   const raw=[...(i.fields.getUploadedFiles('images')?.values()||[])];
   if(raw.some(x=>!x.contentType?.startsWith('image/')))throw Error('画像ファイルのみ指定できます。');
   const files=[];
   for(const [n,file] of raw.entries()){
    const res=await fetch(file.url);
    if(!res.ok)throw Error('画像の取得に失敗しました');
    const ext=(file.name.split('.').pop()||'png').replace(/[^a-zA-Z0-9]/g,'').slice(0,8)||'png';
    files.push(new AttachmentBuilder(Buffer.from(await res.arrayBuffer()),{name:'announcement-'+n+'.'+ext}));
   }
   const embeds=[new EmbedBuilder().setColor('#5865F2').setDescription(body)];
   if(files.length)embeds[0].setImage('attachment://'+files[0].name);
   for(const file of files.slice(1))embeds.push(new EmbedBuilder().setColor('#5865F2').setImage('attachment://'+file.name));
   const sent=await ch.send({embeds,files,components:require('./annRows').annRows(i.guild,a.roles),allowedMentions:{parse:[]}});
   if(a.sticky){
    st.get(i.guildId).sticky[ch.id]={messageId:sent.id,text:body,roles:[...a.roles]};
    if(!await st.save(i.guild))throw Error('投稿できましたが常駐設定の保存に失敗しました');
   }
   announcements.delete(i.guildId);
   await i.editReply('アナウンスを投稿しました：'+sent.url);
  }catch(e){console.error('アナウンス投稿エラー:',e);await i.editReply('投稿できませんでした：'+e.message);}
  return true;
 }
 if(id.startsWith('gi_channel_')){
  const kind=id.slice('gi_channel_'.length);
  if(!['uid','build','gift','gnews'].includes(kind))return false;
  const cid=i.values?.[0],ch=cid&&await i.guild.channels.fetch(cid).catch(()=>null);
  const me=i.guild.members.me||await i.guild.members.fetchMe();
  if(!ch?.isTextBased()||ch.id===i.channelId||!ch.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.ReadMessageHistory])){
   return i.reply({content:'BOTが投稿できるテキストチャンネルを選んでください。',flags:MessageFlags.Ephemeral});
  }
  const d=st.get(i.guildId);
  if(kind==='gnews'){
   const old=d.gnews;
   d.gnews={ch:cid,role:old?.role||null,seen:old?.ch===cid?old.seen||[]:[],posts:old?.ch===cid?old.posts||{}:{}};
   if(!await st.save(i.guild)){d.gnews=old;return i.reply({content:'設定を保存できませんでした。',flags:MessageFlags.Ephemeral});}
  }else{
   try{
    if(kind==='uid')await require('./intro').place(ch,d.introP?.role||null);
    if(kind==='build')await require('./buildPanel').place(ch,true);
    if(kind==='gift')await require('./gift').place(ch);
    if(!await st.save(i.guild))throw Error('設定を保存できませんでした');
   }catch(e){return i.reply({content:'設置に失敗しました：'+e.message,flags:MessageFlags.Ephemeral});}
  }
  await i.update(render(kind,mode,i.guildId));
  return true;
 }
 if(id.startsWith('gi_role_')){
  const kind=id.slice(8);
  if(!['uid','gnews'].includes(kind))return false;
  const d=st.get(i.guildId),role=i.values?.[0]||null;
  if(kind==='uid'){
   if(!d.introP?.ch)return i.reply({content:'先にUID登録パネルの設置先を選択してください。',flags:MessageFlags.Ephemeral});
   const ch=await i.guild.channels.fetch(d.introP.ch).catch(()=>null);
   if(!ch)return i.reply({content:'設置先が見つかりません。',flags:MessageFlags.Ephemeral});
   await require('./intro').place(ch,role);
  }else{
   if(!d.gnews?.ch)return i.reply({content:'先にお知らせの通知先を選択してください。',flags:MessageFlags.Ephemeral});
   d.gnews.role=role;
  }
  if(!await st.save(i.guild))return i.reply({content:'保存に失敗しました。',flags:MessageFlags.Ephemeral});
  await i.update(render(kind,mode,i.guildId));return true;
 }
 if(id==='bump_channel'){
  const cid=i.values?.[0],ch=cid&&await i.guild.channels.fetch(cid).catch(()=>null);
  const me=i.guild.members.me||await i.guild.members.fetchMe();
  if(!ch?.isTextBased()||ch.id===i.channelId||!ch.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.ReadMessageHistory])){
   return i.reply({content:'BOTが投稿できる通常のテキストチャンネルを選択してください。',flags:MessageFlags.Ephemeral});
  }
  try{
   await require('./bump').configure(ch,st.get(i.guildId).bump?.here||false);
   await i.update(render('bump',mode,i.guildId));
  }catch(e){await i.reply({content:'Bump設定を変更できませんでした：'+e.message,flags:MessageFlags.Ephemeral});}
  return true;
 }
 if(id==='bump_here_on'||id==='bump_here_off'){
  const d=st.get(i.guildId),cid=d.bump?.ch;
  const ch=cid&&await i.guild.channels.fetch(cid).catch(()=>null);
  if(!ch)return i.reply({content:'先にBump通知先を指定してください。',flags:MessageFlags.Ephemeral});
  try{
   await require('./bump').configure(ch,id==='bump_here_on');
   await i.update(render('bump',mode,i.guildId));
  }catch(e){await i.reply({content:'Bump設定を変更できませんでした：'+e.message,flags:MessageFlags.Ephemeral});}
  return true;
 }
 if(id==='contact_write'){
  const modal=new ModalBuilder().setCustomId(ROOT+'contact_submit').setTitle('制作者へのお問い合わせ');
  modal.addComponents(row(new TextInputBuilder().setCustomId('message').setLabel('お問い合わせ内容').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1500)));
  await i.showModal(modal);
  return true;
 }
 if(id==='contact_submit'){
  const msg=i.fields.getTextInputValue('message').trim();
  if(!msg)return i.reply({content:'お問い合わせ内容を入力してください。',flags:MessageFlags.Ephemeral});
  await i.deferReply({flags:MessageFlags.Ephemeral});
  try{
   const hub=i.client.guilds.cache.get(testGuild);
   if(!hub)throw Error('受付先サーバーが見つかりません');
   const me=hub.members.me||await hub.members.fetchMe();
   const name='bot-inquiries';
   let channel=hub.channels.cache.find(c=>c.name===name&&c.type===ChannelType.GuildText);
   if(!channel){
    if(!me.permissions.has(PermissionFlagsBits.ManageChannels))throw Error('受付チャンネルの作成権限がありません');
    channel=await hub.channels.create({
     name,type:ChannelType.GuildText,topic:'BOTへのお問い合わせ受付（管理者のみ）',
     permissionOverwrites:[
      {id:hub.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},
      {id:me.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.CreatePrivateThreads,PermissionFlagsBits.SendMessagesInThreads,PermissionFlagsBits.ManageThreads]}
     ],reason:'問い合わせを #bot-config と分離するため'
    });
   }
   const required=[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.CreatePrivateThreads,PermissionFlagsBits.SendMessagesInThreads];
   if(!channel.permissionsFor(me)?.has(required))throw Error('非公開スレッドの作成権限がありません');
   const thread=await channel.threads.create({name:'お問い合わせ-'+new Date().toISOString().slice(0,10)+'-'+i.user.username.slice(0,30),type:ChannelType.PrivateThread,invitable:false,reason:'管理パネルからのお問い合わせ'});
   await thread.send({content:'**BOTへのお問い合わせ**\n**送信元サーバー**：'+i.guild.name+' ('+i.guildId+')\n**サーバー所有者**：<@'+i.guild.ownerId+'>\n**お問い合わせ送信者**：<@'+i.user.id+'>\n\n**内容**\n'+msg,allowedMentions:{parse:[]}});
   await i.editReply('お問い合わせを送信しました。');
  }catch(e){
   console.error('非公開お問い合わせスレッド作成失敗:',e);
   await i.editReply('お問い合わせを送信できませんでした。管理用チャンネルの権限設定をご確認ください。');
  }
  return true;
 }
 if(id==='inactive_role'||id==='inactive_exclude'){
  const d=st.get(i.guildId),s=d.inactive||{},field=id==='inactive_role'?'role':'exclude';
  if(s.enabled)return i.reply({content:'未活動メンバー管理を停止してから変更してください。',flags:MessageFlags.Ephemeral});
  const value=i.values?.[0]||null;
  if(field==='role'&&!value)return i.reply({content:'対象ロールを指定してください。',flags:MessageFlags.Ephemeral});
  if(value&&field==='role'){
   try{await require('./inactive').managedRole(i.guild,value);}
   catch(e){return i.reply({content:'ロールを選択できません：'+e.message,flags:MessageFlags.Ephemeral});}
  }
  const old={...(d.inactiveSettings||{})};
  d.inactiveSettings={...old,[field]:value};
  if(!await st.save(i.guild)){
   d.inactiveSettings=old;
   return i.reply({content:'設定の保存に失敗しました。',flags:MessageFlags.Ephemeral});
  }
  await i.update(render(field==='role'?'inrole':'inexclude',mode,i.guildId));
  return true;
 }
 if(id==='months'){
  const months=Number(i.values?.[0]),d=st.get(i.guildId);
  if(d.inactive?.enabled)return i.reply({content:'未活動メンバー管理を停止してから判定期間を変更してください。',flags:MessageFlags.Ephemeral});
  if(!Number.isInteger(months)||months<1||months>12)return i.reply({content:'1〜12か月を選んでください。',flags:MessageFlags.Ephemeral});
  const old=d.inactiveMonths,oldNested=d.inactive?.months;
  d.inactiveMonths=months;
  if(d.inactive)d.inactive.months=months;
  if(!await st.save(i.guild)){
   d.inactiveMonths=old;
   if(d.inactive)d.inactive.months=oldNested;
   return i.reply({content:'保存できませんでした。変更を取り消しました。',flags:MessageFlags.Ephemeral});
  }
  await i.update(render('inmonths',mode,i.guildId));
  return true;
 }
 if(id==='ranking_on'||id==='ranking_off'){
  const d=st.get(i.guildId),enabling=id==='ranking_on';
  if(enabling&&!d.vc)return i.reply({content:'先にVC通知先を設定してください。',flags:MessageFlags.Ephemeral});
  const previous=d.rkOff;d.rkOff=!enabling;
  try{
   if(enabling)await require('./vcrank').start(i.guild);
   else await require('./vcrank').stop(i.guild);
   if(!await st.save(i.guild))throw Error('保存に失敗しました。');
  }catch(e){
   d.rkOff=previous;
   return i.reply({content:'切り替えに失敗しました：'+e.message,flags:MessageFlags.Ephemeral});
  }
  await i.update(render('ranking',mode,i.guildId));
  return true;
 }
 if(id==='vc_select'){
  const selected=i.values?.[0];
  const ch=selected&&await i.guild.channels.fetch(selected).catch(()=>null);
  const me=i.guild.members.me||await i.guild.members.fetchMe();
  const required=[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks];
  if(!ch?.isTextBased()||ch.id===i.channelId||!ch.permissionsFor(me)?.has(required)){
   return i.reply({content:'BOTが閲覧・投稿できる通常のテキストチャンネルを選択してください。',flags:MessageFlags.Ephemeral});
  }
  const data=st.get(i.guildId),old=data.vc;
  data.vc=selected;
  if(!await st.save(i.guild)){
   data.vc=old;
   return i.reply({content:'設定の保存に失敗しました。変更は取り消しました。',flags:MessageFlags.Ephemeral});
  }
  await i.update(render('vc',mode,i.guildId));
  return true;
 }
 if(id==='gen_on'||id==='gen_off'){
  const data=st.get(i.guildId),prev=data.panelTestGenshin,prevReal=data.genshin;
  data.panelTestGenshin=id==='gen_on';
  data.genshin=id==='gen_on';
  if(!await st.save(i.guild)){
   data.panelTestGenshin=prev;data.genshin=prevReal;
   return i.reply({content:'設定を保存できませんでした。',flags:MessageFlags.Ephemeral});
  }
  await require('./registerCommands').syncGuild(i.client,i.guildId).catch(e=>console.error('原神コマンド同期:',e.message));
  await i.update(render('home',id==='gen_on'?'on':'off',i.guildId));
  return true;
 }
 if(id==='enable_genshin'){
  const data=st.get(i.guildId),prev=data.panelTestGenshin,prevReal=data.genshin;
  data.panelTestGenshin=true;data.genshin=true;
  if(!await st.save(i.guild)){
   data.panelTestGenshin=prev;data.genshin=prevReal;
   return i.reply({content:'設定を保存できませんでした。',flags:MessageFlags.Ephemeral});
  }
  await require('./registerCommands').syncGuild(i.client,i.guildId).catch(e=>console.error('原神コマンド同期:',e.message));
  await i.update(render('home','on',i.guildId));
  return true;
 }
 let page='home';
 if(id==='pick'||id==='sub')page=i.values?.[0]||'home';
 else if(id.startsWith('back_'))page=id.slice(5);
 await i.update(render(page,mode,i.guildId));return true;
}
module.exports={render,handle};
