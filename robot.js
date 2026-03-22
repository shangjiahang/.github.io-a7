"use strict";
/* =====================================================
   黄梅暗7 — 机器人模块
   支持三种模式：
     advanced  高级：全知视角，掌握所有玩家手牌和底牌
     medium    中级：仅知自身手牌和已出牌，合理推理
     basic     初级：相当于原 _pickSmartPass 垫牌方案
   ===================================================== */

// 当前机器人模式，由 lobby.html 通过 URL 参数传入
const ROBOT_MODE = (() => {
  const p = new URLSearchParams(location.search).get('mode');
  return p === 'advanced' ? 'advanced' : p === 'medium' ? 'medium' : 'basic';
})();

/* =====================================================
   工具：复用 game.js 中已有的全局函数
   cardVal / cardScore / isTrump / suitGroup / isJk
   ===================================================== */

// 从已出牌历史推断某玩家是否缺某花色组
function _robotLacksSuit(p, sg, playedHistory) {
  // 遍历历史记录找到该玩家作为跟牌时的情况
  for (const round of playedHistory) {
    const lead = round.find(e => e.isLead);
    if (!lead) continue;
    const leadSg = suitGroup(lead.cards[0]);
    if (leadSg !== sg) continue;
    const myEntry = round.find(e => e.p === p && !e.isLead);
    if (!myEntry) continue;
    // 该玩家跟牌中没有 sg 花色 → 缺该花色
    if (!myEntry.cards.some(c => suitGroup(c) === sg)) return true;
  }
  return false;
}

// 计算一组牌的得分
function _sumScore(cards) {
  return cards.reduce((s, c) => s + cardScore(c), 0);
}

// 计算一组牌的最大牌力
function _maxVal(cards) {
  return cards.reduce((m, c) => Math.max(m, cardVal(c)), 0);
}

/* =====================================================
   RobotAI — 机器人主对象
   ===================================================== */
const RobotAI = {

  /* --------------------------------------------------
     入口：为玩家 p 选出出牌（替代 _aiChoose）
     返回 card id 数组
     -------------------------------------------------- */
  choose(p) {
    switch (ROBOT_MODE) {
      case 'advanced': return this._chooseAdvanced(p);
      case 'medium':   return this._chooseMedium(p);
      default:         return this._chooseBasic(p);
    }
  },

  /* --------------------------------------------------
     初级模式：复用原 _pickSmartPass + 简单首出逻辑
     -------------------------------------------------- */
  _chooseBasic(p) {
    const h = [...S.ps[p].hand];
    if (S.playedRound.length === 0) {
      return [this._basicLead(p, h)];
    }
    return this._basicFollow(p, h, S.leadCards.length);
  },

  _basicLead(p, h) {
    const nonT = h.filter(c => !isTrump(c));
    if (nonT.length) {
      nonT.sort((a, b) => cardVal(b) - cardVal(a));
      return nonT[0];
    }
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

    // 借用 G 的牌型约束选牌
    const { must, canFill } = G._mustFollowCards(h, n);
    const result = [...must];
    if (result.length < n) {
      const used = new Set(result);
      result.push(...canFill.filter(c => !used.has(c)).slice(0, n - result.length));
    }
    if (result.length < n) {
      const used = new Set(result);
      const rem  = h.filter(c => !used.has(c) && suitGroup(c) !== lg)
                    .sort((a, b) => cardScore(a) - cardScore(b));
      result.push(...rem.slice(0, n - result.length));
    }
    return result.slice(0, n);
  },

  /* --------------------------------------------------
     中级模式：仅知自身手牌 + 已出牌历史 + 底牌（有权限时）
     依据阵营策略决策
     -------------------------------------------------- */
  _chooseMedium(p) {
    const h       = [...S.ps[p].hand];
    const isAtk   = S.attackers.includes(p);
    const n       = S.leadCards.length;

    if (S.playedRound.length === 0) {
      // 首出
      return [this._mediumLead(p, h, isAtk)];
    }
    return this._mediumFollow(p, h, n, isAtk);
  },

  _mediumLead(p, h, isAtk) {
    // 统计本局到目前为止已出的牌（用于推断）
    const playedAll = this._allPlayedCards();

    if (isAtk) {
      // 抓分方首出：优先出可能赢的高牌/主牌，避开无把握的花色
      // 找最大非主牌（A/K级别）
      const nonT = h.filter(c => !isTrump(c));
      const bigNonT = nonT.filter(c => cardVal(c) >= 13); // K及以上
      if (bigNonT.length) {
        bigNonT.sort((a, b) => cardVal(b) - cardVal(a));
        return bigNonT[0];
      }
      // 没有大牌则出最小的非主牌探路
      if (nonT.length) {
        nonT.sort((a, b) => cardVal(a) - cardVal(b));
        return nonT[0];
      }
      // 只剩主牌：出最小主牌
      h.sort((a, b) => cardVal(a) - cardVal(b));
      return h[0];
    } else {
      // 守分方首出：尽量出小牌/无分牌，保留大牌截杀
      const nonScore = h.filter(c => cardScore(c) === 0 && !isTrump(c));
      if (nonScore.length) {
        nonScore.sort((a, b) => cardVal(a) - cardVal(b));
        return nonScore[0];
      }
      const nonT = h.filter(c => !isTrump(c));
      if (nonT.length) {
        nonT.sort((a, b) => cardVal(a) - cardVal(b));
        return nonT[0];
      }
      h.sort((a, b) => cardVal(a) - cardVal(b));
      return h[0];
    }
  },

  _mediumFollow(p, h, n, isAtk) {
    const lg      = suitGroup(S.leadCards[0]);
    const same    = h.filter(c => suitGroup(c) === lg);
    const other   = h.filter(c => suitGroup(c) !== lg);

    // 当前轮次已出的最强牌
    const curBest = this._roundBestEntry();
    const curBestIsAlly = curBest && this._isAlly(p, curBest.p);

    // 本轮已积累的分数
    const roundScore = S.playedRound.reduce((s, e) => s + _sumScore(e.cards), 0);
    const hasRoundScore = roundScore > 0;

    // 必须先跟同花色（含牌型约束）
    const { must: mustCards, canFill: fillCards } = G._mustFollowCards(h, n);
    const mustN      = Math.min(same.length, n);
    // 同花色全部候选（用于策略选牌）
    const sameSorted = [...same].sort((a, b) => cardVal(a) - cardVal(b));

    // 辅助：从候选中选 n 张，must 牌优先，再从 fillCards 中按策略补足
    const pickSame = (candidates, count) => {
      // 确保 must 一定包含，再从 candidates 里补不在 must 里的部分
      const res = [...mustCards];
      const usedSet = new Set(mustCards);
      const extra = candidates.filter(c => !usedSet.has(c));
      res.push(...extra);
      return res.slice(0, count);
    };

    if (same.length >= n) {
      if (isAtk) {
        if (curBestIsAlly) {
          return pickSame(sameSorted, n);
        }
        const winning = same.filter(c => cardVal(c) > _maxVal(curBest.cards));
        if (winning.length >= n) {
          winning.sort((a, b) => cardVal(a) - cardVal(b));
          return pickSame(winning, n);
        }
        return pickSame(sameSorted, n);
      } else {
        if (curBestIsAlly) {
          return pickSame(sameSorted, n);
        }
        const winning = same.filter(c => cardVal(c) > _maxVal(curBest.cards));
        if (winning.length >= n) {
          winning.sort((a, b) => cardVal(a) - cardVal(b));
          return pickSame(winning, n);
        }
        return pickSame(sameSorted, n);
      }
    }

    // 跟牌不足：先出 must + fillCards，再从 other 选垫牌
    const forced    = [...mustCards];
    const usedForced = new Set(forced);
    forced.push(...fillCards.filter(c => !usedForced.has(c)));
    const forcedFinal = forced.slice(0, mustN);
    const needExtra = n - forcedFinal.length;

    let extras;
    if (isAtk) {
      if (hasRoundScore) {
        // 本轮有分：垫分牌贡献得分
        const withScore = other.filter(c => cardScore(c) > 0).sort((a, b) => cardScore(b) - cardScore(a));
        const noScore   = other.filter(c => cardScore(c) === 0).sort((a, b) => cardVal(a) - cardVal(b));
        extras = [...withScore, ...noScore].slice(0, needExtra);
      } else {
        // 本轮无分：垫小牌
        const noScore   = other.filter(c => cardScore(c) === 0).sort((a, b) => cardVal(a) - cardVal(b));
        const withScore = other.filter(c => cardScore(c) > 0).sort((a, b) => cardScore(a) - cardScore(b));
        extras = [...noScore, ...withScore].slice(0, needExtra);
      }
    } else {
      // 守分方：垫无分小牌
      const noScore  = other.filter(c => cardScore(c) === 0).sort((a, b) => cardVal(a) - cardVal(b));
      const hasScoreCards = other.filter(c => cardScore(c) > 0).sort((a, b) => cardScore(a) - cardScore(b));
      extras = [...noScore, ...hasScoreCards].slice(0, needExtra);
    }

    return [...forcedFinal, ...extras].slice(0, n);
  },

  /* --------------------------------------------------
     高级模式：全知视角
     可看到所有玩家手牌和底牌，进行深度策略分析
     -------------------------------------------------- */
  _chooseAdvanced(p) {
    const h     = [...S.ps[p].hand];
    const isAtk = S.attackers.includes(p);
    const n     = S.leadCards.length;

    if (S.playedRound.length === 0) {
      return [this._advancedLead(p, h, isAtk)];
    }
    return this._advancedFollow(p, h, n, isAtk);
  },

  // 高级首出：利用全局视角选最优首出牌
  _advancedLead(p, h, isAtk) {
    // 获取所有对手手牌（全知）
    const opponents  = isAtk
      ? S.defenders.filter(i => i !== p)
      : S.attackers.filter(i => i !== p);
    const allies     = isAtk
      ? S.attackers.filter(i => i !== p)
      : S.defenders.filter(i => i !== p);

    if (isAtk) {
      // 抓分方首出策略：
      // 1. 优先找对手都无法压制的高分牌（A/K+同花色）
      // 2. 其次找对手缺色的花色
      // 3. 出大主牌掏主

      // 找"必赢"的非主牌：对手都没有该花色或该花色只有小牌
      const nonT = h.filter(c => !isTrump(c));
      const bestCard = this._findGuaranteedWinner(p, nonT, opponents);
      if (bestCard) return bestCard;

      // 找对手手中无该花色的花色（必赢）
      const lackSuit = this._findOpponentLackSuit(p, nonT, opponents);
      if (lackSuit) return lackSuit;

      // 找大主牌（大于对手所有主牌）
      const trumpCards = h.filter(isTrump);
      const bigTrump = this._findBigTrump(trumpCards, opponents);
      if (bigTrump) return bigTrump;

      // 兜底：出最大非主牌
      if (nonT.length) {
        nonT.sort((a, b) => cardVal(b) - cardVal(a));
        return nonT[0];
      }
      h.sort((a, b) => cardVal(b) - cardVal(a));
      return h[0];

    } else {
      // 守分方首出策略：
      // 1. 出对手（抓分方）都缺的花色（让他们被迫垫牌）
      // 2. 出自己的高分牌（当盟友能赢时贡献分）
      // 3. 否则出小牌

      // 找攻击方都缺的花色
      const nonT = h.filter(c => !isTrump(c));
      const atkLack = this._findAllLackSuit(p, nonT, opponents);
      if (atkLack) return atkLack;

      // 出小牌，避免让攻击方得分
      const noScore = nonT.filter(c => cardScore(c) === 0);
      if (noScore.length) {
        noScore.sort((a, b) => cardVal(a) - cardVal(b));
        return noScore[0];
      }
      if (nonT.length) {
        nonT.sort((a, b) => cardVal(a) - cardVal(b));
        return nonT[0];
      }
      h.sort((a, b) => cardVal(a) - cardVal(b));
      return h[0];
    }
  },

  // 高级跟牌：全知视角精准决策
  _advancedFollow(p, h, n, isAtk) {
    const lg    = suitGroup(S.leadCards[0]);
    const same  = h.filter(c => suitGroup(c) === lg);
    const other = h.filter(c => suitGroup(c) !== lg);

    const curBest       = this._roundBestEntry();
    const curBestIsAlly = curBest && this._isAlly(p, curBest.p);
    const roundScore    = S.playedRound.reduce((s, e) => s + _sumScore(e.cards), 0);
    const hasRoundScore = roundScore > 0;

    // 后续还有玩家出牌
    const remaining = S.np - S.playedRound.length - 1; // 我之后还剩几个人出牌
    const opponents  = isAtk ? S.defenders : S.attackers;

    // 判断我出后是否仍有对手能压制（全知）
    const canOpponentBeat = (card) => {
      for (const op of opponents) {
        if (op === p) continue;
        const opHand = S.ps[op].hand;
        // 对手是否有该花色更大的牌
        const canBeat = opHand.some(c =>
          suitGroup(c) === suitGroup(card) && cardVal(c) > cardVal(card)
        ) || (!isTrump(card) && opHand.some(isTrump));
        if (canBeat) return true;
      }
      return false;
    };

    const { must: mustCards2, canFill: fillCards2 } = G._mustFollowCards(h, n);
    const mustN      = Math.min(same.length, n);
    const sameSorted = [...same].sort((a, b) => cardVal(a) - cardVal(b));

    // 辅助：选 n 张同花色，must 牌优先，余量从候选中补
    const pickSame = (candidates, count) => {
      const res = [...mustCards2];
      const used = new Set(mustCards2);
      res.push(...candidates.filter(c => !used.has(c)));
      return res.slice(0, count);
    };

    if (same.length >= n) {
      if (isAtk) {
        if (curBestIsAlly && remaining === 0) {
          return pickSame(sameSorted, n);
        }
        if (curBestIsAlly) {
          return pickSame(sameSorted, n);
        }
        const myBeat = same
          .filter(c => !canOpponentBeat(c) || remaining === 0)
          .filter(c => cardVal(c) > _maxVal(curBest.cards))
          .sort((a, b) => cardVal(a) - cardVal(b));
        if (myBeat.length >= n) return pickSame(myBeat, n);

        if (hasRoundScore) {
          const bigCards = [...same].sort((a, b) => cardVal(b) - cardVal(a));
          return pickSame(bigCards, n);
        }
        return pickSame(sameSorted, n);

      } else {
        // 守分方
        if (curBestIsAlly && remaining === 0) {
          if (hasRoundScore && same.some(c => cardScore(c) > 0)) {
            const scoreCards = same.filter(c => cardScore(c) > 0).sort((a, b) => cardScore(b) - cardScore(a));
            const noScore    = same.filter(c => cardScore(c) === 0).sort((a, b) => cardVal(a) - cardVal(b));
            return pickSame([...scoreCards, ...noScore], n);
          }
          return pickSame(sameSorted, n);
        }
        if (curBestIsAlly) {
          return pickSame(sameSorted, n);
        }
        if (hasRoundScore) {
          const winning = same.filter(c => cardVal(c) > _maxVal(curBest.cards));
          if (winning.length >= n) {
            winning.sort((a, b) => cardVal(a) - cardVal(b));
            return pickSame(winning, n);
          }
        }
        return pickSame(sameSorted, n);
      }
    }

    // 跟牌不足：先出 must + fillCards，再选垫牌
    const forcedBase = [...mustCards2];
    const usedForced = new Set(forcedBase);
    forcedBase.push(...fillCards2.filter(c => !usedForced.has(c)));
    const forced    = forcedBase.slice(0, mustN);
    const needExtra = n - forced.length;
    let extras;

    const allyWinning = curBestIsAlly;
    const lastPlayer  = remaining === 0;

    if (isAtk) {
      if (allyWinning || lastPlayer) {
        // 盟友在赢 or 是最后一家：垫最多分
        const withScore = other.filter(c => cardScore(c) > 0).sort((a, b) => cardScore(b) - cardScore(a));
        const noScore   = other.filter(c => cardScore(c) === 0).sort((a, b) => cardVal(a) - cardVal(b));
        extras = [...withScore, ...noScore].slice(0, needExtra);
      } else {
        // 对手在赢 or 不确定：垫小无分
        const noScore   = other.filter(c => cardScore(c) === 0).sort((a, b) => cardVal(a) - cardVal(b));
        const withScore = other.filter(c => cardScore(c) > 0).sort((a, b) => cardScore(a) - cardScore(b));
        extras = [...noScore, ...withScore].slice(0, needExtra);
      }
    } else {
      // 守分方：无论如何都尽量不垫分
      const noScore    = other.filter(c => cardScore(c) === 0).sort((a, b) => cardVal(a) - cardVal(b));
      const withScore  = other.filter(c => cardScore(c) > 0).sort((a, b) => cardScore(a) - cardScore(b));
      extras = [...noScore, ...withScore].slice(0, needExtra);
    }

    return [...forced, ...extras].slice(0, n);
  },

  /* --------------------------------------------------
     工具方法
     -------------------------------------------------- */

  // 当前轮次最强出牌玩家信息
  _roundBestEntry() {
    if (!S.playedRound.length) return null;
    let best = S.playedRound[0];
    for (let i = 1; i < S.playedRound.length; i++) {
      if (G._beats(S.playedRound[i].cards, best.cards)) best = S.playedRound[i];
    }
    return best;
  },

  // p 和 q 是否为盟友
  _isAlly(p, q) {
    if (p === q) return true;
    const pa = S.attackers.includes(p);
    const qa = S.attackers.includes(q);
    return pa === qa;
  },

  // 获取本局所有已出牌（展开为平铺数组）
  _allPlayedCards() {
    const all = [];
    // 从 #ps0~3 的 DOM 读取（或通过维护的历史）
    for (let i = 0; i < S.np; i++) {
      const sl = document.getElementById(`ps${i}`);
      if (sl) sl.querySelectorAll('.card[data-cid]').forEach(el => all.push(el.dataset.cid));
    }
    return all;
  },

  // 找到一张非主牌：对所有对手来说在该花色中是最大的（必赢）
  _findGuaranteedWinner(p, nonTCards, opponents) {
    // 按花色分组
    const bySuit = {};
    for (const c of nonTCards) {
      const sg = suitGroup(c);
      if (!bySuit[sg]) bySuit[sg] = [];
      bySuit[sg].push(c);
    }
    for (const sg of Object.keys(bySuit)) {
      const cards = bySuit[sg].sort((a, b) => cardVal(b) - cardVal(a));
      const best  = cards[0];
      // 检查所有对手是否都没有更大的该花色牌
      const safe = opponents.every(op => {
        return !S.ps[op].hand.some(c => suitGroup(c) === sg && cardVal(c) > cardVal(best));
      });
      if (safe) return best;
    }
    return null;
  },

  // 找对手们（全部）都缺色的花色中己方最大牌
  _findAllLackSuit(p, nonTCards, opponents) {
    const bySuit = {};
    for (const c of nonTCards) {
      const sg = suitGroup(c);
      if (!bySuit[sg]) bySuit[sg] = [];
      bySuit[sg].push(c);
    }
    for (const sg of Object.keys(bySuit)) {
      const allLack = opponents.every(op => !S.ps[op].hand.some(c => suitGroup(c) === sg));
      if (allLack) {
        const cards = bySuit[sg].sort((a, b) => cardVal(a) - cardVal(b));
        return cards[0]; // 出最小的即可（对手缺色必须垫牌）
      }
    }
    return null;
  },

  // 找对手中有人缺色的花色中己方最大牌
  _findOpponentLackSuit(p, nonTCards, opponents) {
    const bySuit = {};
    for (const c of nonTCards) {
      const sg = suitGroup(c);
      if (!bySuit[sg]) bySuit[sg] = [];
      bySuit[sg].push(c);
    }
    for (const sg of Object.keys(bySuit)) {
      const anyLack = opponents.some(op => !S.ps[op].hand.some(c => suitGroup(c) === sg));
      if (anyLack) {
        const cards = bySuit[sg].sort((a, b) => cardVal(b) - cardVal(a));
        return cards[0];
      }
    }
    return null;
  },

  // 找大于所有对手主牌的最小主牌
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

/* =====================================================
   挂钩到 G._aiTurn：替换原有 AI 出牌逻辑
   ===================================================== */
(function patchAI() {
  const _patch = () => {
    if (typeof G === 'undefined') { setTimeout(_patch, 50); return; }

    // 保存原始方法备用
    G._aiChoose_orig = G._aiChoose.bind(G);

    // 替换 _aiChoose
    G._aiChoose = function(p) {
      if (ROBOT_MODE === 'basic') return this._aiChoose_orig(p);
      return RobotAI.choose(p);
    };
  };
  _patch();
})();
