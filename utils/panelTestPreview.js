const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, EmbedBuilder, AttachmentBuilder, LabelBuilder, FileUploadBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder,
  StringSelectMenuBuilder, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder } = require('discord.js');
const ROOT='pt_';
const announcements=new Map();
const modalPanels=new Map();
async function returnHome(i,mode){
 const key=i.guildId+':'+i.user.id;
 const panelId=modalPanels.get(key);
 modalPanels.delete(key);
 try{
  const ch=i.guild&&require('./store').findCh(i.guild);
  const message=panelId&&ch&&await ch.messages.fetch(panelId).catch(()=>null);
  if(message&&message.author.id===i.client.user.id)await message.edit(render('home',mode,i.guildId));
 }catch(e){console.error('管理トップへの復帰失敗:',e);}
}
function draft(gid){const x=announcements.get(gid);if(x&&Date.now()-x.updated<3600000)return x;const d={ch:null,roles:[],sticky:false,updated:Date.now()};announcements.set(gid,d);return d;}
const testGuild='1341988738074542111';
const {isAdmin}=require('./perm');
const feed=require('./officialFeed');
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
 members:['👥 メンバー管理','非アクティブメンバー管理'],
 inactive:['👥 非アクティブメンバー管理','判定月数・対象ロール・除外ロール・ON/OFF（プレビューのみ）'],
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
 alarm:['⏰ アラーム','毎日の通知を登録・解除します。'],
 stickylist:['📌 常駐アナウンスの解除','登録済みの常駐投稿を解除します。'],
 annsticky:['常駐設定','投稿を常駐させるか選択します。'],
 inmonths:['判定期間','1〜12か月から活動がない期間を選択します。'],
 inrole:['対象ロール','活動状況を確認する対象ロールを設定します。'],
 inchannel:['ログ・通知先','管理ログとキック承認通知の投稿先を設定します。'],
 inexclude:['除外ロール','非アクティブメンバー管理から除外するロールを設定します。'],
 inon:['有効化・停止','非アクティブメンバー管理の有効化・停止を設定します。'],
 analyticsmembers:['メンバー分析','人数・加入・退出の履歴と期間比較を表示します。'],
 analyticsvc:['VC分析','通話回数・通話時間の履歴と期間比較を表示します。'],
 other:['⚙️ その他の設定','原神設定・公式お知らせ・初期化'],
 audit:['📋 管理ログ','BOTの管理パネルから変更した設定の履歴'],
 reset:['⚠️ 設定を初期化','テストサーバー限定。BOTの保存設定と分析履歴を削除します。投稿済みメッセージは削除しません。']
};
function choices(mode,guildId){
 return [
  ['announce','📢 アナウンスを作る','本文・画像・常駐の管理'],
  ['notifications','🛎️ 通知設定','VC通知・Bump・アラーム'],
  ['analytics','📊 サーバー分析','メンバー数とVC活動の推移'],
  ['inactive','👥 非アクティブメンバー管理','判定期間・対象ロールなどを管理'],
  ['other','⚙️ その他の設定','原神・BOTお知らせ・初期化'],
  ['contact','🗨️ お問い合わせ','不具合報告・ご要望']
 ];
}
function back(page){
 return ['alarm','vc','ranking','bump'].includes(page)?'notifications':['stickylist','annsticky'].includes(page)?'announce':['genshin','enable','official','broadcast','reset'].includes(page)?'other':['vc','ranking','bump'].includes(page)?'notifications':(['uid','build','gift','gnews'].includes(page)?'genshin':(['annchannel','annroles','anncontent','annsticky'].includes(page)?'announce':(['inmonths','inrole','inexclude','inchannel','inon'].includes(page)?'inactive':(['analyticsmembers','analyticsvc'].includes(page)?'analytics':['official','broadcast'].includes(page)?'home':'home'))));
}
function select(id,placeholder,items) {
 return new StringSelectMenuBuilder().setCustomId(ROOT+id).setPlaceholder(placeholder)
  .addOptions(items.map(([value,label,description])=>({value,label,...(description?{description}:{})})));
}
function render(page='home',mode='pending',guildId=null,auditPage=0,graph=false) {
 if(!screen[page])page='home';
 const container=new ContainerBuilder().addTextDisplayComponents(
  new TextDisplayBuilder().setContent(page==='home'?'## ⚙️ BOT 管理パネル':'## '+screen[page][0])
 );
 if(page==='home'){
  const feedSettings=guildId&&st.get(guildId).officialFeed;
  const needsFeed=!!(guildId&&guildId!==testGuild&&!feedSettings?.channelId);
  if(needsFeed){
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('### 📢 初期設定：お知らせの受信先\n公式お知らせを受信するチャンネルを最初に指定してください。\n-# ※この設定は一度完了すると、管理パネルから自動的に非表示になります。'));
   container.addActionRowComponents(row(new ChannelSelectMenuBuilder().setCustomId(ROOT+'official_channel').setPlaceholder('お知らせを受信するチャンネルを選択').addChannelTypes(ChannelType.GuildText)));
  }
  const notice=guildId&&st.get(guildId).broadcastNotice;
  if(notice?.body){
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('### 📢 BOTからのお知らせ\n'+notice.body));
   container.addActionRowComponents(row(button('broadcast_dismiss','確認しました',ButtonStyle.Primary)));
  }
  if(mode==='pending'&&!needsFeed){
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**原神サーバーとして利用しますか？**\n-# ※この設定は一度完了すると、管理パネルから自動的に非表示になります。'));
   container.addActionRowComponents(row(button('gen_on','原神設定：ON',ButtonStyle.Success),button('gen_off','原神設定：OFF',ButtonStyle.Danger)));
  }
  container.addActionRowComponents(row(select('pick','機能を選択してください',choices(mode,guildId))));

 }else{
  if(page==='other'){
   const d=st.get(guildId);
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**原神機能**：'+(mode==='on'?'ON':mode==='off'?'OFF':'初期設定待ち')+'\n**BOTのお知らせ**：'+(guildId===testGuild?'配信元サーバー':d.officialFeed?.enabled?'受信 ON':'受信 OFF')+'\n\n-# 各項目から詳細設定を変更できます。'));
  }else if(page==='broadcast'){
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**全サーバーへの管理者向け案内**\n各サーバーの常設管理パネルに表示します。\n-# 既に同じ案内を受け取ったサーバーには重複送信しません。送信後は取り消せません。'));
   container.addActionRowComponents(row(button('broadcast_write','一斉配信の本文を入力',ButtonStyle.Primary)));
  }else if(page==='official'){
   const settings=st.get(guildId).officialFeed;
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    '**公式お知らせ**\n-# メインサーバーの #log で公開された投稿を受信\n\n受信先：'+(settings?.channelId?'<#'+settings.channelId+'>':'未設定')+
    '\n状態：'+(settings?.enabled?'ON':'OFF')+
    '\n\n-# 既存フォローは重複作成しません。フォロー先のウェブフック管理権限が必要です。'
   ));
   container.addActionRowComponents(row(new ChannelSelectMenuBuilder().setCustomId(ROOT+'official_channel').setPlaceholder('既存チャンネルから受信先を選択').addChannelTypes(ChannelType.GuildText)));
   container.addActionRowComponents(row(button('official_on','受信 ON',ButtonStyle.Success),button('official_off','受信 OFF')));
  }else if(page==='announce'){
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
  }else if(page==='stickylist'){
   const ids=Object.keys(st.get(guildId).sticky||{}).slice(0,25);
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent(ids.length?'解除すると常駐を停止します。既存の投稿は削除されません。':'現在、常駐アナウンスはありません。'));
   if(ids.length)container.addActionRowComponents(row(select('sticky_remove','解除する常駐投稿を選択',ids.map(id=>[id,'#'+(st.get(guildId).sticky?.[id]?.text||'常駐投稿').replace(/\\s+/g,' ').slice(0,65)]))));
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
   const d=guildId?st.get(guildId):{},ch=v=>v?'<#'+v+'>':'未設定',roles=v=>v?'<@&'+v+'>':'なし',sc=d.vcMentionSchedule||{},bp=d.bump||{};
   const alarms=Array.isArray(d.alarms)?d.alarms:[];
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent([
    '**VC参加通知**',
    '状態：'+(d.vcOff?'OFF':'ON')+' / 通知先：'+ch(d.vc),
    '時間帯①：'+(sc.start&&sc.end?sc.start+'〜'+sc.end:'未設定')+' / '+roles(sc.primaryRole),
    '時間帯②：'+roles(sc.secondaryRole),
    '',
    '**VCランキング**',
    '状態：'+(d.rkOff?'OFF':'ON')+' / 投稿先：'+ch(d.vc),
    '',
    '**Bump通知**',
    '通知先：'+ch(bp.ch)+' / @here：'+(bp.here?'ON':'OFF'),
    '',
    '**アラーム**',
    '登録数：'+alarms.length+'件'+(alarms.length?' / '+alarms.slice(0,3).map(a=>a.time||'時刻未設定').join('、'):'')
   ].join('\n')));
  }else if(page==='vc'){
   const d=guildId ? st.get(guildId) : {};
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**VC参加通知：'+(d.vcOff?'OFF':'ON')+'**\n現在の通知先：'+(d.vc?'<#'+d.vc+'>':'未設定')+'\n\n通知先を変更すると、VCランキングでも同じ投稿先を使用します。'));
   container.addActionRowComponents(row(button('vc_on','ON',ButtonStyle.Success).setDisabled(!d.vcOff),button('vc_off','OFF',ButtonStyle.Secondary).setDisabled(!!d.vcOff)));
   container.addActionRowComponents(row(new ChannelSelectMenuBuilder().setCustomId(ROOT+'vc_select').setPlaceholder('VC通知先チャンネルを選択').addChannelTypes(ChannelType.GuildText)));
   const schedule=d.vcMentionSchedule||{};
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**時間帯別メンション（日本時間）**\n時間帯①：'+(schedule.start||'未設定')+'〜'+(schedule.end||'未設定')+'　'+(schedule.primaryRole?'<@&'+schedule.primaryRole+'>':'メンションなし')+'\nそれ以外：'+(schedule.secondaryRole?'<@&'+schedule.secondaryRole+'>':'メンションなし')+'\n-# 開始時刻を含み終了時刻は含みません。日付をまたぐ指定も可能です。'));
   container.addActionRowComponents(row(button('vc_schedule_time','時間帯を設定',ButtonStyle.Primary),button('vc_schedule_clear','時間帯を無効化',ButtonStyle.Secondary)));
   container.addActionRowComponents(row(new RoleSelectMenuBuilder().setCustomId(ROOT+'vc_schedule_primary').setPlaceholder('時間帯①のメンションロール').setMinValues(1).setMaxValues(1)));
   container.addActionRowComponents(row(new RoleSelectMenuBuilder().setCustomId(ROOT+'vc_schedule_secondary').setPlaceholder('それ以外のメンションロール').setMinValues(1).setMaxValues(1)));
   container.addActionRowComponents(row(button('vc_role_primary_clear','時間帯①：なし'),button('vc_role_secondary_clear','それ以外：なし')));
  }else if(page==='alarm'){
   const alarms=(st.get(guildId).alarms||[]);
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**毎日のアラーム**\\n'+(alarms.length?alarms.slice(0,25).map((a,n)=>(n+1)+'. '+a.time+'　<#'+a.ch+'>　'+a.msg.replace(/\\s+/g,' ').slice(0,70)).join('\\n'):'登録なし')));
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**新規登録の通知先**：'+(st.get(guildId).alarmChannelId?'<#'+st.get(guildId).alarmChannelId+'>':'未設定')));
   container.addActionRowComponents(row(new ChannelSelectMenuBuilder().setCustomId(ROOT+'alarm_channel').setPlaceholder('アラーム通知先を選択').addChannelTypes(ChannelType.GuildText)));
   container.addActionRowComponents(row(button('alarm_new','アラームを登録',ButtonStyle.Primary)));
   if(alarms.length)container.addActionRowComponents(row(select('alarm_remove','解除するアラームを選択',alarms.slice(0,25).map((a,n)=>[String(n),a.time+'　'+(a.msg||'').slice(0,60)]))));
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
  }else if(page==='audit'){
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent(require('./managementAudit').summary(guildId,auditPage)));
   container.addActionRowComponents(row(button('audit_prev_'+auditPage,'PREV',ButtonStyle.Secondary).setDisabled(auditPage<=0),button('audit_next_'+auditPage,'NEXT',ButtonStyle.Secondary).setDisabled(auditPage>=(st.get(guildId).managementLog||[]).length-1)));
  }else if(page==='contact'){
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('不具合報告・デバッグの相談・機能のご要望などを制作者へ送信します。\n-# BOT管理用の #bot-config に非公開スレッドを作成し、管理者に通知します。'));
   container.addActionRowComponents(row(button('contact_write','お問い合わせを作成',ButtonStyle.Primary)));
  }else if(page==='reset'){
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**テストサーバー限定**\n保存した設定・UID情報・分析履歴を削除します。既存の投稿や外部サービスの連携は削除しません。実行後は元に戻せません。\n\n-# 非アクティブメンバー管理を停止した上で、所有者が確認文を入力する必要があります。'));
   container.addActionRowComponents(row(button('reset_start','初期化する',ButtonStyle.Danger)));
  }else if(page==='inchannel'){
   const d=st.get(guildId),id=d.inactiveSettings?.approvalChannelId||d.inactive?.approvalChannelId||d.inactive?.log;
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('現在：'+(id?'<#'+id+'>':'#bot-config（初期値）')));
   container.addActionRowComponents(row(new ChannelSelectMenuBuilder().setCustomId(ROOT+'inactive_channel').setPlaceholder('ログ・通知先を選択').addChannelTypes(ChannelType.GuildText)));
  }else if(page==='inrole'||page==='inexclude'){
   const d=st.get(guildId),settings=d.inactiveSettings||{},excluded=page==='inexclude';
   const current=excluded?settings.exclude||d.inactive?.exclude:settings.role||d.inactive?.role;
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('現在：'+(current?'<@&'+current+'>':'未設定')+'\n-# '+(excluded?'除外ロールは未設定にも戻せます。':'対象ロールを指定してください。')));
   container.addActionRowComponents(row(new RoleSelectMenuBuilder().setCustomId(ROOT+(excluded?'inactive_exclude':'inactive_role')).setPlaceholder(excluded?'除外ロールを選択':'対象ロールを選択').setMinValues(1).setMaxValues(1)));
   if(excluded)container.addActionRowComponents(row(button('inactive_exclude_clear','除外ロールをなしにする',ButtonStyle.Secondary)));
  }else if(page==='analytics'){
   const days=Object.entries(st.get(guildId).analyticsDaily||{}).sort(([a],[b])=>a.localeCompare(b));
   const recent=days.slice(-7),sum=k=>recent.reduce((n,[,v])=>n+(Number(v[k])||0),0);
   const last=days.at(-1)?.[1];
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    '**メンバー分析**\n現在の人数：'+(last?.members??'記録なし')+'人\n直近7記録日：加入 '+sum('joins')+'人 / 退出 '+sum('leaves')+'人\n\n**VC分析**\n通話開始：'+sum('vcCalls')+'回 / 累計 '+(sum('vcSeconds')/3600).toFixed(1)+'時間\n\n-# BOT導入後の記録のみ。記録がない過去日は補完しません。'
   ));
   container.addActionRowComponents(row(button('analytics_image','分析グラフを表示',ButtonStyle.Primary)));
  }else if(page==='analyticsmembers'||page==='analyticsvc'){
   const days=Object.entries(st.get(guildId).analyticsDaily||{}).sort(([a],[b])=>a.localeCompare(b));
   const recent=days.slice(-7),sum=k=>recent.reduce((n,[,v])=>n+(Number(v[k])||0),0);
   const last=days.at(-1)?.[1];
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent(page==='analyticsmembers'?
    '現在のメンバー数：'+(last?.members??'記録なし')+'人\n直近7記録日の加入：'+sum('joins')+'人 / 退出：'+sum('leaves')+'人':
    '直近7記録日の通話開始：'+sum('vcCalls')+'回 / 通話時間：'+(sum('vcSeconds')/3600).toFixed(1)+'時間'));
   container.addActionRowComponents(row(button('analytics_image','分析グラフを表示',ButtonStyle.Primary)));
  }else if(page==='inon'){
   const d=st.get(guildId),s=d.inactive||{},cfg=d.inactiveSettings||{};
   const lines=['**現在の状態：'+(s.enabled?'ON':'OFF')+'**','判定期間：'+(d.inactiveMonths||s.months||3)+'か月','対象ロール：'+(cfg.role||s.role?'<@&'+(cfg.role||s.role)+'>':'未設定'),'除外ロール：'+(cfg.exclude||s.exclude?'<@&'+(cfg.exclude||s.exclude)+'>':'なし'),'ログ・通知先：'+(cfg.approvalChannelId||s.approvalChannelId||s.log?'<#'+(cfg.approvalChannelId||s.approvalChannelId||s.log)+'>':'#bot-config（初期値）'),'','-# 有効化すると活動記録を開始します。指定期間の無活動後に警告DMを送り、7日間反応がない場合、管理者へキックの承認を求めます。承認なしでキックは実行しません。停止すると監視を止め、外したロールの復元を試みます。'];
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
   container.addActionRowComponents(row(button('inactive_on','有効化する',ButtonStyle.Success),button('inactive_off','停止する',ButtonStyle.Danger)));
  }else if(page==='inmonths'){
   const d=st.get(guildId);
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent('現在：**'+(d.inactiveMonths||d.inactive?.months||3)+'か月**\n-# 月数の変更では自動キックは有効になりません。'));
   container.addActionRowComponents(row(select('months','判定期間を選択',Array.from({length:12},(_,n)=>[String(n+1),(n+1)+'か月']))));
  }else container.addTextDisplayComponents(new TextDisplayBuilder().setContent(screen[page][1]));
  if(page==='analytics'&&graph){
   container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://server-analytics.png')));
  }
  if(page==='inactive'){
   const d=st.get(guildId),cfg=d.inactiveSettings||{},settings=d.inactive||{};
   container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    '**監視：'+(settings.enabled?'ON':'OFF')+'**\n判定期間：'+(d.inactiveMonths||settings.months||3)+'か月\n対象ロール：'+(cfg.role||settings.role?'<@&'+(cfg.role||settings.role)+'>':'未設定')+'\n除外ロール：'+(cfg.exclude||settings.exclude?'<@&'+(cfg.exclude||settings.exclude)+'>':'なし')+'\nログ：'+(settings.log?'<#'+settings.log+'>':'#bot-config（有効化時）')+'\n警告中：'+Object.values(settings.users||{}).filter(u=>u.warningAt).length+'人'
   ));
   container.addActionRowComponents(row(button('inactive_on','有効化',ButtonStyle.Success),button('inactive_off','停止',ButtonStyle.Secondary)));
  }
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
  const next=page==='other'?[
    ...(mode==='on'?[['genshin','🎮 原神設定','原神のお知らせ・UID登録など']]:[['enable','🎮 原神機能を有効化','原神用の機能を設定']]),
    ...(guildId===testGuild?[['broadcast','📣 BOTのお知らせを配信','各サーバーへ案内を配信']]:[['official','📢 BOTのお知らせを受信','受信先を設定']]),
    ['reset','⚠️ 設定を初期化','テストサーバー限定・確認必須']
   ]:page==='notifications'?[['vc','🔊 VC参加通知','参加通知を送るチャンネル'],['ranking','🏆 VCランキング','ランキングのON/OFF・投稿先'],['bump','🔔 Bump通知','通知先・リマインド設定'],['alarm','⏰ アラーム','毎日の通知の登録・解除']]:
    page==='genshin'?[['gnews','原神のお知らせ','表示先と通知ロール'],['uid','UID登録','登録先と任意の付与ロール'],['build','ビルドカード','パネルの表示先'],['gift','ギフトコード','表示先']]:
    page==='announce'?[['stickylist','📌 常駐の解除','投稿済みの常駐アナウンスを解除']]:
    page==='inactive'?[['inmonths','判定期間','1〜12か月'],['inrole','対象ロール','管理対象を指定'],['inexclude','除外ロール','対象外にするロール'],['inchannel','ログ・通知先','管理ログ・キック承認通知の投稿先']]:
    page==='analytics'?[]:[];
  if(next.length)container.addActionRowComponents(row(select('sub','設定項目を選択',next)));
  container.addActionRowComponents(row(button('back_'+back(page),'← 戻る'),...(back(page)==='home'?[]:[button('back_home','最初に戻る')])));
 }
 return {components:[container],flags:MessageFlags.IsComponentsV2,allowedMentions:{parse:[]}};
}
async function handleCore(i){
 if(!(i.isButton()||i.isStringSelectMenu()||i.isChannelSelectMenu()||i.isRoleSelectMenu()||i.isModalSubmit())||!i.customId?.startsWith(ROOT))return false;
 if(!i.guild||!isAdmin(i)||i.channel?.name!=='bot-config'){
  await i.reply({content:'この操作は #bot-config でサーバー管理者のみ実行できます。',flags:MessageFlags.Ephemeral});return true;
 }
 const id=i.customId.slice(ROOT.length);
 if(id.startsWith('audit_prev_')||id.startsWith('audit_next_')){
  const direction=id.startsWith('audit_prev_')?-1:1;
  const n=Math.max(0,Math.min((st.get(i.guildId).managementLog||[]).length-1,(Number(id.split('_').at(-1))||0)+direction));
  const currentMode=isGI(i.guildId)||st.get(i.guildId).panelTestGenshin===true?'on':st.get(i.guildId).panelTestGenshin===false?'off':'pending';
  return i.update(require('./managementAudit').view(i.guildId,n));
 }
 const testMode=st.get(i.guildId).panelTestGenshin;
 const mode=isGI(i.guildId)||testMode===true?'on':testMode===false?'off':'pending';
 if(id==='sticky_remove'){
  const data=st.get(i.guildId),key=i.values?.[0],old=data.sticky?.[key];
  if(!old)return i.reply({content:'すでに解除されています。',flags:MessageFlags.Ephemeral});
  delete data.sticky[key];
  if(!await st.save(i.guild)){data.sticky[key]=old;return i.reply({content:'解除状態を保存できませんでした。',flags:MessageFlags.Ephemeral});}
  return i.update(render('stickylist',mode,i.guildId));
 }
 if(id==='alarm_channel'){
  const selected=i.values?.[0],ch=selected&&await i.guild.channels.fetch(selected).catch(()=>null);
  const me=i.guild.members.me||await i.guild.members.fetchMe();
  if(!ch?.isTextBased()||!ch.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks]))return i.reply({content:'BOTが投稿できるテキストチャンネルを選んでください。',flags:MessageFlags.Ephemeral});
  const d=st.get(i.guildId),old=d.alarmChannelId;d.alarmChannelId=selected;
  if(!await st.save(i.guild)){d.alarmChannelId=old;return i.reply({content:'保存に失敗しました。',flags:MessageFlags.Ephemeral});}
  return i.update(render('alarm',mode,i.guildId));
 }
 if(id==='alarm_new'){
  if(!st.get(i.guildId).alarmChannelId)return i.reply({content:'先にアラームの通知先を選択してください。',flags:MessageFlags.Ephemeral});
  const modal=new ModalBuilder().setCustomId(ROOT+'alarm_create').setTitle('毎日のアラームを登録');
  modal.addLabelComponents(
   new LabelBuilder().setLabel('時刻（例：09:00 18:30）').setTextInputComponent(new TextInputBuilder().setCustomId('times').setStyle(TextInputStyle.Short).setRequired(true)),
   new LabelBuilder().setLabel('通知本文').setTextInputComponent(new TextInputBuilder().setCustomId('message').setStyle(TextInputStyle.Paragraph).setMaxLength(2000).setRequired(true))
  );
  return i.showModal(modal);
 }
 if(id==='alarm_create'){
  const times=i.fields.getTextInputValue('times').trim().split(/[\\s　]+/);
  const normalized=times.map(x=>x.match(/^([01]?\\d|2[0-3]):([0-5]\\d)$/)).filter(Boolean).map(m=>m[1].padStart(2,'0')+':'+m[2]);
  if(!normalized.length||normalized.length!==times.length)return i.reply({content:'時刻は 09:00 18:30 のように入力してください。',flags:MessageFlags.Ephemeral});
  const data=st.get(i.guildId),old=[...(data.alarms||[])],setter={by:i.user.id,byName:i.member?.displayName||i.user.username,byAvatar:i.user.displayAvatarURL()};
  // Alarm delivery is independent of the management channel.
  data.alarms||=[];
  for(const time of new Set(normalized)){
   const a={time,ch:data.alarmChannelId,msg:i.fields.getTextInputValue('message'),...setter};
   const existing=data.alarms.find(x=>x.time===time&&x.ch===a.ch&&x.msg===a.msg);
   if(existing)Object.assign(existing,setter);else data.alarms.push(a);
  }
  if(!await st.save(i.guild)){data.alarms=old;return i.reply({content:'保存に失敗しました。',flags:MessageFlags.Ephemeral});}
  await i.reply({content:'アラームを登録しました。投稿先：<#'+data.alarmChannelId+'>　時刻：'+[...new Set(normalized)].join('、'),flags:MessageFlags.Ephemeral});return true;
 }
 if(id==='alarm_remove'){
  const data=st.get(i.guildId),n=Number(i.values?.[0]),old=[...(data.alarms||[])];
  if(!Number.isInteger(n)||n<0||n>=old.length)return i.reply({content:'対象が見つかりません。',flags:MessageFlags.Ephemeral});
  data.alarms.splice(n,1);
  if(!await st.save(i.guild)){data.alarms=old;return i.reply({content:'解除を保存できませんでした。',flags:MessageFlags.Ephemeral});}
  return i.update(render('alarm',mode,i.guildId));
 }
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
  modalPanels.set(i.guildId+':'+i.user.id,i.message?.id);
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
   await returnHome(i,mode);
   await i.editReply('アナウンスを投稿しました：'+sent.url);
  }catch(e){console.error('アナウンス投稿エラー:',e);await i.editReply('投稿できませんでした：'+e.message);}
  return true;
 }
 if(id==='broadcast_dismiss'){
  const data=st.get(i.guildId),old=data.broadcastNotice;
  delete data.broadcastNotice;
  if(!await st.save(i.guild)){data.broadcastNotice=old;return i.reply({content:'確認状態を保存できませんでした。',flags:MessageFlags.Ephemeral});}
  await i.update(render('home',mode,i.guildId));return true;
 }
 if(id==='broadcast_write'){
  if(i.guildId!==testGuild||i.user.id!==i.guild.ownerId)return i.reply({content:'配信はメインサーバーの所有者のみ実行できます。',flags:MessageFlags.Ephemeral});
  const modal=new ModalBuilder().setCustomId(ROOT+'broadcast_submit').setTitle('全サーバーへの一斉配信');
  modal.addComponents(row(new TextInputBuilder().setCustomId('broadcast_body').setLabel('送信する本文').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1700)));
  return i.showModal(modal);
 }
 if(id==='broadcast_submit'){
  if(i.guildId!==testGuild||i.user.id!==i.guild.ownerId)return i.reply({content:'配信権限がありません。',flags:MessageFlags.Ephemeral});
  const body=i.fields.getTextInputValue('broadcast_body').trim();
  if(!body)return i.reply({content:'本文を入力してください。',flags:MessageFlags.Ephemeral});
  await i.deferReply({flags:MessageFlags.Ephemeral});
  const signature=require('node:crypto').createHash('sha256').update(body).digest('hex').slice(0,16);
  let sent=0,skipped=0,failed=0;
  for(const guild of i.client.guilds.cache.values()){
   const channel=st.findCh(guild);
   if(!channel){failed++;continue;}
   const data=st.get(guild.id);
   if((data.broadcastHistory||[]).includes(signature)){skipped++;continue;}
   try{
    const me=guild.members.me||await guild.members.fetchMe();
    if(!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]))throw Error('送信権限不足');
    data.broadcastNotice={body,signature};
    data.broadcastHistory=[...(data.broadcastHistory||[]).slice(-9),signature];
    if(!await st.save(guild))throw Error('お知らせの保存に失敗しました');
    await require('./managementPanel').ensure(guild);
    sent++;
   }catch(e){failed++;console.error('一斉配信失敗',guild.id,e);}
  }
  await returnHome(i,mode);
  await i.editReply('一斉配信の結果：送信 '+sent+'サーバー／重複除外 '+skipped+'サーバー／失敗 '+failed+'サーバー');
  return true;
 }
 if(id==='official_channel'||id==='official_on'||id==='official_off'){
  if(i.guildId===testGuild)return i.reply({content:'メインサーバーは配信元のため、受信設定は利用できません。',flags:MessageFlags.Ephemeral});
  const data=st.get(i.guildId),old=data.officialFeed?{...data.officialFeed}:undefined;
  const next={enabled:old?.enabled||false,channelId:old?.channelId||null};
  if(id==='official_channel'){next.channelId=i.values?.[0]||null;next.enabled=true;}
  else next.enabled=id==='official_on';
  if(next.enabled&&!next.channelId)return i.reply({content:'先に受信先チャンネルを選択してください。',flags:MessageFlags.Ephemeral});
  await i.deferUpdate();
  try{
   if(next.enabled){const result=await feed.follow(i.client,i.guild,next.channelId);if(result.already&&result.channelId)next.channelId=result.channelId;}
   else if(old?.channelId&&old.enabled)await feed.unfollow(i.client,i.guild,old.channelId);
   data.officialFeed=next;
   if(!await st.save(i.guild))throw Error('設定を保存できませんでした');
   if(next.enabled&&!data.betaPanelNoticeSent){
    const destination=await i.guild.channels.fetch(next.channelId);
    if(!destination?.send)throw Error('お知らせの投稿先が見つかりません');
    const posted=await require('./betaPanelNotice').deliver(destination);
    data.betaPanelNoticeSent={messageId:posted.id,channelId:next.channelId};
    if(!await st.save(i.guild))console.error('ベータ版案内の送信記録保存失敗',i.guildId);
   }
   await i.editReply(render('home',mode,i.guildId));
  }catch(e){
   data.officialFeed=old;
   await i.followUp({content:'公式お知らせの設定に失敗しました：'+e.message,flags:MessageFlags.Ephemeral});
  }
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
  modalPanels.set(i.guildId+':'+i.user.id,i.message?.id);
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
   const channel=st.findCh(hub);
   if(!channel)throw Error('#bot-config が見つかりません');
   const required=[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.CreatePrivateThreads,PermissionFlagsBits.SendMessagesInThreads];
   if(!channel.permissionsFor(me)?.has(required))throw Error('BOTに非公開スレッドの作成権限がありません');
   const thread=await channel.threads.create({
    name:'お問い合わせ-'+new Date().toISOString().slice(0,10)+'-'+i.user.username.slice(0,30),
    type:ChannelType.PrivateThread,invitable:false,autoArchiveDuration:1440,
    reason:'管理パネルからのお問い合わせ'
   });
   const owner=hub.ownerId;
   if(owner!==me.id)await thread.members.add(owner);
   const header='**BOTへのお問い合わせ**\n**送信元サーバー**：'+i.guild.name+' ('+i.guildId+')\n**サーバー所有者**：<@'+i.guild.ownerId+'>\n**お問い合わせ送信者**：<@'+i.user.id+'>\n\n**内容**\n'+msg;
   await thread.send({content:header,allowedMentions:{parse:[]}});
   // The receiving guild owner is added as a private-thread member and explicitly notified there.
   await thread.send({content:'<@'+owner+'> 新しいお問い合わせです。',allowedMentions:{users:[owner]}});
   await returnHome(i,mode);
   await i.editReply('お問い合わせを送信しました。');
  }catch(e){
   console.error('非公開お問い合わせスレッド作成失敗:',e);
   await i.editReply('お問い合わせを送信できませんでした。管理用チャンネルの権限設定をご確認ください。');
  }
  return true;
 }
 if(id==='reset_start'){
  if(i.guildId!==testGuild||i.user.id!==i.guild.ownerId)return i.reply({content:'初期化はテストサーバーの所有者のみ実行できます。',flags:MessageFlags.Ephemeral});
  if(st.get(i.guildId).inactive?.enabled)return i.reply({content:'先に非アクティブメンバー管理を停止してください。',flags:MessageFlags.Ephemeral});
  const modal=new ModalBuilder().setCustomId(ROOT+'reset_confirm').setTitle('設定を初期化');
  modal.addComponents(row(new TextInputBuilder().setCustomId('confirm').setLabel('初期化する場合 RESET と入力').setStyle(TextInputStyle.Short).setRequired(true)));
  return i.showModal(modal);
 }
 if(id==='reset_confirm'){
  if(i.guildId!==testGuild||i.user.id!==i.guild.ownerId)return i.reply({content:'権限がありません。',flags:MessageFlags.Ephemeral});
  if(i.fields.getTextInputValue('confirm').trim()!=='RESET')return i.reply({content:'初期化を中止しました。',flags:MessageFlags.Ephemeral});
  const data=st.get(i.guildId);
  if(data.inactive?.enabled||Object.values(data.inactive?.users||{}).some(x=>x.suspendedRole||x.restoreRole))return i.reply({content:'非アクティブメンバー管理の停止とロール復元を完了してから実行してください。',flags:MessageFlags.Ephemeral});
  await i.deferReply({flags:MessageFlags.Ephemeral});
  const original={...data},panelId=data.managementPanelId,logId=data.managementLogMessageId;
  // Keep the persistent message IDs and an audit marker, without retaining user-related configuration.
  for(const key of Object.keys(data))delete data[key];
  Object.assign(data,{vc:null,sticky:{},alarms:[],entry:{},welcome:{},managementPanelId:panelId,managementLogMessageId:logId,managementLog:[{at:Date.now(),by:i.user.id,action:'設定を初期化',details:['設定データ：保存済み → 初期状態']}]});
  if(!await st.save(i.guild)){for(const key of Object.keys(data))delete data[key];Object.assign(data,original);return i.editReply('保存に失敗したため初期化を取り消しました。');}
  await require('./managementAudit').publish(i.guild).catch(e=>console.error('初期化後ログ更新:',e));
  await require('./managementPanel').ensure(i.guild).catch(e=>console.error('初期化後パネル更新:',e));
  return i.editReply('保存設定を初期化しました。既存の投稿済みメッセージは削除していません。');
 }
 if(id==='analytics_image'){
  try{
   const png=require('./analyticsGraph').create(st.get(i.guildId).analyticsDaily||{});
   return i.update({...render('analytics',mode,i.guildId,0,true),files:[new AttachmentBuilder(png,{name:'server-analytics.png'})],attachments:[]});
  }catch(e){console.error('分析グラフ作成失敗:',e);return i.reply({content:'分析グラフを作成できませんでした。',flags:MessageFlags.Ephemeral});}
 }
 if(id==='inactive_on'||id==='inactive_off'){
  // All guilds may switch monitoring; actual kicks still require explicit admin approval.
  await i.deferUpdate();
  const d=st.get(i.guildId),s=d.inactive;
  if(id==='inactive_off'){
   if(s)s.enabled=false;
   const failures=s?await require('./inactive').restoreSuspended(i.guild,s):0;
   const saved=await st.save(i.guild);
   await i.editReply(render('inon',mode,i.guildId));
   if(!saved||failures)await i.followUp({content:!saved?'停止状態を保存できませんでした。':'監視は停止しましたが、'+failures+'人のロールを復元できませんでした。',flags:MessageFlags.Ephemeral});
   return true;
  }
  if(s?.enabled){await i.editReply(render('inon',mode,i.guildId));return true;}
  const role=d.inactiveSettings?.role||s?.role;
  const months=d.inactiveMonths||s?.months||3;
  const ch=st.findCh(i.guild),me=i.guild.members.me||await i.guild.members.fetchMe();
  if(!role||!ch){await i.followUp({content:'有効化する前に対象ロールと #bot-config を設定してください。',flags:MessageFlags.Ephemeral});return true;}
  if(!me.permissions.has(PermissionFlagsBits.KickMembers)||!ch.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks])){
   await i.followUp({content:'BOTのキック権限、または #bot-config のログ投稿権限が不足しています。',flags:MessageFlags.Ephemeral});return true;
  }
  try{await require('./inactive').managedRole(i.guild,role);}
  catch(e){await i.followUp({content:'対象ロールを操作できません：'+e.message,flags:MessageFlags.Ephemeral});return true;}
  if(s&&Object.values(s.users||{}).some(u=>u.suspendedRole||u.restoreRole)){
   await i.followUp({content:'復元待ちのロールがあります。先に停止処理を完了してください。',flags:MessageFlags.Ephemeral});return true;
  }
  const now=Date.now(),prev=d.inactive;
  d.inactive={enabled:true,since:now,seenAt:now,checkedAt:0,log:d.inactiveSettings?.approvalChannelId||ch.id,approvalChannelId:d.inactiveSettings?.approvalChannelId||ch.id,role,exclude:d.inactiveSettings?.exclude||null,months,users:{}};
  if(!await st.save(i.guild)){d.inactive=prev;await i.followUp({content:'保存に失敗したため有効化していません。',flags:MessageFlags.Ephemeral});return true;}
  await i.editReply(render('inon',mode,i.guildId));return true;
 }
 if(id==='inactive_channel'){
  const idSelected=i.values?.[0],ch=idSelected&&await i.guild.channels.fetch(idSelected).catch(()=>null);
  const me=i.guild.members.me||await i.guild.members.fetchMe();
  if(!ch?.isTextBased()||!ch.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]))return i.reply({content:'BOTが閲覧・投稿できるテキストチャンネルを選んでください。',flags:MessageFlags.Ephemeral});
  const d=st.get(i.guildId),old={...(d.inactiveSettings||{})},oldLive=d.inactive?.approvalChannelId,oldLog=d.inactive?.log;
  d.inactiveSettings={...old,approvalChannelId:idSelected};
  if(d.inactive){d.inactive.approvalChannelId=idSelected;d.inactive.log=idSelected;}
  if(!await st.save(i.guild)){d.inactiveSettings=old;if(d.inactive){d.inactive.approvalChannelId=oldLive;d.inactive.log=oldLog;}return i.reply({content:'保存できませんでした。',flags:MessageFlags.Ephemeral});}
  await i.update(render('inactive',mode,i.guildId));return true;
 }
 if(id==='inactive_exclude_clear'){
  const d=st.get(i.guildId),live=d.inactive;
  if(live?.enabled)return i.reply({content:'先に管理を停止してください。',flags:MessageFlags.Ephemeral});
  const old={...(d.inactiveSettings||{})};d.inactiveSettings={...old,exclude:null};
  if(!await st.save(i.guild)){d.inactiveSettings=old;return i.reply({content:'保存に失敗しました。',flags:MessageFlags.Ephemeral});}
  await i.update(render('inexclude',mode,i.guildId));return true;
 }
 if(id==='inactive_role'||id==='inactive_exclude'){
  const d=st.get(i.guildId),s=d.inactive||{},field=id==='inactive_role'?'role':'exclude';
  if(s.enabled)return i.reply({content:'非アクティブメンバー管理を停止してから変更してください。',flags:MessageFlags.Ephemeral});
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
  await i.update(render('inactive',mode,i.guildId));
  return true;
 }
 if(id==='months'){
  const months=Number(i.values?.[0]),d=st.get(i.guildId);
  if(d.inactive?.enabled)return i.reply({content:'非アクティブメンバー管理を停止してから判定期間を変更してください。',flags:MessageFlags.Ephemeral});
  if(!Number.isInteger(months)||months<1||months>12)return i.reply({content:'1〜12か月を選んでください。',flags:MessageFlags.Ephemeral});
  const old=d.inactiveMonths,oldNested=d.inactive?.months;
  d.inactiveMonths=months;
  if(d.inactive)d.inactive.months=months;
  if(!await st.save(i.guild)){
   d.inactiveMonths=old;
   if(d.inactive)d.inactive.months=oldNested;
   return i.reply({content:'保存できませんでした。変更を取り消しました。',flags:MessageFlags.Ephemeral});
  }
  await i.update(render('inactive',mode,i.guildId));
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
 if(id==='vc_schedule_time'){
  const modal=new ModalBuilder().setCustomId(ROOT+'vc_schedule_save').setTitle('VCメンションの時間帯');
  const current=st.get(i.guildId).vcMentionSchedule||{};
  modal.addLabelComponents(
   new LabelBuilder().setLabel('開始時刻（HH:mm）').setTextInputComponent(new TextInputBuilder().setCustomId('start').setStyle(TextInputStyle.Short).setRequired(true).setValue(current.start||'08:00')),
   new LabelBuilder().setLabel('終了時刻（HH:mm）').setTextInputComponent(new TextInputBuilder().setCustomId('end').setStyle(TextInputStyle.Short).setRequired(true).setValue(current.end||'18:00'))
  );
  return i.showModal(modal);
 }
 if(['vc_schedule_save','vc_schedule_clear','vc_schedule_primary','vc_schedule_secondary','vc_role_primary_clear','vc_role_secondary_clear'].includes(id)){
  const d=st.get(i.guildId),old=d.vcMentionSchedule;
  const next={...(old||{})};
  if(id==='vc_schedule_save'){
   const a=i.fields.getTextInputValue('start').trim(),b=i.fields.getTextInputValue('end').trim();
   const valid=require('./vcMentionSchedule').minute;
   if(valid(a)===null||valid(b)===null||a===b)return i.reply({content:'時刻は08:00の形式で、開始と終了を異なる時刻にしてください。',flags:MessageFlags.Ephemeral});
   next.start=a;next.end=b;
  }else if(id==='vc_schedule_clear'){d.vcMentionSchedule=null;}
  else if(id==='vc_schedule_primary')next.primaryRole=i.values?.[0]||null;
  else if(id==='vc_schedule_secondary')next.secondaryRole=i.values?.[0]||null;
  else if(id==='vc_role_primary_clear')next.primaryRole=null;
  else if(id==='vc_role_secondary_clear')next.secondaryRole=null;
  if(id!=='vc_schedule_clear')d.vcMentionSchedule=next;
  if(!await st.save(i.guild)){d.vcMentionSchedule=old;return i.reply({content:'設定の保存に失敗しました。',flags:MessageFlags.Ephemeral});}
  if(id==='vc_schedule_save')return i.reply({content:'時間帯を保存しました：'+next.start+'〜'+next.end+'（日本時間）',flags:MessageFlags.Ephemeral});
  return i.update(render('vc',mode,i.guildId));
 }
 if(id==='vc_on'||id==='vc_off'){
  const data=st.get(i.guildId),old=data.vcOff;
  if(id==='vc_on'&&!data.vc)return i.reply({content:'先にVC通知先を選択してください。',flags:MessageFlags.Ephemeral});
  data.vcOff=id==='vc_off';
  if(!await st.save(i.guild)){data.vcOff=old;return i.reply({content:'ON/OFFを保存できませんでした。',flags:MessageFlags.Ephemeral});}
  await i.update(render('vc',mode,i.guildId));return true;
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
async function handle(i){
 if(!i.guildId||!i.customId?.startsWith(ROOT))return false;
 const audit=require('./managementAudit');
 const before=audit.compact(st.get(i.guildId));
 const result=await handleCore(i);
 if(result&&i.guild&&i.replied&&!i.ephemeral){ /* no special action */ }
 if(result&&i.guild&&isAdmin(i))await audit.record(i.guild,i.user,before);
 return result;
}
module.exports={render,handle};
