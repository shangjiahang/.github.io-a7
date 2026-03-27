// =====================================================
//  黄梅暗7 — 微信小游戏入口
//  game.js 是小游戏的逻辑主入口（对应 game.json 的入口）
// =====================================================
import { RobotAI } from './js/npc/robot.js';
import './render.js';

// 挂载到全局，供 render.js 直接访问
GameGlobal.RobotAI = RobotAI;
