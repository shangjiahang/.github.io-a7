"use strict";
// =====================================================
//  黄梅暗7 — 机器人模块（小游戏版）
//  支持三种模式：advanced / medium / basic
// =====================================================
import { S, G, cardVal, cardScore, isTrump, suitGroup, isJk, isBJ, isSJ } from '../base/gameLogic.js';

// 当前机器人模式，由 main.js 通过 RobotAI.setMode() 设置
let ROBOT_MODE = 'basic';

function _maxVal(cards) {
  return cards.reduce((m, c) => Math.max(m, cardVal(c)), 0);
}

const RobotAI = {

  setMode(mode) {
    ROBOT_MODE = (mode === 'advanced' || mode === 'medium') ? mode : 'basic';
  },

  choose(p) {
    switch (ROBOT_MODE) {
      case 'advanced': return this._chooseAdvanced(p);
      case 'medium':   return this._chooseMedium(p);
      default:         return this._chooseBasic(p);
    }
  },

  // ---- 初级 ----
  _chooseBasic(p) {
    const h = [...S.ps[p].hand];
    if (S.playedRound.length === 0) return [this._basicLead(p, h)];
    return this._basicFollow(p, h, S.leadCards.length);
  },

  _basicLead(p, h) {
    const nonT = h.filter(c => !isTrump(c));
    if (nonT.length) { nonT.sort((a, b) => cardVal(b) - cardVal(a)); return nonT[0]; }
    h.sort((a, b) => cardVal(a) - cardVal(b));
    return h[0];
  },

  _basicFollow(p, h, n) {
    const lg   = suitGroup(S.leadCards[0]);
    const same = h.filter(c => suitGroup(c) === lg);
    if (same.length === 0) {
      const rem = [...h].sort((a, b) => cardScore(a) - cardScore(b));
      return rem.slice(0, n);
    }
    const { must, canFill } = G._mustFollowCards(h, n);
    const result = [...must];
    if (result.length < n) {
      const used = new Set(result);
      result.push(...canFill.filter(c => !used.has(c)).slice(0, n - result.length));
    }
    if (result.length < n) {
      const used = new Set(result);
      const rem  = h.filter(c => !used.has(c) && suitGroup(c) !== lg).sort((a, b) => cardScore(a) - cardScore(b));
      result.push(...rem.slice(0, n - result.length));
    }
    return result.slice(0, n);
  },

  // ---- 中级 ----
  _chooseMedium(p) {
    const h     = [...S.ps[p].hand];
    const isAtk = S.attackers.includes(p);
    const n     = S.leadCards.length;
    if (S.playedRound.length === 0) return [this._mediumLead(p, h, isAtk)];
    return this._mediumFollow(p, h, n, isAtk);
  },

  _mediumLead(p, h, isAtk) {
    if (isAtk) {
      const nonT = h.filter(c => !isTrump(c));
      const bigNonT = nonT.filter(c => cardVal(c) >= 13);
      if (bigNonT.length) { bigNonT.sort((a, b) => cardVal(b) - cardVal(a)); return bigNonT[0]; }
      if (nonT.length) { nonT.sort((a, b) => cardVal(a) - cardVal(b)); return nonT[0]; }
      h.sort((a, b) => cardVal(a) - cardVal(b)); return h[0];
    } else {
      const nonScore = h.filter(c => cardScore(c) === 0 && !isTrump(c));
      if (nonScore.length) { nonScore.sort((a, b) => cardVal(a) - cardVal(b)); return nonScore[0]; }
      const nonT = h.filter(c => !isTrump(c));
      if (nonT.length) { nonT.sort((a, b) => cardVal(a) - cardVal(b)); return nonT[0]; }
      h.sort((a, b) => cardVal(a) - cardVal(b)); return h[0];
    }
  },

  _mediumFollow(p, h, n, isAtk) {
    const lg   = suitGroup(S.leadCards[0]);
    const same = h.filter(c => suitGroup(c) === lg);
    const other = h.filter(c => suitGroup(c) !== lg);
    const curBest = this._roundBestEntry();
    const curBestIsAlly = curBest && this._isAlly(p, curBest.p);
    const roundScore = S.playedRound.reduce((s, e) => s + e.cards.reduce((ss, c) => ss + cardScore(c), 0), 0);
    const hasRoundScore = roundScore > 0;
    const { must: mustCards, canFill: fillCards } = G._mustFollowCards(h, n);
    const mustN = Math.min(same.length, n);
    const sameSorted = [...same].sort((a, b) => cardVal(a) - cardVal(b));
    const pickSame = (candidates, count) => {
      const res = [...mustCards]; const usedSet = new Set(mustCards);
      res.push(...candidates.filter(c => !usedSet.has(c)));
      return res.slice(0, count);
    };
    if (same.length >= n) {
      if (isAtk) {
        if (curBestIsAlly) return pickSame(sameSorted, n);
        const winning = same.filter(c => cardVal(c) > _maxVal(curBest.cards));
        if (winning.length >= n) { winning.sort((a, b) => cardVal(a) - cardVal(b)); return pickSame(winning, n); }
        return pickSame(sameSorted, n);
      } else {
        if (curBestIsAlly) return pickSame(sameSorted, n);
        const winning = same.filter(c => cardVal(c) > _maxVal(curBest.cards));
        if (winning.length >= n) { winning.sort((a, b) => cardVal(a) - cardVal(b)); return pickSame(winning, n); }
        return pickSame(sameSorted, n);
      }
    }
    const forced = [...mustCards]; const usedForced = new Set(forced);
    forced.push(...fillCards.filter(c => !usedForced.has(c)));
    const forcedFinal = forced.slice(0, mustN);
    const needExtra = n - forcedFinal.length;
    let extras;
    if (isAtk) {
      if (hasRoundScore) {
        const withScore = other.filter(c => cardScore(c) > 0).sort((a, b) => cardScore(b) - cardScore(a));
        const noScore   = other.filter(c => cardScore(c) === 0).sort((a, b) => cardVal(a) - cardVal(b));
        extras = [...withScore, ...noScore].slice(0, needExtra);
      } else {
        const noScore   = other.filter(c => cardScore(c) === 0).sort((a, b) => cardVal(a) - cardVal(b));
        const withScore = other.filter(c => cardScore(c) > 0).sort((a, b) => cardScore(a) - cardScore(b));
        extras = [...noScore, ...withScore].slice(0, needExtra);
      }
    } else {
      const noScore  = other.filter(c => cardScore(c) === 0).sort((a, b) => cardVal(a) - cardVal(b));
      const hasScoreCards = other.filter(c => cardScore(c) > 0).sort((a, b) => cardScore(a) - cardScore(b));
      extras = [...noScore, ...hasScoreCards].slice(0, needExtra);
    }
    return [...forcedFinal, ...extras].slice(0, n);
  },

  // ---- 高级 ----
  _chooseAdvanced(p) {
    const h     = [...S.ps[p].hand];
    const isAtk = S.attackers.includes(p);
    const n     = S.leadCards.length;
    if (S.playedRound.length === 0) return [this._advancedLead(p, h, isAtk)];
    return this._advancedFollow(p, h, n, isAtk);
  },

  _advancedLead(p, h, isAtk) {
    const opponents = isAtk ? S.defenders.filter(i => i !== p) : S.attackers.filter(i => i !== p);
    if (isAtk) {
      const nonT = h.filter(c => !isTrump(c));
      const best = this._findGuaranteedWinner(p, nonT, opponents);
      if (best) return best;
      const lack = this._findOpponentLackSuit(p, nonT, opponents);
      if (lack) return lack;
      const trumpCards = h.filter(isTrump);
      const bigTrump = this._findBigTrump(trumpCards, opponents);
      if (bigTrump) return bigTrump;
      if (nonT.length) { nonT.sort((a, b) => cardVal(b) - cardVal(a)); return nonT[0]; }
      h.sort((a, b) => cardVal(b) - cardVal(a)); return h[0];
    } else {
      const nonT = h.filter(c => !isTrump(c));
      const atkLack = this._findAllLackSuit(p, nonT, opponents);
      if (atkLack) return atkLack;
      const noScore = nonT.filter(c => cardScore(c) === 0);
      if (noScore.length) { noScore.sort((a, b) => cardVal(a) - cardVal(b)); return noScore[0]; }
      if (nonT.length) { nonT.sort((a, b) => cardVal(a) - cardVal(b)); return nonT[0]; }
      h.sort((a, b) => cardVal(a) - cardVal(b)); return h[0];
    }
  },

  _advancedFollow(p, h, n, isAtk) {
    const lg    = suitGroup(S.leadCards[0]);
    const same  = h.filter(c => suitGroup(c) === lg);
    const other = h.filter(c => suitGroup(c) !== lg);
    const curBest = this._roundBestEntry();
    const curBestIsAlly = curBest && this._isAlly(p, curBest.p);
    const roundScore = S.playedRound.reduce((s, e) => s + e.cards.reduce((ss, c) => ss + cardScore(c), 0), 0);
    const hasRoundScore = roundScore > 0;
    const remaining  = S.np - S.playedRound.length - 1;
    const opponents  = isAtk ? S.defenders : S.attackers;
    const canOpponentBeat = (card) => {
      for (const op of opponents) {
        if (op === p) continue;
        const opHand = S.ps[op].hand;
        if (opHand.some(c => suitGroup(c) === suitGroup(card) && cardVal(c) > cardVal(card)) || (!isTrump(card) && opHand.some(isTrump))) return true;
      }
      return false;
    };
    const { must: mustCards2, canFill: fillCards2 } = G._mustFollowCards(h, n);
    const mustN = Math.min(same.length, n);
    const sameSorted = [...same].sort((a, b) => cardVal(a) - cardVal(b));
    const pickSame = (candidates, count) => {
      const res = [...mustCards2]; const used = new Set(mustCards2);
      res.push(...candidates.filter(c => !used.has(c)));
      return res.slice(0, count);
    };
    if (same.length >= n) {
      if (isAtk) {
        if (curBestIsAlly) return pickSame(sameSorted, n);
        const myBeat = same.filter(c => !canOpponentBeat(c) || remaining === 0).filter(c => cardVal(c) > _maxVal(curBest.cards)).sort((a, b) => cardVal(a) - cardVal(b));
        if (myBeat.length >= n) return pickSame(myBeat, n);
        if (hasRoundScore) { const bigCards = [...same].sort((a, b) => cardVal(b) - cardVal(a)); return pickSame(bigCards, n); }
        return pickSame(sameSorted, n);
      } else {
        if (curBestIsAlly && remaining === 0) {
          if (hasRoundScore && same.some(c => cardScore(c) > 0)) {
            const scoreCards = same.filter(c => cardScore(c) > 0).sort((a, b) => cardScore(b) - cardScore(a));
            const noScore    = same.filter(c => cardScore(c) === 0).sort((a, b) => cardVal(a) - cardVal(b));
            return pickSame([...scoreCards, ...noScore], n);
          }
          return pickSame(sameSorted, n);
        }
        if (curBestIsAlly) return pickSame(sameSorted, n);
        if (hasRoundScore) {
          const winning = same.filter(c => cardVal(c) > _maxVal(curBest.cards));
          if (winning.length >= n) { winning.sort((a, b) => cardVal(a) - cardVal(b)); return pickSame(winning, n); }
        }
        return pickSame(sameSorted, n);
      }
    }
    const forcedBase = [...mustCards2]; const usedForced = new Set(forcedBase);
    forcedBase.push(...fillCards2.filter(c => !usedForced.has(c)));
    const forced = forcedBase.slice(0, mustN);
    const needExtra = n - forced.length;
    let extras;
    if (isAtk) {
      if (curBestIsAlly || remaining === 0) {
        const withScore = other.filter(c => cardScore(c) > 0).sort((a, b) => cardScore(b) - cardScore(a));
        const noScore   = other.filter(c => cardScore(c) === 0).sort((a, b) => cardVal(a) - cardVal(b));
        extras = [...withScore, ...noScore].slice(0, needExtra);
      } else {
        const noScore   = other.filter(c => cardScore(c) === 0).sort((a, b) => cardVal(a) - cardVal(b));
        const withScore = other.filter(c => cardScore(c) > 0).sort((a, b) => cardScore(a) - cardScore(b));
        extras = [...noScore, ...withScore].slice(0, needExtra);
      }
    } else {
      const noScore   = other.filter(c => cardScore(c) === 0).sort((a, b) => cardVal(a) - cardVal(b));
      const withScore = other.filter(c => cardScore(c) > 0).sort((a, b) => cardScore(a) - cardScore(b));
      extras = [...noScore, ...withScore].slice(0, needExtra);
    }
    return [...forced, ...extras].slice(0, n);
  },

  // ---- 工具 ----
  _roundBestEntry() {
    if (!S.playedRound.length) return null;
    let best = S.playedRound[0];
    for (let i = 1; i < S.playedRound.length; i++) {
      if (G._beats(S.playedRound[i].cards, best.cards)) best = S.playedRound[i];
    }
    return best;
  },

  _isAlly(p, q) {
    if (p === q) return true;
    return S.attackers.includes(p) === S.attackers.includes(q);
  },

  _findGuaranteedWinner(p, nonTCards, opponents) {
    const bySuit = {};
    for (const c of nonTCards) { const sg = suitGroup(c); if (!bySuit[sg]) bySuit[sg] = []; bySuit[sg].push(c); }
    for (const sg of Object.keys(bySuit)) {
      const cards = bySuit[sg].sort((a, b) => cardVal(b) - cardVal(a));
      const safe  = opponents.every(op => !S.ps[op].hand.some(c => suitGroup(c) === sg && cardVal(c) > cardVal(cards[0])));
      if (safe) return cards[0];
    }
    return null;
  },

  _findAllLackSuit(p, nonTCards, opponents) {
    const bySuit = {};
    for (const c of nonTCards) { const sg = suitGroup(c); if (!bySuit[sg]) bySuit[sg] = []; bySuit[sg].push(c); }
    for (const sg of Object.keys(bySuit)) {
      if (opponents.every(op => !S.ps[op].hand.some(c => suitGroup(c) === sg))) {
        const cards = bySuit[sg].sort((a, b) => cardVal(a) - cardVal(b));
        return cards[0];
      }
    }
    return null;
  },

  _findOpponentLackSuit(p, nonTCards, opponents) {
    const bySuit = {};
    for (const c of nonTCards) { const sg = suitGroup(c); if (!bySuit[sg]) bySuit[sg] = []; bySuit[sg].push(c); }
    for (const sg of Object.keys(bySuit)) {
      if (opponents.some(op => !S.ps[op].hand.some(c => suitGroup(c) === sg))) {
        const cards = bySuit[sg].sort((a, b) => cardVal(b) - cardVal(a));
        return cards[0];
      }
    }
    return null;
  },

  _findBigTrump(trumpCards, opponents) {
    if (!trumpCards.length) return null;
    const opMaxTrump = opponents.reduce((mx, op) => {
      const opT = S.ps[op].hand.filter(isTrump);
      return Math.max(mx, opT.length ? _maxVal(opT) : 0);
    }, 0);
    const winners = trumpCards.filter(c => cardVal(c) > opMaxTrump);
    if (!winners.length) return null;
    winners.sort((a, b) => cardVal(a) - cardVal(b));
    return winners[0];
  },
};

// 替换 G._aiChoose
G._aiChoose = function(p) {
  return RobotAI.choose(p);
};

export { RobotAI };
