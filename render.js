"use strict";
// =====================================================
//  黄梅暗7 — Canvas渲染层
//  负责所有界面绘制，通过 G.onEvent 接收游戏逻辑事件
// =====================================================
import { S, G, cardDisp, isTrump, suitGroup, cardVal, SNAME, KITTY } from './js/base/gameLogic.js';

// =====================================================
//  画布和屏幕尺寸
// =====================================================
const canvas  = wx.createCanvas();
const ctx     = canvas.getContext('2d');

// 用逻辑像素初始化（与触摸坐标保持一致）
const _sysInfo = wx.getSystemInfoSync();
let SW = _sysInfo.windowWidth;
let SH = _sysInfo.windowHeight;
canvas.width  = SW;
canvas.height = SH;

// 屏幕方向变化时更新尺寸
wx.onWindowResize(res => {
  SW = res.windowWidth;
  SH = res.windowHeight;
  canvas.width  = SW;
  canvas.height = SH;
  Render.draw();
});

// =====================================================
//  UI 状态
// =====================================================
const UI = {
  scene:        'lobby',   // lobby | game | kitty | settle | history
  robotMode:    'basic',
  selectedCards: new Set(), // 出牌阶段已选中的牌索引
  kittySelIdx:  new Set(),  // 换底选中索引
  kittyAllCards: [],        // 换底时的全部手牌
  settleData:   null,
  msgText:      '',
  msgTimer:     null,
  msgCallback:  null,
  counterUI:    false,
  counterOpts:  [],
  counterRemain: 0,
  kittyCanSell: false,
  kittyPhaseLabel: '',
  // 弹框
  modal:        null,       // null | { type, ... }
  // 叫主可选牌（发牌阶段）
  callableCards: [],
  // 反主选项弹框
  counterModal: false,
  // 菜单弹框
  menuOpen: false,
  // 查看底牌弹框
  kittyViewOpen: false,
  // 历史记录滚动偏移
  histScrollY:   0,
  _histScrollBase: 0,
  // 换底弹框滚动偏移
  kittyScrollY: 0,
  // 出牌阵列放大预览
  zoomCards:    [],
  zoomName:     '',
  zoomTimer:    null,
  // 阵营公布
  teamRevealData: null,
  // 信息栏阵营行数据（公布后持久显示，每局清除）
  teamInfo: null,
  // 本轮先手玩家（-1表示未知）
  roundLeader: -1,
  // 每玩家累积出牌历史（在出牌区叠加显示）
  playedHist:   [[], [], [], []],
  // 触摸处理
  touchStartX: 0,
  touchStartY: 0,
  // 可拖拽面板位置（信息栏 / 反主倍数标签 / 菜单按钮）
  infoPos:  { x: 6, y: 6 },
  multPos:  { x: -1, y: -1 },   // -1 表示跟随默认位置
  menuPos:  { x: -1, y: -1 },   // -1 表示跟随默认位置（屏幕左侧中间）
  // 拖拽状态
  drag: null,   // null | { panel:'info'|'mult'|'menu', offX, offY }
};

// =====================================================
//  颜色常量
// =====================================================
const CLR = {
  bg:        '#1e5e38',
  bgDark:    '#143d24',
  text:      '#ffffff',
  textDim:   'rgba(255,255,255,0.6)',
  cardFg:    '#ffffff',
  cardBg:    '#ffffff',
  cardBack:  '#1d5fa8',
  red:       '#d00000',
  black:     '#111111',
  gold:      '#ffe066',
  green:     '#28a745',
  blue:      '#2c7be5',
  orange:    '#e0780a',
  darkRed:   '#dc3545',
  gray:      '#6c757d',
  cyan:      '#17a2b8',
  overlay:   'rgba(0,0,0,0.72)',
  panel:     'rgba(10,40,25,0.95)',
  info:      'rgba(0,0,0,0.68)',
  active:    'rgba(255,200,0,0.88)',
  leader:    'rgba(80,200,120,0.92)',
  winColor:  '#7ffe7f',
  loseColor: '#ff8888',
};

// =====================================================
//  尺寸计算（依据屏幕宽度自适应）
// =====================================================
function dim() {
  const cw  = Math.min(SW * 0.115, 52);   // 牌宽
  const ch  = cw * 1.45;                   // 牌高
  const csm = cw * 0.48;                   // 小牌宽
  const csh = csm * 1.45;                  // 小牌高
  const cm  = cw * 0.75;                   // 中牌宽
  const cmh = cm * 1.45;                   // 中牌高
  return { cw, ch, csm, csh, cm, cmh };
}

// =====================================================
//  字体辅助
// =====================================================
function font(size, bold) {
  return `${bold ? '700 ' : ''}${size}px PingFang SC, Helvetica, Arial, sans-serif`;
}

// =====================================================
//  绘制单张牌
// =====================================================
function drawCard(x, y, w, h, id, opts = {}) {
  const { back = false, selected = false, glow = false } = opts;
  const r = 6;
  ctx.save();
  // 选中状态上移
  if (selected) y -= h * 0.2;

  // 圆角矩形
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();

  if (back) {
    ctx.fillStyle = CLR.cardBack;
    ctx.fill();
    ctx.strokeStyle = '#5588cc';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else {
    ctx.fillStyle = CLR.cardBg;
    ctx.fill();
    if (selected) {
      ctx.strokeStyle = CLR.gold;
      ctx.lineWidth = 2.5;
    } else if (glow) {
      ctx.strokeStyle = CLR.gold;
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth = 1.5;
    }
    ctx.stroke();

    if (id) {
      const d    = cardDisp(id);
      const clr  = d.color === 'red' ? CLR.red : CLR.black;
      const fs   = Math.max(9, w * 0.24);
      const ssz  = Math.max(13, w * 0.34);
      ctx.fillStyle = clr;
      ctx.font = font(fs, true);
      ctx.textAlign = 'left';
      ctx.fillText(d.top, x + 2, y + fs + 1);
      ctx.fillText(d.suit, x + 2, y + fs * 2 + 2);
      // 中心花色
      ctx.font = font(ssz);
      ctx.textAlign = 'center';
      ctx.fillText(d.suit, x + w / 2, y + h / 2 + ssz * 0.35);
      // 右下角（倒置）
      ctx.save();
      ctx.translate(x + w - 2, y + h - 2);
      ctx.rotate(Math.PI);
      ctx.font = font(fs, true);
      ctx.textAlign = 'left';
      ctx.fillText(d.top, 0, fs);
      ctx.fillText(d.suit, 0, fs * 2);
      ctx.restore();
    }
  }

  ctx.restore();
}

// =====================================================
//  圆角矩形辅助
// =====================================================
function roundRect(x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill)   { ctx.fillStyle   = fill;   ctx.fill();   }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}

// =====================================================
//  按钮定义（由 Render.draw 每帧计算）
// =====================================================
let BUTTONS = []; // [{id, x, y, w, h, label, color, disabled}]

function addBtn(id, x, y, w, h, label, color, disabled = false) {
  BUTTONS.push({ id, x, y, w, h, label, color, disabled });
}

function drawBtn(btn) {
  // transparent 颜色的按钮只作为点击热区，不重绘外观
  if (btn.color === 'transparent') return;
  const alpha = btn.disabled ? 0.42 : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  roundRect(btn.x, btn.y, btn.w, btn.h, 10, btn.color, null);
  ctx.fillStyle = '#fff';
  ctx.font = font(14, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2);
  ctx.restore();
}

function hitBtn(tx, ty) {
  for (const btn of BUTTONS) {
    if (!btn.disabled && tx >= btn.x && tx <= btn.x + btn.w && ty >= btn.y && ty <= btn.y + btn.h) {
      return btn.id;
    }
  }
  return null;
}

// =====================================================
//  主渲染对象
// =====================================================
const Render = {

  draw() {
    BUTTONS = [];
    ctx.clearRect(0, 0, SW, SH);
    if (UI.scene === 'lobby') this._drawLobby();
    else this._drawGame();
    // 所有按钮统一最后绘制（确保浮层按钮也能渲染）
    // 结算/历史页时先清掉游戏内按钮，只保留弹框按钮
    for (const btn of BUTTONS) drawBtn(btn);
    // 消息浮层（所有场景通用）
    if (UI.msgText) this._drawMsg();
  },

  // ---- 大厅 ----
  _drawLobby() {
    // 背景
    const grad = ctx.createRadialGradient(SW / 2, SH * 0.3, 0, SW / 2, SH * 0.3, SH);
    grad.addColorStop(0, '#1a2a4a');
    grad.addColorStop(1, '#0a0e1a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SW, SH);

    // 标题
    ctx.fillStyle = CLR.gold;
    ctx.font = font(Math.min(SW * 0.1, 42), true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('黄梅暗7', SW / 2, SH * 0.22);

    ctx.fillStyle = CLR.textDim;
    ctx.font = font(13);
    ctx.fillText('选择对局模式', SW / 2, SH * 0.22 + 28);

    // 三个模式按钮
    const bw = SW * 0.72, bh = 62, bx = (SW - bw) / 2;
    const modes = [
      { id: 'adv', label: '高级房', sub: '全知视角 · 高难度', color: '#7c3aed' },
      { id: 'mid', label: '中级房', sub: '策略推理 · 中等难度', color: '#16a34a' },
      { id: 'bas', label: '初级房', sub: '基础模式 · 入门难度', color: '#b45309' },
    ];
    modes.forEach((m, idx) => {
      const by = SH * 0.33 + idx * (bh + 14);
      roundRect(bx, by, bw, bh, 14, m.color + '33', m.color + '88');
      ctx.fillStyle = '#ffffff';
      ctx.font = font(17, true);
      ctx.textAlign = 'left';
      ctx.fillText(m.label, bx + 18, by + 22);
      ctx.fillStyle = CLR.textDim;
      ctx.font = font(12);
      ctx.fillText(m.sub, bx + 18, by + 44);
      addBtn('mode_' + m.id, bx, by, bw, bh, '', 'transparent');
    });

    ctx.fillStyle = CLR.textDim;
    ctx.font = font(11);
    ctx.textAlign = 'center';
    ctx.fillText('点击模式卡片即可进入游戏 · 单机对战4人桌', SW / 2, SH * 0.88);
  },

  // ---- 游戏主界面 ----
  _drawGame() {
    // 背景
    const grad = ctx.createRadialGradient(SW / 2, SH / 2, 0, SW / 2, SH / 2, SH * 0.8);
    grad.addColorStop(0, '#2e8a56');
    grad.addColorStop(1, '#1e5e38');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SW, SH);

    if (UI.scene === 'lobby') return;

    const d = dim();

    // 绘制4个玩家区
    this._drawPlayers(d);

    // 控制栏
    this._drawCtrlBar(d);

    // 信息栏
    this._drawInfo();

    // 菜单按钮
    this._drawMenu();

    // 浮层
    if (UI.zoomCards.length) this._drawZoom(d);
    if (UI.teamRevealData) this._drawTeamReveal();
    if (UI.menuOpen)       this._drawMenuPanel();
    if (UI.kittyViewOpen)  this._drawKittyView(d);
    if (UI.counterModal)   this._drawCounterModal(d);
    if (UI.modal)          this._drawModal(d);
    if (UI.scene === 'kitty')   this._drawKittyModal(d);
    if (UI.scene === 'settle')  this._drawSettle();
    if (UI.scene === 'history') this._drawHistory();
  },

  // ---- 玩家区域 ----
  _drawPlayers(d) {
    const { cw, ch, csm, csh, cm, cmh } = d;
    const land = SW > SH; // 横屏判断

    if (land) {
      // 横屏布局：P2 顶部居中、P1 左侧、P3 右侧、P0 底部
      const midX = SW / 2;
      // P2 顶部：手牌→出牌区→信息标签（标签最后绘制，覆盖牌堆上方）
      this._drawAIHand(2, midX, SH * 0.02, 'top', csm, csh);
      this._drawPlayedCards(2, midX, SH * 0.16, 'top', cm, cmh);
      this._drawPlayerInfo(2, midX, SH * 0.02 + csh + 2);
      // P1 左侧：出牌堆紧贴手牌右侧
      this._drawAIHand(1, SW * 0.02, SH * 0.38, 'left', csm, csh);
      this._drawPlayedCards(1, SW * 0.02 + csh + 6, SH * 0.38, 'left', cm, cmh);
      this._drawPlayerInfo(1, SW * 0.02 + csh + 6, SH * 0.36);
      // P3 右侧：出牌堆紧贴手牌左侧
      this._drawAIHand(3, SW - SW * 0.02 - csh, SH * 0.38, 'right', csm, csh);
      this._drawPlayedCards(3, SW - SW * 0.02 - csh - 6 - cm, SH * 0.38, 'right', cm, cmh);
      this._drawPlayerInfo(3, SW - SW * 0.02 - csh - 50, SH * 0.36);
      // P0 底部
      this._drawHumanHand(d);
      this._drawPlayedCards(0, midX, SH * 0.60, 'bottom', cm, cmh);
      this._drawPlayerInfo(0, midX, SH * 0.60 - 26);
    } else {
      // 竖屏布局
      // P2 顶部
      this._drawAIHand(2, SW / 2, SH * 0.04, 'top', csm, csh);
      this._drawPlayedCards(2, SW / 2, SH * 0.15, 'top', cm, cmh);
      this._drawPlayerInfo(2, SW / 2, SH * 0.04 + csh + 4);
      // P1 左侧：出牌堆紧贴手牌右侧（往外靠）
      this._drawAIHand(1, SW * 0.03, SH * 0.42, 'left', csm, csh);
      this._drawPlayedCards(1, SW * 0.03 + csh + 6, SH * 0.42, 'left', cm, cmh);
      this._drawPlayerInfo(1, SW * 0.03 + csh + 6, SH * 0.4);
      // P3 右侧：出牌堆紧贴手牌左侧（往外靠）
      this._drawAIHand(3, SW - SW * 0.03 - csh, SH * 0.42, 'right', csm, csh);
      this._drawPlayedCards(3, SW - SW * 0.03 - csh - 6 - cm, SH * 0.42, 'right', cm, cmh);
      this._drawPlayerInfo(3, SW - SW * 0.03 - csh - 50, SH * 0.4);
      // P0 底部
      this._drawHumanHand(d);
      this._drawPlayedCards(0, SW / 2, SH * 0.68, 'bottom', cm, cmh);
      this._drawPlayerInfo(0, SW / 2, SH * 0.68 - 26);
    }
  },

  _drawAIHand(p, cx, cy, dir, csm, csh) {
    const cnt = S.ps[p] ? S.ps[p].hand.length : 0;
    if (!cnt) return;
    const gap = 3;
    if (dir === 'top') {
      const total = cnt * csm - (cnt - 1) * (csm - gap - csm * 0.55);
      let x = cx - total / 2;
      for (let i = 0; i < cnt; i++) {
        drawCard(x, cy, csm, csh, null, { back: true });
        x += gap + csm * 0.45;
      }
    } else if (dir === 'left' || dir === 'right') {
      const step = csh * 0.45;
      const totalH = csh + step * (cnt - 1);
      // 限制不超出上下边界（保留 4px 边距）
      const margin = 4;
      const maxH = SH - margin * 2;
      const actualH = Math.min(totalH, maxH);
      const actualStep = cnt > 1 ? (actualH - csh) / (cnt - 1) : 0;
      let y = cy - actualH / 2;
      // 确保不超出顶部
      if (y < margin) y = margin;
      // 确保不超出底部
      if (y + actualH > SH - margin) y = SH - margin - actualH;
      for (let i = 0; i < cnt; i++) {
        drawCard(cx, y, csm, csh, null, { back: true });
        y += actualStep;
      }
    }
  },

  _drawPlayerInfo(p, x, y) {
    if (!S.ps[p]) return;
    const isCur     = p === S.curP && S.phase === 'playing';
    // 先手玩家：本轮还没出过牌（playedRound中没有该玩家的条目）即为先手
    const isLeader  = S.phase === 'playing'
                    && UI.roundLeader === p
                    && !S.playedRound.some(e => e.p === p);
    const isCaller  = p === S.caller;
    const showScore = !isCaller && (S.teamRevealed ? S.attackers.includes(p) : true);
    const sc = (showScore && (S.phase === 'playing' || S.phase === 'settle')) ? (S.playerScores[p] || 0) : null;
    let line1 = S.ps[p].name + ' ' + S.ps[p].hand.length + '张';
    if (sc !== null) line1 += `  得分:${sc}`;

    // 首出玩家：绿色背景；当前出牌非首出：金色背景；其他：半透明深色
    const bg = isLeader ? '#2a8a3a' : (isCur ? CLR.active : CLR.info);
    const fg = (isCur || isLeader) ? '#fff' : '#e0f0e0';

    ctx.font = font(11);
    const tw = ctx.measureText(line1).width + 16;
    const th = 22;

    // 首出玩家：绘制绿色光晕
    if (isLeader) {
      ctx.save();
      ctx.shadowColor = '#00ff66';
      ctx.shadowBlur  = 10;
      roundRect(x - tw / 2, y, tw, th, 5, bg, '#00cc44');
      ctx.restore();
    } else {
      roundRect(x - tw / 2, y, tw, th, 5, bg, null);
    }

    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(line1, x, y + th / 2);

    // 首出玩家：在标签下方显示"先手"角标
    if (isLeader) {
      const tagW = 36, tagH = 16;
      roundRect(x - tagW / 2, y + th + 2, tagW, tagH, 4, '#00aa44', null);
      ctx.fillStyle = '#fff';
      ctx.font = font(9, true);
      ctx.fillText('先手', x, y + th + 2 + tagH / 2);
    }
  },

  _drawPlayedCards(p, cx, cy, dir, cm, cmh) {
    const hist = (UI.playedHist && UI.playedHist[p]) ? UI.playedHist[p] : [];
    if (!hist.length) return;

    const n = hist.length;
    const RECENT = 6; // 最新6张正常间距展示
    const oldN = Math.max(0, n - RECENT);

    if (dir === 'top' || dir === 'bottom') {
      // 横向：早期牌压缩叠加，最新6张正常间距
      const normalGap = cm + 3;
      const compactGap = Math.max(4, cm * 0.28);
      const totalW = (oldN > 0 ? oldN * compactGap : 0)
                   + Math.min(n, RECENT) * normalGap - (n > 1 ? 3 : 0);
      let x = cx - totalW / 2;
      for (let i = 0; i < n; i++) {
        drawCard(x, cy, cm, cmh, hist[i]);
        x += i < oldN ? compactGap : normalGap;
      }
    } else {
      // 纵向（左右玩家）：旧牌高度压缩叠加（30%），最新6张间距较大（62%）
      const oldStep = cmh * 0.30;  // 旧牌：更紧密叠加
      const newStep = cmh * 0.62;  // 最新6张：间距稍大，清晰可见
      const steps = Array.from({ length: n - 1 }, (_, i) => i < oldN ? oldStep : newStep);
      const calcH = cmh + steps.reduce((s, v) => s + v, 0);
      // 限制不超出屏幕上下边界
      const maxH = SH - 8;
      const scaleH = calcH > maxH ? maxH / calcH : 1;
      let y = Math.max(4, cy - calcH * scaleH / 2);
      for (let i = 0; i < n; i++) {
        drawCard(cx, y, cm, cmh, hist[i]);
        if (i < n - 1) y += steps[i] * scaleH;
      }
    }
  },

  _drawHumanHand(d) {
    const { cw, ch } = d;
    const h = S.ps[0] ? S.ps[0].hand : [];
    if (!h.length) return;
    const n     = h.length;
    const land  = SW > SH;
    const maxW  = land ? SW * 0.7 : SW - 40;
    const gap   = Math.max(8, Math.min(cw, Math.floor((maxW - cw) / Math.max(1, n - 1))));
    const total = cw + gap * (n - 1);
    const x0    = (SW - total) / 2;
    const y0    = SH - ch - (land ? 14 : 28);

    // 记录手牌顶部 y，供 _drawCtrlBar 定位按钮
    this._handY0 = y0;
    this._handCh = ch;

    // 记录每张牌的坐标（供触摸检测）
    // 叠放时除最后一张外，可点击宽度为 gap（与绘制步长一致），避免偏右
    this._handCardRects = [];
    for (let i = 0; i < n; i++) {
      const x  = x0 + i * gap;
      const sel = UI.selectedCards.has(i);
      const callable = (S.phase === 'dealing' && S.caller === -1) && (h[i].endsWith('7') || h[i] === 'BJ' || h[i] === 'SJ');
      drawCard(x, y0, cw, ch, h[i], { selected: sel, glow: callable });
      const hitW = (i === n - 1) ? cw : gap; // 最后一张用完整宽度，其余用步长
      this._handCardRects.push({ x, y: y0, w: hitW, h: ch, idx: i });
    }
  },

  // ---- 控制栏 ----
  _drawCtrlBar(d) {
    const land  = SW > SH;
    const btnH  = land ? 36 : 40;
    const phase  = S.phase;

    // 按钮 y 坐标：有手牌时放牌组正上方，否则放屏幕底部偏上
    let by;
    if (this._handY0 != null && (phase === 'playing' || phase === 'dealing')) {
      by = this._handY0 - btnH - 8;
    } else {
      by = land ? SH - btnH - 8 : SH * 0.72;
    }

    if (phase === 'idle') {
      addBtn('start', (SW - 100) / 2, by, 100, btnH, '开始游戏', CLR.blue);
    } else if (phase === 'dealing') {
      if (S.caller === -1 && this._canCallHuman()) {
        addBtn('call', (SW - 80) / 2, by, 80, btnH, '叫主', CLR.orange);
      }
    } else if (phase === 'playing') {
      if (S.curP === 0) {
        const isLead = S.playedRound.length === 0;
        addBtn('play', SW / 2 - 48, by, 88, btnH, '出牌', CLR.green, UI.selectedCards.size === 0);
        if (!isLead) addBtn('pass', SW / 2 + 48, by, 80, btnH, '垫牌', CLR.gray);
      }
    } else if (phase === 'settle') {
      addBtn('nextgame', SW / 2 - 54, by, 100, btnH, '下一局', CLR.blue);
      addBtn('hist', SW / 2 + 54, by, 80, btnH, '历史', CLR.gray);
    }

    // 反主相关按钮（反主阶段）
    if (UI.counterUI) {
      addBtn('counter', SW / 2 - 54, by - 44, 88, 36, '反主', CLR.darkRed);
      addBtn('skip', SW / 2 + 42, by - 44, 68, 36, '跳过', CLR.gray);
      // 倒计时显示
      if (UI.counterRemain > 0) {
        ctx.font = font(13, true);
        ctx.fillStyle = UI.counterRemain <= 2 ? '#ff4444' : '#ffe066';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${UI.counterRemain}s`, SW / 2 + 120, by - 44 + 18);
      }
    }
  },

  _canCallHuman() {
    return S.ps[0] && S.ps[0].hand.some(c => c.endsWith('7') || c === 'BJ' || c === 'SJ');
  },

  // ---- 游戏信息栏（可拖拽） ----
  _drawInfo() {
    const phase = S.phase;
    const showTrump = phase === 'playing' || phase === 'settle' || phase === 'kitty';
    const trumpText = showTrump
      ? (S.trumpSuit ? SNAME[S.trumpSuit] : (S.trumpJoker ? '国主' : '未定'))
      : '保密';

    // 叫主牌显示（文字形式）
    let calledCardText = '-';
    if (S.calledCard) {
      const cd = cardDisp(S.calledCard);
      if (showTrump) {
        // 大王/小王特殊处理
        if (S.calledCard === 'BJ' || S.calledCard === 'SJ') {
          calledCardText = cd.top + cd.suit; // "大王"/"小王"
        } else {
          calledCardText = SNAME[cd.suit] + cd.top; // 如"黑桃7"
        }
      } else {
        calledCardText = '保密';
      }
    }

    // 叫主玩家
    const callerName = S.ps[S.caller >= 0 ? S.caller : S.dealer]?.name || '-';
    // 玩家自己分数
    const myScore = (S.phase === 'playing' || S.phase === 'settle')
      ? (S.playerScores[0] || 0) : null;

    const lines = [
      `轮次: ${S.round}`,
      `叫主: ${callerName}`,
      `叫主牌: ${calledCardText}`,
      `主花色: ${trumpText}`,
    ];
    if (S.multiplier > 1) {
      lines.push(`反主: ×${S.multiplier}`);
    }
    if (myScore !== null) {
      lines.push(`我的得分: ${myScore}`);
    }

    // 阵营行（公布后显示，每局开始时 UI.teamInfo 会被清除）
    if (UI.teamInfo) {
      const sideColor = UI.teamInfo.isAttacker ? '#f90' : '#4af';
      lines.push({ text: `阵营: ${UI.teamInfo.side}`, color: sideColor });
      if (UI.teamInfo.teammate) {
        lines.push({ text: `队友: ${UI.teamInfo.teammate}`, color: sideColor });
      }
    }

    const pad = 8, lh = 17;
    // 计算最长行宽
    ctx.font = font(11);
    let maxTw = 100;
    for (const l of lines) {
      const t = typeof l === 'string' ? l : l.text;
      const tw = ctx.measureText(t).width;
      if (tw > maxTw) maxTw = tw;
    }
    const bw = maxTw + pad * 2 + 4;
    const boxH = lines.length * lh + pad * 2;

    const { x, y } = UI.infoPos;
    const ix = Math.max(0, Math.min(SW - bw, x));
    const iy = Math.max(0, Math.min(SH - boxH, y));
    UI.infoPos.x = ix; UI.infoPos.y = iy;
    roundRect(ix, iy, bw, boxH, 8, CLR.info, null);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = font(11);
    lines.forEach((l, i) => {
      const text  = typeof l === 'string' ? l : l.text;
      const color = typeof l === 'string' ? '#c8f0c8' : l.color;
      ctx.fillStyle = color;
      ctx.fillText(text, ix + pad, iy + pad + i * lh);
    });
    // 记录拖拽区域
    this._infoRect = { x: ix, y: iy, w: bw, h: boxH };

    // 反主倍数标签单独不再显示（已并入信息栏），但保留拖拽兼容
    this._multRect = null;
    UI.multPos.x = -1; UI.multPos.y = -1;
  },

  // ---- 菜单按钮（可拖拽，默认屏幕左侧中间） ----
  _drawMenu() {
    const bw = 70, bh = 30;
    // 默认位置：左侧垂直居中
    if (UI.menuPos.x < 0) {
      UI.menuPos.x = 8;
      UI.menuPos.y = SH / 2 - bh / 2;
    }
    const mx = Math.max(0, Math.min(SW - bw, UI.menuPos.x));
    const my = Math.max(0, Math.min(SH - bh, UI.menuPos.y));
    UI.menuPos.x = mx; UI.menuPos.y = my;
    // 先绘制背景（确保可见）
    roundRect(mx, my, bw, bh, 8, CLR.info, 'rgba(100,180,255,0.3)');
    ctx.fillStyle = '#aef';
    ctx.font = font(13);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('☰ 菜单', mx + bw / 2, my + bh / 2);
    // 注册按钮热区（透明，覆盖在绘制区域上）
    addBtn('menu', mx, my, bw, bh, '', 'transparent');
    // 记录拖拽区域
    this._menuRect = { x: mx, y: my, w: bw, h: bh };
  },

  // ---- 消息浮层 ----
  _drawMsg() {
    const msg = UI.msgText;
    ctx.font = font(14);
    const tw = ctx.measureText(msg).width;
    const pw = tw + 48, ph = 46;
    const px = (SW - pw) / 2, py = SH * 0.45 - ph / 2;
    roundRect(px, py, pw, ph, 12, 'rgba(0,0,0,0.9)', null);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(msg, SW / 2, py + ph / 2);
  },

  // ---- 叫主弹框 ----
  _drawCallModal(d) {
    const { cw, ch } = d;
    const cards = UI.callableCards;
    if (!cards.length) return;
    const pw = SW * 0.85, ph = ch + 80;
    const px = (SW - pw) / 2, py = (SH - ph) / 2;
    roundRect(px, py, pw, ph, 14, CLR.panel, '#4a8a5a');
    ctx.fillStyle = '#9ff';
    ctx.font = font(14, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('选择叫主的牌', SW / 2, py + 12);
    const n = cards.length;
    const total = n * cw + (n - 1) * 8;
    let x = (SW - total) / 2;
    this._callCardRects = [];
    for (const c of cards) {
      drawCard(x, py + 40, cw, ch, c);
      this._callCardRects.push({ x, y: py + 40, w: cw, h: ch, card: c });
      x += cw + 8;
    }
    addBtn('closeCall', px + pw - 64, py + ph - 40, 56, 30, '取消', CLR.gray);
  },

  // ---- 换底弹框 ----
  _drawKittyModal(d) {
    const { cw, ch } = d;
    const pad = 10;
    const btnAreaH = 46;
    const titleH = 36;
    const pw = SW * 0.95;
    // 先算牌区所需高度
    const cards = UI.kittyAllCards;
    const n = cards.length;
    const cols = Math.max(1, Math.floor((pw - pad * 2) / (cw + 6)));
    const rows = Math.ceil(n / cols);
    const rowH = ch + 8;
    const cardsAreaH = rows * rowH - 8 + 10; // 最后一行不加间距，下边加 10 内边距
    // 弹框高度：标题 + 牌区 + 按钮区，但不超出屏幕
    const ph = Math.min(SH * 0.92, titleH + cardsAreaH + btnAreaH);
    const px = (SW - pw) / 2, py = Math.max(4, (SH - ph) / 2);
    roundRect(px, py, pw, ph, 14, CLR.panel, '#4a8a5a');

    const title = UI.kittyPhaseLabel || '换底牌';
    ctx.fillStyle = '#9ff';
    ctx.font = font(13, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${title}（已选 ${UI.kittySelIdx.size}/${KITTY}）`, SW / 2, py + 10);

    // 牌区可用高度
    const cardZoneH = ph - titleH - btnAreaH;
    const startX = px + pad;
    const scrollOff = UI.kittyScrollY || 0;

    // 设置裁剪区域，防止牌超出弹框
    ctx.save();
    ctx.beginPath();
    ctx.rect(px + 2, py + titleH, pw - 4, cardZoneH);
    ctx.clip();

    this._kittyCardRects = [];
    for (let i = 0; i < n; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx2 = startX + col * (cw + 6);
      const cy2 = py + titleH + row * rowH - scrollOff;
      const sel = UI.kittySelIdx.has(i);
      drawCard(cx2, cy2, cw, ch, cards[i], { selected: sel });
      // 只记录可见区域内的点击热区
      if (cy2 + ch > py + titleH && cy2 < py + titleH + cardZoneH) {
        this._kittyCardRects.push({ x: cx2, y: cy2, w: cw, h: ch, idx: i });
      }
    }
    ctx.restore();

    const btnY = py + ph - btnAreaH + 6;
    addBtn('confirmKitty', px + 16, btnY, 100, 34, '确认底牌', CLR.green);
    if (UI.kittyCanSell) addBtn('sell', px + 124, btnY, 68, 34, '卖主', CLR.cyan);

    // 记录最大可滚动量（供 touchmove 限制）
    const totalCardsH = rows * rowH;
    this._kittyMaxScroll = Math.max(0, totalCardsH - cardZoneH + 10);
    // 限制当前滚动值不超上限
    if (UI.kittyScrollY > this._kittyMaxScroll) {
      UI.kittyScrollY = this._kittyMaxScroll;
      UI._kittyScrollBase = UI.kittyScrollY;
    }

    // 如果内容超出，显示滚动提示和滚动条
    if (totalCardsH > cardZoneH) {
      // 滚动提示文字
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = font(10);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('↕ 上下滑动查看更多', SW / 2, py + titleH + 10);

      // 右侧滚动条
      const sbX = px + pw - 6;
      const sbH = cardZoneH;
      const thumbH = Math.max(30, (cardZoneH / totalCardsH) * sbH);
      const thumbY = py + titleH + (scrollOff / this._kittyMaxScroll) * (sbH - thumbH);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      roundRect(sbX, py + titleH, 4, sbH, 2, 'rgba(255,255,255,0.1)', null);
      roundRect(sbX, thumbY, 4, thumbH, 2, 'rgba(255,255,255,0.6)', null);
    }
  },

  // ---- 反主弹框 ----
  _drawCounterModal(d) {
    const opts = UI.counterOpts;
    if (!opts.length) return;
    const { cw, ch } = d;
    // 每行：牌面预览 + 按钮文字；行高取牌高+10或44取大
    const bh = Math.max(44, ch + 10);
    const pad = 14;
    const titleH = 30 + pad;
    const cancelH = 32 + 8;
    const totalContent = titleH + opts.length * (bh + 8) + cancelH + pad;
    const ph = Math.min(SH * 0.88, totalContent);
    const pw = Math.min(SW * 0.82, 340);
    const px = (SW - pw) / 2;
    const py = Math.max(8, (SH - ph) / 2);
    roundRect(px, py, pw, ph, 14, CLR.panel, '#4a8a5a');
    ctx.fillStyle = '#9ff';
    ctx.font = font(14, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('选择反主方式', SW / 2, py + pad);

    // 各选项：左侧显示反主牌面，右侧为选择按钮
    opts.forEach((opt, i) => {
      const rowY = py + titleH + i * (bh + 8);
      // 画牌面预览（两张牌）
      const previewCards = opt.cards || [];
      const cardScale = Math.min(1, (bh - 6) / ch);
      const pcw = Math.round(cw * cardScale);
      const pch = Math.round(ch * cardScale);
      const cardsW = previewCards.length * (pcw + 4);
      const cardX = px + 14;
      const cardY = rowY + (bh - pch) / 2;
      previewCards.forEach((c, ci) => {
        drawCard(cardX + ci * (pcw + 4), cardY, pcw, pch, c);
      });
      // 按钮区域在牌面右边
      const btnX = cardX + cardsW + 8;
      const btnW = pw - 14 - cardsW - 8 - 14;
      addBtn('counter_' + i, btnX, rowY + (bh - 38) / 2, btnW, 38, opt.label, CLR.darkRed);
    });
    addBtn('closeCounter', px + 16, py + ph - pad - 32, pw - 32, 32, '取消', CLR.gray);
  },

  // ---- 通用弹框 ----
  _drawModal(d) {
    const m = UI.modal;
    if (!m) return;
    if (m.type === 'call')    { this._drawCallModal(d); return; }
    if (m.type === 'sellFail') {
      const pw = SW * 0.75, ph = 140;
      const px = (SW - pw) / 2, py = (SH - ph) / 2;
      roundRect(px, py, pw, ph, 14, CLR.panel, '#dc3545');
      ctx.fillStyle = '#ff8888';
      ctx.font = font(15, true);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('卖主失败！', SW / 2, py + 18);
      addBtn('sellCont', px + 16, py + 60, (pw - 44) / 2, 36, '继续游戏', CLR.green);
      addBtn('sellQuit', px + 16 + (pw - 44) / 2 + 12, py + 60, (pw - 44) / 2, 36, '放弃本局', CLR.darkRed);
    }
  },

  // ---- 结算面板 ----
  _drawSettle() {
    const sd = UI.settleData;
    if (!sd) return;
    // 清空游戏内按钮，确保结算弹框在最上层
    BUTTONS = [];
    roundRect(0, 0, SW, SH, 0, CLR.overlay, null);
    const pw = SW * 0.92, ph = Math.min(SH * 0.82, 520);
    const px = (SW - pw) / 2, py = (SH - ph) / 2;
    roundRect(px, py, pw, ph, 14, CLR.panel, '#4a8a5a');

    ctx.fillStyle = '#9ff';
    ctx.font = font(15, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('本局结算', SW / 2, py + 12);

    const rows = [
      ['抓分方', sd.atkN],
      ['防守方', sd.defN],
      ['总分', sd.sc + ' 分'],
      ['底牌分', sd.kb + ' 分'],
      ['反主倍数', '×' + sd.multiplier],
      ['筹码', sd.chips],
    ];
    let ry = py + 38;
    const rh = 22;
    rows.forEach(([k, v]) => {
      ctx.fillStyle = CLR.textDim;
      ctx.font = font(12);
      ctx.textAlign = 'left';
      ctx.fillText(k, px + 16, ry);
      ctx.textAlign = 'right';
      ctx.fillText(v, px + pw - 16, ry);
      ry += rh;
    });

    // 结果
    const clr = sd.cls === 'rWin' ? CLR.winColor : sd.cls === 'rBig' ? '#ff4444' : CLR.loseColor;
    ctx.fillStyle = clr;
    ctx.font = font(16, true);
    ctx.textAlign = 'center';
    ctx.fillText(sd.txt, SW / 2, ry + 10);
    ry += 36;

    // 玩家明细
    if (sd.playerRec) {
      const cols = ['玩家', '阵营', '得分', '胜负', '筹码'];
      const colX = [px + 12, px + pw * 0.22, px + pw * 0.48, px + pw * 0.65, px + pw * 0.82];
      ctx.fillStyle = '#7ff';
      ctx.font = font(11, true);
      cols.forEach((c, i) => { ctx.textAlign = 'left'; ctx.fillText(c, colX[i], ry); });
      ry += 18;
      for (const r of sd.playerRec) {
        ctx.fillStyle = r.win ? CLR.winColor : CLR.loseColor;
        ctx.font = font(11);
        const vals = [r.name, r.team, r.score, r.win ? '胜' : '负', r.chips];
        vals.forEach((v, i) => { ctx.textAlign = 'left'; ctx.fillText(String(v), colX[i], ry); });
        ry += 18;
      }
    }

    const btnY = py + ph - 46;
    addBtn('nextgame2', px + 16, btnY, 100, 34, '下一局', CLR.blue);
    addBtn('hist2', px + pw - 100, btnY, 84, 34, '历史记录', CLR.gray);
  },

  // ---- 历史记录 ----
  _drawHistory() {
    BUTTONS = [];
    roundRect(0, 0, SW, SH, 0, 'rgba(0,0,0,0.93)', null);
    ctx.fillStyle = '#e0f0e0';
    ctx.font = font(16, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('历史结算记录', SW / 2, 16);
    let y = 50 - UI.histScrollY;
    for (const h of S.history) {
      if (y > SH) break;
      if (y + 100 > 0) {
        roundRect(14, y, SW - 28, 90, 8, 'rgba(255,255,255,0.08)', null);
        ctx.fillStyle = '#fff';
        ctx.font = font(12, true);
        ctx.textAlign = 'left';
        ctx.fillText(`第${h.gameRound}局 | ${h.txt}`, 22, y + 10);
        ctx.fillStyle = '#adf';
        ctx.font = font(11);
        ctx.fillText(`抓分方: ${h.atkN}  防守方: ${h.defN}  总分: ${h.sc}`, 22, y + 30);
        ctx.fillText(h.chips, 22, y + 48);
        if (h.playerRec) {
          ctx.fillStyle = '#7ff';
          ctx.fillText('玩家  阵营  得分  胜负  筹码', 22, y + 66);
        }
      }
      y += 100;
    }
    if (!S.history.length) {
      ctx.fillStyle = CLR.textDim;
      ctx.font = font(13);
      ctx.textAlign = 'center';
      ctx.fillText('暂无历史记录', SW / 2, SH / 2);
    }
    addBtn('closeHist', (SW - 80) / 2, SH - 52, 80, 34, '关闭', CLR.gray);
  },

  // ---- 出牌放大预览 ----
  _drawZoom(d) {
    const { cw, ch } = d;
    const n = UI.zoomCards.length;
    const total = n * cw + (n - 1) * 10;
    const px = (SW - total - 40) / 2, py = SH / 2 - ch / 2 - 30;
    roundRect(px, py, total + 40, ch + 56, 14, 'rgba(0,0,0,0.58)', null);
    ctx.fillStyle = '#ffe';
    ctx.font = font(13, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(UI.zoomName + ' 出牌', SW / 2, py + 8);
    let x = px + 20;
    for (const c of UI.zoomCards) {
      drawCard(x, py + 30, cw, ch, c);
      x += cw + 10;
    }
  },

  // ---- 阵营公布 ----
  _drawTeamReveal() {
    const td = UI.teamRevealData;
    const pw = SW * 0.85, ph = 160;
    const px = (SW - pw) / 2, py = (SH - ph) / 2;
    roundRect(px, py, pw, ph, 14, CLR.panel, '#4a8a5a');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#9ff';
    ctx.font = font(14, true);
    ctx.fillText('阵营公布', SW / 2, py + 12);
    ctx.font = font(12);
    ctx.fillStyle = '#f90';
    ctx.textAlign = 'left';
    ctx.fillText(`抓分方：${td.atkNames}`, px + 18, py + 42);
    ctx.fillStyle = '#4af';
    ctx.fillText(`守分方：${td.defNames}`, px + 18, py + 66);
    ctx.fillStyle = '#fff';
    ctx.fillText(`你是 ${td.playerSide}，队友：${td.teammate || '无'}`, px + 18, py + 92);
    addBtn('closeTeam', (SW - 68) / 2, py + ph - 40, 68, 30, '确定', CLR.green);
  },

  // ---- 菜单弹框 ----
  _drawMenuPanel() {
    // 半透明遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, SW, SH);

    const pw    = Math.min(SW * 0.75, 280);
    const itemH = 46;   // 每个按钮的高度
    const gap   = 8;    // 按钮间距
    const pad   = 16;   // 内边距（上下左右）
    const titleH = 28;  // 标题区高度（包含标题文字）

    // 构建菜单项
    const items = [];
    // 查看底牌（仅最后换底玩家且底牌存在时显示）
    const kittyOwner = S.kittyOwner !== -1 ? S.kittyOwner : S.caller;
    if (kittyOwner === 0 && S.kitty && S.kitty.length && S.phase === 'playing') {
      items.push({ id: 'menu_kitty', label: '查看底牌' });
    }
    items.push({ id: 'menu_hist',  label: '历史记录' });
    if (S.phase !== 'idle') {
      items.push({ id: 'menu_lobby', label: '返回大厅', danger: true });
    }
    items.push({ id: 'menu_close', label: '取消', gray: true });

    // 精确计算弹框高度：上内边距 + 标题 + 间距 + 按钮区 + 下内边距
    const btnsH = items.length * itemH + Math.max(0, items.length - 1) * gap;
    const ph = pad + titleH + gap + btnsH + pad;

    const px = (SW - pw) / 2;
    const py = Math.max(20, (SH - ph) / 2);
    roundRect(px, py, pw, ph, 14, CLR.panel, '#4a8a5a');

    // 标题
    ctx.fillStyle = '#9ff';
    ctx.font = font(15, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('菜单', SW / 2, py + pad + titleH / 2);

    // 分割线
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + pad, py + pad + titleH + gap / 2);
    ctx.lineTo(px + pw - pad, py + pad + titleH + gap / 2);
    ctx.stroke();

    // 按钮列表
    const btnsTop = py + pad + titleH + gap;
    items.forEach((item, i) => {
      const by  = btnsTop + i * (itemH + gap);
      const clr = item.gray  ? CLR.gray
                : item.danger ? CLR.darkRed
                : CLR.blue;
      addBtn(item.id, px + pad, by, pw - pad * 2, itemH, item.label, clr);
    });
  },

  // ---- 查看底牌弹框 ----
  _drawKittyView(d) {
    const { cw, ch } = d;
    const kitty = S.kitty || [];
    if (!kitty.length) return;

    // 遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, SW, SH);

    const pad    = 16;
    const titleH = 32;
    const btnH   = 40;
    const cols   = Math.min(kitty.length, Math.floor((SW * 0.9 - pad * 2) / (cw + 8)));
    const rows   = Math.ceil(kitty.length / cols);
    const cardsAreaH = rows * (ch + 8) - 8;
    const pw = Math.min(SW * 0.9, cols * (cw + 8) - 8 + pad * 2);
    const ph = pad + titleH + 10 + cardsAreaH + 12 + btnH + pad;
    const px = (SW - pw) / 2;
    const py = Math.max(8, (SH - ph) / 2);

    roundRect(px, py, pw, ph, 14, CLR.panel, '#4a8a5a');

    // 标题
    ctx.fillStyle = '#9ff';
    ctx.font = font(14, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('底牌', SW / 2, py + pad + titleH / 2);

    // 牌
    const cardsTop = py + pad + titleH + 10;
    let xi = 0, yi = 0;
    for (const c of kitty) {
      const cx2 = px + pad + xi * (cw + 8);
      const cy2 = cardsTop + yi * (ch + 8);
      drawCard(cx2, cy2, cw, ch, c);
      xi++;
      if (xi >= cols) { xi = 0; yi++; }
    }

    // 取消按钮
    const btnY = cardsTop + rows * (ch + 8) - 8 + 12;
    addBtn('closeKittyView', (SW - 100) / 2, btnY, 100, btnH, '关闭', CLR.gray);
  },
};

// =====================================================
//  事件处理
// =====================================================
function handleEvent(type, data) {
  switch (type) {
    case 'gameStart':
      UI.scene = 'game';
      UI.selectedCards.clear();
      UI.playedHist = [[], [], [], []];
      UI.teamInfo = null;  // 每局开始清除阵营行
      UI.roundLeader = -1;
      Render.draw();
      break;
    case 'dealCard':
      Render.draw();
      break;
    case 'updateCallBtn':
      Render.draw();
      break;
    case 'dealEnd':
      // 发牌完成后对玩家0手牌按主牌/花色排序
      if (S.ps[0] && S.ps[0].hand.length) G.sortHand(S.ps[0].hand);
      Render.draw();
      break;
    case 'called':
      // 叫主后主花色确定，重新排序手牌
      if (S.ps[0] && S.ps[0].hand.length) G.sortHand(S.ps[0].hand);
      UI.modal = null;
      Render.draw();
      break;
    case 'showMsg':
      UI.msgText = data.text;
      if (UI.msgTimer) clearTimeout(UI.msgTimer);
      UI.msgTimer = setTimeout(() => {
        UI.msgText = '';
        if (data.cb) data.cb();
        Render.draw();
      }, data.dur || 2000);
      Render.draw();
      break;
    case 'counterTurnStart': {
      const pName = S.ps[data.p]?.name || `玩家${data.p}`;
      UI.msgText = `询问 ${pName} 是否反主…`;
      if (UI.msgTimer) clearTimeout(UI.msgTimer);
      // 消息显示到反主结束后自动清除
      UI.msgTimer = setTimeout(() => { UI.msgText = ''; Render.draw(); }, 6000);
      Render.draw();
      break;
    }
    case 'showCounterUI':
      UI.counterUI = true;
      UI.counterOpts = data.opts;
      Render.draw();
      break;
    case 'counterCountdown':
      UI.counterRemain = data.remain;
      Render.draw();
      break;
    case 'hideCounterUI':
      UI.counterUI = false;
      UI.counterModal = false;
      if (UI.msgTimer) clearTimeout(UI.msgTimer);
      UI.msgText = '';
      Render.draw();
      break;
    case 'counterTurnEnd':
      UI.counterUI = false;
      if (UI.msgTimer) clearTimeout(UI.msgTimer);
      UI.msgText = '';
      Render.draw();
      break;
    case 'countered':
      Render.draw();
      break;
    case 'startKittyExchange':
      UI.scene = 'kitty';
      UI.kittyAllCards = [...data.hand];
      UI.kittySelIdx.clear();
      UI.kittyScrollY = 0;
      UI._kittyScrollBase = 0;
      UI.kittyCanSell = data.canSell;
      UI.kittyPhaseLabel = data.phase === 'counter' ? `反主换底（请选 ${KITTY} 张）` : `叫主换底（请选 ${KITTY} 张）`;
      Render.draw();
      break;
    case 'kittyConfirmed':
      UI.scene = 'game';
      UI.kittySelIdx.clear();
      Render.draw();
      break;
    case 'aiKittyDone':
      Render.draw();
      break;
    case 'trySell':
      Render.draw();
      break;
    case 'sellResult':
      if (!data.ok) {
        UI.modal = { type: 'sellFail' };
      }
      Render.draw();
      break;
    case 'sellFailed':
      UI.modal = { type: 'sellFail' };
      Render.draw();
      break;
    case 'revealCalledCard':
      {
        const cname = S.ps[data.caller]?.name || '-';
        UI.msgText = `${cname} 叫主：${data.card || '国主'}`;
        if (UI.msgTimer) clearTimeout(UI.msgTimer);
        UI.msgTimer = setTimeout(() => { UI.msgText = ''; Render.draw(); }, 3200);
        Render.draw();
      }
      break;
    case 'gameUpdate':
      Render.draw();
      break;
    case 'showPlayBtns':
      UI.selectedCards.clear();
      Render.draw();
      break;
    case 'autoSelectCards':
      {
        const h = S.ps[0].hand;
        UI.selectedCards.clear();
        for (const c of data.cards) {
          const idx = h.indexOf(c);
          if (idx !== -1) UI.selectedCards.add(idx);
        }
        Render.draw();
      }
      break;
    case 'cardsPlayed':
      UI.selectedCards.clear();
      // 记录本轮先手玩家（isLead=true 表示该玩家是本轮首出）
      if (data.isLead) UI.roundLeader = data.p;
      // 追加到累积出牌历史
      if (!UI.playedHist) UI.playedHist = [[], [], [], []];
      UI.playedHist[data.p].push(...data.cards);
      UI.zoomCards = data.cards;
      UI.zoomName  = data.p === 0 ? '你' : S.ps[data.p].name;
      if (UI.zoomTimer) clearTimeout(UI.zoomTimer);
      UI.zoomTimer = setTimeout(() => { UI.zoomCards = []; Render.draw(); }, 2000);
      Render.draw();
      break;
    case 'roundEnd':
      Render.draw();
      break;
    case 'teamReveal':
      {
        const atkNames = data.attackers.map(i => (i === 0 ? '你' : S.ps[i].name)).join('、');
        const defNames = data.defenders.map(i => (i === 0 ? '你' : S.ps[i].name)).join('、');
        const isAttacker = data.attackers.includes(0);
        const playerSide = isAttacker ? '抓分方' : '守分方';
        const teammate = isAttacker
          ? data.attackers.filter(i => i !== 0).map(i => S.ps[i].name).join('、')
          : data.defenders.filter(i => i !== 0).map(i => S.ps[i].name).join('、');
        UI.teamRevealData = { atkNames, defNames, playerSide, teammate };
        // 持久保存到信息栏
        UI.teamInfo = { side: playerSide, teammate: teammate || '无', isAttacker };
        Render.draw();
      }
      break;
    case 'settle':
      UI.scene = 'settle';
      UI.settleData = data;
      Render.draw();
      break;
    case 'settleNoCall':
      UI.scene = 'settle';
      UI.settleData = { sc: 0, atkN: '-', defN: '-', kb: 0, multiplier: 1, txt: '无人叫主，本局无效', cls: 'rLose', chips: '-', playerRec: null };
      Render.draw();
      break;
    case 'nextGame':
      UI.scene = 'game';
      UI.settleData = null;
      UI.selectedCards.clear();
      UI.playedHist = [[], [], [], []];
      UI.roundLeader = -1;
      Render.draw();
      break;
  }
}

// =====================================================
//  触摸事件处理（含拖拽支持）
// =====================================================
function hitDraggable(tx, ty) {
  // 检查是否命中可拖拽面板（优先级：菜单 > 倍数标签 > 信息栏）
  if (Render._menuRect) {
    const r = Render._menuRect;
    if (tx >= r.x && tx <= r.x + r.w && ty >= r.y && ty <= r.y + r.h)
      return { panel: 'menu', offX: tx - r.x, offY: ty - r.y };
  }
  if (Render._multRect) {
    const r = Render._multRect;
    if (tx >= r.x && tx <= r.x + r.w && ty >= r.y && ty <= r.y + r.h)
      return { panel: 'mult', offX: tx - r.x, offY: ty - r.y };
  }
  if (Render._infoRect) {
    const r = Render._infoRect;
    if (tx >= r.x && tx <= r.x + r.w && ty >= r.y && ty <= r.y + r.h)
      return { panel: 'info', offX: tx - r.x, offY: ty - r.y };
  }
  return null;
}

// =====================================================
//  触摸事件（使用 wx 全局 API 兼容真机）
// =====================================================
wx.onTouchStart(e => {
  const t = e.touches[0];
  UI.touchStartX = t.clientX;
  UI.touchStartY = t.clientY;
  const hit = hitDraggable(t.clientX, t.clientY);
  if (hit) UI.drag = hit;
});

wx.onTouchMove(e => {
  const t = e.touches[0];
  if (UI.drag) {
    const nx = t.clientX - UI.drag.offX;
    const ny = t.clientY - UI.drag.offY;
    if (UI.drag.panel === 'info') {
      UI.infoPos.x = nx; UI.infoPos.y = ny;
    } else if (UI.drag.panel === 'mult') {
      UI.multPos.x = nx; UI.multPos.y = ny;
    } else if (UI.drag.panel === 'menu') {
      UI.menuPos.x = nx; UI.menuPos.y = ny;
    }
    Render.draw();
    return;
  }
  // 换底弹框内滚动
  if (UI.scene === 'kitty') {
    const dy = UI.touchStartY - t.clientY;
    const maxScroll = Render._kittyMaxScroll || 0;
    UI.kittyScrollY = Math.max(0, Math.min(maxScroll, (UI._kittyScrollBase || 0) + dy));
    Render.draw();
  }
  // 历史记录滚动（实时）
  if (UI.scene === 'history') {
    const dy = t.clientY - UI.touchStartY;
    UI.histScrollY = Math.max(0, (UI._histScrollBase || 0) - dy);
    Render.draw();
  }
});

wx.onTouchEnd(e => {
  UI._kittyScrollBase = UI.kittyScrollY;
  UI._histScrollBase  = UI.histScrollY;
  const t = e.changedTouches[0];
  const tx = t.clientX, ty = t.clientY;
  const dx = tx - UI.touchStartX, dy = ty - UI.touchStartY;
  const moved = Math.abs(dx) > 8 || Math.abs(dy) > 8;

  if (UI.drag) {
    UI.drag = null;
    if (!moved) handleTap(tx, ty);
    return;
  }

  if (moved) return;
  handleTap(tx, ty);
});

function handleTap(tx, ty) {
  // 先检查按钮
  const btnId = hitBtn(tx, ty);
  if (btnId) {
    handleBtnTap(btnId);
    return;
  }

  // 点击遮罩关闭菜单弹框
  if (UI.menuOpen) {
    UI.menuOpen = false;
    Render.draw();
    return;
  }


  // 叫主弹框牌点击
  if (UI.modal && UI.modal.type === 'call' && Render._callCardRects) {
    for (const r of Render._callCardRects) {
      if (tx >= r.x && tx <= r.x + r.w && ty >= r.y && ty <= r.y + r.h) {
        G.humanCall(r.card);
        UI.modal = null;
        return;
      }
    }
  }

  // 换底牌选择
  if (UI.scene === 'kitty' && Render._kittyCardRects) {
    for (const r of Render._kittyCardRects) {
      if (tx >= r.x && tx <= r.x + r.w && ty >= r.y && ty <= r.y + r.h) {
        if (UI.kittySelIdx.has(r.idx)) UI.kittySelIdx.delete(r.idx);
        else if (UI.kittySelIdx.size < KITTY) UI.kittySelIdx.add(r.idx);
        Render.draw();
        return;
      }
    }
  }

  // 玩家手牌选择
  if (S.phase === 'playing' && S.curP === 0 && Render._handCardRects) {
    for (const r of Render._handCardRects) {
      if (tx >= r.x && tx <= r.x + r.w && ty >= r.y && ty <= r.y + r.h) {
        if (UI.selectedCards.has(r.idx)) UI.selectedCards.delete(r.idx);
        else UI.selectedCards.add(r.idx);
        Render.draw();
        return;
      }
    }
  }

  // 发牌阶段点击可叫主牌
  if (S.phase === 'dealing' && S.caller === -1 && Render._handCardRects) {
    for (const r of Render._handCardRects) {
      if (tx >= r.x && tx <= r.x + r.w && ty >= r.y && ty <= r.y + r.h) {
        const card = S.ps[0].hand[r.idx];
        if (card.endsWith('7') || card === 'BJ' || card === 'SJ') {
          UI.callableCards = S.ps[0].hand.filter(c => c.endsWith('7') || c === 'BJ' || c === 'SJ');
          UI.modal = { type: 'call' };
          Render.draw();
        }
        return;
      }
    }
  }
}

function handleBtnTap(id) {
  if (id === 'start') {
    G.start();
    return;
  }
  if (id.startsWith('mode_')) {
    const modeMap = { adv: 'advanced', mid: 'medium', bas: 'basic' };
    UI.robotMode = modeMap[id.slice(5)] || 'basic';
    GameGlobal.RobotAI.setMode(UI.robotMode);
    UI.scene = 'game';
    G.start();
    return;
  }
  if (id === 'call') {
    UI.callableCards = S.ps[0].hand.filter(c => c.endsWith('7') || c === 'BJ' || c === 'SJ');
    UI.modal = { type: 'call' };
    Render.draw();
    return;
  }
  if (id === 'closeCall') {
    UI.modal = null;
    Render.draw();
    return;
  }
  if (id === 'play') {
    const cards = [...UI.selectedCards].map(i => S.ps[0].hand[i]);
    G.humanPlay(cards);
    return;
  }
  if (id === 'pass') {
    const cards = [...UI.selectedCards].map(i => S.ps[0].hand[i]);
    G.humanPass(cards);
    return;
  }
  if (id === 'counter') {
    UI.counterModal = true;
    Render.draw();
    return;
  }
  if (id.startsWith('counter_')) {
    const idx = parseInt(id.slice(8));
    UI.counterModal = false;
    G.doCounter(UI.counterOpts[idx]);
    return;
  }
  if (id === 'closeCounter') {
    UI.counterModal = false;
    Render.draw();
    return;
  }
  if (id === 'skip') {
    G.skipCounter();
    return;
  }
  if (id === 'confirmKitty') {
    G.confirmKitty(UI.kittySelIdx, UI.kittyAllCards);
    return;
  }
  if (id === 'sell') {
    G.trySell(UI.kittySelIdx, UI.kittyAllCards);
    return;
  }
  if (id === 'sellCont') {
    UI.modal = null;
    G.sellFailContinue();
    return;
  }
  if (id === 'sellQuit') {
    UI.modal = null;
    G.sellFailQuit();
    return;
  }
  if (id === 'nextgame' || id === 'nextgame2') {
    G.nextGame();
    G.start();
    return;
  }
  if (id === 'hist' || id === 'hist2') {
    UI.scene = 'history';
    UI.histScrollY = 0;
    Render.draw();
    return;
  }
  if (id === 'closeHist') {
    UI.scene = S.phase === 'idle' ? 'lobby' : (UI.settleData ? 'settle' : 'game');
    Render.draw();
    return;
  }
  if (id === 'menu') {
    UI.menuOpen = true;
    Render.draw();
    return;
  }
  if (id === 'menu_close') {
    UI.menuOpen = false;
    Render.draw();
    return;
  }
  if (id === 'menu_kitty') {
    UI.menuOpen = false;
    UI.kittyViewOpen = true;
    Render.draw();
    return;
  }
  if (id === 'closeKittyView') {
    UI.kittyViewOpen = false;
    Render.draw();
    return;
  }
  if (id === 'menu_hist') {
    UI.menuOpen = false;
    UI.scene = 'history';
    UI.histScrollY = 0;
    Render.draw();
    return;
  }
  if (id === 'menu_lobby') {
    UI.menuOpen = false;
    UI.scene = 'lobby';
    Render.draw();
    return;
  }
  if (id === 'closeTeam') {
    UI.teamRevealData = null;
    Render.draw();
    return;
  }
}

// =====================================================
//  初始化
// =====================================================
G.onEvent = handleEvent;

// 初始绘制大厅
UI.scene = 'lobby';
Render.draw();

// 手机切回前台后重绘，防止黑屏
wx.onShow(() => {
  // Canvas 上下文在后台可能被销毁，重新设置尺寸强制刷新
  canvas.width  = SW;
  canvas.height = SH;
  Render.draw();
});
