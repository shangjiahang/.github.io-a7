"use strict";
// =====================================================
//  黄梅暗7 — 纯游戏逻辑（无DOM依赖）
//  供 main.js 和 render.js 调用
// =====================================================

const SUITS    = ['\u2660', '\u2665', '\u2663', '\u2666'];
const SNAME    = { '\u2660': '黑桃', '\u2665': '红桃', '\u2663': '梅花', '\u2666': '方块' };
const SUIT_ORD = ['\u2660', '\u2665', '\u2663', '\u2666'];
const RANKS    = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RV       = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
const SCORE_R  = { '5': 5, '10': 10, 'K': 10 };
const LVL      = '7';
const KITTY    = 8;

// =====================================================
//  牌工具函数
// =====================================================
const mk   = (s, r) => s + r;
const gS   = id => id[0];
const gR   = id => id.slice(1);
const isBJ = id => id === 'BJ';
const isSJ = id => id === 'SJ';
const isJk = id => isBJ(id) || isSJ(id);
const isLv = id => !isJk(id) && gR(id) === LVL;

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
  phase:        'idle',
  np:           4,
  ps:           [],
  deck:         [],
  kitty:        [],
  dealer:       0,
  firstDealer:  0,
  caller:       -1,
  calledCard:   null,
  trumpSuit:    null,
  trumpJoker:   false,
  counterHist:  [],
  multiplier:   1,
  curP:         0,
  round:        1,
  gameRound:    1,
  leadCards:    [],
  playedRound:  [],
  atkScore:     0,
  playerScores: [0, 0, 0, 0],
  defenders:    [],
  attackers:    [],
  teamRevealed: false,
  callerPair7:  false,
  sellAttempt:  false,
  sellCard:     null,
  kittyOwner:   -1,
  kittyPhase:   'caller',
  _counterCont: null,
  _kittyAfterSell: false,
  history:      [],
  dealIdx:      0,
  dealTimer:    null,
  totalDeal:    0,
  _kittyHidden: false,
};

// =====================================================
//  主花色 / 牌力计算
// =====================================================
function isTrump(id) {
  if (isJk(id)) return true;
  if (isLv(id)) return true;
  if (S.trumpJoker) return false;
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
  if (S.trumpSuit && id === mk(S.trumpSuit, LVL)) return 800;
  if (isLv(id)) return 750;
  if (!S.trumpJoker && S.trumpSuit && gS(id) === S.trumpSuit) return 500 + RV[gR(id)];
  return RV[gR(id)] || 0;
}

// =====================================================
//  游戏控制器 G（纯逻辑，无DOM）
//  事件通知通过回调 G.onEvent(type, data) 向外传递
// =====================================================
const G = {

  // 外部注入的事件回调，由 main.js 设置
  onEvent: null,

  _emit(type, data) {
    if (typeof this.onEvent === 'function') this.onEvent(type, data || {});
  },

  // ---------- 开始 ----------
  start() {
    this.initGame();
    this._emit('gameStart', {});
    this.startDeal();
  },

  initGame() {
    S.np  = 4;
    S.ps  = [];
    for (let i = 0; i < S.np; i++) {
      S.ps.push({ name: i === 0 ? '你' : `玩家${i}`, hand: [], isHuman: i === 0 });
    }
    S.deck         = shuffle(makeFull());
    S.kitty        = [];
    S.caller       = -1;
    S.calledCard   = null;
    S.trumpSuit    = null;
    S.trumpJoker   = false;
    S.counterHist  = [];
    S.multiplier   = 1;
    S.round        = 1;
    S.leadCards    = [];
    S.playedRound  = [];
    S.atkScore     = 0;
    S.playerScores = [0, 0, 0, 0];
    S.defenders    = [];
    S.attackers    = [];
    S.teamRevealed = false;
    S.callerPair7  = false;
    S.sellAttempt  = false;
    S.sellCard     = null;
    S.kittyOwner   = -1;
    S.kittyPhase   = 'caller';
    S._counterCont = null;
    S._kittyAfterSell = false;
    S.dealIdx      = 0;
    S.totalDeal    = S.np * (S.np === 4 ? 25 : 20);
    S.phase        = 'dealing';
  },

  // ---------- 发牌 ----------
  startDeal() {
    this.dealSeq = this._buildDealSeq();
    this._emit('dealStart', {});
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
      this._emit('dealCard', { p, card });
      if (S.caller === -1) {
        for (let i = 1; i < S.np; i++) {
          if (this._aiWantCall(i)) { this._aiDoCall(i); break; }
        }
        this._emit('updateCallBtn', { canCall: S.caller === -1 && this._canCall(0) });
      }
    }, 150);
  },

  _finishDeal() {
    S.kitty = S.deck.slice(S.dealIdx, S.dealIdx + KITTY);
    if (S.caller === -1) {
      this._emit('showMsg', { text: '无人叫主，本局结束！', dur: 2200 });
      setTimeout(() => {
        S.firstDealer = this.prev(S.firstDealer);
        S.gameRound++;
        this._settleNoCall();
      }, 2400);
      return;
    }
    S.phase      = 'kitty';
    S.kittyPhase = 'caller';
    S._counterCont = null;
    this._emit('dealEnd', {});
    this._startKittyExchange();
  },

  // ---------- 叫主 ----------
  _canCall(p) {
    return S.ps[p].hand.some(c => isLv(c) || isJk(c));
  },

  // 人类玩家叫主（由界面触发，card 为选定的牌）
  humanCall(card) {
    this._doCall(0, card);
  },

  _doCall(p, card) {
    S.caller     = p;
    S.calledCard = card;
    if (isJk(card)) {
      S.trumpSuit  = null;
      S.trumpJoker = true;
    } else {
      S.trumpSuit  = gS(card);
      S.trumpJoker = false;
    }
    S.dealer = p;
    this._checkPair7();
    this._emit('called', { p, card });
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
  _counterTurn(p, skipP, done) {
    if (p === skipP) {
      this._emit('counterTurnEnd', {});
      done();
      return;
    }
    this._emit('counterTurnStart', { p });
    if (p === 0) {
      const opts    = this._getCounterOpts(0);
      const hasOpts = opts.length > 0;
      this._emit('showCounterUI', { hasOpts, opts });
      let remain = 5;
      this._emit('counterCountdown', { remain, hasOpts });
      this._counterInterval = setInterval(() => {
        remain--;
        this._emit('counterCountdown', { remain, hasOpts });
        if (remain <= 0) clearInterval(this._counterInterval);
      }, 1000);
      this._counterTimer = setTimeout(() => {
        clearInterval(this._counterInterval);
        this._emit('hideCounterUI', {});
        this._skipDone = null;
        this._counterTurn(this.prev(p), skipP, done);
      }, 5000);
      this._skipDone = () => this._counterTurn(this.prev(p), skipP, done);
    } else {
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

  // 人类选择反主（由界面触发）
  doCounter(opt) {
    this._cancelCounterTurn();
    this._doCounter(0, opt);
  },

  // 人类跳过反主
  skipCounter() {
    this._cancelCounterTurn();
    if (typeof this._skipDone === 'function') {
      const cb = this._skipDone;
      this._skipDone = null;
      cb();
    }
  },

  _getCounterOpts(p) {
    const h      = S.ps[p].hand;
    const minLv  = this._curCounterLv();
    const pairs  = [];
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
    this._emit('countered', { p, opt, multiplier: S.multiplier });
    setTimeout(() => {
      if (S.sellAttempt) { this._completeSell(true, p); return; }
      this._cancelCounterTurn();
      S.kittyPhase = 'counter';
      this._startKittyExchange();
    }, 2200);
  },

  _cancelCounterTurn() {
    if (this._counterTimer)    { clearTimeout(this._counterTimer);    this._counterTimer   = null; }
    if (this._counterInterval) { clearInterval(this._counterInterval); this._counterInterval = null; }
    this._emit('hideCounterUI', {});
  },

  // ---------- 换底牌 ----------
  _startKittyExchange() {
    const owner = S.kittyOwner !== -1 ? S.kittyOwner : S.caller;
    if (owner !== 0) { this._aiKitty(owner); return; }
    const player = S.ps[0];
    player.hand.push(...S.kitty); S.kitty = [];
    this.sortHand(player.hand);
    this._emit('startKittyExchange', {
      phase: S.kittyPhase,
      hand: [...player.hand],
      canSell: S.kittyPhase === 'caller' && S.callerPair7 && S.caller === 0,
    });
  },

  // 人类确认底牌（selIdx: Set<number>, allCards: string[]）
  confirmKitty(selIdx, allCards) {
    if (!selIdx || selIdx.size !== KITTY) {
      this._emit('showMsg', { text: `请选择恰好 ${KITTY} 张底牌！（当前已选 ${selIdx ? selIdx.size : 0} 张）`, dur: 1500 });
      return;
    }
    S.kitty = []; S.ps[0].hand = [];
    allCards.forEach((c, i) => {
      if (selIdx.has(i)) S.kitty.push(c);
      else S.ps[0].hand.push(c);
    });
    this.sortHand(S.ps[0].hand);
    this._emit('kittyConfirmed', { kitty: [...S.kitty], hand: [...S.ps[0].hand] });
    this._afterKittyConfirm();
  },

  _afterKittyConfirm() {
    const phase = S.kittyPhase;
    if (S._kittyAfterSell) {
      S._kittyAfterSell = false;
      this._startPlaying();
    } else if (phase === 'caller') {
      S.kittyPhase = 'counter';
      const startP = this.prev(S.caller);
      this._counterTurn(startP, S.caller, () => this._startPlaying());
    } else {
      const counterP = S.kittyOwner;
      const nextP    = this.prev(counterP);
      this._counterTurn(nextP, counterP, () => this._startPlaying());
    }
  },

  // 人类卖主
  trySell(selIdx, allCards) {
    if (!selIdx || selIdx.size !== KITTY) {
      this._emit('showMsg', { text: `先选好 ${KITTY} 张底牌！`, dur: 1200 });
      return;
    }
    const selCards = [...selIdx].map(i => allCards[i]);
    if (!selCards.includes(S.calledCard)) {
      this._emit('showMsg', { text: '底牌中需要包含叫主的7！', dur: 1500 });
      return;
    }
    S.sellAttempt = true; S.sellCard = S.calledCard;
    S.kitty       = selCards;
    S.ps[0].hand  = allCards.filter((_, i) => !selIdx.has(i));
    this._emit('trySell', { kitty: [...S.kitty] });
    this._emit('showMsg', { text: '卖主中，等待其他玩家反主...', dur: 2000 });
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
    this._emit('sellResult', { ok, ctrP });
    if (ok) {
      this._emit('showMsg', { text: `卖主成功！${S.ps[ctrP].name} 反主并换底`, dur: 1500 });
      setTimeout(() => {
        S.kittyPhase = 'counter';
        S.kittyOwner = ctrP;
        S._kittyAfterSell = true;
        this._startKittyExchange();
      }, 1700);
    } else {
      this._emit('sellFailed', {});
    }
  },

  // 卖主失败后人类选择继续/放弃
  sellFailContinue() { this._startPlaying(); },
  sellFailQuit()     { S.atkScore = 40; this._doSettle(); },

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
    this._emit('aiKittyDone', { p });
    const phase = S.kittyPhase;
    setTimeout(() => {
      if (S._kittyAfterSell) {
        S._kittyAfterSell = false;
        this._startPlaying();
      } else if (phase === 'caller') {
        S.kittyPhase = 'counter';
        const startP = this.prev(S.caller);
        this._counterTurn(startP, S.caller, () => this._startPlaying());
      } else {
        const counterP = S.kittyOwner;
        const nextP    = this.prev(counterP);
        this._counterTurn(nextP, S.caller, () => this._startPlaying());
      }
    }, 400);
  },

  // ---------- 出牌阶段 ----------
  _startPlaying() {
    S.phase       = 'playing';
    S.curP        = S.caller;
    S.dealer      = S.caller;
    S.round       = 1;
    S.atkScore    = 0;
    S.playedRound = [];
    this._determineTeams();
    this._emit('revealCalledCard', { caller: S.caller, card: S.calledCard });
    // 一对7叫主：阵营从开局就完全确定，直接公布
    if (S.callerPair7) {
      S.teamRevealed = true;
      setTimeout(() => this._emit('teamReveal', { attackers: S.attackers, defenders: S.defenders }), 500);
    }
    setTimeout(() => {
      this._emit('gameUpdate', {});
      this._nextTurn();
    }, 3200);
  },

  _determineTeams() {
    S.defenders = [S.caller];
    const calledSuit = (S.calledCard && !isJk(S.calledCard)) ? gS(S.calledCard) : S.trumpSuit;
    if (!S.callerPair7 && calledSuit) {
      for (let i = 0; i < S.np; i++) {
        if (i !== S.caller && S.ps[i].hand.some(c => isLv(c) && gS(c) === calledSuit)) {
          S.defenders.push(i);
        }
      }
    }
    S.attackers = S.ps.map((_, i) => i).filter(i => !S.defenders.includes(i));
  },

  _nextTurn() {
    this._emit('gameUpdate', {});
    if (S.curP === 0) {
      this._emit('showPlayBtns', { isLead: S.playedRound.length === 0 });
    } else {
      setTimeout(() => this._aiTurn(), 700);
    }
  },

  // 人类出牌（cards: string[]）
  humanPlay(cards) {
    if (!cards.length) { this._emit('showMsg', { text: '请选择要出的牌！', dur: 1000 }); return; }
    const err = this._validatePlay(0, cards);
    if (err) { this._emit('showMsg', { text: err, dur: 1500 }); return; }
    this._playCards(0, cards);
  },

  // 人类垫牌（自动选牌）
  humanPassAuto() {
    const n    = S.leadCards.length;
    const auto = this._pickSmartPass(S.ps[0].hand, n);
    if (!auto) { this._emit('showMsg', { text: `手牌不足 ${n} 张！`, dur: 1000 }); return; }
    this._emit('autoSelectCards', { cards: auto });
    this._emit('showMsg', { text: '已自动选出推荐垫牌，再次点击垫牌确认出牌', dur: 1800 });
  },

  // 人类确认垫牌（cards 为当前选中的牌）
  humanPass(cards) {
    const n = S.leadCards.length;
    if (cards.length === n) {
      const err = this._validatePlay(0, cards);
      if (err) { this._emit('showMsg', { text: err, dur: 1800 }); return; }
      this._playCards(0, cards);
      return;
    }
    this.humanPassAuto();
  },

  _pickSmartPass(hand, n) {
    if (hand.length < n) return null;
    const lg    = suitGroup(S.leadCards[0]);
    const same  = hand.filter(c => suitGroup(c) === lg);
    const other = hand.filter(c => suitGroup(c) !== lg);
    const mustN = Math.min(same.length, n);
    const sameSorted = [...same].sort((a, b) => cardVal(a) - cardVal(b));
    const forced  = sameSorted.slice(0, mustN);
    const needExtra = n - mustN;
    if (needExtra === 0) return forced;
    const isDefender = S.defenders.includes(0);
    const isAttacker = S.attackers.includes(0);
    const priorScore = S.playedRound.reduce((sum, e) => sum + e.cards.reduce((s, c) => s + cardScore(c), 0), 0);
    const hasScore   = priorScore > 0;
    let extras;
    if (isDefender) {
      const noScore = other.filter(c => cardScore(c) === 0).sort((a, b) => cardVal(a) - cardVal(b));
      const hasScoreCards = other.filter(c => cardScore(c) > 0).sort((a, b) => cardScore(a) - cardScore(b));
      extras = [...noScore, ...hasScoreCards].slice(0, needExtra);
    } else if (isAttacker && hasScore) {
      const withScore = other.filter(c => cardScore(c) > 0).sort((a, b) => cardScore(b) - cardScore(a) || cardVal(a) - cardVal(b));
      const noScore   = other.filter(c => cardScore(c) === 0).sort((a, b) => cardVal(a) - cardVal(b));
      extras = [...withScore, ...noScore].slice(0, needExtra);
    } else {
      const noScore   = other.filter(c => cardScore(c) === 0).sort((a, b) => cardVal(a) - cardVal(b));
      const withScore = other.filter(c => cardScore(c) > 0).sort((a, b) => cardScore(a) - cardScore(b));
      extras = [...noScore, ...withScore].slice(0, needExtra);
    }
    return [...forced, ...extras];
  },

  // 出牌验证
  _validatePlay(p, cards) {
    if (S.playedRound.length === 0) {
      return this._validateFirstPlay(cards);
    }
    const n = S.leadCards.length;
    if (cards.length !== n) return `必须出 ${n} 张牌！`;
    return this._validateFollow(S.ps[p].hand, cards);
  },

  _validateFirstPlay(cards) {
    if (cards.length === 1) return null;
    const trumpCards    = cards.filter(c => isTrump(c));
    const nonTrumpCards = cards.filter(c => !isTrump(c));
    if (trumpCards.length > 0 && nonTrumpCards.length > 0) return '不能混合出主牌和副牌！';
    if (nonTrumpCards.length > 0) {
      const suits = new Set(nonTrumpCards.map(c => gS(c)));
      if (suits.size > 1) return '副牌必须同一花色！';
      if (nonTrumpCards.length >= 2) {
        const ranks = nonTrumpCards.map(c => gR(c)).sort();
        if (!this._isAllowedNonTrumpCombo(ranks)) return '出牌组合不符合规则！';
      }
    }
    if (trumpCards.length >= 2) {
      const ranks = trumpCards.map(c => gR(c)).sort();
      if (!this._isAllowedTrumpCombo(trumpCards, ranks)) return '主牌出牌组合不符合规则！';
    }
    return null;
  },

  _isAllowedTrumpCombo(trumpCards, sortedRanks) {
    const n = trumpCards.length;
    if (n === 2) return this._isPair(trumpCards);
    if (n === 3) {
      const sv = trumpCards.map(cardVal).sort((a, b) => a - b);
      return (sv[1] === sv[2] && sv[0] !== sv[1]) || (sv[0] === sv[1] && sv[1] !== sv[2]);
    }
    if (n >= 4 && n % 2 === 0) return this._isConsecPairs(sortedRanks);
    if (n >= 5 && n % 2 !== 0) return this._isChainWithKicker(sortedRanks);
    return false;
  },

  _isAllowedNonTrumpCombo(ranks) {
    const sr = [...ranks].sort((a, b) => (RV[a] || 0) - (RV[b] || 0));
    const n  = sr.length;
    if (n === 2) return sr[0] === sr[1];
    if (n === 3) {
      const allowed = [['A','A','K'],['A','K','K'],['6','7','7'],['7','7','8']];
      return allowed.some(p => p.every((r, i) => r === sr[i]));
    }
    if (n >= 4 && n % 2 === 0) return this._isConsecPairs(sr);
    if (n >= 5 && n % 2 !== 0) return this._isChainWithKicker(sr);
    return false;
  },

  _isConsecPairs(sortedRanks) {
    const sr = [...sortedRanks].sort((a, b) => (RV[a] || 0) - (RV[b] || 0));
    if (sr.length % 2 !== 0) return false;
    for (let i = 0; i < sr.length; i += 2) {
      if (sr[i] !== sr[i + 1]) return false;
    }
    const vals = [];
    for (let i = 0; i < sr.length; i += 2) vals.push(RV[sr[i]] || 0);
    const lvlVal = RV[LVL] || 7; // 等级牌的点数值（暗7中LVL='7'，值=7）
    for (let i = 1; i < vals.length; i++) {
      const diff = vals[i] - vals[i - 1];
      if (diff === 1) continue;
      // 允许跨过等级牌：6→8（diff=2，中间为7）
      if (diff === 2 && vals[i - 1] + 1 === lvlVal) continue;
      return false;
    }
    return true;
  },

  _isChainWithKicker(sortedRanks) {
    const sr = [...sortedRanks].sort((a, b) => (RV[a] || 0) - (RV[b] || 0));
    const n  = sr.length;
    if (n < 5 || n % 2 === 0) return false;
    for (let skip = 0; skip < n; skip++) {
      const rest = sr.filter((_, i) => i !== skip);
      if (!this._isConsecPairs(rest)) continue;
      const kv       = RV[sr[skip]] || 0;
      const restVals = rest.filter((_, i) => i % 2 === 0).map(r => RV[r] || 0);
      const chainMin = Math.min(...restVals);
      const chainMax = Math.max(...restVals);
      const lvlVal = RV[LVL] || 7;
      // kicker 紧贴链的低端或高端（允许跨等级牌）
      if (kv === chainMin - 1) return true;
      if (kv === chainMax + 1) return true;
      // 跨等级牌：kicker=6且链从8开始（6跳过7连8），或kicker=8且链到6结束
      if (kv === chainMin - 2 && chainMin - 1 === lvlVal) return true;
      if (kv === chainMax + 2 && chainMax + 1 === lvlVal) return true;
    }
    return false;
  },

  _chainKickerPower(cards) {
    const ranks = cards.map(c => gR(c)).sort();
    for (let skip = 0; skip < ranks.length; skip++) {
      const rest = ranks.filter((_, i) => i !== skip);
      if (this._isConsecPairs(rest)) {
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

  _mustFollowCards(hand, n) {
    const lg   = suitGroup(S.leadCards[0]);
    const same = hand.filter(c => suitGroup(c) === lg);
    if (same.length === 0) return { must: [], canFill: [], hasCombination: false };
    const leadN    = S.leadCards.length;
    const leadType = this._playType(S.leadCards);
    const removeFromSame = (combo) => {
      const used = [...combo];
      return same.filter(c => {
        const idx = used.indexOf(c);
        if (idx !== -1) { used.splice(idx, 1); return false; }
        return true;
      });
    };
    if (leadN === 2 && leadType.type === 'pair') {
      const pairCards = this._findPairsInGroup(same);
      if (pairCards.length >= 2) {
        const onePair = pairCards.slice(0, 2);
        return { must: onePair, canFill: removeFromSame(onePair), hasCombination: true };
      }
      const need = Math.min(n, same.length);
      return { must: same.slice(0, need), canFill: same.slice(need), hasCombination: false };
    }
    if (leadN === 3 && (leadType.type === 'trio_high_pair' || leadType.type === 'trio_low_pair')) {
      const matchCombo = this._findTrioCombo(same, leadType.type);
      if (matchCombo) return { must: matchCombo, canFill: removeFromSame(matchCombo), hasCombination: true };
      const pairCards = this._findPairsInGroup(same);
      if (pairCards.length >= 2) {
        const onePair = pairCards.slice(0, 2);
        return { must: onePair, canFill: removeFromSame(onePair), hasCombination: true };
      }
      const need = Math.min(n, same.length);
      return { must: same.slice(0, need), canFill: same.slice(need), hasCombination: false };
    }
    if (leadN >= 4 && leadN % 2 === 0 && leadType.type === 'chain') {
      const chainCombo = this._findChainCombo(same, leadN);
      if (chainCombo) return { must: chainCombo, canFill: removeFromSame(chainCombo), hasCombination: true };
      const pairCards = this._findPairsInGroup(same);
      if (pairCards.length >= 2) {
        const onePair = pairCards.slice(0, 2);
        return { must: onePair, canFill: removeFromSame(onePair), hasCombination: true };
      }
      const need = Math.min(n, same.length);
      return { must: same.slice(0, need), canFill: same.slice(need), hasCombination: false };
    }
    const need = Math.min(n, same.length);
    return { must: same.slice(0, need), canFill: same.slice(need), hasCombination: false };
  },

  _findPairsInGroup(cards) {
    const byVal = {};
    for (const c of cards) {
      const v = cardVal(c);
      if (!byVal[v]) byVal[v] = [];
      byVal[v].push(c);
    }
    const result = [];
    for (const v of Object.keys(byVal)) {
      if (byVal[v].length >= 2) result.push(byVal[v][0], byVal[v][1]);
    }
    return result;
  },

  _findTrioCombo(cards, type) {
    const n = cards.length;
    if (n < 3) return null;
    for (let i = 0; i < n - 2; i++)
      for (let j = i + 1; j < n - 1; j++)
        for (let k = j + 1; k < n; k++) {
          const combo = [cards[i], cards[j], cards[k]];
          const pt    = this._playType(combo);
          if (pt.type === type) return combo;
        }
    return null;
  },

  _findChainCombo(cards, needN) {
    const byVal = {};
    for (const c of cards) {
      const v = cardVal(c);
      if (!byVal[v]) byVal[v] = [];
      byVal[v].push(c);
    }
    const pairVals = Object.keys(byVal).filter(v => byVal[v].length >= 2).map(Number).sort((a, b) => a - b);
    if (pairVals.length < 2) return null;
    let best = null, bestLen = 0;
    for (let start = 0; start < pairVals.length; start++) {
      let end = start;
      while (end + 1 < pairVals.length && pairVals[end + 1] === pairVals[end] + 1) end++;
      const len = end - start + 1;
      if (len >= 2 && len * 2 >= bestLen) {
        bestLen = len * 2;
        const take  = Math.min(len, Math.ceil(needN / 2));
        const combo = [];
        for (let t = start; t < start + take; t++) combo.push(byVal[pairVals[t]][0], byVal[pairVals[t]][1]);
        best = combo;
      }
    }
    return best && best.length >= 2 ? best : null;
  },

  _validateFollow(hand, played) {
    const lg         = suitGroup(S.leadCards[0]);
    const same       = hand.filter(c => suitGroup(c) === lg);
    const playedSame = played.filter(c => suitGroup(c) === lg);
    const suitName   = lg === '_T' ? '主牌' : (SNAME[lg] || lg);
    if (same.length === 0) return null;
    const n    = S.leadCards.length;
    const need = Math.min(n, same.length);
    if (playedSame.length < need) return `有${suitName}必须先出！`;
    const { must, hasCombination } = this._mustFollowCards(hand, n);
    if (hasCombination && must.length > 0) {
      const mustCopy = [...must], playedCopy = [...played];
      let violated = false;
      for (const m of mustCopy) {
        const idx = playedCopy.indexOf(m);
        if (idx === -1) { violated = true; break; }
        playedCopy.splice(idx, 1);
      }
      if (violated) {
        const leadType = this._playType(S.leadCards);
        if (leadType.type === 'pair') return `有${suitName}对子必须出对子！`;
        if (leadType.type === 'trio_high_pair' || leadType.type === 'trio_low_pair') return '有同花色三张组合必须先出！';
        if (leadType.type === 'chain') return `有${suitName}联对必须先出联对！`;
        return '必须先出符合牌型的同花色牌！';
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
    this._emit('cardsPlayed', { p, cards, isLead });
    if (!S.teamRevealed && S.calledCard && cards.includes(S.calledCard)) {
      S.teamRevealed = true;
      setTimeout(() => this._emit('teamReveal', { attackers: S.attackers, defenders: S.defenders }), 400);
    }
    if (S.playedRound.length === S.np) {
      setTimeout(() => this._endRound(), 1200);
    } else {
      S.curP = this.prev(S.curP);
      if (S.curP === 0) setTimeout(() => this._emit('showPlayBtns', { isLead: false }), 300);
      else setTimeout(() => this._aiTurn(), 700);
    }
  },

  // ---------- 本轮结算 ----------
  _endRound() {
    const winner = this._calcWinner();
    let rs = 0;
    for (const e of S.playedRound) for (const c of e.cards) rs += cardScore(c);
    S.playerScores[winner] = (S.playerScores[winner] || 0) + rs;
    if (S.attackers.includes(winner)) S.atkScore += rs;
    this._emit('roundEnd', { winner, score: rs });
    const lastWinCards = S.playedRound.find(e => e.p === winner)?.cards || [];
    const done = S.ps.every(p => p.hand.length === 0);
    setTimeout(() => {
      S.playedRound = []; S.leadCards = [];
      S.round++;
      S.curP = winner;
      if (done) this._calcKoudi(winner, lastWinCards);
      else       this._nextTurn();
    }, 1400);
  },

  _calcWinner() {
    let best = S.playedRound[0];
    for (let i = 1; i < S.playedRound.length; i++) {
      if (this._beats(S.playedRound[i].cards, best.cards)) best = S.playedRound[i];
    }
    return best.p;
  },

  // ---------- 牌型与比较 ----------
  _playType(cards) {
    const n = cards.length;
    const vals = cards.map(cardVal);
    if (n === 1) return { type: 'single', power: vals[0] };
    if (n === 2) {
      if (this._isPair(cards)) return { type: 'pair', power: Math.min(...vals) };
      return { type: 'single2', power: Math.max(...vals) };
    }
    if (n === 3) {
      const sv = [...vals].sort((a, b) => a - b);
      if (sv[1] === sv[2] && sv[0] !== sv[1]) return { type: 'trio_high_pair', power: sv[1] };
      if (sv[0] === sv[1] && sv[1] !== sv[2]) return { type: 'trio_low_pair', power: sv[0] };
      return { type: 'trio_all', power: sv[0] };
    }
    if (n >= 4 && n % 2 === 0) {
      const sv = [...vals].sort((a, b) => a - b);
      if (this._isConsecPairs(cards.map(c => gR(c)).sort())) return { type: 'chain', power: sv[0] };
    }
    if (n >= 5 && n % 2 !== 0) {
      const ranks = cards.map(c => gR(c)).sort();
      if (this._isChainWithKicker(ranks)) return { type: 'chain_kicker', power: this._chainKickerPower(cards) };
    }
    return { type: 'other', power: Math.max(...vals) };
  },

  _beats(chal, cur) {
    const chalTrump = chal.some(isTrump);
    const curTrump  = cur.some(isTrump);
    const leadTrump = S.leadCards.some(isTrump);
    if (S.leadCards.length === 1) {
      if (chalTrump && !curTrump) return true;
      if (!chalTrump && curTrump) return false;
      if (!chalTrump && !curTrump) {
        const leadS = gS(S.leadCards[0]), chalS = gS(chal[0]), curS = gS(cur[0]);
        if (chalS !== leadS) return false;
        if (curS  !== leadS) return true;
        return cardVal(chal[0]) > cardVal(cur[0]);
      }
      return cardVal(chal[0]) > cardVal(cur[0]);
    }
    const leadType = this._playType(S.leadCards);
    if (!leadTrump) {
      const leadS = gS(S.leadCards[0]);
      if (!chalTrump && gS(chal[0]) !== leadS) return false;
      if (chalTrump && !curTrump && gS(cur[0]) !== leadS) return true;
      if (!chalTrump && curTrump) return false;
    }
    if (leadTrump) {
      if (chalTrump && !curTrump) return true;
      if (!chalTrump && curTrump) return false;
      if (!chalTrump && !curTrump) return false;
    }
    const chalType = this._playType(chal), curType = this._playType(cur);
    if (leadType.type === 'single' || leadType.type === 'single2' || leadType.type === 'other') return chalType.power > curType.power;
    if (leadType.type === 'pair') {
      if (chalType.type === 'pair' && curType.type !== 'pair') return true;
      if (chalType.type !== 'pair' && curType.type === 'pair') return false;
      if (chalType.type === 'pair' && curType.type === 'pair') return chalType.power > curType.power;
      return false;
    }
    if (leadType.type === 'trio_high_pair' || leadType.type === 'trio_low_pair' || leadType.type === 'trio_all') {
      const cm = chalType.type === leadType.type, cu = curType.type === leadType.type;
      if (cm && !cu) return true;
      if (!cm && cu) return false;
      if (cm && cu)  return chalType.power > curType.power;
      return chalType.power > curType.power;
    }
    if (leadType.type === 'chain') {
      if (chalType.type === 'chain' && curType.type !== 'chain') return true;
      if (chalType.type !== 'chain' && curType.type === 'chain') return false;
      if (chalType.type === 'chain' && curType.type === 'chain') return chalType.power > curType.power;
      return false;
    }
    if (leadType.type === 'chain_kicker') {
      if (chalType.type === 'chain_kicker' && curType.type !== 'chain_kicker') return true;
      if (chalType.type !== 'chain_kicker' && curType.type === 'chain_kicker') return false;
      if (chalType.type === 'chain_kicker' && curType.type === 'chain_kicker') return chalType.power > curType.power;
      return false;
    }
    return Math.max(...chal.map(cardVal)) > Math.max(...cur.map(cardVal));
  },

  _isPair(cards) {
    if (cards.length !== 2) return false;
    if (isBJ(cards[0]) && isBJ(cards[1])) return true;
    if (isSJ(cards[0]) && isSJ(cards[1])) return true;
    if (isJk(cards[0]) || isJk(cards[1])) return false;
    // 主牌对：同点数（含跨花色，如♠7和♥7）
    if (isTrump(cards[0]) && isTrump(cards[1])) return gR(cards[0]) === gR(cards[1]);
    // 副牌对：必须同花色同点数
    return gR(cards[0]) === gR(cards[1]) && gS(cards[0]) === gS(cards[1]);
  },

  // ---------- 扣底 ----------
  _calcKoudi(lastWinner, lastWinCards) {
    const isAtk = S.attackers.includes(lastWinner);
    let ks = 0;
    if (isAtk) {
      const n          = lastWinCards.length;
      const factor     = n === 1 ? 2 : n === 2 ? 4 : n === 3 ? 6 : 8;
      const multiplier = S.multiplier || 1;
      for (const c of S.kitty) ks += cardScore(c) * factor * multiplier;
      S.atkScore += ks;
    }
    const msg = isAtk ? `扣底 +${ks} 分` : '防守方赢得最后一轮，无扣底';
    this._emit('showMsg', { text: msg, dur: 2200 });
    setTimeout(() => this._doSettle(), 2400);
  },

  // ---------- 结算 ----------
  _doSettle() {
    S.phase = 'settle';
    const sc = S.atkScore;
    const playerIsAtk = S.attackers.includes(0);
    let txt, cls, baseUnit;
    if (sc === 0) {
      baseUnit = 4; txt = playerIsAtk ? `大光（0分），你们输了！` : `大光（0分），你们赢了！`; cls = playerIsAtk ? 'rBig' : 'rWin';
    } else if (sc <= 40) {
      baseUnit = 2; txt = playerIsAtk ? `小光（${sc}分），你们输了！` : `小光（${sc}分），你们赢了！`; cls = playerIsAtk ? 'rLose' : 'rWin';
    } else if (sc < 80) {
      baseUnit = 1; txt = playerIsAtk ? `抓分不足（${sc}分），你们输了！` : `防守成功（${sc}分），你们赢了！`; cls = playerIsAtk ? 'rLose' : 'rWin';
    } else {
      baseUnit = Math.floor((sc - 80) / 20) + 1; txt = playerIsAtk ? `抓分方胜！（${sc}分）` : `防守失败（${sc}分），你们输了！`; cls = playerIsAtk ? 'rWin' : 'rLose';
    }
    const chipUnit  = baseUnit;
    const atkWin    = sc >= 80;
    const winSide   = atkWin ? S.attackers : S.defenders;
    const loseSide  = atkWin ? S.defenders : S.attackers;
    const winCount  = winSide.length;
    const loseCount = loseSide.length;
    const winGet    = chipUnit === 0 ? 0 : Math.round(chipUnit * loseCount / winCount);
    const winLabel  = atkWin ? '抓分方' : '保分方';
    const loseLabel = atkWin ? '保分方' : '抓分方';
    const chips     = chipUnit === 0 ? '平局' : `${winLabel}每人 +${winGet}筹 / ${loseLabel}每人 -${chipUnit}筹`;
    const atkN = S.attackers.map(i => S.ps[i].name).join('、');
    const defN = S.defenders.map(i => S.ps[i].name).join('、');
    const kb   = S.kitty.reduce((s, c) => s + cardScore(c), 0);
    const playerRec = S.ps.map((pl, i) => {
      const isAtk2 = S.attackers.includes(i);
      const isCall = i === S.caller;
      const win2   = isAtk2 ? atkWin : !atkWin;
      let pChipsNum = 0;
      if (chipUnit > 0) pChipsNum = win2 ? winGet : -chipUnit;
      return {
        name:  pl.name,
        team:  isCall ? '守（叫主）' : isAtk2 ? '抓分方' : '守分方',
        score: S.playerScores[i] || 0,
        win:   win2,
        chips: chipUnit === 0 ? (win2 ? '平' : '-') : (pChipsNum >= 0 ? `+${pChipsNum}` : `${pChipsNum}`),
      };
    });
    S.history.push({ gameRound: S.gameRound, atkN, defN, sc, multiplier: S.multiplier, txt, chips, trumpSuit: S.trumpSuit ? SNAME[S.trumpSuit] : '国主', caller: S.ps[S.caller]?.name || '-', playerRec });
    this._emit('settle', { sc, kb, atkN, defN, multiplier: S.multiplier, txt, cls, chips, playerRec });
  },

  _settleNoCall() {
    S.history.push({ gameRound: S.gameRound, atkN: '-', defN: '-', sc: 0, multiplier: 1, txt: '无人叫主', chips: '-', trumpSuit: '-', caller: '-' });
    this._emit('settleNoCall', {});
  },

  nextGame() {
    S.gameRound++;
    if (S.atkScore >= 80) {
      S.firstDealer = S.attackers[0] || 0;
      S.dealer      = S.firstDealer;
    } else {
      S.firstDealer = this.prev(S.firstDealer);
      S.dealer      = S.firstDealer;
    }
    this._emit('nextGame', {});
  },

  // ---------- AI出牌 ----------
  _aiTurn() {
    if (S.phase !== 'playing') return;
    const p = S.curP;
    if (!S.ps[p] || S.ps[p].hand.length === 0) return; // 手牌已空，跳过
    const cards = this._aiChoose(p);
    if (!cards || cards.length === 0) return; // 异常保护
    this._playCards(p, cards);
  },

  _aiChoose(p) {
    const h = [...S.ps[p].hand];
    if (!h.length) return [];
    if (S.playedRound.length === 0) {
      const lead = this._aiLead(p, h);
      return lead ? [lead] : [h[0]];
    }
    return this._aiFollow(p, h, S.leadCards.length);
  },

  _aiLead(p, h) {
    const nonT = h.filter(c => !isTrump(c));
    if (nonT.length) { nonT.sort((a, b) => cardVal(b) - cardVal(a)); return nonT[0]; }
    h.sort((a, b) => cardVal(a) - cardVal(b));
    return h[0];
  },

  _aiFollow(p, h, n) {
    const lg   = suitGroup(S.leadCards[0]);
    const same = h.filter(c => suitGroup(c) === lg);
    if (same.length === 0) {
      const rem = [...h].sort((a, b) => cardScore(a) - cardScore(b));
      return rem.slice(0, n);
    }
    const { must, canFill } = this._mustFollowCards(h, n);
    const result = [...must];
    if (result.length < n) {
      const usedSet = new Set(result);
      result.push(...canFill.filter(c => !usedSet.has(c)).slice(0, n - result.length));
    }
    if (result.length < n) {
      const used = new Set(result);
      const rem  = h.filter(c => !used.has(c) && suitGroup(c) !== lg);
      rem.sort((a, b) => cardScore(a) - cardScore(b) || cardVal(a) - cardVal(b));
      result.push(...rem.slice(0, n - result.length));
    }
    return result.slice(0, n);
  },

  // ---------- 手牌排序 ----------
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

  // ---------- 工具 ----------
  prev(p) { return (p - 1 + S.np) % S.np; },
  next(p) { return (p + 1) % S.np; },
};

// 导出（小游戏模块系统）
export { S, G, SUITS, SNAME, SUIT_ORD, RANKS, RV, SCORE_R, LVL, KITTY, mk, gS, gR, isBJ, isSJ, isJk, isLv, makeFull, shuffle, cardScore, cardColor, cardDisp, isTrump, suitGroup, cardVal };
