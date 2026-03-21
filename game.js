"use strict";
/* =====================================================
   黄梅暗7 — 游戏逻辑
   依据《黄梅暗7-游戏规则.md》实现
   ===================================================== */

// =====================================================
//  常量
// =====================================================
const SUITS    = ['\u2660', '\u2665', '\u2663', '\u2666']; // ♠ ♥ ♣ ♦
const SNAME    = { '\u2660': '黑桃', '\u2665': '红桃', '\u2663': '梅花', '\u2666': '方块' };
const SUIT_ORD = ['\u2660', '\u2665', '\u2663', '\u2666']; // 反主大小：黑>红>梅>方
const RANKS    = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RV       = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
const SCORE_R  = { '5': 5, '10': 10, 'K': 10 };
const LVL      = '7';
const KITTY    = 8;

// =====================================================
//  牌工具函数
// =====================================================
const mk    = (s, r) => s + r;
const gS    = id => id[0];
const gR    = id => id.slice(1);
const isBJ  = id => id === 'BJ';
const isSJ  = id => id === 'SJ';
const isJk  = id => isBJ(id) || isSJ(id);
const isLv  = id => !isJk(id) && gR(id) === LVL;  // 是否为7（级牌）

function makeDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push(mk(s, r));
  d.push('BJ'); d.push('SJ');
  return d;
}
function makeFull() { return [...makeDeck(), ...makeDeck()]; }

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = 0 | Math.random() * (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cardScore(id) {
  if (isJk(id)) return 0;
  return SCORE_R[gR(id)] || 0;
}

function cardColor(id) {
  if (isJk(id)) return 'red';
  return (gS(id) === '\u2665' || gS(id) === '\u2666') ? 'red' : 'black';
}

function cardDisp(id) {
  if (isBJ(id)) return { top: '大', suit: '王', color: 'red' };
  if (isSJ(id)) return { top: '小', suit: '王', color: 'black' };
  return { top: gR(id), suit: gS(id), color: cardColor(id) };
}

// =====================================================
//  游戏状态 S
// =====================================================
const S = {
  phase:       'idle',    // idle | dealing | kitty | playing | settle
  np:          4,
  ps:          [],        // [{name, hand:[], isHuman}]
  deck:        [],
  kitty:       [],
  dealer:      0,
  firstDealer: 0,         // 本局第一个得牌人（发牌起始）
  caller:      -1,
  calledCard:  null,
  trumpSuit:   null,      // 主花色（null=无花色/国主）
  trumpJoker:  false,     // 是否国主（大小王主）
  counterHist: [],        // 反主历史 [{p, cards, suit, type, label}]
  multiplier:  1,
  curP:        0,
  round:       1,
  gameRound:   1,
  leadCards:   [],
  playedRound: [],        // 本轮出牌 [{p, cards}]
  atkScore:    0,
  playerScores: [0, 0, 0, 0], // 各玩家本局累计得分（抓分方抓到分时记录）
  defenders:   [],
  attackers:   [],
  teamRevealed: false,    // 阵营是否已向所有人公布
  callerPair7: false,
  sellAttempt: false,
  sellCard:    null,
  kittyOwner:  -1,        // 最后换底的玩家（=反主玩家 或 叫主玩家）
  kittyPhase:  'caller',  // 'caller'=叫主换底中, 'counter'=反主换底中
  _counterCont: null,     // 反主换底完成后的继续回调
  _kittyAfterSell: false, // 卖主成功后的反主换底标记（换底后直接出牌）
  history:     [],
  dealIdx:     0,
  dealTimer:   null,
  totalDeal:   0,
};

// =====================================================
//  主花色 / 牌力计算
// =====================================================
function isTrump(id) {
  if (isJk(id)) return true;
  if (isLv(id)) return true;               // 所有7均为主牌
  if (S.trumpJoker) return false;           // 国主：无花色主牌
  if (S.trumpSuit && gS(id) === S.trumpSuit) return true;
  return false;
}

function suitGroup(id) {
  if (isTrump(id)) return '_T';
  return gS(id);
}

function cardVal(id) {
  if (isBJ(id)) return 1000;
  if (isSJ(id)) return 900;
  if (S.trumpSuit && id === mk(S.trumpSuit, LVL)) return 800;  // 正主7最大
  if (isLv(id)) return 750;                                      // 副主7
  if (!S.trumpJoker && S.trumpSuit && gS(id) === S.trumpSuit) return 500 + RV[gR(id)];
  return RV[gR(id)] || 0;
}

// =====================================================
//  渲染牌元素
// =====================================================
function mkCard(id, { back = false, sm = false, med = false, onClick = null } = {}) {
  const el = document.createElement('div');
  let cls = 'card';
  if (back) cls += ' back';
  if (sm)   cls += ' sm';
  if (med)  cls += ' med';
  el.className = cls;
  if (!back && id) {
    const d = cardDisp(id);
    el.classList.add(d.color);
    if (!sm) {
      el.innerHTML = `<div class="tl">${d.top}<br>${d.suit}</div><div class="cs">${d.suit}</div><div class="bl">${d.top}<br>${d.suit}</div>`;
    }
    el.dataset.cid = id;
  }
  if (onClick) el.addEventListener('click', onClick);
  return el;
}

// =====================================================
//  G — 游戏控制器
// =====================================================
const G = {

  // ---------- 开始 ----------
  start() {
    document.getElementById('bStart').style.display = 'none';
    this.initGame();
    this.renderAll();
    this.updateInfo();
    this.startDeal();
  },

  initGame() {
    S.np  = 4;
    S.ps  = [];
    for (let i = 0; i < S.np; i++) {
      S.ps.push({ name: i === 0 ? '你' : `电脑${i}`, hand: [], isHuman: i === 0 });
    }
    S.deck        = shuffle(makeFull());
    S.kitty       = [];
    S.caller      = -1;
    S.calledCard  = null;
    S.trumpSuit   = null;
    S.trumpJoker  = false;
    S.counterHist = [];
    S.multiplier  = 1;
    S.round       = 1;
    S.leadCards   = [];
    S.playedRound = [];
    S.atkScore    = 0;
    S.playerScores = [0, 0, 0, 0];
    S.defenders   = [];
    S.attackers   = [];
    S.teamRevealed = false;
    S.callerPair7 = false;
    S.sellAttempt = false;
    S.sellCard    = null;
    S.kittyOwner      = -1;
    S.kittyPhase      = 'caller';
    S._counterCont    = null;
    S._kittyAfterSell = false;
    S.dealIdx         = 0;
    S.totalDeal   = S.np * (S.np === 4 ? 25 : 20);
    S.phase       = 'dealing';
    this.hideAllBtns();
    this.clearPlayed();
    this._hideEl('suitTag');
    this._hideEl('multTag');
    this._hideEl('callBanner');
    // 重置底牌查看按钮
    const bvk = document.getElementById('bViewKitty');
    if (bvk) bvk.style.display = 'none';
    // 显示菜单按钮
    document.getElementById('menuBtn').style.display = '';
  },

  // ---------- 发牌 ----------
  startDeal() {
    const pile = document.getElementById('deck');
    pile.innerHTML = '';
    const c = mkCard(null, { back: true });
    c.style.position = 'absolute';
    pile.appendChild(c);
    pile.style.display = 'block';
    this.dealSeq = this._buildDealSeq();
    this._doDeal();
  },

  _buildDealSeq() {
    const seq = [];
    let cur = S.firstDealer;
    for (let i = 0; i < S.totalDeal; i++) {
      seq.push(cur);
      cur = this.prev(cur);
    }
    return seq;
  },

  _doDeal() {
    S.dealTimer = setInterval(() => {
      if (S.dealIdx >= this.dealSeq.length) {
        clearInterval(S.dealTimer);
        this._finishDeal();
        return;
      }
      const p    = this.dealSeq[S.dealIdx];
      const card = S.deck[S.dealIdx];
      S.ps[p].hand.push(card);
      S.dealIdx++;
      this.renderHand(p);
      this.updateInfo();
      // 发牌过程中：仅允许叫主（不允许反主）
      if (S.caller === -1) {
        for (let i = 1; i < S.np; i++) {
          if (this._aiWantCall(i)) { this._aiDoCall(i); break; }
        }
        const bCall = document.getElementById('bCall');
        bCall.style.display = (S.caller === -1 && this._canCall(0)) ? '' : 'none';
      }
    }, 150);
  },

  _finishDeal() {
    S.kitty = S.deck.slice(S.dealIdx, S.dealIdx + KITTY);
    document.getElementById('deck').style.display = 'none';
    this._hideEl('bCall');
    this._hideEl('bCounter');

    if (S.caller === -1) {
      // 无人叫主，本局结束
      this._showMsg('无人叫主，本局结束！', 2200, () => {
        S.firstDealer = this.prev(S.firstDealer);
        S.gameRound++;
        this._settleNoCall();
      });
      return;
    }

    S.phase = 'kitty';
    // 发牌结束后，先由叫主玩家换底
    S.kittyPhase   = 'caller';
    S._counterCont = null;
    this._startKittyExchange();
  },

  // ---------- 叫主 ----------
  _canCall(p) {
    return S.ps[p].hand.some(c => isLv(c) || isJk(c));
  },

  humanCall() {
    const opts = S.ps[0].hand.filter(c => isLv(c) || isJk(c));
    if (!opts.length) return;
    this._openChoiceModal('选择叫主的牌', opts, card => this._doCall(0, card));
  },

  _doCall(p, card) {
    S.caller     = p;
    S.calledCard = card;
    if (isJk(card)) {
      S.trumpSuit   = null;
      S.trumpJoker  = true;
    } else {
      S.trumpSuit   = gS(card);
      S.trumpJoker  = false;
    }
    S.dealer = p;
    this._checkPair7();
    // 显示叫主横幅（保密，不透露花色）
    const banner = document.getElementById('callBanner');
    banner.textContent = `${S.ps[p].name} 已叫主！`;
    banner.style.display = 'block';
    // 主花色保密
    document.getElementById('iSuit').textContent = '已叫主（保密）';
    this._hideEl('bCall');
    this.renderHand(0);
  },

  _checkPair7() {
    if (!S.calledCard || isJk(S.calledCard)) { S.callerPair7 = false; return; }
    const suit = gS(S.calledCard);
    const cnt  = S.ps[S.caller].hand.filter(c => isLv(c) && gS(c) === suit).length;
    S.callerPair7 = cnt >= 2;
  },

  _aiWantCall(p) {
    const h = S.ps[p].hand;
    if (h.length < 2) return false;
    return h.some(c => isLv(c)) && Math.random() < 0.3;
  },

  _aiDoCall(p) {
    const opts = S.ps[p].hand.filter(c => isLv(c) || isJk(c));
    if (!opts.length) return;
    const card = opts[Math.floor(Math.random() * opts.length)];
    this._doCall(p, card);
  },

  // ---------- 反主 ----------
  // 逆时针逐一询问，从 startP 到 skipP（不含）结束
  _counterTurn(p, skipP, done) {
    if (p === skipP) {
      this._hideCounterTurnHint();
      this._hideEl('callBanner');
      done();
      return;
    }
    this._showCounterTurnHint(p);
    if (p === 0) {
      // 人类玩家：5秒倒计时，提供反主和跳过按钮
      const opts    = this._getCounterOpts(0);
      const hasOpts = opts.length > 0;
      if (hasOpts) document.getElementById('bCounter').style.display = '';
      document.getElementById('bSkip').style.display = '';
      let remain = 5;
      this._showCounterCountdown(remain, hasOpts);
      this._counterInterval = setInterval(() => {
        remain--;
        this._showCounterCountdown(remain, hasOpts);
        if (remain <= 0) clearInterval(this._counterInterval);
      }, 1000);
      this._counterTimer = setTimeout(() => {
        clearInterval(this._counterInterval);
        this._hideEl('bCounter');
        this._hideEl('bSkip');
        this._skipDone = null;
        this._hideCounterCountdown();
        this._counterTurn(this.prev(p), skipP, done);
      }, 5000);
      // 保存跳过回调，供 skipCounter() 调用
      this._skipDone = () => this._counterTurn(this.prev(p), skipP, done);
    } else {
      // AI玩家：随机等待 5~10 秒（均匀等待，避免根据时长推断手牌）
      const waitMs = 5000 + Math.floor(Math.random() * 5001);
      const opts   = this._getCounterOpts(p);
      this._counterTimer = setTimeout(() => {
        this._counterTimer = null;
        if (opts.length && Math.random() < 0.35) {
          this._doCounter(p, opts[0]);
        } else {
          this._counterTurn(this.prev(p), skipP, done);
        }
      }, waitMs);
    }
  },

  openCounter() {
    const pairs = this._getCounterOpts(0);
    if (!pairs.length) { this._showMsg('没有可反主的牌！', 1200); return; }
    const items = pairs.map(opt => {
      const btn = document.createElement('button');
      btn.className = 'btn bwrn';
      btn.textContent = opt.label;
      btn.onclick = () => {
        this._cancelCounterTurn();
        this._doCounter(0, opt);
        this.closeM('mChoice');
      };
      return btn;
    });
    this._openChoiceRaw('选择反主方式', items);
  },

  _getCounterOpts(p) {
    const h      = S.ps[p].hand;
    const minLv  = this._curCounterLv();
    const pairs  = [];
    // 用于反主的牌不能重复：检查该玩家已用过的牌
    const usedCards = S.counterHist.filter(h => h.p === p).flatMap(h => h.cards);
    if (h.filter(isBJ).length >= 2 && this._ctrLv('BJ') > minLv &&
        usedCards.filter(isBJ).length < 2) {
      pairs.push({ type: 'BJ', cards: ['BJ','BJ'], label: '一对大王', suit: null });
    }
    if (h.filter(isSJ).length >= 2 && this._ctrLv('SJ') > minLv &&
        usedCards.filter(isSJ).length < 2) {
      pairs.push({ type: 'SJ', cards: ['SJ','SJ'], label: '一对小王', suit: null });
    }
    for (const s of SUITS) {
      const id = mk(s, LVL);
      const alreadyUsed = usedCards.filter(c => c === id).length;
      if (h.filter(c => c === id).length >= 2 && this._ctrLv(id) > minLv && alreadyUsed < 2) {
        pairs.push({ type: '7', cards: [id, id], label: `一对${SNAME[s]}7`, suit: s });
      }
    }
    return pairs;
  },

  _ctrLv(id) {
    if (isBJ(id)) return 100;
    if (isSJ(id)) return 90;
    return 10 - SUIT_ORD.indexOf(gS(id));
  },

  _curCounterLv() {
    if (!S.counterHist.length) return 0;
    return this._ctrLv(S.counterHist[S.counterHist.length - 1].cards[0]);
  },

  _doCounter(p, opt) {
    S.counterHist.push({ p, cards: opt.cards, suit: opt.suit, type: opt.type, label: opt.label });
    S.multiplier *= 2;
    if (opt.type === 'BJ' || opt.type === 'SJ') {
      S.trumpSuit  = null;
      S.trumpJoker = true;
    } else {
      S.trumpSuit  = opt.suit;
      S.trumpJoker = false;
    }
    S.kittyOwner = p;
    // 更新横幅
    const banner = document.getElementById('callBanner');
    banner.textContent = `${S.ps[p].name} 反主！×${S.multiplier}`;
    banner.style.display = 'block';
    this.renderAll(); this.updateInfo(); this._updateMultTag();
    // 展示反主牌给所有玩家
    this._showCounterCards(p, opt, () => {
      if (S.sellAttempt) { this._completeSell(true, p); return; }
      // 反主后立即让反主玩家换底，换底完成后继续轮询下一位
      this._cancelCounterTurn();
      S.kittyPhase = 'counter';
      this._startKittyExchange();
    });
  },

  _showCounterCards(p, opt, cb) {
    const a     = document.getElementById('reveal');
    const lbl   = document.getElementById('revealLabel');
    const cards = document.getElementById('revealCards');
    cards.innerHTML = '';
    lbl.textContent = `${S.ps[p].name} 反主（${opt.label}）：`;
    for (const c of opt.cards) cards.appendChild(mkCard(c));
    a.style.display = 'flex';
    setTimeout(() => { a.style.display = 'none'; if (cb) cb(); }, 2200);
  },

  _cancelCounterTurn() {
    if (this._counterTimer)   { clearTimeout(this._counterTimer);   this._counterTimer   = null; }
    if (this._counterInterval){ clearInterval(this._counterInterval); this._counterInterval = null; }
    this._hideEl('bCounter');
    this._hideEl('bSkip');
    this._hideCounterCountdown();
    this._hideCounterTurnHint();
    this._hideEl('callBanner');
  },

  // 玩家主动点击"跳过"跳过反主
  skipCounter() {
    this._cancelCounterTurn();
    // 重新触发轮询：找到当前被询问的状态继续往下走
    // 通过标记 _skipDone 回调来恢复流程
    if (typeof this._skipDone === 'function') {
      const cb = this._skipDone;
      this._skipDone = null;
      cb();
    }
  },

  // ---------- 换底牌 ----------
  _startKittyExchange() {
    const owner = S.kittyOwner !== -1 ? S.kittyOwner : S.caller;
    if (owner !== 0) { this._aiKitty(owner); return; }
    // 给底牌8张加入玩家手牌
    const player = S.ps[0];
    player.hand.push(...S.kitty); S.kitty = [];
    this.sortHand(player.hand);
    const modal = document.getElementById('mKitty');
    const cont  = document.getElementById('mKittyCards');
    const phase = S.kittyPhase;
    const title = phase === 'counter'
      ? `反主换底（请选 ${KITTY} 张）`
      : `叫主换底（请选 ${KITTY} 张）`;
    document.getElementById('mKittyTitle').textContent = title;
    document.getElementById('mKittyTip').textContent  = `共 ${player.hand.length} 张，点击选中/取消，选 ${KITTY} 张放入底牌`;
    cont.innerHTML = '';
    const selIdx  = new Set();
    const allCards = [...player.hand];
    allCards.forEach((c, i) => {
      const el = mkCard(c);
      el.dataset.idx = i;
      el.addEventListener('click', () => {
        if (selIdx.has(i)) { selIdx.delete(i); el.classList.remove('sel'); }
        else if (selIdx.size < KITTY) { selIdx.add(i); el.classList.add('sel'); }
        document.getElementById('mKittyTitle').textContent = `已选 ${selIdx.size}/${KITTY} 张`;
      });
      cont.appendChild(el);
    });
    modal._selIdx   = selIdx;
    modal._allCards = allCards;
    // 卖主按钮：仅叫主换底阶段且满足条件时显示
    document.getElementById('bSell').style.display =
      (phase === 'caller' && S.callerPair7 && S.caller === 0) ? '' : 'none';
    modal.style.display = 'flex';
  },

  confirmKitty() {
    const modal    = document.getElementById('mKitty');
    const selIdx   = modal._selIdx;
    const allCards = modal._allCards;
    if (!selIdx || selIdx.size !== KITTY) {
      this._showMsg(`请选择恰好 ${KITTY} 张底牌！（当前已选 ${selIdx ? selIdx.size : 0} 张）`, 1500);
      return;
    }
    S.kitty = []; S.ps[0].hand = [];
    allCards.forEach((c, i) => {
      if (selIdx.has(i)) S.kitty.push(c);
      else S.ps[0].hand.push(c);
    });
    this.closeM('mKitty');
    this._renderKitty(false);
    this.renderHand(0);

    const phase = S.kittyPhase;
    if (S._kittyAfterSell) {
      // 卖主成功后的反主换底，换底完成直接出牌
      S._kittyAfterSell = false;
      this._startPlaying();
    } else if (phase === 'caller') {
      // 叫主玩家换底完成 → 开始反主轮询（从叫主者逆时针下一位开始）
      S.kittyPhase = 'counter';
      const startP = this.prev(S.caller);
      this._counterTurn(startP, S.caller, () => this._startPlaying());
    } else {
      // 反主玩家换底完成 → 继续轮询下一位（从该反主者逆时针下一位继续，直到绕回叫主者）
      const counterP = S.kittyOwner;
      const nextP    = this.prev(counterP);
      this._counterTurn(nextP, S.caller, () => this._startPlaying());
    }
  },

  trySell() {
    const modal    = document.getElementById('mKitty');
    const selIdx   = modal._selIdx;
    const allCards = modal._allCards;
    if (!selIdx || selIdx.size !== KITTY) {
      this._showMsg(`先选好 ${KITTY} 张底牌！`, 1200);
      return;
    }
    const selCards = [...selIdx].map(i => allCards[i]);
    if (!selCards.includes(S.calledCard)) {
      this._showMsg('底牌中需要包含叫主的7！', 1500);
      return;
    }
    S.sellAttempt = true; S.sellCard = S.calledCard;
    S.kitty       = selCards;
    S.ps[0].hand  = allCards.filter((_, i) => !selIdx.has(i));
    this.closeM('mKitty');
    this._renderKitty(true);
    this.renderHand(0);
    this._showMsg('卖主中，等待其他玩家反主...', 2000);
    setTimeout(() => {
      let any = false;
      for (let i = 1; i < S.np; i++) {
        const opts = this._getCounterOpts(i);
        if (opts.length && Math.random() < 0.5) { this._doCounter(i, opts[0]); any = true; break; }
      }
      if (!any) this._completeSell(false, -1);
    }, 2200);
  },

  _completeSell(ok, ctrP) {
    S.sellAttempt = false;
    const el = document.getElementById('sellTag');
    el.textContent    = ok ? '卖主成功！' : '卖主失败！';
    el.style.display  = 'block';
    setTimeout(() => el.style.display = 'none', 2500);
    if (ok) {
      // 卖主成功：反主玩家(ctrP)需先换底，换底完成后直接进入出牌（无需再继续反主轮询）
      this._showMsg(`卖主成功！${S.ps[ctrP].name} 反主并换底`, 1500, () => {
        S.kittyPhase = 'counter';
        S.kittyOwner = ctrP;
        // 换底完成后，_aiKitty/_confirmKitty 会调 _counterTurn(prev(ctrP), caller, startPlaying)
        // 为使轮询立即结束，将叫主者临时改为 prev(ctrP)，使下一位就是 skipP
        // 更简单：直接记录"下次换底后直接出牌"标记
        S._kittyAfterSell = true;
        this._startKittyExchange();
      });
    } else {
      this._showChoice(
        '卖主失败！选择：', '继续游戏', '放弃本局',
        () => this._startPlaying(),
        () => { S.atkScore = 40; this._doSettle(); }
      );
    }
  },

  _aiKitty(p) {
    const pl = S.ps[p];
    pl.hand.push(...S.kitty); S.kitty = [];
    this.sortHand(pl.hand);
    const h = [...pl.hand];
    h.sort((a, b) => {
      const at = isTrump(a), bt = isTrump(b);
      if (at !== bt) return at ? 1 : -1;
      return cardScore(a) - cardScore(b);
    });
    S.kitty      = h.slice(0, KITTY);
    S.ps[p].hand = h.slice(KITTY);
    this._renderKitty(false);
    this.renderHand(p);

    const phase = S.kittyPhase;
    setTimeout(() => {
      if (S._kittyAfterSell) {
        S._kittyAfterSell = false;
        this._startPlaying();
      } else if (phase === 'caller') {
        // 叫主 AI 换底完成 → 开始反主轮询
        S.kittyPhase = 'counter';
        const startP = this.prev(S.caller);
        this._counterTurn(startP, S.caller, () => this._startPlaying());
      } else {
        // 反主 AI 换底完成 → 继续轮询下一位
        const counterP = S.kittyOwner;
        const nextP    = this.prev(counterP);
        this._counterTurn(nextP, S.caller, () => this._startPlaying());
      }
    }, 400);
  },

  // ---------- 出牌阶段 ----------
  _startPlaying() {
    S.phase       = 'playing';
    // 首轮出牌人 = 叫主玩家（S.caller），逆时针依次出牌
    S.curP        = S.caller;
    S.dealer      = S.caller;   // dealer 始终跟随叫主玩家（用于标识显示）
    S.round       = 1;
    S.atkScore    = 0;
    S.playedRound = [];
    this._determineTeams();
    this._revealCalledCard(() => {
      this._showSuitTag();
      this.renderAll(); this.updateInfo();
      this._nextTurn();
    });
  },

  _determineTeams() {
    S.defenders = [S.caller];
    if (!S.callerPair7 && S.trumpSuit) {
      for (let i = 0; i < S.np; i++) {
        if (i !== S.caller && S.ps[i].hand.some(c => isLv(c) && gS(c) === S.trumpSuit)) {
          S.defenders.push(i);
        }
      }
    }
    S.attackers = S.ps.map((_, i) => i).filter(i => !S.defenders.includes(i));
  },

  _revealCalledCard(cb) {
    const a     = document.getElementById('reveal');
    const lbl   = document.getElementById('revealLabel');
    const cards = document.getElementById('revealCards');
    cards.innerHTML = '';
    if (S.calledCard) {
      lbl.textContent = `${S.ps[S.caller].name} 叫主：`;
      cards.appendChild(mkCard(S.calledCard));
    }
    a.style.display = 'flex';
    this.updateInfo(); // 公开真实主花色
    setTimeout(() => { a.style.display = 'none'; if (cb) cb(); }, 3200);
  },

  _showSuitTag() {
    const el = document.getElementById('suitTag');
    if (S.trumpSuit) {
      el.textContent  = `主：${SNAME[S.trumpSuit]} ${S.trumpSuit}`;
      el.style.display = 'block';
    } else if (S.trumpJoker) {
      el.textContent  = '国主（无花色）';
      el.style.display = 'block';
    }
  },

  _updateMultTag() {
    const el = document.getElementById('multTag');
    if (S.multiplier > 1) {
      el.textContent  = `反主 ×${S.multiplier}（扣底时翻倍）`;
      el.style.display = 'block';
    } else {
      el.style.display = 'none';
    }
  },

  _nextTurn() {
    this.updateInfo();
    if (S.curP === 0) {
      this._showPlayBtns();
    } else {
      setTimeout(() => this._aiTurn(), 700);
    }
  },

  _showPlayBtns() {
    this.hideAllBtns();
    document.getElementById('bPlay').style.display = '';
    // 首个出牌玩家：不显示垫牌按钮
    document.getElementById('bPass').style.display = S.leadCards.length > 0 ? '' : 'none';
    this._updatePlayBtn();
  },

  _updatePlayBtn() {
    document.getElementById('bPlay').disabled = this._getSel().length === 0;
  },

  _getSel() {
    const res = [];
    document.getElementById('h0').querySelectorAll('.card.sel').forEach(el => {
      if (el.dataset.cid) res.push(el.dataset.cid);
    });
    return res;
  },

  humanPlay() {
    const sel = this._getSel();
    if (!sel.length) { this._showMsg('请选择要出的牌！', 1000); return; }
    const err = this._validatePlay(0, sel);
    if (err) { this._showMsg(err, 1500); return; }
    this._playCards(0, sel);
  },

  humanPass() {
    const n   = S.leadCards.length;
    const sel = this._getSel();
    // 若当前已有正确数量的选中牌，直接出牌（第二次点击）
    if (sel.length === n) {
      this._playCards(0, sel);
      return;
    }
    // 否则：智能选牌（第一次点击）
    const auto = this._pickSmartPass(S.ps[0].hand, n);
    if (!auto) { this._showMsg(`手牌不足 ${n} 张！`, 1000); return; }
    // 清除已有选择，选中 auto
    document.getElementById('h0').querySelectorAll('.card.sel').forEach(el => el.classList.remove('sel'));
    let remaining = [...auto];
    document.getElementById('h0').querySelectorAll('.card[data-cid]').forEach(el => {
      const idx = remaining.indexOf(el.dataset.cid);
      if (idx !== -1) {
        el.classList.add('sel');
        remaining.splice(idx, 1);
      }
    });
    this._updatePlayBtn();
    this._showMsg(`已自动选出推荐垫牌，再次点击垫牌确认出牌`, 1800);
  },

  // 智能垫牌选牌：满足跟牌规则，同时依角色和本轮得分情况优化垫牌内容
  _pickSmartPass(hand, n) {
    if (hand.length < n) return null;

    const lg   = suitGroup(S.leadCards[0]);
    const same = hand.filter(c => suitGroup(c) === lg);
    const other = hand.filter(c => suitGroup(c) !== lg);

    // 必须先出同花色的牌（跟牌规则）
    const mustN = Math.min(same.length, n);
    // 同花色部分：按 cardVal 升序（保留大牌）
    const sameSorted = [...same].sort((a, b) => cardVal(a) - cardVal(b));
    const forced = sameSorted.slice(0, mustN);      // 必须出的同花色牌
    const needExtra = n - mustN;                     // 还需垫的张数

    if (needExtra === 0) return forced;

    // 需要从 other（非同花色）中选 needExtra 张垫牌
    const isDefender  = S.defenders.includes(0);
    const isAttacker  = S.attackers.includes(0);

    // 检查本轮前置玩家是否已出分牌（供抓分方判断）
    const priorScore = S.playedRound.reduce((sum, e) => {
      return sum + e.cards.reduce((s, c) => s + cardScore(c), 0);
    }, 0);
    const hasScore = priorScore > 0;

    // 按策略对 other 排序选 needExtra 张
    let extras;
    if (isDefender) {
      // 守分方：尽量不出分牌，无奈时才出最小分
      const noScore  = other.filter(c => cardScore(c) === 0).sort((a, b) => cardVal(a) - cardVal(b));
      const hasScoreCards = other.filter(c => cardScore(c) > 0).sort((a, b) => cardScore(a) - cardScore(b));
      extras = [...noScore, ...hasScoreCards].slice(0, needExtra);
    } else if (isAttacker && hasScore) {
      // 抓分方 + 本轮有人出了分牌：优先垫分牌（贡献分数），分相同则 cardVal 小的先垫
      const withScore = other.filter(c => cardScore(c) > 0).sort((a, b) => cardScore(b) - cardScore(a) || cardVal(a) - cardVal(b));
      const noScore   = other.filter(c => cardScore(c) === 0).sort((a, b) => cardVal(a) - cardVal(b));
      extras = [...withScore, ...noScore].slice(0, needExtra);
    } else {
      // 抓分方 + 本轮无分牌（不值得垫分）：优先垫非分牌
      const noScore  = other.filter(c => cardScore(c) === 0).sort((a, b) => cardVal(a) - cardVal(b));
      const withScore = other.filter(c => cardScore(c) > 0).sort((a, b) => cardScore(a) - cardScore(b));
      extras = [...noScore, ...withScore].slice(0, needExtra);
    }

    return [...forced, ...extras];
  },

  // 从 hand 中取出 cardVal 最小的 n 张（返回 card id 数组，或 null）
  _pickSmallest(hand, n) {
    if (hand.length < n) return null;
    const sorted = [...hand].sort((a, b) => cardVal(a) - cardVal(b));
    return sorted.slice(0, n);
  },

  // 出牌验证
  _validatePlay(p, cards) {
    // 首出牌（本轮第一个出牌）
    if (S.playedRound.length === 0) {
      const err = this._validateFirstPlay(cards);
      if (err) return err;
      return null; // 首出无跟牌约束
    }
    // 跟牌
    const n = S.leadCards.length;
    if (cards.length !== n) return `必须出 ${n} 张牌！`;
    return this._validateFollow(S.ps[p].hand, cards);
  },

  // 首轮出牌限制（依据规则5.1~5.3）
  _validateFirstPlay(cards) {
    if (cards.length === 1) return null; // 单张始终合法
    const trumpCards    = cards.filter(c => isTrump(c));
    const nonTrumpCards = cards.filter(c => !isTrump(c));
    // 5.3 不一致的主牌（如大小王混合）
    if (trumpCards.length > 0 && nonTrumpCards.length > 0) {
      return '不能混合出主牌和副牌！';
    }
    if (nonTrumpCards.length > 0) {
      // 5.1 不同花色的副牌
      const suits = new Set(nonTrumpCards.map(c => gS(c)));
      if (suits.size > 1) return '副牌必须同一花色！';
      // 5.2 同花色下不一致的副牌（连对/AAK/KKA/677/778/联对/联对+单张除外）
      if (nonTrumpCards.length >= 2) {
        const ranks = nonTrumpCards.map(c => gR(c)).sort();
        if (!this._isAllowedNonTrumpCombo(ranks)) {
          return '出牌组合不符合规则！';
        }
      }
    }
    if (trumpCards.length >= 2) {
      // 主牌组合同样验证牌型合法性
      const ranks = trumpCards.map(c => gR(c)).sort();
      if (!this._isAllowedTrumpCombo(trumpCards, ranks)) {
        return '主牌出牌组合不符合规则！';
      }
    }
    return null;
  },

  // 允许的主牌组合（利用 cardVal 排序后检测，逻辑同副牌但用 cardVal 代替点数连续性）
  _isAllowedTrumpCombo(trumpCards, sortedRanks) {
    const n = trumpCards.length;
    if (n === 2) return this._isPair(trumpCards);
    if (n === 3) {
      // 三张主牌：允许 AAK/KKA/677/778 结构（含主牌特殊级牌）
      // 复用副牌检测，并允许任意高对/低对型
      const sv = trumpCards.map(cardVal).sort((a, b) => a - b);
      return (sv[1] === sv[2] && sv[0] !== sv[1]) || (sv[0] === sv[1] && sv[1] !== sv[2]);
    }
    if (n >= 4 && n % 2 === 0) return this._isConsecPairs(sortedRanks);
    if (n >= 5 && n % 2 !== 0) return this._isChainWithKicker(sortedRanks);
    return false;
  },

  // 允许的副牌组合：对子、AAK、KKA、677、778、联对、联对+1单张
  _isAllowedNonTrumpCombo(sortedRanks) {
    const n = sortedRanks.length;
    if (n === 2) {
      // 对子
      return sortedRanks[0] === sortedRanks[1];
    }
    if (n === 3) {
      // AAK / KKA / 677 / 778
      const allowed = [['A','A','K'],['A','K','K'],['6','7','7'],['7','7','8']];
      return allowed.some(p => p.every((r, i) => r === sortedRanks[i]));
    }
    if (n >= 4 && n % 2 === 0) {
      // 联对：检查是否为连续对子（AABB...）
      return this._isConsecPairs(sortedRanks);
    }
    if (n >= 5 && n % 2 !== 0) {
      // 联对+1单张
      return this._isChainWithKicker(sortedRanks);
    }
    return false;
  },

  _isConsecPairs(sortedRanks) {
    if (sortedRanks.length % 2 !== 0) return false;
    for (let i = 0; i < sortedRanks.length; i += 2) {
      if (sortedRanks[i] !== sortedRanks[i + 1]) return false;
    }
    // 还需检查各对相邻（点数连续）
    const vals = [];
    for (let i = 0; i < sortedRanks.length; i += 2) vals.push(RV[sortedRanks[i]] || 0);
    for (let i = 1; i < vals.length; i++) {
      if (vals[i] - vals[i-1] !== 1) return false;
    }
    return true;
  },

  // 判断 sortedRanks 是否为"联对+1单张"结构
  // 单张必须与联对的最低对或最高对点数相邻（差1）
  _isChainWithKicker(sortedRanks) {
    const n = sortedRanks.length;
    if (n < 5 || n % 2 === 0) return false; // 奇数且至少5张（2对+1）
    // 逐一尝试去掉每个位置的牌，看剩余是否构成联对
    for (let skip = 0; skip < n; skip++) {
      const rest = sortedRanks.filter((_, i) => i !== skip);
      if (!this._isConsecPairs(rest)) continue;
      // 验证单张与联对首尾相邻
      const kicker = sortedRanks[skip];
      const kv = RV[kicker] || 0;
      // 联对最低点（rest[0]）和最高点（rest[rest.length-1]）
      const chainMin = RV[rest[0]] || 0;
      const chainMax = RV[rest[rest.length - 1]] || 0;
      if (kv === chainMin - 1 || kv === chainMax + 1) return true;
    }
    return false;
  },

  // 取联对+单张中联对部分的最小 cardVal（用于 power 计算）
  _chainKickerPower(cards) {
    const ranks = cards.map(c => gR(c)).sort();
    for (let skip = 0; skip < ranks.length; skip++) {
      const rest = ranks.filter((_, i) => i !== skip);
      if (this._isConsecPairs(rest)) {
        // 找到联对部分，取其对应 cards 中最小的 cardVal
        const restCards = [];
        const usedIdx = new Set();
        for (const r of rest) {
          const idx = cards.findIndex((c, i) => !usedIdx.has(i) && gR(c) === r);
          if (idx !== -1) { restCards.push(cards[idx]); usedIdx.add(idx); }
        }
        const sv = restCards.map(cardVal).sort((a, b) => a - b);
        return sv[0];
      }
    }
    return 0;
  },

  // 跟牌验证
  _validateFollow(hand, played) {
    const lg       = suitGroup(S.leadCards[0]);
    const same     = hand.filter(c => suitGroup(c) === lg);
    const playedSame = played.filter(c => suitGroup(c) === lg);
    if (same.length > 0) {
      const need = Math.min(S.leadCards.length, same.length);
      if (playedSame.length < need) {
        return `有${lg === '_T' ? '主牌' : (SNAME[lg] || lg)}必须先出！`;
      }
    }
    return null;
  },

  _playCards(p, cards) {
    const h = S.ps[p].hand;
    for (const c of cards) {
      const i = h.indexOf(c);
      if (i !== -1) h.splice(i, 1);
    }
    const isLead = S.playedRound.length === 0;
    if (isLead) S.leadCards = cards;
    S.playedRound.push({ p, cards });
    this.renderHand(p);
    this.renderPlayed(p, cards);
    if (isLead) this._markLeader(p);
    this.showPlayZoom(p, cards);
    this.hideAllBtns();
    this.updateInfo();

    // 检测：非叫主玩家出了叫主牌 → 公布阵营
    if (!S.teamRevealed && p !== S.caller && S.calledCard && cards.includes(S.calledCard)) {
      S.teamRevealed = true;
      setTimeout(() => this._showTeamReveal(), 400);
    }

    if (S.playedRound.length === S.np) {
      setTimeout(() => this._endRound(), 1200);
    } else {
      S.curP = this.prev(S.curP);
      if (S.curP === 0) setTimeout(() => this._showPlayBtns(), 300);
      else setTimeout(() => this._aiTurn(), 700);
    }
  },

  showPlayZoom(p, cards) {
    const zoom = document.getElementById('playZoom');
    const lbl  = document.getElementById('playZoomLabel');
    zoom.innerHTML = '';
    for (const c of cards) {
      const el = mkCard(c);
      el.classList.add('playZoomCard');
      zoom.appendChild(el);
    }
    const name = p === 0 ? '你' : S.ps[p].name;
    lbl.textContent    = `${name} 出牌`;
    zoom.style.display = 'flex';
    lbl.style.display  = 'block';
    clearTimeout(this._zoomTimer);
    this._zoomTimer = setTimeout(() => {
      zoom.style.display = 'none';
      lbl.style.display  = 'none';
    }, 2000);
  },

  // ---------- 阵营公布 ----------
  _showTeamReveal() {
    const atkNames = S.attackers.map(i => (i === 0 ? '你' : S.ps[i].name)).join('、');
    const defNames = S.defenders.map(i => (i === 0 ? '你' : S.ps[i].name)).join('、');
    // 判断玩家自己阵营
    const playerSide = S.attackers.includes(0) ? '抓分方' : '守分方';
    const teammate   = S.attackers.includes(0)
      ? S.attackers.filter(i => i !== 0).map(i => S.ps[i].name).join('、')
      : S.defenders.filter(i => i !== 0).map(i => S.ps[i].name).join('、');

    const title = document.getElementById('mChoiceTitle');
    const cont  = document.getElementById('mChoiceCards');
    title.textContent = '阵营公布';
    cont.innerHTML = `
      <div style="width:100%;text-align:left;line-height:2;font-size:14px;padding:4px 0">
        <div><span style="color:#f90">抓分方：</span><b>${atkNames}</b></div>
        <div><span style="color:#4af">守分方：</span><b>${defNames}</b></div>
        <hr style="border-color:rgba(255,255,255,.2);margin:6px 0">
        <div>你是 <b style="color:${playerSide === '抓分方' ? '#f90' : '#4af'}">${playerSide}</b>，
        队友：<b>${teammate || '无（独自一队）'}</b></div>
      </div>`;
    document.getElementById('mChoice').style.display = 'flex';
  },

  // ---------- AI出牌 ----------
  _aiTurn() {
    if (S.phase !== 'playing') return;
    const p     = S.curP;
    const cards = this._aiChoose(p);
    this._playCards(p, cards);
  },

  _aiChoose(p) {
    const h = [...S.ps[p].hand];
    if (S.playedRound.length === 0) return [this._aiLead(p, h)];
    return this._aiFollow(p, h, S.leadCards.length);
  },

  _aiLead(p, h) {
    const nonT = h.filter(c => !isTrump(c));
    if (nonT.length) {
      nonT.sort((a, b) => cardVal(b) - cardVal(a));
      return nonT[0];
    }
    h.sort((a, b) => cardVal(a) - cardVal(b));
    return h[0];
  },

  _aiFollow(p, h, n) {
    const lg   = suitGroup(S.leadCards[0]);
    const same = h.filter(c => suitGroup(c) === lg);
    const res  = [];
    if (same.length >= n) {
      same.sort((a, b) => cardVal(a) - cardVal(b));
      return same.slice(0, n);
    }
    res.push(...same);
    const rem = h.filter(c => suitGroup(c) !== lg);
    rem.sort((a, b) => cardScore(a) - cardScore(b));
    res.push(...rem.slice(0, n - res.length));
    return res.slice(0, n);
  },

  // ---------- 本轮结算 ----------
  _endRound() {
    const winner = this._calcWinner();
    let rs = 0;
    for (const e of S.playedRound) for (const c of e.cards) rs += cardScore(c);
    if (S.attackers.includes(winner)) {
      S.atkScore += rs;
      // 本轮得分全归赢牌玩家统计
      S.playerScores[winner] = (S.playerScores[winner] || 0) + rs;
    }
    this.updateInfo();
    this.renderAll(); // 刷新各玩家pInfo得分
    const lastWinCards = S.playedRound.find(e => e.p === winner)?.cards || [];
    const done = S.ps.every(p => p.hand.length === 0);
    setTimeout(() => {
      this._clearLeader();
      S.playedRound = []; S.leadCards = [];
      S.round++;
      S.curP = winner;
      if (done) {
        this._calcKoudi(winner, lastWinCards);
      } else {
        this._nextTurn();
      }
    }, 1400);
  },

  _calcWinner() {
    let best = S.playedRound[0];
    for (let i = 1; i < S.playedRound.length; i++) {
      if (this._beats(S.playedRound[i].cards, best.cards)) best = S.playedRound[i];
    }
    return best.p;
  },

  // ---------- 出牌大小比较 ----------

  // 判断一组牌的牌型，返回 { type, power }
  // type: 'single'|'pair'|'trio_aam'|'trio_maa'|'trio_677'|'trio_778'|'chain'
  // power: 用于同牌型间比较的数值（越大越强）
  _playType(cards) {
    const n = cards.length;
    const vals = cards.map(cardVal);

    if (n === 1) {
      return { type: 'single', power: vals[0] };
    }

    if (n === 2) {
      if (this._isPair(cards)) {
        // 对子：用最小值（两张相同，取任意一张）
        return { type: 'pair', power: Math.min(...vals) };
      }
      // 非对子的两张牌（应不允许，但保底处理）
      return { type: 'single2', power: Math.max(...vals) };
    }

    if (n === 3) {
      // 按 cardVal 排序后判断
      const sv = [...vals].sort((a, b) => a - b); // 升序
      // AAK：最大两张相同（AA），较小一张是K
      // 用 cardVal 来判断：最大两张相等且第三张不等
      if (sv[1] === sv[2] && sv[0] !== sv[1]) {
        // 对在高端：类 AAK 结构，power = 对子那端的值（sv[1]）
        return { type: 'trio_high_pair', power: sv[1] };
      }
      if (sv[0] === sv[1] && sv[1] !== sv[2]) {
        // 对在低端：类 KKA 或 677/778 结构
        // 677：pair=7(低)，单张=6；778：pair=7(高)，单张=8
        // power 仍用对子那端的值（sv[0]）
        return { type: 'trio_low_pair', power: sv[0] };
      }
      // 三张全同（理论上不会出现）
      return { type: 'trio_all', power: sv[0] };
    }

    if (n >= 4 && n % 2 === 0) {
      // 联对：AABB CC...（按对排列，最小对决定大小）
      const sv = [...vals].sort((a, b) => a - b);
      const isPairs = this._isConsecPairs(cards.map(c => gR(c)).sort());
      if (isPairs) {
        // 联对 power = 最小的对子值
        return { type: 'chain', power: sv[0] };
      }
    }

    if (n >= 5 && n % 2 !== 0) {
      // 联对+1单张：去掉单张后为联对
      const ranks = cards.map(c => gR(c)).sort();
      if (this._isChainWithKicker(ranks)) {
        // power = 联对部分最小对的 cardVal（找出联对部分）
        const chainPower = this._chainKickerPower(cards);
        return { type: 'chain_kicker', power: chainPower };
      }
    }

    // 其他：fallback 到最大值
    return { type: 'other', power: Math.max(...vals) };
  },

  // 判断挑战方(chal)是否打败当前最强方(cur)，leadCards为首出牌
  _beats(chal, cur) {
    const chalTrump = chal.some(isTrump);
    const curTrump  = cur.some(isTrump);
    const leadTrump = S.leadCards.some(isTrump);

    // 单张：简单比 cardVal
    if (S.leadCards.length === 1) {
      if (chalTrump && !curTrump) return true;
      if (!chalTrump && curTrump) return false;
      if (!chalTrump && !curTrump) {
        // 副牌单张：必须同花色才能比
        const leadS = gS(S.leadCards[0]);
        const chalS = gS(chal[0]);
        const curS  = gS(cur[0]);
        if (chalS !== leadS) return false;           // 挑战方不是首出花色，不算
        if (curS !== leadS) return true;             // 当前持有者也不是首出花色，挑战方赢
        return cardVal(chal[0]) > cardVal(cur[0]);
      }
      // 同为主牌
      return cardVal(chal[0]) > cardVal(cur[0]);
    }

    // 组合牌
    const leadType = this._playType(S.leadCards);

    // 副牌场景：检查花色归属（只有跟首出花色才有资格比）
    if (!leadTrump) {
      const leadS = gS(S.leadCards[0]);
      if (!chalTrump && gS(chal[0]) !== leadS) return false;  // 挑战方非首出花色
      if (chalTrump && !curTrump && gS(cur[0]) !== leadS) return true; // 挑战方主牌 > 当前非主
      if (!chalTrump && curTrump) return false;                         // 挑战方非主 < 当前主
    }

    // 主牌场景：挑战方有主无主的基础比较
    if (leadTrump) {
      if (chalTrump && !curTrump) return true;
      if (!chalTrump && curTrump) return false;
      if (!chalTrump && !curTrump) return false;
    }

    // 到这里：双方同为主牌 或 双方同为副牌同花色，进行牌型比较
    const chalType = this._playType(chal);
    const curType  = this._playType(cur);

    // 单张（作为 fallback）
    if (leadType.type === 'single' || leadType.type === 'single2' || leadType.type === 'other') {
      return chalType.power > curType.power;
    }

    // 对子：只有都是对子才能互比，否则挑战方的非对子无法超越
    if (leadType.type === 'pair') {
      const chalIsPair = chalType.type === 'pair';
      const curIsPair  = curType.type === 'pair';
      if (chalIsPair && !curIsPair) return true;
      if (!chalIsPair && curIsPair) return false;
      if (chalIsPair && curIsPair)  return chalType.power > curType.power;
      return false;
    }

    // 三张（AAK/KKA/677/778）：
    // 同类型（高对型 vs 高对型，低对型 vs 低对型）才比 power
    if (leadType.type === 'trio_high_pair' || leadType.type === 'trio_low_pair' || leadType.type === 'trio_all') {
      const chalMatch = (chalType.type === leadType.type);
      const curMatch  = (curType.type  === leadType.type);
      if (chalMatch && !curMatch) return true;
      if (!chalMatch && curMatch) return false;
      if (chalMatch && curMatch)  return chalType.power > curType.power;
      // 双方都不匹配牌型时，比最大值（边界情况）
      return chalType.power > curType.power;
    }

    // 联对：都是联对才能比
    if (leadType.type === 'chain') {
      const chalIsChain = chalType.type === 'chain';
      const curIsChain  = curType.type  === 'chain';
      if (chalIsChain && !curIsChain) return true;
      if (!chalIsChain && curIsChain) return false;
      if (chalIsChain && curIsChain)  return chalType.power > curType.power;
      return false;
    }

    // 联对+单张：都是 chain_kicker 才能互比联对部分
    if (leadType.type === 'chain_kicker') {
      const chalIsKicker = chalType.type === 'chain_kicker';
      const curIsKicker  = curType.type  === 'chain_kicker';
      if (chalIsKicker && !curIsKicker) return true;
      if (!chalIsKicker && curIsKicker) return false;
      if (chalIsKicker && curIsKicker)  return chalType.power > curType.power;
      return false;
    }

    // 兜底：比最大 cardVal
    return Math.max(...chal.map(cardVal)) > Math.max(...cur.map(cardVal));
  },

  _isPair(cards) {
    if (cards.length !== 2) return false;
    if (isBJ(cards[0]) && isBJ(cards[1])) return true;
    if (isSJ(cards[0]) && isSJ(cards[1])) return true;
    if (isJk(cards[0]) || isJk(cards[1])) return false;
    return gR(cards[0]) === gR(cards[1]) && gS(cards[0]) === gS(cards[1]);
  },

  // ---------- 扣底 ----------
  _calcKoudi(lastWinner, lastWinCards) {
    const isAtk = S.attackers.includes(lastWinner);
    let ks = 0;
    if (isAtk) {
      const n      = lastWinCards.length;
      const factor = n === 1 ? 2 : n === 2 ? 4 : n === 3 ? 6 : 8;
      for (const c of S.kitty) ks += cardScore(c) * factor;
      S.atkScore += ks;
    }
    const msg = isAtk ? `扣底 +${ks} 分` : '防守方赢得最后一轮，无扣底';
    this._showMsg(msg, 2200, () => this._doSettle());
  },

  // ---------- 结算 ----------
  _doSettle() {
    S.phase = 'settle';
    const sc = S.atkScore;
    // 判断玩家(0)的阵营
    const playerIsAtk = S.attackers.includes(0);
    let txt, cls, chips;
    // 按客观结果确定胜负和筹码，txt/cls 依据玩家实际阵营描述
    if (sc === 0) {
      chips = '保分方 +4筹';
      txt   = playerIsAtk ? `大光（0分），你们输了！` : `大光（0分），你们赢了！`;
      cls   = playerIsAtk ? 'rBig' : 'rWin';
    } else if (sc <= 40) {
      chips = '保分方 +2筹';
      txt   = playerIsAtk ? `小光（${sc}分），你们输了！` : `小光（${sc}分），你们赢了！`;
      cls   = playerIsAtk ? 'rLose' : 'rWin';
    } else if (sc < 80) {
      chips = '保分方 +1筹';
      txt   = playerIsAtk ? `抓分不足（${sc}分），你们输了！` : `防守成功（${sc}分），你们赢了！`;
      cls   = playerIsAtk ? 'rLose' : 'rWin';
    } else {
      const extra = Math.floor((sc - 80) / 40) + 1;
      chips = `抓分方 +${extra}筹`;
      txt   = playerIsAtk ? `抓分方胜！（${sc}分）` : `防守失败（${sc}分），你们输了！`;
      cls   = playerIsAtk ? 'rWin' : 'rLose';
    }
    const atkN = S.attackers.map(i => S.ps[i].name).join('、');
    const defN = S.defenders.map(i => S.ps[i].name).join('、');
    const kb   = S.kitty.reduce((s, c) => s + cardScore(c), 0);
    document.getElementById('mSettleBody').innerHTML = `
      <div class="sRow"><span>抓分方</span><span>${atkN}</span></div>
      <div class="sRow"><span>防守方</span><span>${defN}</span></div>
      <div class="sRow"><span>抓分方总分</span><span>${sc} 分</span></div>
      <div class="sRow"><span>底牌总分</span><span>${kb} 分</span></div>
      <div class="sRow"><span>反主倍数</span><span>×${S.multiplier}</span></div>
      <div class="sRow"><span>筹码</span><span>${chips}</span></div>
      <div class="sRes ${cls}">${txt}</div>
    `;
    document.getElementById('mSettle').style.display = 'flex';
    S.history.push({
      gameRound: S.gameRound, atkN, defN, sc, multiplier: S.multiplier, txt, chips,
      trumpSuit: S.trumpSuit ? SNAME[S.trumpSuit] : '国主',
      caller: S.ps[S.caller]?.name || '-',
    });
  },

  _settleNoCall() {
    document.getElementById('mSettleBody').innerHTML =
      `<div class="sRes rLose">无人叫主，本局无效</div>`;
    document.getElementById('mSettle').style.display = 'flex';
    S.history.push({
      gameRound: S.gameRound, atkN: '-', defN: '-', sc: 0,
      multiplier: 1, txt: '无人叫主', chips: '-', trumpSuit: '-', caller: '-',
    });
  },

  nextGame() {
    this.closeM('mSettle');
    S.gameRound++;
    // 下局第一得牌人：上局胜利方则保持，否则轮移一位
    if (S.atkScore >= 80) {
      S.firstDealer = S.attackers[0] || 0;
      S.dealer      = S.firstDealer;
    } else {
      S.firstDealer = this.prev(S.firstDealer);
      S.dealer      = S.firstDealer;
    }
    this.hideAllBtns();
    document.getElementById('bStart').style.display = '';
  },

  // ---------- 渲染 ----------
  renderAll() {
    for (let i = 0; i < S.np; i++) this.renderHand(i);
  },

  sortHand(h) {
    const so = { '\u2660': 0, '\u2665': 1, '\u2663': 2, '\u2666': 3 };
    h.sort((a, b) => {
      const at = isTrump(a), bt = isTrump(b);
      if (at !== bt) return bt ? 1 : -1;
      if (at && bt)  return cardVal(b) - cardVal(a);
      const as = gS(a) || 'Z', bs = gS(b) || 'Z';
      if (as !== bs) return (so[as] ?? 9) - (so[bs] ?? 9);
      return (RV[gR(b)] || 0) - (RV[gR(a)] || 0);
    });
  },

  renderHand(p) {
    const h    = S.ps[p].hand;
    const cont = document.getElementById(`h${p}`);
    const info = document.getElementById(`pi${p}`);
    cont.innerHTML = '';

    if (p === 0) {
      // 玩家自己：出牌阶段显示得分标签
      if (info) {
        const isCaller = S.caller === 0;
        if ((S.phase === 'playing' || S.phase === 'settle') && !isCaller) {
          const sc = S.playerScores[0] || 0;
          info.innerHTML = `你<br>得分: ${sc}`;
          info.className = 'pInfo';
          if (p === S.curP && S.phase === 'playing') info.classList.add('active');
          info.style.display = '';
        } else {
          info.style.display = 'none';
        }
      }
      this.sortHand(h);
      const bw    = document.getElementById('board').offsetWidth || 360;
      const maxW  = bw - 120;
      const cardW = 46;

      if (S.phase === 'dealing' && S.caller === -1) {
        // 发牌阶段：可叫主牌上行（高亮），普通牌下行
        const callable = h.filter(c => isLv(c) || isJk(c));
        const normal   = h.filter(c => !isLv(c) && !isJk(c));
        cont.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:5px;padding:0 4px;';

        if (callable.length > 0) {
          const rowTop = document.createElement('div');
          rowTop.style.cssText = 'display:flex;align-items:flex-end;position:relative;';
          const lbl = document.createElement('div');
          lbl.style.cssText = 'font-size:10px;color:#ffe066;background:rgba(0,0,0,.7);padding:2px 6px;border-radius:4px;white-space:nowrap;margin-right:4px;flex-shrink:0;align-self:center;';
          lbl.textContent = '可叫主';
          rowTop.appendChild(lbl);
          const ovr = callable.length > 1
            ? Math.max(10, Math.min(cardW, Math.floor((maxW * 0.45 - cardW) / Math.max(1, callable.length - 1))))
            : cardW;
          callable.forEach((c, i) => {
            const el = mkCard(c, { onClick: () => { if (S.caller !== -1) return; G.humanCall(); } });
            el.dataset.cid = c;
            el.classList.add('callable');
            el.style.cssText = `position:relative;margin-left:${i === 0 ? '0' : `-${cardW - ovr}px`};z-index:${i + 1};`;
            rowTop.appendChild(el);
          });
          cont.appendChild(rowTop);
        }

        if (normal.length > 0) {
          const rowBot = document.createElement('div');
          rowBot.style.cssText = 'display:flex;align-items:flex-end;position:relative;';
          const ovr2 = normal.length > 1
            ? Math.max(10, Math.min(cardW, Math.floor((maxW - cardW) / Math.max(1, normal.length - 1))))
            : cardW;
          normal.forEach((c, i) => {
            const el = mkCard(c, { onClick: () => {
              if (S.phase !== 'playing' || S.curP !== 0) return;
              el.classList.toggle('sel'); this._updatePlayBtn();
            }});
            el.dataset.cid = c;
            el.style.cssText = `position:relative;margin-left:${i === 0 ? '0' : `-${cardW - ovr2}px`};z-index:${i + 1};`;
            rowBot.appendChild(el);
          });
          cont.appendChild(rowBot);
        }
      } else {
        // 出牌阶段：单行
        cont.style.cssText = 'display:flex;flex-direction:row;align-items:flex-end;padding:0 4px;';
        const total   = h.length;
        const overlap = total > 1
          ? Math.max(10, Math.min(cardW, Math.floor((maxW - cardW) / Math.max(1, total - 1))))
          : cardW;
        h.forEach((c, i) => {
          const el = mkCard(c, { onClick: () => {
            if (S.phase !== 'playing' || S.curP !== 0) return;
            el.classList.toggle('sel'); this._updatePlayBtn();
          }});
          el.dataset.cid = c;
          el.style.cssText = `position:relative;margin-left:${i === 0 ? '0' : `-${cardW - overlap}px`};z-index:${i + 1};`;
          cont.appendChild(el);
        });
      }
    } else {
      // AI玩家
      if (info) {
        const isCaller = S.caller === p;
        const sc = (!isCaller && (S.phase === 'playing' || S.phase === 'settle')) ? (S.playerScores[p] || 0) : null;
        const scoreLine = sc !== null ? `<br>得分: ${sc}` : '';
        info.innerHTML  = `${S.ps[p].name}<br>剩余: ${h.length}${scoreLine}`;
        info.className  = 'pInfo';
        if (p === S.dealer && S.phase !== 'idle') info.classList.add('dealer');
        if (p === S.curP   && S.phase === 'playing') info.classList.add('active');
      }
      const total = h.length;
      if (p === 1 || p === 3) {
        // 左右：纵向叠加
        const visH = 6;
        h.forEach((_, i) => {
          const el = mkCard(null, { back: true, sm: true });
          el.style.cssText = `position:relative;margin-top:${i === 0 ? '0' : `-${34 - visH}px`};z-index:${i + 1};flex-shrink:0;`;
          cont.appendChild(el);
        });
      } else {
        // 顶部：横向叠加
        const bw   = document.getElementById('board').offsetWidth || 360;
        const maxW = bw - 120;
        const smW  = 22;
        const ovr  = total > 1
          ? Math.max(4, Math.min(smW, Math.floor((maxW - smW) / Math.max(1, total - 1))))
          : smW;
        h.forEach((_, i) => {
          const el = mkCard(null, { back: true, sm: true });
          el.style.cssText = `position:relative;margin-left:${i === 0 ? '0' : `-${smW - ovr}px`};z-index:${i + 1};`;
          cont.appendChild(el);
        });
      }
    }
  },

  renderPlayed(p, cards) {
    const sl = document.getElementById(`ps${p}`);
    for (const c of cards) {
      const el       = mkCard(c, { med: true });
      const existing = sl.children.length;
      el.classList.add('flyIn');
      if (existing > 0) {
        if (p === 1 || p === 3) {
          el.style.marginTop  = `-${Math.min(existing * 8, 42)}px`;
        } else {
          el.style.marginLeft = `-${Math.min(existing * 10, 30)}px`;
        }
      }
      sl.appendChild(el);
    }
  },

  // 标记本轮首出玩家
  _markLeader(p) {
    this._clearLeader();
    const sl   = document.getElementById(`ps${p}`);
    const info = document.getElementById(`pi${p}`);
    if (sl)   sl.classList.add('leader');
    if (info) info.classList.add('leader');
  },

  // 清除首出标记
  _clearLeader() {
    for (let i = 0; i < 4; i++) {
      document.getElementById(`ps${i}`)?.classList.remove('leader');
      document.getElementById(`pi${i}`)?.classList.remove('leader');
    }
  },

  clearPlayed() {
    for (let i = 0; i < 4; i++) {
      const s = document.getElementById(`ps${i}`);
      if (s) s.innerHTML = '';
    }
  },

  _renderKitty(hidden) {
    // hidden=true 表示卖主中，底牌暂不公开
    // hidden=false 表示换底完成
    S._kittyHidden = hidden;
    const bvk = document.getElementById('bViewKitty');
    if (!bvk) return;
    // kittyOwner=-1 表示无反主，换底者为叫主者(caller)
    const owner = S.kittyOwner !== -1 ? S.kittyOwner : S.caller;
    // 只有最后换底玩家是玩家自己(p=0)时才显示查看按钮
    bvk.style.display = (owner === 0 && S.kitty.length > 0) ? '' : 'none';
  },

  // 底牌查看：仅最后换底玩家（玩家自己）可用
  viewKitty() {
    this.closeMenu();
    // kittyOwner=-1 表示无反主，换底者为叫主者(caller)
    const owner = S.kittyOwner !== -1 ? S.kittyOwner : S.caller;
    if (owner !== 0) {
      this._showMsg('只有换底玩家本人可查看底牌', 1500);
      return;
    }
    if (!S.kitty.length) {
      this._showMsg('暂无底牌信息', 1200);
      return;
    }
    // 复用 mChoice 弹框展示底牌
    document.getElementById('mChoiceTitle').textContent = `底牌（${KITTY}张，仅你可见）`;
    const cont = document.getElementById('mChoiceCards');
    cont.innerHTML = '';
    for (const c of S.kitty) cont.appendChild(mkCard(c, {}));
    document.getElementById('mChoice').style.display = 'flex';
  },

  updateInfo() {
    document.getElementById('iRound').textContent  = S.round;
    document.getElementById('iDealer').textContent = S.ps[S.caller >= 0 ? S.caller : S.dealer]?.name || '-';
    const showReal = S.phase === 'playing' || S.phase === 'settle' || S.caller === -1;
    document.getElementById('iSuit').textContent =
      showReal
        ? (S.trumpSuit ? (SNAME[S.trumpSuit] + ' ' + S.trumpSuit) : (S.trumpJoker ? '国主' : '未确定'))
        : '已叫主（保密）';

    // 叫主牌：出牌/结算阶段所有人可见；叫主玩家本人全程可见
    const cardEl  = document.getElementById('iCalledCard');
    const noneEl  = document.getElementById('iCalledCardNone');
    const cardVal = document.getElementById('iCalledCardVal');
    const showCard = (S.phase === 'playing' || S.phase === 'settle')
                   || (S.caller === 0 && S.calledCard != null);
    if (showCard) {
      if (S.calledCard) {
        const d = cardDisp(S.calledCard);
        cardVal.textContent  = d.top + d.suit;
        cardVal.style.color  = d.color === 'red' ? '#ff4444' : '#fff';
        cardEl.style.display  = '';
        if (noneEl) noneEl.style.display = 'none';
      } else {
        if (cardEl)  cardEl.style.display  = 'none';
        if (noneEl) { noneEl.textContent = '国主'; noneEl.style.display = ''; }
      }
    } else {
      if (cardEl)  cardEl.style.display  = 'none';
      if (noneEl) noneEl.style.display   = 'none';
    }
  },

  hideAllBtns() {
    ['bCall','bCounter','bSkip','bPlay','bPass','bStart'].forEach(id => {
      const e = document.getElementById(id);
      if (e) e.style.display = 'none';
    });
  },

  // ---------- 菜单 ----------
  toggleMenu() {
    document.getElementById('menuPanel').classList.toggle('open');
  },

  closeMenu() {
    document.getElementById('menuPanel').classList.remove('open');
  },

  toggleHist() {
    this.closeMenu();
    const panel = document.getElementById('histPanel');
    const list  = document.getElementById('histList');
    list.innerHTML = '';
    for (const h of S.history) {
      const item = document.createElement('div');
      item.className = 'hItem';
      item.innerHTML = `<b>第${h.gameRound}局</b> | ${h.txt} | 叫主: ${h.caller} | 主: ${h.trumpSuit}`;
      const det = document.createElement('div');
      det.className = 'hDetail';
      det.innerHTML = `抓分方: ${h.atkN} | 防守方: ${h.defN} | 得分: ${h.sc} | 筹码: ${h.chips} | 反主: ×${h.multiplier}`;
      item.onclick = () => det.style.display = det.style.display === 'block' ? 'none' : 'block';
      item.appendChild(det);
      list.appendChild(item);
    }
    const show = panel.style.display !== 'flex';
    panel.style.display = show ? 'flex' : 'none';
  },

  // ---------- Modal工具 ----------
  _openChoiceModal(title, cards, onPick) {
    document.getElementById('mChoiceTitle').textContent = title;
    const c = document.getElementById('mChoiceCards');
    c.innerHTML = '';
    for (const card of cards) {
      const el = mkCard(card, { onClick: () => { this.closeM('mChoice'); onPick(card); } });
      c.appendChild(el);
    }
    document.getElementById('mChoice').style.display = 'flex';
  },

  _openChoiceRaw(title, items) {
    document.getElementById('mChoiceTitle').textContent = title;
    const c = document.getElementById('mChoiceCards');
    c.innerHTML = '';
    for (const el of items) c.appendChild(el);
    document.getElementById('mChoice').style.display = 'flex';
  },

  closeM(id) { document.getElementById(id).style.display = 'none'; },

  _showMsg(text, dur = 2000, cb = null) {
    const b = document.getElementById('msg');
    b.innerHTML = text; b.style.display = 'block';
    clearTimeout(b._t);
    b._t = setTimeout(() => { b.style.display = 'none'; if (cb) cb(); }, dur);
  },

  _showChoice(msg, l1, l2, cb1, cb2) {
    const b = document.getElementById('msg');
    b.style.pointerEvents = 'auto';
    b.innerHTML = `<div style="margin-bottom:12px">${msg}</div>
      <div style="display:flex;gap:12px;justify-content:center">
        <button class="btn bsuc" id="_cb1">${l1}</button>
        <button class="btn bdng" id="_cb2">${l2}</button>
      </div>`;
    b.style.display = 'block';
    document.getElementById('_cb1').onclick = () => { b.style.display = 'none'; b.style.pointerEvents = 'none'; cb1(); };
    document.getElementById('_cb2').onclick = () => { b.style.display = 'none'; b.style.pointerEvents = 'none'; cb2(); };
  },

  // ---------- 提示UI工具 ----------
  _showCounterTurnHint(p) {
    const el   = document.getElementById('counterTurnHint');
    const name = p === 0 ? '你' : S.ps[p].name;
    el.textContent  = `正在询问【${name}】是否反主...`;
    el.style.display = 'block';
  },

  _hideCounterTurnHint() {
    const el = document.getElementById('counterTurnHint');
    if (el) el.style.display = 'none';
  },

  _showCounterCountdown(remain, hasOpts) {
    const el = document.getElementById('counterCountdown');
    if (!el) return;
    el.innerHTML    = hasOpts
      ? `你可以反主（${remain} 秒后自动跳过）`
      : `考虑中... ${remain} 秒`;
    el.style.display = 'block';
  },

  _hideCounterCountdown() {
    const el = document.getElementById('counterCountdown');
    if (el) el.style.display = 'none';
  },

  // ---------- 工具 ----------
  prev(p) { return (p - 1 + S.np) % S.np; },
  next(p) { return (p + 1) % S.np; },

  _hideEl(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  },
};

// =====================================================
//  初始化
// =====================================================
window.addEventListener('load', () => {
  S.dealer      = Math.floor(Math.random() * 4); // 首局随机庄家
  S.firstDealer = S.dealer;
  S.gameRound   = 1;
  S.history     = [];
  G.updateInfo();
  G.hideAllBtns();
  document.getElementById('bStart').style.display = '';
  document.getElementById('msg').style.pointerEvents = 'none';
  // 点击菜单外区域关闭菜单
  document.addEventListener('click', e => {
    const menuBtn   = document.getElementById('menuBtn');
    const menuPanel = document.getElementById('menuPanel');
    if (!menuBtn.contains(e.target) && !menuPanel.contains(e.target)) {
      G.closeMenu();
    }
  });
});

document.addEventListener('dblclick', e => e.preventDefault());
