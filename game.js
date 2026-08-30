// ============================================
// 转刀大师 - PingDao 复刻版
// 基于 HTML5 Canvas
// ============================================

(function () {
    'use strict';

    // ===== 全局变量 =====
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');

    // 游戏世界尺寸（逻辑坐标）- 大地图
    const WORLD_WIDTH = 2400;
    const WORLD_HEIGHT = 1600;

    // 视口（摄像机）
    const camera = {
        x: 0,
        y: 0,
        // 视口宽高在 resizeCanvas 中设置
        viewW: 960,
        viewH: 600,
        targetX: 0,
        targetY: 0
    };

    // 适配屏幕
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let isRotated = false; // 当前是否处于竖屏旋转模式

    // 检测屏幕方向：手机端竖屏时自动将游戏容器旋转90°横屏显示
    function checkOrientation() {
        const container = document.getElementById('game-container');
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 'ontouchstart' in window;
        // 仅手机端 + 物理竖屏时触发旋转
        const isPortrait = window.innerHeight > window.innerWidth;

        if (isMobile && isPortrait) {
            container.classList.add('rotate-portrait');
            isRotated = true;
        } else {
            container.classList.remove('rotate-portrait');
            isRotated = false;
        }
    }

    function resizeCanvas() {
        // 先检测方向，确保容器尺寸正确
        checkOrientation();

        const container = document.getElementById('game-container');
        const cw = container.clientWidth;
        const ch = container.clientHeight;

        canvas.width = cw;
        canvas.height = ch;

        // 视口尺寸 = 屏幕逻辑尺寸
        camera.viewW = cw;
        camera.viewH = ch;

        // 直接1:1映射，不再整体缩放（大地图用摄像机跟随）
        scale = 1;
        offsetX = 0;
        offsetY = 0;
    }

    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', resizeCanvas);

    // ===== 游戏状态 =====
    const GameState = {
        LOADING: 'loading',
        START: 'start',
        PLAYING: 'playing',
        UPGRADE: 'upgrade',
        GAMEOVER: 'gameover'
    };

    let gameState = GameState.LOADING;
    let lastTime = 0;
    let gameTime = 0; // 游戏内时间（秒）

    // ===== 输入 =====
    const input = {
        moveX: 0,
        moveY: 0,
        keys: {},
        joystickActive: false,
        joystickDX: 0,
        joystickDY: 0
    };

    // 键盘
    window.addEventListener('keydown', (e) => {
        input.keys[e.key.toLowerCase()] = true;
        e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
        input.keys[e.key.toLowerCase()] = false;
        e.preventDefault();
    });

    // 虚拟摇杆（浮动式：触屏任意位置生成摇杆）
    const joystick = document.getElementById('joystick');
    const joystickKnob = document.getElementById('joystick-knob');
    const ultBtn = document.getElementById('ult-btn');
    let joystickTouchId = null;
    let joystickCenterX = 0, joystickCenterY = 0;
    const JOY_RADIUS = 50; // 摇杆最大拖动半径

    function isMobile() {
        return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 'ontouchstart' in window;
    }

    // 竖屏旋转模式下，将物理屏幕坐标转换为游戏逻辑坐标
    function getLogicalCoords(clientX, clientY) {
        if (!isRotated) return { x: clientX, y: clientY };
        // 容器 rotate(90deg) 后，逻辑坐标 = (clientY, window.innerWidth - clientX)
        return { x: clientY, y: window.innerWidth - clientX };
    }

    function initJoystick() {
        if (!isMobile()) return;

        // 浮动摇杆：监听整个游戏容器的 touchstart
        const gameContainer = document.getElementById('game-container');

        gameContainer.addEventListener('touchstart', (e) => {
            if (gameState !== GameState.PLAYING) return;
            e.preventDefault();

            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                // 跳过大招按钮的触摸
                if (touch.target === ultBtn || ultBtn.contains(touch.target)) continue;

                // 第一个有效触摸作为摇杆
                if (joystickTouchId === null) {
                    joystickTouchId = touch.identifier;
                    const pos = getLogicalCoords(touch.clientX, touch.clientY);
                    joystickCenterX = pos.x;
                    joystickCenterY = pos.y;

                    // 将摇杆显示在触摸点（逻辑坐标）
                    joystick.style.display = 'block';
                    joystick.style.left = (pos.x - 60) + 'px';
                    joystick.style.top = (pos.y - 60) + 'px';
                    joystickKnob.style.transform = 'translate(-50%, -50%)';
                }
            }
        }, { passive: false });

        gameContainer.addEventListener('touchmove', (e) => {
            if (gameState !== GameState.PLAYING) return;
            e.preventDefault();

            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                if (touch.identifier === joystickTouchId) {
                    const pos = getLogicalCoords(touch.clientX, touch.clientY);
                    let dx = pos.x - joystickCenterX;
                    let dy = pos.y - joystickCenterY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > JOY_RADIUS) {
                        dx = (dx / dist) * JOY_RADIUS;
                        dy = (dy / dist) * JOY_RADIUS;
                    }
                    joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
                    input.joystickDX = dx / JOY_RADIUS;
                    input.joystickDY = dy / JOY_RADIUS;
                    input.joystickActive = true;
                }
            }
        }, { passive: false });

        gameContainer.addEventListener('touchend', (e) => {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === joystickTouchId) {
                    joystickTouchId = null;
                    input.joystickDX = 0;
                    input.joystickDY = 0;
                    input.joystickActive = false;
                    joystick.style.display = 'none';
                }
            }
        }, { passive: false });

        gameContainer.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === joystickTouchId) {
                    joystickTouchId = null;
                    input.joystickDX = 0;
                    input.joystickDY = 0;
                    input.joystickActive = false;
                    joystick.style.display = 'none';
                }
            }
        }, { passive: false });

        // 大招按钮触控
        ultBtn.style.display = 'flex';

        ultBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (player.energy >= player.maxEnergy && !player.ultActive) {
                player.activateUltimate();
            }
        }, { passive: false });

        // 也支持点击（非触屏设备调试用）
        ultBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (player.energy >= player.maxEnergy && !player.ultActive) {
                player.activateUltimate();
            }
        });
    }

    // ===== 工具函数 =====
    function dist(x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function rand(min, max) {
        return min + Math.random() * (max - min);
    }

    function randInt(min, max) {
        return Math.floor(rand(min, max + 1));
    }

    // ===== 玩家 =====
    const player = {
        x: WORLD_WIDTH / 2,
        y: WORLD_HEIGHT / 2,
        radius: 18,
        speed: 150, // 像素/秒
        hp: 100,
        maxHp: 100,
        level: 1,
        exp: 0,
        expNeeded: 10,
        kills: 0,

        // 飞刀属性
        knifeCount: 1,
        knifeDamage: 10,
        knifeOrbitRadius: 60,
        knifeRotationSpeed: 3, // 弧度/秒
        knifeAngle: 0,
        knifeSize: 22,

        // 其他属性
        expPickupRange: 50,
        hpRegen: 0, // HP/秒

        invincibleTime: 0, // 受击无敌时间

        // Buff状态
        expMagnetTime: 0, // 全图拾取经验buff剩余时间
        invincibleBuffTime: 0, // 无敌buff剩余时间
        slowTime: 0, // 被减速剩余时间
        poisonTime: 0, // 被毒剩余时间

        // 能量条
        energy: 0,
        maxEnergy: 200,
        // 大招状态
        ultActive: false,
        ultTimer: 0,
        ultDuration: 5, // 大招持续 5 秒

        // 被抵消的飞刀：{index, restoreTime}
        disabledKnives: [],

        reset() {
            this.x = WORLD_WIDTH / 2;
            this.y = WORLD_HEIGHT / 2;
            this.speed = 150;
            this.hp = 100;
            this.maxHp = 100;
            this.level = 1;
            this.exp = 0;
            this.expNeeded = 10;
            this.kills = 0;
            this.knifeCount = 1;
            this.knifeDamage = 10;
            this.knifeOrbitRadius = 60;
            this.knifeRotationSpeed = 3;
            this.knifeAngle = 0;
            this.knifeSize = 22;
            this.expPickupRange = 50;
            this.hpRegen = 0;
            this.invincibleTime = 0;
            this.expMagnetTime = 0;
            this.invincibleBuffTime = 0;
            this.slowTime = 0;
        this.poisonTime = 0;
            this.energy = 0;
            this.ultActive = false;
            this.ultTimer = 0;
            this.disabledKnives = [];
            this.equipKnockbackMul = 1;
            this.equipUltDamageMul = 1;
        },

        update(dt) {
            // 移动
            let mx = 0, my = 0;
            if (input.keys['w'] || input.keys['arrowup']) my -= 1;
            if (input.keys['s'] || input.keys['arrowdown']) my += 1;
            if (input.keys['a'] || input.keys['arrowleft']) mx -= 1;
            if (input.keys['d'] || input.keys['arrowright']) mx += 1;

            if (input.joystickActive) {
                mx = input.joystickDX;
                my = input.joystickDY;
            }

            const len = Math.sqrt(mx * mx + my * my);
            if (len > 0) {
                mx /= len;
                my /= len;
            }

            // 减速效果：被冰法师命中时移动速度减半
            const speedMul = this.slowTime > 0 ? 0.5 : 1;
            this.x += mx * this.speed * speedMul * dt;
            this.y += my * this.speed * speedMul * dt;
            this.x = clamp(this.x, this.radius, WORLD_WIDTH - this.radius);
            this.y = clamp(this.y, this.radius, WORLD_HEIGHT - this.radius);

            // 飞刀旋转
            this.knifeAngle += this.knifeRotationSpeed * dt;

            // HP回复
            if (this.hpRegen > 0 && this.hp < this.maxHp) {
                this.hp = Math.min(this.maxHp, this.hp + this.hpRegen * dt);
            }

            // 无敌时间
            if (this.invincibleTime > 0) {
                this.invincibleTime -= dt;
            }

            // Buff计时器递减
            if (this.expMagnetTime > 0) {
                this.expMagnetTime -= dt;
                if (this.expMagnetTime < 0) this.expMagnetTime = 0;
            }
            if (this.invincibleBuffTime > 0) {
                this.invincibleBuffTime -= dt;
                if (this.invincibleBuffTime < 0) this.invincibleBuffTime = 0;
            }
            if (this.slowTime > 0) {
                this.slowTime -= dt;
                if (this.slowTime < 0) this.slowTime = 0;
            }
            if (this.poisonTime > 0) {
                this.poisonTime -= dt;
                if (this.poisonTime < 0) this.poisonTime = 0;
                this.takeDamage(3 * dt); // 每秒3点毒素伤害
            }

            // 恢复被抵消的飞刀
            for (let i = this.disabledKnives.length - 1; i >= 0; i--) {
                this.disabledKnives[i].restoreTime -= dt;
                if (this.disabledKnives[i].restoreTime <= 0) {
                    this.disabledKnives.splice(i, 1);
                }
            }

            // 大招计时
            if (this.ultActive) {
                this.ultTimer -= dt;
                if (this.ultTimer <= 0) {
                    this.ultActive = false;
                }
            }

            // 大招按键
            if ((input.keys[' '] || input.keys['space'] || input.keys['e'] || input.keys['j']) && this.energy >= this.maxEnergy && !this.ultActive) {
                this.activateUltimate();
            }
        },

        activateUltimate() {
            this.energy = 0;
            this.ultActive = true;
            this.ultTimer = 1.2; // 激光持续 1.2 秒
            this.invincibleTime = 1.5;
            screenShake = 20;
            playUltimateSound();
            speakSkillName('六脉神剑');
            addDamageText(this.x, this.y - 40, '六脉神剑!', '#00ffff');
            // 全屏激光伤害
            const ultMul = this.equipUltDamageMul || 1;
            const laserDamage = (200 + player.level * 20) * ultMul;
            // 对所有敌人造成伤害
            for (let i = enemies.length - 1; i >= 0; i--) {
                const e = enemies[i];
                e.hp -= laserDamage;
                if (e.hp <= 0) {
                    spawnExpOrb(e.x, e.y, e.expDrop);
                    player.gainEnergy(8);
                    player.kills++;
                    enemies.splice(i, 1);
                }
            }
            // 对所有Boss造成伤害
            for (const b of bosses) {
                b.hp -= laserDamage;
                b.hitFlash = 0.3;
                addDamageText(b.x, b.y - b.radius - 5, '-' + laserDamage, '#00ffff');
            }
            // 打破所有宝箱
            for (const c of chests) {
                if (!c.opened) {
                    c.hp -= laserDamage;
                }
            }
        },

        gainEnergy(amount) {
            if (this.ultActive) return; // 大招期间不攒能量
            this.energy = Math.min(this.maxEnergy, this.energy + amount);
        },

        getKnifePositions() {
            const positions = [];
            // 构建被禁用的索引集合
            const disabledSet = new Set();
            for (const d of this.disabledKnives) disabledSet.add(d.index);
            let activeCount = 0;
            for (let i = 0; i < this.knifeCount; i++) {
                if (disabledSet.has(i)) continue;
                activeCount++;
            }
            if (activeCount === 0) return positions; // 全部被抵消
            for (let i = 0; i < this.knifeCount; i++) {
                if (disabledSet.has(i)) continue;
                const angle = this.knifeAngle + (activeCount > 0 ? (positions.length * Math.PI * 2 / activeCount) : 0);
                const kx = this.x + Math.cos(angle) * this.knifeOrbitRadius;
                const ky = this.y + Math.sin(angle) * this.knifeOrbitRadius;
                positions.push({ x: kx, y: ky, angle: angle, index: i });
            }
            return positions;
        },

        // 抵消一把飞刀（随机选一把当前活跃的）
        disableKnife() {
            const activeKnives = this.getKnifePositions();
            if (activeKnives.length === 0) return;
            const pick = activeKnives[randInt(0, activeKnives.length - 1)];
            this.disabledKnives.push({ index: pick.index, restoreTime: 3.0 });
        },

        takeDamage(amount) {
            // 无敌buff期间或受击无敌期间均免疫伤害
            if (this.invincibleTime > 0 || this.invincibleBuffTime > 0) return;
            this.hp -= amount;
            this.invincibleTime = 0.5;
            // 受击效果
            screenShake = 8;
            playPlayerHurtSound();
            if (this.hp <= 0) {
                this.hp = 0;
                gameOver();
            }
        },

        gainExp(amount) {
            this.exp += amount;
            while (this.exp >= this.expNeeded) {
                this.exp -= this.expNeeded;
                this.level++;
                this.expNeeded = Math.floor(10 + this.level * 5 + this.level * this.level * 0.5);
                playLevelUpSound();
                triggerUpgrade();
            }
        },

        draw(ctx) {
            // 玩家身体 - 二次元美少女
            const blink = this.invincibleTime > 0 && Math.floor(this.invincibleTime * 20) % 2 === 0;

            ctx.save();
            if (blink) ctx.globalAlpha = 0.4;

            const px = this.x;
            const py = this.y;
            const r = this.radius;

            // === 阴影 ===
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(px, py + r - 2, r, r * 0.3, 0, 0, Math.PI * 2);
            ctx.fill();

            // === 移动方向朝向（用于身体微微倾斜） ===
            const moveAngle = Math.atan2(this.vy, this.vx);
            const isMoving = (this.vx !== 0 || this.vy !== 0);
            const lean = isMoving ? Math.sin(gameTime * 8) * 2 : 0;

            // === 裙摆（先画，在身体下层） ===
            ctx.fillStyle = '#DC143C'; // 深红色百褶裙
            ctx.strokeStyle = '#8B0000';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            // 裙摆为扇形
            const skirtTop = py + r * 0.1;
            const skirtBot = py + r * 0.85;
            const skirtW = r * 0.95;
            ctx.moveTo(px - skirtW * 0.5, skirtTop);
            ctx.quadraticCurveTo(px - skirtW, skirtBot - r * 0.1, px - skirtW * 0.7 + lean, skirtBot);
            // 百褶裙褶皱
            for (let i = 0; i < 5; i++) {
                const t = (i + 1) / 6;
                const cx = px - skirtW * 0.5 + skirtW * t;
                ctx.lineTo(cx, skirtBot - r * 0.08);
                ctx.lineTo(cx + r * 0.06, skirtBot);
            }
            ctx.lineTo(px + skirtW * 0.7 + lean, skirtBot);
            ctx.quadraticCurveTo(px + skirtW, skirtBot - r * 0.1, px + skirtW * 0.5, skirtTop);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // 裙摆白色蕾丝边
            ctx.strokeStyle = '#FFF0F5';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px - skirtW * 0.7 + lean, skirtBot);
            for (let i = 0; i <= 6; i++) {
                const t = i / 6;
                const cx = px - skirtW * 0.7 + lean + (skirtW * 1.4) * t;
                ctx.lineTo(cx, skirtBot);
            }
            ctx.stroke();

            // === 身体（上衣） ===
            ctx.fillStyle = '#FFFFFF'; // 白色上衣
            ctx.strokeStyle = '#C0C0C0';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.ellipse(px, py + r * 0.05, r * 0.5, r * 0.45, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // 衣领红色蝴蝶结
            ctx.fillStyle = '#FF1744';
            ctx.beginPath();
            ctx.moveTo(px, py - r * 0.2);
            ctx.lineTo(px - r * 0.25, py - r * 0.35);
            ctx.lineTo(px - r * 0.15, py - r * 0.15);
            ctx.lineTo(px + r * 0.15, py - r * 0.15);
            ctx.lineTo(px + r * 0.25, py - r * 0.35);
            ctx.closePath();
            ctx.fill();
            // 蝴蝶结中心
            ctx.fillStyle = '#C62828';
            ctx.beginPath();
            ctx.arc(px, py - r * 0.22, r * 0.06, 0, Math.PI * 2);
            ctx.fill();

            // === 头部 ===
            const headY = py - r * 0.45;
            const headR = r * 0.52;

            // 后发（长发垂在身后）
            ctx.fillStyle = '#FFD54F'; // 金色长发
            ctx.strokeStyle = '#F9A825';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            // 后发从头部两侧延伸到腰部
            ctx.moveTo(px - headR * 0.8, headY - headR * 0.2);
            ctx.quadraticCurveTo(px - headR * 1.3, headY + headR * 0.5, px - headR * 1.1, py + r * 0.5);
            ctx.quadraticCurveTo(px - headR * 0.9, py + r * 0.7, px - headR * 0.5, py + r * 0.3);
            ctx.lineTo(px - headR * 0.4, headY + headR * 0.3);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(px + headR * 0.8, headY - headR * 0.2);
            ctx.quadraticCurveTo(px + headR * 1.3, headY + headR * 0.5, px + headR * 1.1, py + r * 0.5);
            ctx.quadraticCurveTo(px + headR * 0.9, py + r * 0.7, px + headR * 0.5, py + r * 0.3);
            ctx.lineTo(px + headR * 0.4, headY + headR * 0.3);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // 脸部
            ctx.fillStyle = '#FFEFD5'; // 肤色
            ctx.beginPath();
            ctx.arc(px, headY, headR, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#F0D0B0';
            ctx.lineWidth = 1;
            ctx.stroke();

            // 前发（刘海）
            ctx.fillStyle = '#FFD54F';
            ctx.strokeStyle = '#F9A825';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(px, headY - headR * 0.15, headR * 1.05, Math.PI * 1.1, Math.PI * 1.9);
            ctx.lineTo(px + headR * 0.3, headY - headR * 0.3);
            ctx.quadraticCurveTo(px + headR * 0.1, headY - headR * 0.1, px, headY - headR * 0.15);
            ctx.quadraticCurveTo(px - headR * 0.2, headY - headR * 0.05, px - headR * 0.4, headY - headR * 0.25);
            ctx.quadraticCurveTo(px - headR * 0.6, headY - headR * 0.4, px - headR * 0.3, headY - headR * 0.55);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // 双马尾装饰缎带（左侧）
            ctx.fillStyle = '#FF1744';
            ctx.beginPath();
            ctx.ellipse(px - headR * 0.85, headY - headR * 0.3, r * 0.08, r * 0.15, -0.3, 0, Math.PI * 2);
            ctx.fill();
            // 双马尾装饰缎带（右侧）
            ctx.beginPath();
            ctx.ellipse(px + headR * 0.85, headY - headR * 0.3, r * 0.08, r * 0.15, 0.3, 0, Math.PI * 2);
            ctx.fill();

            // === 眼睛（大眼睛，带高光） ===
            const eyeY = headY + headR * 0.05;
            const eyeSpacing = headR * 0.4;

            // 左眼白色
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.ellipse(px - eyeSpacing, eyeY, headR * 0.18, headR * 0.22, 0, 0, Math.PI * 2);
            ctx.fill();
            // 右眼白色
            ctx.beginPath();
            ctx.ellipse(px + eyeSpacing, eyeY, headR * 0.18, headR * 0.22, 0, 0, Math.PI * 2);
            ctx.fill();

            // 左眼瞳孔（蓝色渐变）
            const eyeGradL = ctx.createRadialGradient(px - eyeSpacing, eyeY, 0, px - eyeSpacing, eyeY, headR * 0.18);
            eyeGradL.addColorStop(0, '#42A5F5');
            eyeGradL.addColorStop(0.6, '#1565C0');
            eyeGradL.addColorStop(1, '#0D47A1');
            ctx.fillStyle = eyeGradL;
            ctx.beginPath();
            ctx.arc(px - eyeSpacing, eyeY, headR * 0.13, 0, Math.PI * 2);
            ctx.fill();

            // 右眼瞳孔
            const eyeGradR = ctx.createRadialGradient(px + eyeSpacing, eyeY, 0, px + eyeSpacing, eyeY, headR * 0.18);
            eyeGradR.addColorStop(0, '#42A5F5');
            eyeGradR.addColorStop(0.6, '#1565C0');
            eyeGradR.addColorStop(1, '#0D47A1');
            ctx.fillStyle = eyeGradR;
            ctx.beginPath();
            ctx.arc(px + eyeSpacing, eyeY, headR * 0.13, 0, Math.PI * 2);
            ctx.fill();

            // 眼睛高光
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath();
            ctx.arc(px - eyeSpacing + headR * 0.05, eyeY - headR * 0.05, headR * 0.05, 0, Math.PI * 2);
            ctx.arc(px + eyeSpacing + headR * 0.05, eyeY - headR * 0.05, headR * 0.05, 0, Math.PI * 2);
            ctx.fill();
            // 小高光点
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.beginPath();
            ctx.arc(px - eyeSpacing - headR * 0.03, eyeY + headR * 0.04, headR * 0.025, 0, Math.PI * 2);
            ctx.arc(px + eyeSpacing - headR * 0.03, eyeY + headR * 0.04, headR * 0.025, 0, Math.PI * 2);
            ctx.fill();

            // 眉毛
            ctx.strokeStyle = '#D4A017';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(px - eyeSpacing - headR * 0.12, eyeY - headR * 0.2);
            ctx.quadraticCurveTo(px - eyeSpacing, eyeY - headR * 0.25, px - eyeSpacing + headR * 0.12, eyeY - headR * 0.18);
            ctx.moveTo(px + eyeSpacing - headR * 0.12, eyeY - headR * 0.18);
            ctx.quadraticCurveTo(px + eyeSpacing, eyeY - headR * 0.25, px + eyeSpacing + headR * 0.12, eyeY - headR * 0.2);
            ctx.stroke();

            // 腮红
            ctx.fillStyle = 'rgba(255,105,180,0.35)';
            ctx.beginPath();
            ctx.ellipse(px - headR * 0.55, eyeY + headR * 0.25, headR * 0.12, headR * 0.08, 0, 0, Math.PI * 2);
            ctx.ellipse(px + headR * 0.55, eyeY + headR * 0.25, headR * 0.12, headR * 0.08, 0, 0, Math.PI * 2);
            ctx.fill();

            // 嘴巴（小微笑）
            ctx.strokeStyle = '#E75480';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(px, headY + headR * 0.35, headR * 0.1, 0.2, Math.PI - 0.2);
            ctx.stroke();

            // === 手臂（简单线条表示） ===
            ctx.strokeStyle = '#FFEFD5';
            ctx.lineWidth = r * 0.15;
            ctx.lineCap = 'round';
            // 左臂
            ctx.beginPath();
            ctx.moveTo(px - r * 0.4, py - r * 0.05);
            ctx.quadraticCurveTo(px - r * 0.65, py + r * 0.15, px - r * 0.55 + lean * 0.5, py + r * 0.4);
            ctx.stroke();
            // 右臂
            ctx.beginPath();
            ctx.moveTo(px + r * 0.4, py - r * 0.05);
            ctx.quadraticCurveTo(px + r * 0.65, py + r * 0.15, px + r * 0.55 + lean * 0.5, py + r * 0.4);
            ctx.stroke();

            // 无敌buff护盾光环
            if (this.invincibleBuffTime > 0) {
                const shieldR = this.radius + 8 + Math.sin(gameTime * 8) * 2;
                ctx.strokeStyle = `rgba(255, 68, 68, ${0.5 + Math.sin(gameTime * 10) * 0.2})`;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(this.x, this.y, shieldR, 0, Math.PI * 2);
                ctx.stroke();
                // 护盾光晕
                const sGrad = ctx.createRadialGradient(this.x, this.y, this.radius, this.x, this.y, shieldR + 6);
                sGrad.addColorStop(0, 'rgba(255, 68, 68, 0)');
                sGrad.addColorStop(0.8, 'rgba(255, 68, 68, 0.15)');
                sGrad.addColorStop(1, 'rgba(255, 68, 68, 0)');
                ctx.fillStyle = sGrad;
                ctx.beginPath();
                ctx.arc(this.x, this.y, shieldR + 6, 0, Math.PI * 2);
                ctx.fill();
            }

            // 经验磁铁buff光环
            if (this.expMagnetTime > 0) {
                const magnetR = this.radius + 5 + Math.sin(gameTime * 6) * 3;
                ctx.strokeStyle = `rgba(0, 191, 255, ${0.4 + Math.sin(gameTime * 8) * 0.2})`;
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 4]);
                ctx.lineDashOffset = -gameTime * 30;
                ctx.beginPath();
                ctx.arc(this.x, this.y, magnetR, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            ctx.restore();

            // 飞刀
            const knives = this.getKnifePositions();
            for (const k of knives) {
                ctx.save();
                ctx.translate(k.x, k.y);
                ctx.rotate(k.angle + Math.PI / 4);

                // 刀身
                ctx.fillStyle = '#C0C0C0';
                ctx.strokeStyle = '#808080';
                ctx.lineWidth = 1;

                // 刀刃（三角形）
                ctx.beginPath();
                ctx.moveTo(this.knifeSize, 0);
                ctx.lineTo(-this.knifeSize * 0.3, -this.knifeSize * 0.4);
                ctx.lineTo(-this.knifeSize * 0.3, this.knifeSize * 0.4);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                // 刀柄
                ctx.fillStyle = '#4A3520';
                ctx.fillRect(-this.knifeSize * 0.5, -this.knifeSize * 0.2, this.knifeSize * 0.3, this.knifeSize * 0.4);

                // 高光
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.beginPath();
                ctx.moveTo(this.knifeSize * 0.5, 0);
                ctx.lineTo(0, -this.knifeSize * 0.2);
                ctx.lineTo(0, 0);
                ctx.closePath();
                ctx.fill();

                ctx.restore();
            }
        }
    };

    // ===== 敌人 =====
    const enemyTypes = [
        { name: '小怪', radius: 14, hp: 20, speed: 60, damage: 10, color: '#ff4444', expDrop: 2, shape: 'circle' },
        { name: '快速兵', radius: 12, hp: 15, speed: 100, damage: 8, color: '#ff8800', expDrop: 3, shape: 'triangle' },
        { name: '坦克', radius: 20, hp: 50, speed: 40, damage: 15, color: '#aa00ff', expDrop: 5, shape: 'square' },
        { name: '精英', radius: 25, hp: 100, speed: 55, damage: 20, color: '#ff0066', expDrop: 10, shape: 'star' },
        { name: '弓箭手', radius: 13, hp: 25, speed: 50, damage: 12, color: '#00CED1', expDrop: 4, shape: 'diamond', ranged: true, attackRange: 250, attackInterval: 2 },
        { name: '狂战士', radius: 16, hp: 40, speed: 85, damage: 18, color: '#FF1493', expDrop: 6, shape: 'hexagon', rageMode: true },
        { name: '冰法师', radius: 15, hp: 35, speed: 45, damage: 14, color: '#1E90FF', expDrop: 5, shape: 'octagon', slowEffect: true, attackRange: 200, attackInterval: 2.5 },
        { name: '炸弹客', radius: 18, hp: 30, speed: 70, damage: 25, color: '#FFD700', expDrop: 8, shape: 'pentagon', explodeOnDeath: true },
        { name: '毒蜂', radius: 11, hp: 18, speed: 110, damage: 12, color: '#7CFC00', expDrop: 4, shape: 'cross', erratic: true, poisonAttack: true },
        { name: '重甲兵', radius: 22, hp: 80, speed: 35, damage: 20, color: '#708090', expDrop: 8, shape: 'shield', slowAura: true },
        { name: '刺客', radius: 14, hp: 30, speed: 90, damage: 16, color: '#4B0082', expDrop: 6, shape: 'blade', teleportAttack: true, teleportInterval: 4 },
        { name: '巫医', radius: 16, hp: 45, speed: 50, damage: 8, color: '#FF69B4', expDrop: 7, shape: 'plus', healer: true, healRange: 150, healInterval: 3, healAmount: 20 },
    ];

    const enemies = [];

    function spawnEnemy() {
        // 随时间增加难度
        const difficulty = Math.min(gameTime / 30, 11); // 0~11
        const typeIndex = Math.min(Math.floor(Math.random() * (1 + difficulty)), enemyTypes.length - 1);
        const type = enemyTypes[typeIndex];

        // 在玩家屏幕周围一定范围外生成
        const spawnMargin = 60;
        // 随机选一个方向：从摄像机视口外缘生成
        const viewLeft = camera.x;
        const viewTop = camera.y;
        const viewRight = camera.x + camera.viewW;
        const viewBottom = camera.y + camera.viewH;

        let x, y;
        const side = randInt(0, 3);
        if (side === 0) { // 上方
            x = rand(viewLeft - spawnMargin, viewRight + spawnMargin);
            y = viewTop - spawnMargin;
        } else if (side === 1) { // 右方
            x = viewRight + spawnMargin;
            y = rand(viewTop - spawnMargin, viewBottom + spawnMargin);
        } else if (side === 2) { // 下方
            x = rand(viewLeft - spawnMargin, viewRight + spawnMargin);
            y = viewBottom + spawnMargin;
        } else { // 左方
            x = viewLeft - spawnMargin;
            y = rand(viewTop - spawnMargin, viewBottom + spawnMargin);
        }

        // 确保在地图范围内
        x = clamp(x, -50, WORLD_WIDTH + 50);
        y = clamp(y, -50, WORLD_HEIGHT + 50);

        const hpScale = 1 + difficulty * 0.3;
        const dmgScale = 1 + difficulty * 0.2;

        enemies.push({
            x: x,
            y: y,
            type: type,
            radius: type.radius,
            hp: type.hp * hpScale,
            maxHp: type.hp * hpScale,
            speed: type.speed,
            damage: type.damage * dmgScale,
            color: type.color,
            expDrop: type.expDrop,
            shape: type.shape,
            hitFlash: 0,
            vx: 0,
            vy: 0,
            knockbackTime: 0,
            // 新增属性
            ranged: type.ranged || false,
            attackRange: type.attackRange || 0,
            attackInterval: type.attackInterval || 0,
            attackTimer: type.attackInterval || 0,
            rageMode: type.rageMode || false,
            enraged: false,
            slowEffect: type.slowEffect || false,
            explodeOnDeath: type.explodeOnDeath || false,
            erratic: type.erratic || false,
            poisonAttack: type.poisonAttack || false,
            slowAura: type.slowAura || false,
            teleportAttack: type.teleportAttack || false,
            teleportInterval: type.teleportInterval || 0,
            teleportTimer: type.teleportInterval || 0,
            healer: type.healer || false,
            healRange: type.healRange || 0,
            healInterval: type.healInterval || 0,
            healTimer: type.healInterval || 0,
            healAmount: type.healAmount || 0,
        });
    }

    function updateEnemies(dt) {
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];

            // 向玩家移动
            const dx = player.x - e.x;
            const dy = player.y - e.y;
            const d = Math.sqrt(dx * dx + dy * dy);

            // 狂战士狂暴模式：血量低于50%时速度和伤害提升
            if (e.rageMode && !e.enraged && e.hp < e.maxHp * 0.5) {
                e.enraged = true;
                e.speed *= 1.6;
                e.damage *= 1.5;
                e.color = '#FF0000';
            }

            if (e.knockbackTime > 0) {
                e.knockbackTime -= dt;
                e.x += e.vx * dt;
                e.y += e.vy * dt;
                e.vx *= 0.9;
                e.vy *= 0.9;
            } else if (e.ranged && d < e.attackRange && d > e.attackRange * 0.5) {
                // 远程敌人：在射程内保持距离，不迫近
                // 不移动
            } else if (d > 0) {
                e.x += (dx / d) * e.speed * dt;
                e.y += (dy / d) * e.speed * dt;
            }

            // 边界限制
            e.x = clamp(e.x, -50, WORLD_WIDTH + 50);
            e.y = clamp(e.y, -50, WORLD_HEIGHT + 50);

            // 闪烁恢复
            if (e.hitFlash > 0) e.hitFlash -= dt;

            // 远程攻击逻辑（弓箭手、冰法师）
            if (e.ranged && e.attackTimer !== undefined) {
                e.attackTimer -= dt;
                if (e.attackTimer <= 0 && d < e.attackRange && d > 0) {
                    e.attackTimer = e.attackInterval;
                    // 发射投射物
                    const projSpeed = 200;
                    bossProjectiles.push({
                        x: e.x, y: e.y,
                        vx: (dx / d) * projSpeed,
                        vy: (dy / d) * projSpeed,
                        radius: 6,
                        damage: e.damage * 0.7,
                        life: 2,
                        color: e.color,
                        type: e.slowEffect ? 'ice' : 'arrow'
                    });
                }
            }

            // 毒蜂： erratic移动（蛇形追踪）
            if (e.erratic) {
                // 在直线移动基础上加横向偏移
                const perpX = -dy / (d || 1);
                const perpY = dx / (d || 1);
                const wobble = Math.sin(gameTime * 8 + e.x * 0.01) * 40 * dt;
                e.x += perpX * wobble;
                e.y += perpY * wobble;
                // 毒蜂攻击：接触玩家时施加持续毒素
                if (d < e.radius + player.radius + 5 && !e._poisonCooldown) {
                    e._poisonCooldown = true;
                    setTimeout(() => { e._poisonCooldown = false; }, 1000);
                    player.poisonTime = 2; // 2秒毒持续
                }
            }

            // 重甲兵：减速光环（靠近时减速玩家）
            if (e.slowAura && d < 100) {
                player.slowTime = Math.max(player.slowTime, 0.3); // 持续刷新减速
            }

            // 刺客：瞬移到玩家附近
            if (e.teleportAttack) {
                e.teleportTimer -= dt;
                if (e.teleportTimer <= 0 && d > 150) {
                    e.teleportTimer = e.teleportInterval;
                    // 瞬移到玩家身后
                    const tpAngle = rand(0, Math.PI * 2);
                    e.x = player.x + Math.cos(tpAngle) * 60;
                    e.y = player.y + Math.sin(tpAngle) * 60;
                    e.x = clamp(e.x, e.radius, WORLD_WIDTH - e.radius);
                    e.y = clamp(e.y, e.radius, WORLD_HEIGHT - e.radius);
                    // 瞬移特效
                    for (let p = 0; p < 8; p++) {
                        const angle = rand(0, Math.PI * 2);
                        const speed = rand(50, 120);
                        clashParticles.push({
                            x: e.x, y: e.y,
                            vx: Math.cos(angle) * speed,
                            vy: Math.sin(angle) * speed,
                            life: 0.3, maxLife: 0.3,
                            size: rand(2, 4)
                        });
                    }
                }
            }

            // 巫医：治疗附近友军
            if (e.healer) {
                e.healTimer -= dt;
                if (e.healTimer <= 0) {
                    e.healTimer = e.healInterval;
                    // 治疗范围内的敌人
                    for (const ally of enemies) {
                        if (ally === e) continue;
                        const ad = dist(e.x, e.y, ally.x, ally.y);
                        if (ad < e.healRange && ally.hp < ally.maxHp) {
                            ally.hp = Math.min(ally.maxHp, ally.hp + e.healAmount);
                            // 治疗特效
                            addDamageText(ally.x, ally.y - ally.radius - 5, '+' + e.healAmount, '#FF69B4');
                        }
                    }
                }
            }

            // 与玩家碰撞
            if (d < e.radius + player.radius) {
                player.takeDamage(e.damage);
                // 击退
                if (d > 0) {
                    e.vx = -(dx / d) * 200;
                    e.vy = -(dy / d) * 200;
                    e.knockbackTime = 0.2;
                }
                // 炸弹客：接触玩家时自爆
                if (e.explodeOnDeath) {
                    e.hp = 0;
                }
            }

            // 飞刀碰撞检测
            const knives = player.getKnifePositions();
            for (const k of knives) {
                const kd = dist(k.x, k.y, e.x, e.y);
                if (kd < player.knifeSize + e.radius) {
                    if (e.hitFlash <= 0) {
                        e.hp -= player.knifeDamage;
                        e.hitFlash = 0.15;
                        playHitSound();
                        // 击退
                        const kdx = e.x - player.x;
                        const kdy = e.y - player.y;
                        const kd2 = Math.sqrt(kdx * kdx + kdy * kdy);
                        if (kd2 > 0) {
                            const kbMul = player.equipKnockbackMul || 1;
                            e.vx = (kdx / kd2) * 150 * kbMul;
                            e.vy = (kdy / kd2) * 150 * kbMul;
                            e.knockbackTime = 0.1;
                        }
                    }
                }
            }

            // 死亡
            if (e.hp <= 0) {
                // 炸弹客死亡爆炸
                if (e.explodeOnDeath) {
                    // 对范围内敌人造成伤害，对玩家造成伤害
                    const explodeR = 80;
                    for (let j = enemies.length - 1; j >= 0; j--) {
                        if (j === i) continue;
                        const ej = enemies[j];
                        const ed = dist(e.x, e.y, ej.x, ej.y);
                        if (ed < explodeR) {
                            ej.hp -= 30;
                        }
                    }
                    // 爆炸伤害玩家
                    if (d < explodeR) {
                        player.takeDamage(20);
                    }
                    screenShake = Math.max(screenShake, 8);
                    // 爆炸特效
                    for (let p = 0; p < 15; p++) {
                        const angle = rand(0, Math.PI * 2);
                        const speed = rand(80, 200);
                        clashParticles.push({
                            x: e.x, y: e.y,
                            vx: Math.cos(angle) * speed,
                            vy: Math.sin(angle) * speed,
                            life: 0.4, maxLife: 0.4,
                            size: rand(3, 6)
                        });
                    }
                }
                // 掉落经验球
                spawnExpOrb(e.x, e.y, e.expDrop);
                playKillSound();
                player.kills++;
                // 获得能量
                player.gainEnergy(8);
                enemies.splice(i, 1);
            }
        }
    }

    function drawEnemies(ctx) {
        for (const e of enemies) {
            ctx.save();
            const r = e.radius;
            const x = e.x, y = e.y;
            const flash = e.hitFlash > 0;
            const mainColor = flash ? '#ffffff' : e.color;

            // === 通用阴影 ===
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.beginPath();
            ctx.ellipse(x, y + r - 2, r * 0.9, r * 0.25, 0, 0, Math.PI * 2);
            ctx.fill();

            // === 根据形状绘制不同二次元怪物 ===
            if (e.shape === 'circle') {
                // 小怪 → 史莱姆
                ctx.fillStyle = mainColor;
                ctx.strokeStyle = '#CC2222';
                ctx.lineWidth = 1.5;
                // 果冻身体（底部扁平的半圆）
                ctx.beginPath();
                ctx.moveTo(x - r, y + r * 0.7);
                ctx.quadraticCurveTo(x - r * 1.1, y - r * 0.5, x, y - r);
                ctx.quadraticCurveTo(x + r * 1.1, y - r * 0.5, x + r, y + r * 0.7);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                // 高光
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.beginPath();
                ctx.ellipse(x - r * 0.35, y - r * 0.35, r * 0.2, r * 0.12, -0.5, 0, Math.PI * 2);
                ctx.fill();
                // 眼睛（呆萌大眼）
                drawSlimeEyes(ctx, x, y, r);
                // 嘴巴
                ctx.strokeStyle = '#600';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.arc(x, y + r * 0.25, r * 0.18, 0.2, Math.PI - 0.2);
                ctx.stroke();

            } else if (e.shape === 'triangle') {
                // 快速兵 → 闪电妖精
                // 翅膀
                ctx.fillStyle = 'rgba(255,200,0,0.4)';
                ctx.strokeStyle = '#FFAA00';
                ctx.lineWidth = 1;
                const wingFlap = Math.sin(gameTime * 15 + e.x * 0.01) * r * 0.3;
                ctx.beginPath();
                ctx.moveTo(x - r * 0.2, y);
                ctx.quadraticCurveTo(x - r * 1.5, y - r * 0.5 + wingFlap, x - r * 0.8, y + r * 0.2);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(x + r * 0.2, y);
                ctx.quadraticCurveTo(x + r * 1.5, y - r * 0.5 + wingFlap, x + r * 0.8, y + r * 0.2);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                // 身体
                ctx.fillStyle = mainColor;
                ctx.strokeStyle = '#CC6600';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.ellipse(x, y, r * 0.6, r * 0.8, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 尖耳朵
                ctx.fillStyle = mainColor;
                ctx.beginPath();
                ctx.moveTo(x - r * 0.5, y - r * 0.3);
                ctx.lineTo(x - r * 0.8, y - r * 0.7);
                ctx.lineTo(x - r * 0.3, y - r * 0.5);
                ctx.closePath();
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(x + r * 0.5, y - r * 0.3);
                ctx.lineTo(x + r * 0.8, y - r * 0.7);
                ctx.lineTo(x + r * 0.3, y - r * 0.5);
                ctx.closePath();
                ctx.fill();
                // 眼睛
                drawCuteEyes(ctx, x, y - r * 0.15, r * 0.12, '#FFE082');
                // 嘴
                ctx.strokeStyle = '#994400';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x - r * 0.1, y + r * 0.2);
                ctx.lineTo(x + r * 0.1, y + r * 0.2);
                ctx.stroke();

            } else if (e.shape === 'square') {
                // 坦克 → 机甲少女
                // 裙甲
                ctx.fillStyle = mainColor;
                ctx.strokeStyle = '#660099';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x - r * 0.8, y + r * 0.2);
                ctx.lineTo(x - r, y + r * 0.8);
                ctx.lineTo(x + r, y + r * 0.8);
                ctx.lineTo(x + r * 0.8, y + r * 0.2);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                // 上身
                ctx.fillStyle = flash ? '#fff' : '#9933CC';
                ctx.beginPath();
                ctx.ellipse(x, y, r * 0.55, r * 0.5, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 头
                ctx.fillStyle = '#FFEFD5';
                ctx.beginPath();
                ctx.arc(x, y - r * 0.5, r * 0.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 头盔碎片
                ctx.fillStyle = mainColor;
                ctx.beginPath();
                ctx.arc(x, y - r * 0.65, r * 0.42, Math.PI, 0);
                ctx.fill();
                ctx.stroke();
                // 眼睛
                drawCuteEyes(ctx, x, y - r * 0.45, r * 0.1, '#E1BEE7');
                // 装甲肩
                ctx.fillStyle = mainColor;
                ctx.beginPath();
                ctx.arc(x - r * 0.6, y + r * 0.1, r * 0.2, 0, Math.PI * 2);
                ctx.arc(x + r * 0.6, y + r * 0.1, r * 0.2, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

            } else if (e.shape === 'star') {
                // 精英 → 暗黑魔女
                // 帽子（五角星形状改为尖帽）
                ctx.fillStyle = mainColor;
                ctx.strokeStyle = '#990033';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x, y - r * 1.1);
                ctx.quadraticCurveTo(x + r * 0.5, y - r * 0.5, x + r * 0.4, y - r * 0.3);
                ctx.lineTo(x - r * 0.4, y - r * 0.3);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                // 帽檐
                ctx.beginPath();
                ctx.ellipse(x, y - r * 0.3, r * 0.6, r * 0.12, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 脸
                ctx.fillStyle = '#FFEFD5';
                ctx.beginPath();
                ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
                ctx.fill();
                // 长发
                ctx.fillStyle = flash ? '#fff' : '#1A0033';
                ctx.beginPath();
                ctx.moveTo(x - r * 0.4, y - r * 0.1);
                ctx.quadraticCurveTo(x - r * 0.6, y + r * 0.6, x - r * 0.2, y + r * 0.8);
                ctx.lineTo(x + r * 0.2, y + r * 0.8);
                ctx.quadraticCurveTo(x + r * 0.6, y + r * 0.6, x + r * 0.4, y - r * 0.1);
                ctx.closePath();
                ctx.fill();
                // 眼睛（红色发光）
                ctx.fillStyle = '#FF0000';
                ctx.shadowColor = '#FF0000';
                ctx.shadowBlur = 6;
                ctx.beginPath();
                ctx.arc(x - r * 0.15, y - r * 0.05, r * 0.06, 0, Math.PI * 2);
                ctx.arc(x + r * 0.15, y - r * 0.05, r * 0.06, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 嘴
                ctx.strokeStyle = '#660033';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x - r * 0.08, y + r * 0.2);
                ctx.lineTo(x + r * 0.08, y + r * 0.2);
                ctx.stroke();

            } else if (e.shape === 'diamond') {
                // 弓箭手 → 精灵弓手少女
                // 兜帽
                ctx.fillStyle = flash ? '#fff' : '#008B8B';
                ctx.strokeStyle = '#005555';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(x - r * 0.5, y);
                ctx.quadraticCurveTo(x - r * 0.7, y - r * 0.8, x, y - r);
                ctx.quadraticCurveTo(x + r * 0.7, y - r * 0.8, x + r * 0.5, y);
                ctx.lineTo(x + r * 0.3, y + r * 0.6);
                ctx.lineTo(x - r * 0.3, y + r * 0.6);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                // 脸
                ctx.fillStyle = '#FFEFD5';
                ctx.beginPath();
                ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
                ctx.fill();
                // 尖耳朵
                ctx.fillStyle = '#FFEFD5';
                ctx.beginPath();
                ctx.moveTo(x - r * 0.35, y);
                ctx.lineTo(x - r * 0.6, y - r * 0.05);
                ctx.lineTo(x - r * 0.3, y + r * 0.05);
                ctx.closePath();
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(x + r * 0.35, y);
                ctx.lineTo(x + r * 0.6, y - r * 0.05);
                ctx.lineTo(x + r * 0.3, y + r * 0.05);
                ctx.closePath();
                ctx.fill();
                // 眼睛
                drawCuteEyes(ctx, x, y - r * 0.05, r * 0.08, '#80CBC4');
                // 弓
                ctx.strokeStyle = '#8B4513';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(x + r * 0.8, y, r * 0.4, -Math.PI / 3, Math.PI / 3);
                ctx.stroke();
                // 弓弦
                ctx.strokeStyle = 'rgba(255,255,255,0.5)';
                ctx.lineWidth = 0.5;
                ctx.beginPath();
                ctx.moveTo(x + r * 0.6, y - r * 0.35);
                ctx.lineTo(x + r * 0.6, y + r * 0.35);
                ctx.stroke();

            } else if (e.shape === 'hexagon') {
                // 狂战士 → 战斗少女
                const enraged = e.enraged;
                // 头发（双马尾）
                ctx.fillStyle = flash ? '#fff' : (enraged ? '#FF0000' : '#FF1493');
                ctx.strokeStyle = enraged ? '#990000' : '#990066';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(x - r * 0.6, y - r * 0.6);
                ctx.quadraticCurveTo(x - r * 1.0, y, x - r * 0.5, y + r * 0.5);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(x + r * 0.6, y - r * 0.6);
                ctx.quadraticCurveTo(x + r * 1.0, y, x + r * 0.5, y + r * 0.5);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                // 身体
                ctx.fillStyle = flash ? '#fff' : '#FF1493';
                ctx.beginPath();
                ctx.ellipse(x, y + r * 0.1, r * 0.6, r * 0.5, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 头
                ctx.fillStyle = '#FFEFD5';
                ctx.beginPath();
                ctx.arc(x, y - r * 0.3, r * 0.42, 0, Math.PI * 2);
                ctx.fill();
                // 前发
                ctx.fillStyle = flash ? '#fff' : (enraged ? '#FF0000' : '#FF1493');
                ctx.beginPath();
                ctx.arc(x, y - r * 0.5, r * 0.45, Math.PI, 0);
                ctx.fill();
                // 眼睛（愤怒眼神）
                ctx.fillStyle = enraged ? '#FF0000' : '#FFD700';
                ctx.beginPath();
                ctx.arc(x - r * 0.15, y - r * 0.25, r * 0.08, 0, Math.PI * 2);
                ctx.arc(x + r * 0.15, y - r * 0.25, r * 0.08, 0, Math.PI * 2);
                ctx.fill();
                // 眉毛（怒）
                ctx.strokeStyle = '#8B0000';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(x - r * 0.25, y - r * 0.4);
                ctx.lineTo(x - r * 0.08, y - r * 0.32);
                ctx.moveTo(x + r * 0.25, y - r * 0.4);
                ctx.lineTo(x + r * 0.08, y - r * 0.32);
                ctx.stroke();
                // 嘴（咬牙）
                ctx.strokeStyle = '#8B0000';
                ctx.beginPath();
                ctx.moveTo(x - r * 0.1, y + r * 0.05);
                ctx.lineTo(x + r * 0.1, y + r * 0.05);
                ctx.stroke();

            } else if (e.shape === 'octagon') {
                // 冰法师 → 冰雪少女
                // 长发
                ctx.fillStyle = flash ? '#fff' : '#87CEEB';
                ctx.strokeStyle = '#4682B4';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(x - r * 0.4, y - r * 0.3);
                ctx.quadraticCurveTo(x - r * 0.7, y + r * 0.6, x - r * 0.3, y + r * 0.8);
                ctx.lineTo(x + r * 0.3, y + r * 0.8);
                ctx.quadraticCurveTo(x + r * 0.7, y + r * 0.6, x + r * 0.4, y - r * 0.3);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                // 头
                ctx.fillStyle = '#F0F8FF';
                ctx.beginPath();
                ctx.arc(x, y - r * 0.25, r * 0.4, 0, Math.PI * 2);
                ctx.fill();
                // 冰晶发饰
                ctx.fillStyle = flash ? '#fff' : '#00BFFF';
                ctx.beginPath();
                ctx.moveTo(x, y - r * 0.7);
                ctx.lineTo(x - r * 0.1, y - r * 0.55);
                ctx.lineTo(x + r * 0.1, y - r * 0.55);
                ctx.closePath();
                ctx.fill();
                // 身体（冰裙）
                ctx.fillStyle = flash ? '#fff' : '#B0E0E6';
                ctx.beginPath();
                ctx.moveTo(x - r * 0.3, y + r * 0.1);
                ctx.lineTo(x - r * 0.6, y + r * 0.7);
                ctx.lineTo(x + r * 0.6, y + r * 0.7);
                ctx.lineTo(x + r * 0.3, y + r * 0.1);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                // 眼睛
                drawCuteEyes(ctx, x, y - r * 0.25, r * 0.09, '#87CEFA');
                // 冰雾粒子
                ctx.fillStyle = 'rgba(135,206,250,0.3)';
                for (let p = 0; p < 3; p++) {
                    const pa = gameTime * 2 + p * 2.1;
                    ctx.beginPath();
                    ctx.arc(x + Math.cos(pa) * r * 0.8, y + Math.sin(pa) * r * 0.5 + r * 0.2, r * 0.08, 0, Math.PI * 2);
                    ctx.fill();
                }

            } else if (e.shape === 'pentagon') {
                // 炸弹客 → 蒸汽朋克少女
                // 身体
                ctx.fillStyle = flash ? '#fff' : '#FFD700';
                ctx.strokeStyle = '#B8860B';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.ellipse(x, y + r * 0.1, r * 0.6, r * 0.55, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 头
                ctx.fillStyle = '#FFEFD5';
                ctx.beginPath();
                ctx.arc(x, y - r * 0.35, r * 0.4, 0, Math.PI * 2);
                ctx.fill();
                // 护目镜
                ctx.fillStyle = '#333';
                ctx.beginPath();
                ctx.ellipse(x - r * 0.15, y - r * 0.35, r * 0.14, r * 0.1, 0, 0, Math.PI * 2);
                ctx.ellipse(x + r * 0.15, y - r * 0.35, r * 0.14, r * 0.1, 0, 0, Math.PI * 2);
                ctx.fill();
                // 护目镜镜片反光
                ctx.fillStyle = 'rgba(255,255,0,0.4)';
                ctx.beginPath();
                ctx.arc(x - r * 0.12, y - r * 0.38, r * 0.04, 0, Math.PI * 2);
                ctx.arc(x + r * 0.18, y - r * 0.38, r * 0.04, 0, Math.PI * 2);
                ctx.fill();
                // 护目镜框
                ctx.strokeStyle = '#555';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.ellipse(x - r * 0.15, y - r * 0.35, r * 0.14, r * 0.1, 0, 0, Math.PI * 2);
                ctx.ellipse(x + r * 0.15, y - r * 0.35, r * 0.14, r * 0.1, 0, 0, Math.PI * 2);
                ctx.stroke();
                // 炸弹背包
                ctx.fillStyle = '#333';
                ctx.beginPath();
                ctx.arc(x - r * 0.7, y + r * 0.3, r * 0.25, 0, Math.PI * 2);
                ctx.fill();
                // 引信火花
                ctx.fillStyle = '#FF4500';
                ctx.shadowColor = '#FF4500';
                ctx.shadowBlur = 4;
                ctx.beginPath();
                ctx.arc(x - r * 0.75, y + r * 0.02, r * 0.06 + Math.sin(gameTime * 10) * r * 0.02, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 嘴
                ctx.strokeStyle = '#8B4513';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(x, y - r * 0.15, r * 0.08, 0, Math.PI);
                ctx.stroke();

            } else if (e.shape === 'cross') {
                // 毒蜂 → 妖蝶少女
                // 翅膀（大蝴蝶翅膀）
                const wingColor = flash ? '#fff' : 'rgba(124,252,0,0.5)';
                ctx.fillStyle = wingColor;
                ctx.strokeStyle = '#32CD32';
                ctx.lineWidth = 1;
                const flap = Math.sin(gameTime * 12 + e.x * 0.02) * 0.3;
                // 左上翅
                ctx.beginPath();
                ctx.ellipse(x - r * 0.9, y - r * 0.4, r * 0.7, r * 0.5, -0.4 + flap, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 右上翅
                ctx.beginPath();
                ctx.ellipse(x + r * 0.9, y - r * 0.4, r * 0.7, r * 0.5, 0.4 - flap, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 左下翅
                ctx.beginPath();
                ctx.ellipse(x - r * 0.7, y + r * 0.3, r * 0.5, r * 0.4, 0.3 + flap, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 右下翅
                ctx.beginPath();
                ctx.ellipse(x + r * 0.7, y + r * 0.3, r * 0.5, r * 0.4, -0.3 - flap, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 翅膀斑点
                ctx.fillStyle = 'rgba(0,128,0,0.4)';
                ctx.beginPath();
                ctx.arc(x - r * 1.0, y - r * 0.4, r * 0.1, 0, Math.PI * 2);
                ctx.arc(x + r * 1.0, y - r * 0.4, r * 0.1, 0, Math.PI * 2);
                ctx.fill();
                // 身体
                ctx.fillStyle = flash ? '#fff' : '#7CFC00';
                ctx.strokeStyle = '#228B22';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.ellipse(x, y, r * 0.35, r * 0.6, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 头
                ctx.fillStyle = '#FFFACD';
                ctx.beginPath();
                ctx.arc(x, y - r * 0.5, r * 0.28, 0, Math.PI * 2);
                ctx.fill();
                // 触角
                ctx.strokeStyle = '#228B22';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x - r * 0.1, y - r * 0.7);
                ctx.quadraticCurveTo(x - r * 0.3, y - r * 0.9, x - r * 0.2, y - r);
                ctx.moveTo(x + r * 0.1, y - r * 0.7);
                ctx.quadraticCurveTo(x + r * 0.3, y - r * 0.9, x + r * 0.2, y - r);
                ctx.stroke();
                // 触角球
                ctx.fillStyle = '#32CD32';
                ctx.beginPath();
                ctx.arc(x - r * 0.2, y - r, r * 0.05, 0, Math.PI * 2);
                ctx.arc(x + r * 0.2, y - r, r * 0.05, 0, Math.PI * 2);
                ctx.fill();
                // 眼睛
                drawCuteEyes(ctx, x, y - r * 0.5, r * 0.07, '#ADFF2F');

            } else if (e.shape === 'shield') {
                // 重甲兵 → 重装骑士少女
                // 盾牌
                ctx.fillStyle = flash ? '#fff' : '#2F4F4F';
                ctx.strokeStyle = '#1a2a2a';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x - r * 0.7, y - r * 0.6);
                ctx.lineTo(x - r * 0.9, y + r * 0.2);
                ctx.lineTo(x - r * 0.5, y + r * 0.8);
                ctx.lineTo(x - r * 0.3, y + r * 0.6);
                ctx.lineTo(x - r * 0.3, y - r * 0.4);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                // 盾牌纹章
                ctx.fillStyle = '#C0C0C0';
                ctx.beginPath();
                ctx.arc(x - r * 0.55, y + r * 0.1, r * 0.12, 0, Math.PI * 2);
                ctx.fill();
                // 身体（铠甲）
                ctx.fillStyle = flash ? '#fff' : '#708090';
                ctx.strokeStyle = '#2F4F4F';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.ellipse(x, y + r * 0.15, r * 0.55, r * 0.5, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 铠甲分割线
                ctx.strokeStyle = '#3a4a4a';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x - r * 0.5, y + r * 0.15);
                ctx.lineTo(x + r * 0.5, y + r * 0.15);
                ctx.stroke();
                // 头盔
                ctx.fillStyle = flash ? '#fff' : '#708090';
                ctx.strokeStyle = '#2F4F4F';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x + r * 0.2, y - r * 0.3, r * 0.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 头盔T型面甲缝
                ctx.fillStyle = '#1a1a1a';
                ctx.beginPath();
                ctx.rect(x + r * 0.15, y - r * 0.5, r * 0.1, r * 0.3);
                ctx.fill();
                ctx.beginPath();
                ctx.rect(x + r * 0.05, y - r * 0.38, r * 0.3, r * 0.06);
                ctx.fill();
                // 头盔顶饰（红色羽毛）
                ctx.fillStyle = '#DC143C';
                ctx.beginPath();
                ctx.moveTo(x + r * 0.2, y - r * 0.65);
                ctx.quadraticCurveTo(x + r * 0.5, y - r * 0.9, x + r * 0.3, y - r);
                ctx.quadraticCurveTo(x + r * 0.15, y - r * 0.8, x + r * 0.2, y - r * 0.65);
                ctx.fill();

            } else if (e.shape === 'blade') {
                // 刺客 → 忍者少女
                // 身体
                ctx.fillStyle = flash ? '#fff' : '#4B0082';
                ctx.strokeStyle = '#2E004D';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.ellipse(x, y + r * 0.15, r * 0.5, r * 0.55, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 忍者面罩
                ctx.fillStyle = flash ? '#fff' : '#3B0064';
                ctx.beginPath();
                ctx.ellipse(x, y - r * 0.15, r * 0.42, r * 0.3, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 头
                ctx.fillStyle = '#FFEFD5';
                ctx.beginPath();
                ctx.arc(x, y - r * 0.35, r * 0.38, 0, Math.PI * 2);
                ctx.fill();
                // 头巾
                ctx.fillStyle = flash ? '#fff' : '#4B0082';
                ctx.strokeStyle = '#2E004D';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(x, y - r * 0.5, r * 0.42, Math.PI, 0);
                ctx.fill();
                ctx.stroke();
                // 头巾飘带
                const ribbonFlow = Math.sin(gameTime * 6 + e.x * 0.02) * r * 0.15;
                ctx.beginPath();
                ctx.moveTo(x + r * 0.38, y - r * 0.5);
                ctx.quadraticCurveTo(x + r * 0.7, y - r * 0.4 + ribbonFlow, x + r * 0.9, y - r * 0.2 + ribbonFlow);
                ctx.lineTo(x + r * 0.8, y - r * 0.1 + ribbonFlow);
                ctx.quadraticCurveTo(x + r * 0.6, y - r * 0.3 + ribbonFlow, x + r * 0.35, y - r * 0.45);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                // 眼睛（锐利眼神）
                ctx.fillStyle = '#FFD700';
                ctx.shadowColor = '#FFD700';
                ctx.shadowBlur = 3;
                ctx.beginPath();
                ctx.arc(x - r * 0.13, y - r * 0.3, r * 0.06, 0, Math.PI * 2);
                ctx.arc(x + r * 0.13, y - r * 0.3, r * 0.06, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 苦无武器
                ctx.fillStyle = '#C0C0C0';
                ctx.strokeStyle = '#666';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x + r * 0.5, y + r * 0.1);
                ctx.lineTo(x + r * 0.65, y - r * 0.05);
                ctx.lineTo(x + r * 0.55, y + r * 0.15);
                ctx.lineTo(x + r * 0.45, y + r * 0.2);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

            } else if (e.shape === 'plus') {
                // 巫医 → 治愈修女
                // 头巾（修女头巾）
                ctx.fillStyle = flash ? '#fff' : '#FFFFFF';
                ctx.strokeStyle = '#DDD';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(x - r * 0.5, y - r * 0.2);
                ctx.quadraticCurveTo(x - r * 0.6, y - r * 0.8, x, y - r * 0.9);
                ctx.quadraticCurveTo(x + r * 0.6, y - r * 0.8, x + r * 0.5, y - r * 0.2);
                ctx.lineTo(x + r * 0.4, y + r * 0.1);
                ctx.lineTo(x - r * 0.4, y + r * 0.1);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                // 头
                ctx.fillStyle = '#FFEFD5';
                ctx.beginPath();
                ctx.arc(x, y - r * 0.25, r * 0.35, 0, Math.PI * 2);
                ctx.fill();
                // 身体（白色长袍）
                ctx.fillStyle = flash ? '#fff' : '#FFFAFA';
                ctx.strokeStyle = '#FFC0CB';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(x - r * 0.45, y);
                ctx.lineTo(x - r * 0.65, y + r * 0.8);
                ctx.lineTo(x + r * 0.65, y + r * 0.8);
                ctx.lineTo(x + r * 0.45, y);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                // 十字标记
                ctx.fillStyle = '#FF69B4';
                const cv = r * 0.12;
                ctx.fillRect(x - cv * 0.3, y + r * 0.2, cv * 0.6, cv * 1.8);
                ctx.fillRect(x - cv * 0.9, y + r * 0.5, cv * 1.8, cv * 0.6);
                // 眼睛（温柔闭合眼）
                ctx.strokeStyle = '#8B4513';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(x - r * 0.13, y - r * 0.22, r * 0.06, 0.2, Math.PI - 0.2);
                ctx.arc(x + r * 0.13, y - r * 0.22, r * 0.06, 0.2, Math.PI - 0.2);
                ctx.stroke();
                // 腮红
                ctx.fillStyle = 'rgba(255,105,180,0.3)';
                ctx.beginPath();
                ctx.ellipse(x - r * 0.22, y - r * 0.1, r * 0.06, r * 0.04, 0, 0, Math.PI * 2);
                ctx.ellipse(x + r * 0.22, y - r * 0.1, r * 0.06, r * 0.04, 0, 0, Math.PI * 2);
                ctx.fill();
                // 治疗光环
                if (!flash) {
                    ctx.strokeStyle = 'rgba(255,105,180,' + (0.3 + Math.sin(gameTime * 4) * 0.15) + ')';
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([3, 3]);
                    ctx.beginPath();
                    ctx.arc(x, y, r * 1.1 + Math.sin(gameTime * 3) * r * 0.05, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            }

            // === 通用血条 ===
            if (e.hp < e.maxHp) {
                const barW = e.radius * 2;
                const barH = 4;
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillRect(e.x - barW / 2, e.y - e.radius - 8, barW, barH);
                ctx.fillStyle = '#ff4444';
                ctx.fillRect(e.x - barW / 2, e.y - e.radius - 8, barW * (e.hp / e.maxHp), barH);
            }

            ctx.restore();
        }
    }

    // === 敌人眼睛辅助绘制函数 ===
    function drawSlimeEyes(ctx, x, y, r) {
        // 史莱姆大眼
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.ellipse(x - r * 0.25, y - r * 0.1, r * 0.14, r * 0.18, 0, 0, Math.PI * 2);
        ctx.ellipse(x + r * 0.25, y - r * 0.1, r * 0.14, r * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(x - r * 0.22, y - r * 0.08, r * 0.07, 0, Math.PI * 2);
        ctx.arc(x + r * 0.28, y - r * 0.08, r * 0.07, 0, Math.PI * 2);
        ctx.fill();
        // 高光
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath();
        ctx.arc(x - r * 0.2, y - r * 0.12, r * 0.03, 0, Math.PI * 2);
        ctx.arc(x + r * 0.3, y - r * 0.12, r * 0.03, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawCuteEyes(ctx, x, y, size, irisColor) {
        // 通用可爱眼睛
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.ellipse(x - size * 1.2, y, size, size * 1.2, 0, 0, Math.PI * 2);
        ctx.ellipse(x + size * 1.2, y, size, size * 1.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = irisColor;
        ctx.beginPath();
        ctx.arc(x - size * 1.2, y, size * 0.7, 0, Math.PI * 2);
        ctx.arc(x + size * 1.2, y, size * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(x - size * 1.2, y, size * 0.35, 0, Math.PI * 2);
        ctx.arc(x + size * 1.2, y, size * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(x - size * 1.0, y - size * 0.3, size * 0.2, 0, Math.PI * 2);
        ctx.arc(x + size * 1.4, y - size * 0.3, size * 0.2, 0, Math.PI * 2);
        ctx.fill();
    }

    // ===== 经验球 =====
    const expOrbs = [];

    function spawnExpOrb(x, y, value) {
        // 可能掉落多个小球
        const count = Math.min(value, 3);
        const perValue = value / count;
        for (let i = 0; i < count; i++) {
            const angle = rand(0, Math.PI * 2);
            const dist = rand(10, 30);
            expOrbs.push({
                x: x + Math.cos(angle) * dist,
                y: y + Math.sin(angle) * dist,
                value: perValue,
                radius: 5 + perValue * 0.5,
                vx: Math.cos(angle) * 80,
                vy: Math.sin(angle) * 80,
                life: 15, // 15秒后消失
                magnetized: false,
                pulse: rand(0, Math.PI * 2)
            });
        }
    }

    function updateExpOrbs(dt) {
        for (let i = expOrbs.length - 1; i >= 0; i--) {
            const orb = expOrbs[i];

            // 散开初速度
            orb.vx *= 0.92;
            orb.vy *= 0.92;

            // 检查是否在拾取范围内
            const d = dist(orb.x, orb.y, player.x, player.y);
            // 全图拾取buff期间，所有经验球都被磁化
            if (d < player.expPickupRange || player.expMagnetTime > 0) {
                orb.magnetized = true;
            }

            if (orb.magnetized) {
                // 向玩家飞去
                const dx = player.x - orb.x;
                const dy = player.y - orb.y;
                const dd = Math.sqrt(dx * dx + dy * dy);
                const magnetSpeed = 300;
                orb.vx = (dx / dd) * magnetSpeed;
                orb.vy = (dy / dd) * magnetSpeed;
            }

            orb.x += orb.vx * dt;
            orb.y += orb.vy * dt;
            orb.pulse += dt * 5;
            orb.life -= dt;

            // 拾取
            if (d < player.radius + orb.radius) {
                player.gainExp(orb.value);
                playPickupSound();
                expOrbs.splice(i, 1);
                continue;
            }

            // 过期
            if (orb.life <= 0) {
                expOrbs.splice(i, 1);
            }
        }
    }

    function drawExpOrbs(ctx) {
        for (const orb of expOrbs) {
            ctx.save();
            const pulseScale = 1 + Math.sin(orb.pulse) * 0.2;
            const r = orb.radius * pulseScale;

            // 光晕
            const gradient = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, r * 2);
            gradient.addColorStop(0, 'rgba(245, 166, 35, 0.6)');
            gradient.addColorStop(1, 'rgba(245, 166, 35, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(orb.x, orb.y, r * 2, 0, Math.PI * 2);
            ctx.fill();

            // 核心
            ctx.fillStyle = '#ffd700';
            ctx.beginPath();
            ctx.arc(orb.x, orb.y, r, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#f5a623';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.restore();
        }
    }

    // ===== 宝箱系统 =====
    const chests = [];
    let chestSpawnTimer = 0;
    const CHEST_SPAWN_INTERVAL = 20; // 每20秒尝试生成一个宝箱
    const MAX_CHESTS = 3; // 地图上最多宝箱数

    function spawnChest() {
        if (chests.length >= MAX_CHESTS) return;

        // 在玩家周围一定范围外、地图内随机生成
        let x, y, tries = 0;
        do {
            x = rand(80, WORLD_WIDTH - 80);
            y = rand(80, WORLD_HEIGHT - 80);
            tries++;
            // 确保离玩家有一定距离
        } while (dist(x, y, player.x, player.y) < 200 && tries < 20);

        // 随机奖励类型：0=飞刀1-3把, 1=全图拾取经验5秒, 2=无敌5秒
        const rewardType = randInt(0, 2);
        let rewardValue, rewardIcon, rewardColor;
        if (rewardType === 0) {
            rewardValue = randInt(1, 3);
            rewardIcon = '🗡️';
            rewardColor = '#FFD700';
        } else if (rewardType === 1) {
            rewardValue = 5; // 5秒
            rewardIcon = '⚡';
            rewardColor = '#00BFFF';
        } else {
            rewardValue = 5; // 5秒
            rewardIcon = '🛡️';
            rewardColor = '#FF4444';
        }

        chests.push({
            x: x,
            y: y,
            radius: 24,
            hp: 30,
            maxHp: 30,
            hitFlash: 0,
            shake: 0,
            rewardType: rewardType,
            rewardValue: rewardValue,
            rewardIcon: rewardIcon,
            rewardColor: rewardColor,
            pulse: rand(0, Math.PI * 2),
            // 打开后短暂存在的拾取物状态
            opened: false
        });
    }

    function updateChests(dt) {
        for (let i = chests.length - 1; i >= 0; i--) {
            const c = chests[i];
            c.pulse += dt * 3;
            if (c.hitFlash > 0) c.hitFlash -= dt;
            if (c.shake > 0) c.shake = Math.max(0, c.shake - 60 * dt);

            if (c.opened) {
                // 已打开，移除
                chests.splice(i, 1);
                continue;
            }

            // 飞刀碰撞检测
            const knives = player.getKnifePositions();
            for (const k of knives) {
                const kd = dist(k.x, k.y, c.x, c.y);
                if (kd < player.knifeSize + c.radius) {
                    if (c.hitFlash <= 0) {
                        c.hp -= player.knifeDamage;
                        c.hitFlash = 0.15;
                        c.shake = 4;
                        playChestHitSound();
                        addDamageText(c.x, c.y - c.radius - 5, '-' + player.knifeDamage, '#FFD700');
                    }
                }
            }

            // 宝箱被打破
            if (c.hp <= 0) {
                playChestOpenSound();
                // 根据奖励类型发放奖励
                if (c.rewardType === 0) {
                    // 飞刀奖励
                    player.knifeCount += c.rewardValue;
                    addDamageText(c.x, c.y, '+' + c.rewardValue + '🗡️', '#FFD700');
                } else if (c.rewardType === 1) {
                    // 全图拾取经验5秒
                    player.expMagnetTime = c.rewardValue;
                    addDamageText(c.x, c.y, '全图拾取经验!', '#00BFFF');
                } else {
                    // 无敌5秒
                    player.invincibleBuffTime = c.rewardValue;
                    addDamageText(c.x, c.y, '无敌护盾!', '#FF4444');
                }
                // 掉落少量经验
                spawnExpOrb(c.x, c.y, 5);
                screenShake = Math.max(screenShake, 5);
                c.opened = true;
            }
        }

        // 定时生成宝箱
        chestSpawnTimer += dt;
        if (chestSpawnTimer >= CHEST_SPAWN_INTERVAL) {
            chestSpawnTimer = 0;
            spawnChest();
        }
    }

    function drawChests(ctx) {
        for (const c of chests) {
            if (c.opened) continue;
            ctx.save();

            const shakeX = c.shake > 0 ? rand(-c.shake, c.shake) : 0;
            const shakeY = c.shake > 0 ? rand(-c.shake, c.shake) : 0;

            // 光晕
            const pulseScale = 1 + Math.sin(c.pulse) * 0.15;
            const glowR = c.radius * 1.8 * pulseScale;
            const gradient = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, glowR);
            gradient.addColorStop(0, 'rgba(255, 215, 0, 0.3)');
            gradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(c.x, c.y, glowR, 0, Math.PI * 2);
            ctx.fill();

            // 阴影
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(c.x + shakeX, c.y + c.radius - 2 + shakeY, c.radius, c.radius * 0.3, 0, 0, Math.PI * 2);
            ctx.fill();

            // 宝箱主体
            const r = c.radius;
            const bx = c.x + shakeX;
            const by = c.y + shakeY;

            // 闪烁
            if (c.hitFlash > 0) {
                ctx.fillStyle = '#ffffff';
            } else {
                ctx.fillStyle = '#8B5A2B'; // 木箱色
            }
            ctx.strokeStyle = '#5C3317';
            ctx.lineWidth = 2;

            // 箱身
            ctx.beginPath();
            ctx.rect(bx - r, by - r * 0.6, r * 2, r * 1.2);
            ctx.fill();
            ctx.stroke();

            // 箱盖（半圆）
            ctx.fillStyle = c.hitFlash > 0 ? '#ffffff' : '#A0522D';
            ctx.beginPath();
            ctx.arc(bx, by - r * 0.6, r, Math.PI, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // 金色装饰条
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(bx - r, by - r * 0.6);
            ctx.lineTo(bx + r, by - r * 0.6);
            ctx.stroke();

            // 锁
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.arc(bx, by - r * 0.6, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#B8860B';
            ctx.lineWidth = 1;
            ctx.stroke();

            // 奖励图标提示
            ctx.fillStyle = c.rewardColor;
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.lineWidth = 2;
            let iconText;
            if (c.rewardType === 0) {
                iconText = c.rewardIcon + c.rewardValue;
            } else {
                iconText = c.rewardIcon + c.rewardValue + 's';
            }
            ctx.strokeText(iconText, bx, by + 2);
            ctx.fillText(iconText, bx, by + 2);

            // 血条
            if (c.hp < c.maxHp) {
                const barW = c.radius * 2;
                const barH = 5;
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                ctx.fillRect(bx - barW / 2, by - c.radius - 12, barW, barH);
                ctx.fillStyle = '#FFD700';
                ctx.fillRect(bx - barW / 2, by - c.radius - 12, barW * (c.hp / c.maxHp), barH);
            }

            ctx.restore();
        }
    }

    // ===== 装备系统 =====
    // 装备定义：每个Boss掉落专属装备
    const equipmentTypes = [
        {
            id: 0,
            bossId: 0, // 龙拳武姬
            name: '降龙戒指',
            icon: '💍',
            color: '#FF6347',
            desc: '飞刀伤害+50%，击退效果翻倍',
            apply: function(p) {
                p.knifeDamage *= 1.5;
                p.equipKnockbackMul = (p.equipKnockbackMul || 1) * 2;
            },
        },
        {
            id: 1,
            bossId: 1, // 焰翼魔女
            name: '火焰披风',
            icon: '🔥',
            color: '#FF4500',
            desc: '飞刀数量+3，飞刀旋转速度+50%',
            apply: function(p) {
                p.knifeCount += 3;
                p.knifeRotationSpeed *= 1.5;
            },
        },
        {
            id: 2,
            bossId: 2, // 暗影忍者姬
            name: '暗影靴',
            icon: '👢',
            color: '#9370DB',
            desc: '移动速度+40%，经验拾取范围+100',
            apply: function(p) {
                p.speed *= 1.4;
                p.expPickupRange += 100;
            },
        },
        {
            id: 3,
            bossId: 3, // 毒膳魔女
            name: '九转护符',
            icon: '🛡️',
            color: '#32CD32',
            desc: '最大HP+50，HP回复+2/秒',
            apply: function(p) {
                p.maxHp += 50;
                p.hp += 50;
                p.hpRegen += 2;
            },
        },
        {
            id: 4,
            bossId: 4, // 黄金龙骑士
            name: '铠甲战盔',
            icon: '👑',
            color: '#FFD700',
            desc: '飞刀尺寸+40%，大招伤害+100%',
            apply: function(p) {
                p.knifeSize *= 1.4;
                p.equipUltDamageMul = (p.equipUltDamageMul || 1) * 2;
            },
        },
    ];

    // 玩家已装备列表（最多3件）
    let playerEquipments = [];
    const MAX_EQUIPS = 3;
    // 装备掉落物
    const equipDrops = [];

    function spawnEquipDrop(x, y, bossId) {
        // 找到对应Boss的装备
        const equip = equipmentTypes.find(e => e.bossId === bossId);
        if (!equip) return;
        equipDrops.push({
            x: x,
            y: y,
            equip: equip,
            radius: 20,
            pulse: 0,
            life: 30, // 30秒后消失
            bob: 0, // 上下浮动动画
        });
    }

    function updateEquipDrops(dt) {
        for (let i = equipDrops.length - 1; i >= 0; i--) {
            const d = equipDrops[i];
            d.pulse += dt * 4;
            d.bob += dt * 3;
            d.life -= dt;

            // 磁吸到玩家
            const dx = player.x - d.x;
            const dy = player.y - d.y;
            const distP = Math.sqrt(dx * dx + dy * dy);
            if (distP < 80) {
                // 靠近时自动飞向玩家
                d.x += dx * 4 * dt;
                d.y += dy * 4 * dt;
            }

            // 拾取
            if (distP < player.radius + d.radius) {
                pickupEquipment(d.equip);
                playChestOpenSound(); // 复用宝箱打开音效
                screenShake = Math.max(screenShake, 6);
                equipDrops.splice(i, 1);
                continue;
            }

            if (d.life <= 0) {
                equipDrops.splice(i, 1);
            }
        }
    }

    function pickupEquipment(equip) {
        // 如果已有同类型装备，不重复拾取
        if (playerEquipments.some(e => e.id === equip.id)) {
            addDamageText(player.x, player.y - 40, '已有 ' + equip.name, '#aaa');
            return;
        }

        // 如果装备已满，移除最旧的
        if (playerEquipments.length >= MAX_EQUIPS) {
            const removed = playerEquipments.shift();
            addDamageText(player.x, player.y - 55, '丢弃 ' + removed.name, '#888');
        }

        // 应用装备效果
        equip.apply(player);
        playerEquipments.push(equip);
        addDamageText(player.x, player.y - 40, '获得 ' + equip.name + '!', equip.color);
        updateEquipmentUI();
    }

    function updateEquipmentUI() {
        for (let i = 0; i < MAX_EQUIPS; i++) {
            const slot = document.getElementById('equip-slot-' + i);
            if (!slot) continue;
            const iconEl = slot.querySelector('.equip-icon');
            const tooltipEl = slot.querySelector('.equip-tooltip');
            if (i < playerEquipments.length) {
                const eq = playerEquipments[i];
                slot.classList.add('filled');
                slot.style.borderColor = eq.color;
                slot.style.boxShadow = '0 0 10px ' + eq.color + '66';
                iconEl.textContent = eq.icon;
                tooltipEl.innerHTML = '<div class="equip-name">' + eq.name + '</div><div class="equip-desc">' + eq.desc + '</div>';
            } else {
                slot.classList.remove('filled');
                slot.style.borderColor = '';
                slot.style.boxShadow = '';
                iconEl.textContent = '';
                tooltipEl.innerHTML = '';
            }
        }
    }

    function drawEquipDrops(ctx) {
        for (const d of equipDrops) {
            ctx.save();
            const bobY = Math.sin(d.bob) * 4;
            const pulseScale = 1 + Math.sin(d.pulse) * 0.15;

            // 光晕
            const glowR = d.radius * 2 * pulseScale;
            const gradient = ctx.createRadialGradient(d.x, d.y + bobY, 0, d.x, d.y + bobY, glowR);
            gradient.addColorStop(0, d.equip.color + '88');
            gradient.addColorStop(0.5, d.equip.color + '33');
            gradient.addColorStop(1, d.equip.color + '00');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(d.x, d.y + bobY, glowR, 0, Math.PI * 2);
            ctx.fill();

            // 阴影
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(d.x, d.y + d.radius - 2, d.radius * 0.8, d.radius * 0.25, 0, 0, Math.PI * 2);
            ctx.fill();

            // 装备主体（菱形宝石）
            const r = d.radius * pulseScale;
            ctx.fillStyle = d.equip.color;
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(d.x, d.y + bobY - r);
            ctx.lineTo(d.x + r * 0.7, d.y + bobY);
            ctx.lineTo(d.x, d.y + bobY + r);
            ctx.lineTo(d.x - r * 0.7, d.y + bobY);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // 高光
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.beginPath();
            ctx.moveTo(d.x, d.y + bobY - r * 0.6);
            ctx.lineTo(d.x + r * 0.3, d.y + bobY - r * 0.1);
            ctx.lineTo(d.x, d.y + bobY);
            ctx.lineTo(d.x - r * 0.2, d.y + bobY - r * 0.2);
            ctx.closePath();
            ctx.fill();

            // 图标
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(d.equip.icon, d.x, d.y + bobY);

            // 即将消失时闪烁
            if (d.life < 5) {
                ctx.globalAlpha = Math.sin(d.life * 8) * 0.5 + 0.5;
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(d.x, d.y + bobY, r + 4, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }
    }

    function resetEquipments() {
        playerEquipments = [];
        equipDrops.length = 0;
        // 重置装备相关属性修饰符
        player.equipKnockbackMul = 1;
        player.equipUltDamageMul = 1;
        updateEquipmentUI();
    }

    // ===== Boss系统 =====
    const bossTypes = [
        {
            id: 0,
            name: '龙拳武姬',
            title: '降龙十八掌',
            color: '#FF6347',
            radius: 38,
            hp: 800,
            speed: 90,
            damage: 35,
            knifeCount: 8,
            knifeDamage: 25,
            knifeOrbitRadius: 75,
            knifeRotationSpeed: 3,
            knifeSize: 28,
            expDrop: 80,
            energyDrop: 50,
            skillName: '亢龙有悔',
            skillInterval: 3.5,
            skillType: 'dash',
            skillDesc: '冲锋突进'
        },
        {
            id: 1,
            name: '焰翼魔女',
            title: '火焰刀宗',
            color: '#FF4500',
            radius: 35,
            hp: 700,
            speed: 95,
            damage: 30,
            knifeCount: 10,
            knifeDamage: 20,
            knifeOrbitRadius: 70,
            knifeRotationSpeed: 4,
            knifeSize: 26,
            expDrop: 70,
            energyDrop: 45,
            skillName: '火焰旋风',
            skillInterval: 4,
            skillType: 'firewave',
            skillDesc: '释放火焰冲击波'
        },
        {
            id: 2,
            name: '暗影忍者姬',
            title: '轮椅暗影',
            color: '#9370DB',
            radius: 33,
            hp: 600,
            speed: 100,
            damage: 28,
            knifeCount: 7,
            knifeDamage: 14,
            knifeOrbitRadius: 60,
            knifeRotationSpeed: 3.5,
            knifeSize: 24,
            expDrop: 60,
            energyDrop: 40,
            skillName: '暗影突袭',
            skillInterval: 4,
            skillType: 'teleport',
            skillDesc: '瞬移到玩家身边'
        },
        {
            id: 3,
            name: '毒膳魔女',
            title: '九转大肠',
            color: '#32CD32',
            radius: 37,
            hp: 750,
            speed: 75,
            damage: 32,
            knifeCount: 9,
            knifeDamage: 22,
            knifeOrbitRadius: 78,
            knifeRotationSpeed: 2.5,
            knifeSize: 27,
            expDrop: 65,
            energyDrop: 42,
            skillName: '九转毒雾',
            skillInterval: 5,
            skillType: 'poison',
            skillDesc: '释放毒雾范围'
        },
        {
            id: 4,
            name: '黄金龙骑士',
            title: '铠甲武圣',
            color: '#FFD700',
            radius: 42,
            hp: 1000,
            speed: 70,
            damage: 40,
            knifeCount: 12,
            knifeDamage: 28,
            knifeOrbitRadius: 85,
            knifeRotationSpeed: 2.8,
            knifeSize: 30,
            expDrop: 100,
            energyDrop: 60,
            skillName: '天降神兵',
            skillInterval: 6,
            skillType: 'summon',
            skillDesc: '召唤小兵'
        },
    ];

    const bosses = [];
    const bossProjectiles = []; // Boss技能弹幕
    let bossSpawnTimer = 0;
    const BOSS_SPAWN_INTERVAL = 180; // 每180秒（3分钟）尝试生成一个Boss
    let bossAlive = false;

    function spawnBoss() {
        if (bossAlive) return;
        const type = bossTypes[randInt(0, bossTypes.length - 1)];

        // 从摄像机视口外生成
        const angle = rand(0, Math.PI * 2);
        const spawnDist = Math.max(camera.viewW, camera.viewH) / 2 + 100;
        let bx = player.x + Math.cos(angle) * spawnDist;
        let by = player.y + Math.sin(angle) * spawnDist;
        bx = clamp(bx, 60, WORLD_WIDTH - 60);
        by = clamp(by, 60, WORLD_HEIGHT - 60);

        const hpScale = 1 + gameTime / 120; // 随时间增强

        bosses.push({
            x: bx,
            y: by,
            type: type,
            name: type.name,
            title: type.title,
            color: type.color,
            radius: type.radius,
            hp: type.hp * hpScale,
            maxHp: type.hp * hpScale,
            speed: type.speed,
            damage: type.damage,
            expDrop: type.expDrop,
            energyDrop: type.energyDrop,
            knifeCount: type.knifeCount,
            knifeDamage: type.knifeDamage,
            knifeOrbitRadius: type.knifeOrbitRadius,
            knifeRotationSpeed: type.knifeRotationSpeed,
            knifeSize: type.knifeSize,
            knifeAngle: 0,
            hitFlash: 0,
            vx: 0,
            vy: 0,
            knockbackTime: 0,
            skillTimer: type.skillInterval,
            skillType: type.skillType,
            skillName: type.skillName,
            // 专属技能状态
            dashTime: 0,
            dashVX: 0,
            dashVY: 0,
            teleportFlash: 0,
            poisonTime: 0,
            summonTimer: 0,
            spawnAnim: 1.0, // 出场动画
            disabledKnives: [], // 被抵消的飞刀
        });

        bossAlive = true;
        playBossSpawnSound();
        screenShake = 12;
        addDamageText(player.x, player.y - 60, '⚠ ' + type.name + ' 来袭!', type.color);
        // 切换到Boss战斗BGM
        switchBGM('boss');
    }

    function getBossKnifePositions(boss) {
        const positions = [];
        const disabledSet = new Set();
        for (const d of boss.disabledKnives) disabledSet.add(d.index);
        let activeCount = 0;
        for (let i = 0; i < boss.knifeCount; i++) {
            if (disabledSet.has(i)) continue;
            activeCount++;
        }
        if (activeCount === 0) return positions;
        for (let i = 0; i < boss.knifeCount; i++) {
            if (disabledSet.has(i)) continue;
            const angle = boss.knifeAngle + (activeCount > 0 ? (positions.length * Math.PI * 2 / activeCount) : 0);
            const kx = boss.x + Math.cos(angle) * boss.knifeOrbitRadius;
            const ky = boss.y + Math.sin(angle) * boss.knifeOrbitRadius;
            positions.push({ x: kx, y: ky, angle: angle, index: i });
        }
        return positions;
    }

    function disableBossKnife(boss) {
        const activeKnives = getBossKnifePositions(boss);
        if (activeKnives.length === 0) return;
        const pick = activeKnives[randInt(0, activeKnives.length - 1)];
        boss.disabledKnives.push({ index: pick.index, restoreTime: 3.0 });
    }

    function updateBosses(dt) {
        for (let i = bosses.length - 1; i >= 0; i--) {
            const b = bosses[i];

            // 出场动画
            if (b.spawnAnim > 0) {
                b.spawnAnim -= dt * 2;
            }

            // 飞刀旋转
            b.knifeAngle += b.knifeRotationSpeed * dt;

            // 闪烁恢复
            if (b.hitFlash > 0) b.hitFlash -= dt;

            // 恢复被抵消的飞刀
            for (let j = b.disabledKnives.length - 1; j >= 0; j--) {
                b.disabledKnives[j].restoreTime -= dt;
                if (b.disabledKnives[j].restoreTime <= 0) {
                    b.disabledKnives.splice(j, 1);
                }
            }

            // 移动逻辑
            const dx = player.x - b.x;
            const dy = player.y - b.y;
            const d = Math.sqrt(dx * dx + dy * dy);

            if (b.dashTime > 0) {
                // 冲锋状态
                b.dashTime -= dt;
                b.x += b.dashVX * dt;
                b.y += b.dashVY * dt;
            } else if (b.knockbackTime > 0) {
                b.knockbackTime -= dt;
                b.x += b.vx * dt;
                b.y += b.vy * dt;
                b.vx *= 0.9;
                b.vy *= 0.9;
            } else if (d > 0) {
                b.x += (dx / d) * b.speed * dt;
                b.y += (dy / d) * b.speed * dt;
            }

            b.x = clamp(b.x, b.radius, WORLD_WIDTH - b.radius);
            b.y = clamp(b.y, b.radius, WORLD_HEIGHT - b.radius);

            // 技能计时
            b.skillTimer -= dt;
            if (b.skillTimer <= 0) {
                b.skillTimer = b.type.skillInterval;
                executeBossSkill(b);
            }

            // 毒雾持续
            if (b.poisonTime > 0) {
                b.poisonTime -= dt;
                // 毒雾范围内伤害玩家
                if (d < 120) {
                    player.takeDamage(5 * dt);
                }
            }

            // 瞬移闪光
            if (b.teleportFlash > 0) b.teleportFlash -= dt;

            // 与玩家碰撞
            if (d < b.radius + player.radius) {
                player.takeDamage(b.damage);
                if (d > 0) {
                    b.vx = -(dx / d) * 200;
                    b.vy = -(dy / d) * 200;
                    b.knockbackTime = 0.15;
                }
            }

            // 玩家飞刀碰撞检测 - 对Boss造成伤害
            const playerKnives = player.getKnifePositions();
            for (const k of playerKnives) {
                const kd = dist(k.x, k.y, b.x, b.y);
                if (kd < player.knifeSize + b.radius) {
                    if (b.hitFlash <= 0) {
                        b.hp -= player.knifeDamage;
                        b.hitFlash = 0.12;
                        playHitSound();
                        addDamageText(b.x, b.y - b.radius - 5, '-' + player.knifeDamage, '#ff4444');
                        // 击退
                        const kdx = b.x - player.x;
                        const kdy = b.y - player.y;
                        const kd2 = Math.sqrt(kdx * kdx + kdy * kdy);
                        if (kd2 > 0) {
                            b.vx = (kdx / kd2) * 80;
                            b.vy = (kdy / kd2) * 80;
                            b.knockbackTime = 0.05;
                        }
                    }
                }
            }

            // Boss飞刀与玩家飞刀碰撞抵消
            const bossKnives = getBossKnifePositions(b);
            let playerKnifeDisabled = false;
            let bossKnifeDisabled = false;
            for (const bk of bossKnives) {
                for (const pk of playerKnives) {
                    const kd = dist(bk.x, bk.y, pk.x, pk.y);
                    if (kd < b.knifeSize + player.knifeSize) {
                        // 双方各抵消一把飞刀，3秒后恢复
                        if (!bossKnifeDisabled) {
                            disableBossKnife(b);
                            bossKnifeDisabled = true;
                        }
                        if (!playerKnifeDisabled) {
                            player.disableKnife();
                            playerKnifeDisabled = true;
                        }
                        playBossKnifeClashSound();
                        spawnClashParticles(bk.x, bk.y);
                        break;
                    }
                }
                if (bossKnifeDisabled && playerKnifeDisabled) break;
            }

            // Boss飞刀伤害玩家
            for (const bk of bossKnives) {
                const kd = dist(bk.x, bk.y, player.x, player.y);
                if (kd < b.knifeSize + player.radius) {
                    player.takeDamage(b.knifeDamage);
                    break;
                }
            }

            // Boss死亡
            if (b.hp <= 0) {
                spawnExpOrb(b.x, b.y, b.expDrop);
                player.gainEnergy(b.energyDrop);
                // 掉落装备
                spawnEquipDrop(b.x, b.y, b.type.id);
                playBossDeathSound();
                screenShake = 20;
                addDamageText(b.x, b.y, '击杀 ' + b.name + '!', b.color);
                bosses.splice(i, 1);
                bossAlive = false;
                // Boss死亡，恢复普通BGM
                switchBGM('normal');
            }
        }

        // Boss定时生成
        bossSpawnTimer += dt;
        if (bossSpawnTimer >= BOSS_SPAWN_INTERVAL) {
            bossSpawnTimer = 0;
            spawnBoss();
        }
    }

    // 飞刀碰撞粒子
    const clashParticles = [];
    function spawnClashParticles(x, y) {
        for (let i = 0; i < 5; i++) {
            const angle = rand(0, Math.PI * 2);
            const speed = rand(50, 150);
            clashParticles.push({
                x: x, y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.3,
                maxLife: 0.3,
                size: rand(2, 4)
            });
        }
    }

    function updateClashParticles(dt) {
        for (let i = clashParticles.length - 1; i >= 0; i--) {
            const p = clashParticles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= 0.9;
            p.vy *= 0.9;
            p.life -= dt;
            if (p.life <= 0) clashParticles.splice(i, 1);
        }
    }

    function drawClashParticles(ctx) {
        for (const p of clashParticles) {
            ctx.save();
            ctx.globalAlpha = p.life / p.maxLife;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    function executeBossSkill(b) {
        switch (b.skillType) {
            case 'dash': {
                // 龙拳武姬 - 亢龙有悔：向玩家方向冲锋
                const dx = player.x - b.x;
                const dy = player.y - b.y;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d > 0) {
                    b.dashVX = (dx / d) * 400;
                    b.dashVY = (dy / d) * 400;
                }
                b.dashTime = 0.6;
                speakSkillName(b.skillName);
                addDamageText(b.x, b.y - b.radius - 10, b.skillName + '!', b.color);
                screenShake = 12;
                break;
            }
            case 'firewave': {
                // 焰翼魔女 - 火焰旋风：释放火焰弹幕
                speakSkillName(b.skillName);
                addDamageText(b.x, b.y - b.radius - 10, b.skillName + '!', b.color);
                for (let i = 0; i < 16; i++) {
                    const angle = (i / 16) * Math.PI * 2;
                    bossProjectiles.push({
                        x: b.x, y: b.y,
                        vx: Math.cos(angle) * 250,
                        vy: Math.sin(angle) * 250,
                        radius: 12,
                        damage: 25,
                        life: 3.5,
                        color: '#FF4500',
                        type: 'fire'
                    });
                }
                screenShake = 10;
                break;
            }
            case 'teleport': {
                // 暗影忍者姬 - 暗影突袭：瞬移到玩家附近
                const angle = rand(0, Math.PI * 2);
                const tpDist = 80;
                b.x = player.x + Math.cos(angle) * tpDist;
                b.y = player.y + Math.sin(angle) * tpDist;
                b.x = clamp(b.x, b.radius, WORLD_WIDTH - b.radius);
                b.y = clamp(b.y, b.radius, WORLD_HEIGHT - b.radius);
                b.teleportFlash = 0.5;
                speakSkillName(b.skillName);
                addDamageText(b.x, b.y - b.radius - 10, b.skillName + '!', b.color);
                break;
            }
            case 'poison': {
                // 毒膳魔女 - 九转毒雾：释放毒雾
                b.poisonTime = 4;
                speakSkillName(b.skillName);
                addDamageText(b.x, b.y - b.radius - 10, b.skillName + '!', b.color);
                // 生成毒雾粒子
                for (let i = 0; i < 25; i++) {
                    const angle = rand(0, Math.PI * 2);
                    const dist = rand(20, 120);
                    bossProjectiles.push({
                        x: b.x + Math.cos(angle) * dist,
                        y: b.y + Math.sin(angle) * dist,
                        vx: 0, vy: 0,
                        radius: 18,
                        damage: 4,
                        life: 4,
                        color: '#32CD32',
                        type: 'poison'
                    });
                }
                break;
            }
            case 'summon': {
                // 黄金龙骑士 - 天降神兵：召唤小兵
                speakSkillName(b.skillName);
                addDamageText(b.x, b.y - b.radius - 10, b.skillName + '!', b.color);
                const summonCount = 6;
                for (let i = 0; i < summonCount; i++) {
                    const angle = (i / summonCount) * Math.PI * 2;
                    const sx = b.x + Math.cos(angle) * 60;
                    const sy = b.y + Math.sin(angle) * 60;
                    enemies.push({
                        x: sx, y: sy,
                        type: enemyTypes[0],
                        radius: 14,
                        hp: 30, maxHp: 30,
                        speed: 90,
                        damage: 15,
                        color: '#ff4444',
                        expDrop: 3,
                        shape: 'circle',
                        hitFlash: 0,
                        vx: 0, vy: 0,
                        knockbackTime: 0
                    });
                }
                screenShake = 8;
                break;
            }
        }
    }

    function updateBossProjectiles(dt) {
        for (let i = bossProjectiles.length - 1; i >= 0; i--) {
            const p = bossProjectiles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;

            // 与玩家碰撞
            const d = dist(p.x, p.y, player.x, player.y);
            if (d < p.radius + player.radius) {
                player.takeDamage(p.damage);
                // 冰法师投射物：减速玩家
                if (p.type === 'ice') {
                    player.slowTime = 1.5; // 1.5秒减速
                }
                if (p.type !== 'poison') {
                    bossProjectiles.splice(i, 1);
                    continue;
                }
            }

            if (p.life <= 0) {
                bossProjectiles.splice(i, 1);
            }
        }
    }

    function drawBossProjectiles(ctx) {
        for (const p of bossProjectiles) {
            ctx.save();
            if (p.type === 'fire') {
                // 火球
                const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
                gradient.addColorStop(0, 'rgba(255, 200, 0, 0.9)');
                gradient.addColorStop(0.5, 'rgba(255, 100, 0, 0.6)');
                gradient.addColorStop(1, 'rgba(255, 50, 0, 0)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'poison') {
                // 毒雾
                ctx.globalAlpha = p.life / 3 * 0.5;
                const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
                gradient.addColorStop(0, 'rgba(50, 205, 50, 0.4)');
                gradient.addColorStop(1, 'rgba(50, 205, 50, 0)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'arrow') {
                // 弓箭手箭矢
                const angle = Math.atan2(p.vy, p.vx);
                ctx.translate(p.x, p.y);
                ctx.rotate(angle);
                ctx.fillStyle = p.color;
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(p.radius, 0);
                ctx.lineTo(-p.radius, -p.radius * 0.4);
                ctx.lineTo(-p.radius * 0.6, 0);
                ctx.lineTo(-p.radius, p.radius * 0.4);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            } else if (p.type === 'ice') {
                // 冰法师冰锥
                const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 1.5);
                gradient.addColorStop(0, 'rgba(135, 206, 250, 0.9)');
                gradient.addColorStop(0.5, 'rgba(30, 144, 255, 0.6)');
                gradient.addColorStop(1, 'rgba(30, 144, 255, 0)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fill();
                // 冰晶核心
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius * 0.4, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
    }

    function drawBosses(ctx) {
        for (const b of bosses) {
            ctx.save();

            // 出场动画：缩放
            const spawnScale = b.spawnAnim > 0 ? (1 - b.spawnAnim) : 1;
            if (spawnScale < 0.1) {
                ctx.restore();
                continue;
            }

            // Boss飞刀
            const bossKnives = getBossKnifePositions(b);
            for (const k of bossKnives) {
                ctx.save();
                ctx.translate(k.x, k.y);
                ctx.rotate(k.angle + Math.PI / 4);

                // Boss飞刀颜色根据Boss类型
                const knifeColor = b.hitFlash > 0 ? '#ffffff' : b.color;

                ctx.fillStyle = knifeColor;
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1;

                // 刀刃
                ctx.beginPath();
                ctx.moveTo(b.knifeSize, 0);
                ctx.lineTo(-b.knifeSize * 0.3, -b.knifeSize * 0.4);
                ctx.lineTo(-b.knifeSize * 0.3, b.knifeSize * 0.4);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                // 刀柄
                ctx.fillStyle = '#4A3520';
                ctx.fillRect(-b.knifeSize * 0.5, -b.knifeSize * 0.2, b.knifeSize * 0.3, b.knifeSize * 0.4);

                ctx.restore();
            }

            // 阴影
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(b.x, b.y + b.radius - 2, b.radius * spawnScale, b.radius * 0.3, 0, 0, Math.PI * 2);
            ctx.fill();

            // 瞬移闪光
            if (b.teleportFlash > 0) {
                ctx.globalAlpha = b.teleportFlash;
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.radius * 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }

            // Boss身体 — 根据Boss类型绘制不同二次元形象
            const r = b.radius * spawnScale;
            const bx = b.x, by = b.y;
            const flash = b.hitFlash > 0;
            const bossType = b.type.id;

            if (bossType === 0) {
                // 龙拳武姬 → 龙拳武姬
                // 长发飘动
                const hairFlow = Math.sin(gameTime * 4) * r * 0.05;
                ctx.fillStyle = flash ? '#fff' : '#1a0a0a';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(bx - r * 0.4, by - r * 0.3);
                ctx.quadraticCurveTo(bx - r * 0.8, by + r * 0.2 + hairFlow, bx - r * 0.5, by + r * 0.9);
                ctx.lineTo(bx + r * 0.5, by + r * 0.9);
                ctx.quadraticCurveTo(bx + r * 0.8, by + r * 0.2 + hairFlow, bx + r * 0.4, by - r * 0.3);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                // 身体（红色武术服）
                ctx.fillStyle = flash ? '#fff' : b.color;
                ctx.beginPath();
                ctx.ellipse(bx, by + r * 0.15, r * 0.6, r * 0.55, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 腰带
                ctx.fillStyle = '#FFD700';
                ctx.fillRect(bx - r * 0.5, by + r * 0.3, r, r * 0.12);
                // 头
                ctx.fillStyle = '#FFEFD5';
                ctx.beginPath();
                ctx.arc(bx, by - r * 0.35, r * 0.42, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 前发
                ctx.fillStyle = flash ? '#fff' : '#1a0a0a';
                ctx.beginPath();
                ctx.arc(bx, by - r * 0.55, r * 0.44, Math.PI, 0);
                ctx.fill();
                // 龙角装饰
                ctx.fillStyle = '#FFD700';
                ctx.beginPath();
                ctx.moveTo(bx - r * 0.3, by - r * 0.75);
                ctx.lineTo(bx - r * 0.4, by - r * 0.95);
                ctx.lineTo(bx - r * 0.15, by - r * 0.8);
                ctx.closePath();
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(bx + r * 0.3, by - r * 0.75);
                ctx.lineTo(bx + r * 0.4, by - r * 0.95);
                ctx.lineTo(bx + r * 0.15, by - r * 0.8);
                ctx.closePath();
                ctx.fill();
                // 眼睛（锐利）
                ctx.fillStyle = '#FF0000';
                ctx.shadowColor = '#FF0000';
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.ellipse(bx - r * 0.15, by - r * 0.3, r * 0.07, r * 0.05, -0.2, 0, Math.PI * 2);
                ctx.ellipse(bx + r * 0.15, by - r * 0.3, r * 0.07, r * 0.05, 0.2, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 怒眉
                ctx.strokeStyle = '#1a0a0a';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(bx - r * 0.28, by - r * 0.48);
                ctx.lineTo(bx - r * 0.05, by - r * 0.38);
                ctx.moveTo(bx + r * 0.28, by - r * 0.48);
                ctx.lineTo(bx + r * 0.05, by - r * 0.38);
                ctx.stroke();
                // 嘴（冷笑）
                ctx.strokeStyle = '#8B0000';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(bx - r * 0.1, by - r * 0.1);
                ctx.quadraticCurveTo(bx, by - r * 0.05, bx + r * 0.12, by - r * 0.12);
                ctx.stroke();

            } else if (bossType === 1) {
                // 焰翼魔女 → 焰翼魔女
                // 火焰翅膀
                const wingFlap = Math.sin(gameTime * 6) * r * 0.08;
                ctx.fillStyle = flash ? '#fff' : 'rgba(255,69,0,0.5)';
                ctx.strokeStyle = '#FF4500';
                ctx.lineWidth = 2;
                // 左翼
                ctx.beginPath();
                ctx.moveTo(bx - r * 0.5, by);
                ctx.quadraticCurveTo(bx - r * 1.5, by - r * 0.8 + wingFlap, bx - r * 1.2, by + r * 0.3);
                ctx.quadraticCurveTo(bx - r * 0.9, by - r * 0.3, bx - r * 0.5, by);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                // 右翼
                ctx.beginPath();
                ctx.moveTo(bx + r * 0.5, by);
                ctx.quadraticCurveTo(bx + r * 1.5, by - r * 0.8 + wingFlap, bx + r * 1.2, by + r * 0.3);
                ctx.quadraticCurveTo(bx + r * 0.9, by - r * 0.3, bx + r * 0.5, by);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                // 火焰粒子
                ctx.fillStyle = 'rgba(255,140,0,0.6)';
                for (let p = 0; p < 4; p++) {
                    const pa = gameTime * 3 + p * 1.6;
                    ctx.beginPath();
                    ctx.arc(bx + Math.cos(pa) * r * 1.0, by + Math.sin(pa) * r * 0.6 - r * 0.3, r * 0.06, 0, Math.PI * 2);
                    ctx.fill();
                }
                // 身体（火焰礼服）
                ctx.fillStyle = flash ? '#fff' : b.color;
                ctx.strokeStyle = '#8B0000';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(bx - r * 0.5, by - r * 0.1);
                ctx.lineTo(bx - r * 0.7, by + r * 0.8);
                ctx.lineTo(bx + r * 0.7, by + r * 0.8);
                ctx.lineTo(bx + r * 0.5, by - r * 0.1);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                // 头
                ctx.fillStyle = '#FFEFD5';
                ctx.beginPath();
                ctx.arc(bx, by - r * 0.4, r * 0.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 火焰发
                ctx.fillStyle = flash ? '#fff' : '#FF6347';
                ctx.strokeStyle = '#8B0000';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(bx - r * 0.35, by - r * 0.6);
                ctx.quadraticCurveTo(bx - r * 0.5, by - r * 1.0, bx - r * 0.1, by - r * 1.1);
                ctx.quadraticCurveTo(bx, by - r * 0.9, bx + r * 0.1, by - r * 1.1);
                ctx.quadraticCurveTo(bx + r * 0.5, by - r * 1.0, bx + r * 0.35, by - r * 0.6);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                // 火焰皇冠
                ctx.fillStyle = '#FFD700';
                ctx.beginPath();
                ctx.moveTo(bx, by - r * 1.05);
                ctx.lineTo(bx - r * 0.08, by - r * 0.85);
                ctx.lineTo(bx + r * 0.08, by - r * 0.85);
                ctx.closePath();
                ctx.fill();
                // 眼睛
                ctx.fillStyle = '#FFD700';
                ctx.shadowColor = '#FFA500';
                ctx.shadowBlur = 6;
                ctx.beginPath();
                ctx.arc(bx - r * 0.14, by - r * 0.35, r * 0.07, 0, Math.PI * 2);
                ctx.arc(bx + r * 0.14, by - r * 0.35, r * 0.07, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.arc(bx - r * 0.14, by - r * 0.35, r * 0.03, 0, Math.PI * 2);
                ctx.arc(bx + r * 0.14, by - r * 0.35, r * 0.03, 0, Math.PI * 2);
                ctx.fill();
                // 嘴
                ctx.strokeStyle = '#8B0000';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(bx, by - r * 0.18, r * 0.08, 0, Math.PI);
                ctx.stroke();

            } else if (bossType === 2) {
                // 暗影忍者姬 → 暗影忍者姬
                // 残影效果
                ctx.globalAlpha = 0.3;
                ctx.fillStyle = b.color;
                for (let s = 1; s <= 2; s++) {
                    ctx.beginPath();
                    ctx.arc(bx - s * r * 0.15, by, r * 0.5, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.globalAlpha = 1;
                // 身体（紫色忍者服）
                ctx.fillStyle = flash ? '#fff' : b.color;
                ctx.strokeStyle = '#4B0082';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.ellipse(bx, by + r * 0.1, r * 0.55, r * 0.6, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 腰带
                ctx.fillStyle = '#1a1a2e';
                ctx.fillRect(bx - r * 0.5, by + r * 0.25, r, r * 0.1);
                // 头
                ctx.fillStyle = '#FFEFD5';
                ctx.beginPath();
                ctx.arc(bx, by - r * 0.4, r * 0.38, 0, Math.PI * 2);
                ctx.fill();
                // 忍者面罩（下半脸）
                ctx.fillStyle = flash ? '#fff' : '#2a1a3e';
                ctx.beginPath();
                ctx.ellipse(bx, by - r * 0.2, r * 0.35, r * 0.25, 0, 0, Math.PI * 2);
                ctx.fill();
                // 头巾
                ctx.fillStyle = flash ? '#fff' : b.color;
                ctx.strokeStyle = '#4B0082';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(bx, by - r * 0.55, r * 0.42, Math.PI, 0);
                ctx.fill();
                ctx.stroke();
                // 飘带
                const ribbonFlow = Math.sin(gameTime * 8) * r * 0.12;
                ctx.beginPath();
                ctx.moveTo(bx + r * 0.38, by - r * 0.55);
                ctx.quadraticCurveTo(bx + r * 0.8, by - r * 0.4 + ribbonFlow, bx + r * 1.1, by - r * 0.15 + ribbonFlow);
                ctx.lineTo(bx + r * 1.0, by + ribbonFlow);
                ctx.quadraticCurveTo(bx + r * 0.7, by - r * 0.3 + ribbonFlow, bx + r * 0.35, by - r * 0.5);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                // 眼睛（锐利）
                ctx.fillStyle = '#9370DB';
                ctx.shadowColor = '#9370DB';
                ctx.shadowBlur = 5;
                ctx.beginPath();
                ctx.ellipse(bx - r * 0.13, by - r * 0.38, r * 0.06, r * 0.04, -0.2, 0, Math.PI * 2);
                ctx.ellipse(bx + r * 0.13, by - r * 0.38, r * 0.06, r * 0.04, 0.2, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // 暗影匕首
                ctx.fillStyle = '#C0C0C0';
                ctx.strokeStyle = '#444';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(bx + r * 0.5, by + r * 0.2);
                ctx.lineTo(bx + r * 0.7, by + r * 0.05);
                ctx.lineTo(bx + r * 0.55, by + r * 0.3);
                ctx.lineTo(bx + r * 0.45, by + r * 0.35);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

            } else if (bossType === 3) {
                // 毒膳魔女 → 毒膳魔女
                // 厨师高帽
                ctx.fillStyle = flash ? '#fff' : '#FFFFFF';
                ctx.strokeStyle = '#228B22';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.ellipse(bx, by - r * 0.7, r * 0.4, r * 0.2, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.beginPath();
                ctx.ellipse(bx, by - r * 0.9, r * 0.35, r * 0.25, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 帽子绿色毒纹
                ctx.fillStyle = 'rgba(50,205,50,0.4)';
                ctx.beginPath();
                ctx.arc(bx - r * 0.15, by - r * 0.9, r * 0.08, 0, Math.PI * 2);
                ctx.arc(bx + r * 0.1, by - r * 0.85, r * 0.06, 0, Math.PI * 2);
                ctx.fill();
                // 身体（绿色厨服）
                ctx.fillStyle = flash ? '#fff' : b.color;
                ctx.strokeStyle = '#006400';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.ellipse(bx, by + r * 0.1, r * 0.6, r * 0.55, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 围裙
                ctx.fillStyle = '#FFFACD';
                ctx.beginPath();
                ctx.moveTo(bx - r * 0.35, by);
                ctx.lineTo(bx - r * 0.4, by + r * 0.7);
                ctx.lineTo(bx + r * 0.4, by + r * 0.7);
                ctx.lineTo(bx + r * 0.35, by);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                // 围裙污渍
                ctx.fillStyle = 'rgba(50,205,50,0.3)';
                ctx.beginPath();
                ctx.arc(bx - r * 0.15, by + r * 0.3, r * 0.06, 0, Math.PI * 2);
                ctx.arc(bx + r * 0.2, by + r * 0.5, r * 0.08, 0, Math.PI * 2);
                ctx.fill();
                // 头
                ctx.fillStyle = '#FFEFD5';
                ctx.beginPath();
                ctx.arc(bx, by - r * 0.35, r * 0.4, 0, Math.PI * 2);
                ctx.fill();
                // 眼睛（疯狂眼神）
                ctx.fillStyle = '#32CD32';
                ctx.shadowColor = '#32CD32';
                ctx.shadowBlur = 6;
                ctx.beginPath();
                ctx.arc(bx - r * 0.16, by - r * 0.32, r * 0.08, 0, Math.PI * 2);
                ctx.arc(bx + r * 0.16, by - r * 0.32, r * 0.08, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.arc(bx - r * 0.14, by - r * 0.3, r * 0.04, 0, Math.PI * 2);
                ctx.arc(bx + r * 0.18, by - r * 0.3, r * 0.04, 0, Math.PI * 2);
                ctx.fill();
                // 嘴（疯狂笑）
                ctx.strokeStyle = '#006400';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(bx, by - r * 0.12, r * 0.12, 0.1, Math.PI - 0.1);
                ctx.stroke();
                // 牙齿
                ctx.fillStyle = '#FFF';
                ctx.fillRect(bx - r * 0.06, by - r * 0.1, r * 0.12, r * 0.04);
                // 毒雾粒子
                ctx.fillStyle = 'rgba(50,205,50,0.3)';
                for (let p = 0; p < 5; p++) {
                    const pa = gameTime * 1.5 + p * 1.26;
                    ctx.beginPath();
                    ctx.arc(bx + Math.cos(pa) * r * 1.1, by + r * 0.2 + Math.sin(pa) * r * 0.7, r * 0.08, 0, Math.PI * 2);
                    ctx.fill();
                }

            } else if (bossType === 4) {
                // 黄金龙骑士 → 黄金龙骑士
                // 翅膀（金色龙翼）
                const wingFlap = Math.sin(gameTime * 5) * r * 0.06;
                ctx.fillStyle = flash ? '#fff' : 'rgba(255,215,0,0.4)';
                ctx.strokeStyle = '#B8860B';
                ctx.lineWidth = 2.5;
                // 左翼
                ctx.beginPath();
                ctx.moveTo(bx - r * 0.5, by - r * 0.1);
                ctx.quadraticCurveTo(bx - r * 1.6, by - r * 0.6 + wingFlap, bx - r * 1.3, by + r * 0.4);
                ctx.quadraticCurveTo(bx - r * 0.9, by, bx - r * 0.5, by - r * 0.1);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                // 右翼
                ctx.beginPath();
                ctx.moveTo(bx + r * 0.5, by - r * 0.1);
                ctx.quadraticCurveTo(bx + r * 1.6, by - r * 0.6 + wingFlap, bx + r * 1.3, by + r * 0.4);
                ctx.quadraticCurveTo(bx + r * 0.9, by, bx + r * 0.5, by - r * 0.1);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                // 翼骨
                ctx.strokeStyle = '#8B6914';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(bx - r * 0.5, by - r * 0.1);
                ctx.lineTo(bx - r * 1.3, by + r * 0.3 + wingFlap);
                ctx.moveTo(bx + r * 0.5, by - r * 0.1);
                ctx.lineTo(bx + r * 1.3, by + r * 0.3 + wingFlap);
                ctx.stroke();
                // 身体（金色铠甲）
                ctx.fillStyle = flash ? '#fff' : b.color;
                ctx.strokeStyle = '#B8860B';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.ellipse(bx, by + r * 0.1, r * 0.6, r * 0.6, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 铠甲胸板
                ctx.fillStyle = '#DAA520';
                ctx.beginPath();
                ctx.moveTo(bx, by - r * 0.2);
                ctx.lineTo(bx - r * 0.3, by + r * 0.15);
                ctx.lineTo(bx, by + r * 0.4);
                ctx.lineTo(bx + r * 0.3, by + r * 0.15);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                // 胸板龙纹
                ctx.strokeStyle = '#8B6914';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(bx - r * 0.15, by);
                ctx.lineTo(bx + r * 0.15, by);
                ctx.moveTo(bx, by - r * 0.1);
                ctx.lineTo(bx, by + r * 0.3);
                ctx.stroke();
                // 肩甲
                ctx.fillStyle = '#DAA520';
                ctx.strokeStyle = '#B8860B';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(bx - r * 0.6, by - r * 0.1, r * 0.2, 0, Math.PI * 2);
                ctx.arc(bx + r * 0.6, by - r * 0.1, r * 0.2, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 头盔
                ctx.fillStyle = flash ? '#fff' : b.color;
                ctx.strokeStyle = '#B8860B';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(bx, by - r * 0.4, r * 0.42, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // 头盔龙角
                ctx.fillStyle = '#DAA520';
                ctx.beginPath();
                ctx.moveTo(bx - r * 0.25, by - r * 0.7);
                ctx.lineTo(bx - r * 0.35, by - r * 0.95);
                ctx.lineTo(bx - r * 0.12, by - r * 0.78);
                ctx.closePath();
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(bx + r * 0.25, by - r * 0.7);
                ctx.lineTo(bx + r * 0.35, by - r * 0.95);
                ctx.lineTo(bx + r * 0.12, by - r * 0.78);
                ctx.closePath();
                ctx.fill();
                // 面甲缝
                ctx.fillStyle = '#1a1a1a';
                ctx.fillRect(bx - r * 0.05, by - r * 0.55, r * 0.1, r * 0.3);
                ctx.fillRect(bx - r * 0.15, by - r * 0.38, r * 0.3, r * 0.05);
                // 眼睛（缝中发光）
                ctx.fillStyle = '#FFD700';
                ctx.shadowColor = '#FFD700';
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(bx - r * 0.1, by - r * 0.35, r * 0.04, 0, Math.PI * 2);
                ctx.arc(bx + r * 0.1, by - r * 0.35, r * 0.04, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            }

            // 名称
            ctx.fillStyle = b.color;
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.lineWidth = 2;
            ctx.strokeText(b.name, b.x, b.y - r - 25);
            ctx.fillText(b.name, b.x, b.y - r - 25);

            // 血条
            const barW = r * 2.5;
            const barH = 8;
            const barY = b.y - r - 18;
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(b.x - barW / 2, barY, barW, barH);
            // 血条颜色根据血量
            const hpRatio = b.hp / b.maxHp;
            ctx.fillStyle = hpRatio > 0.5 ? '#ff4444' : (hpRatio > 0.25 ? '#ff8800' : '#ff0066');
            ctx.fillRect(b.x - barW / 2, barY, barW * hpRatio, barH);
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.strokeRect(b.x - barW / 2, barY, barW, barH);

            // 毒雾效果
            if (b.poisonTime > 0) {
                ctx.globalAlpha = 0.2;
                ctx.fillStyle = '#32CD32';
                ctx.beginPath();
                ctx.arc(b.x, b.y, 120, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }

            ctx.restore();
        }
    }

    // ===== 技能系统 =====
    const skills = [
        {
            id: 'attack',
            name: '小无相功',
            icon: '⚔️',
            desc: '提高飞刀攻击力 +5',
            maxLevel: 10,
            level: 0,
            apply: () => { player.knifeDamage += 5; }
        },
        {
            id: 'speed',
            name: '凌波微步',
            icon: '🏃',
            desc: '提高自身移动速度 +30',
            maxLevel: 8,
            level: 0,
            apply: () => { player.speed += 30; }
        },
        {
            id: 'hp',
            name: '易筋经',
            icon: '❤️',
            desc: '增加最大HP +30 并回满',
            maxLevel: 10,
            level: 0,
            apply: () => { player.maxHp += 30; player.hp = player.maxHp; }
        },
        {
            id: 'regen',
            name: '回春功',
            icon: '💚',
            desc: 'HP回复速度 +1/秒',
            maxLevel: 8,
            level: 0,
            apply: () => { player.hpRegen += 1; }
        },
        {
            id: 'knife',
            name: '火焰刀',
            icon: '🗡️',
            desc: '增加飞刀数量 +1',
            maxLevel: 8,
            level: 0,
            apply: () => { player.knifeCount += 1; }
        },
        {
            id: 'rotate',
            name: '控鹤功',
            icon: '🌀',
            desc: '加快飞刀旋转速度 +0.8',
            maxLevel: 8,
            level: 0,
            apply: () => { player.knifeRotationSpeed += 0.8; }
        },
        {
            id: 'range',
            name: '吸星大法',
            icon: '🧲',
            desc: '扩大经验拾取范围 +20',
            maxLevel: 6,
            level: 0,
            apply: () => { player.expPickupRange += 20; }
        },
        {
            id: 'radius',
            name: '大金刚掌',
            icon: '📡',
            desc: '扩大飞刀轨道半径 +15',
            maxLevel: 6,
            level: 0,
            apply: () => { player.knifeOrbitRadius += 15; }
        },
    ];

    function getAvailableSkills() {
        return skills.filter(s => s.level < s.maxLevel);
    }

    function triggerUpgrade() {
        gameState = GameState.UPGRADE;
        showUpgradeOptions();
    }

    function showUpgradeOptions() {
        const available = getAvailableSkills();
        // 随机选3个
        const shuffled = available.slice().sort(() => Math.random() - 0.5);
        const choices = shuffled.slice(0, 3);

        const container = document.getElementById('upgrade-options');
        container.innerHTML = '';

        if (choices.length === 0) {
            // 没有可用技能，直接恢复
            gameState = GameState.PLAYING;
            return;
        }

        for (const skill of choices) {
            const card = document.createElement('div');
            card.className = 'upgrade-card';
            card.innerHTML = `
                <div class="upgrade-icon">${skill.icon}</div>
                <div class="upgrade-name">${skill.name}</div>
                <div class="upgrade-desc">${skill.desc}</div>
                <div class="upgrade-level">Lv.${skill.level} → Lv.${skill.level + 1}</div>
            `;
            // 同时绑定 click 和 touchend，确保手机端可点选
            let upgradeTouched = false;
            const selectSkill = () => {
                skill.level++;
                skill.apply();
                document.getElementById('upgrade-screen').style.display = 'none';
                gameState = GameState.PLAYING;
            };
            card.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                upgradeTouched = true;
                selectSkill();
            }, { passive: false });
            card.addEventListener('click', (e) => {
                if (upgradeTouched) { e.preventDefault(); return; }
                selectSkill();
            });
            container.appendChild(card);
        }

        document.getElementById('upgrade-screen').style.display = 'flex';
    }

    // ===== 摄像机更新 =====
    function updateCamera(dt) {
        // 摄像机跟随玩家，以玩家为中心
        camera.targetX = player.x - camera.viewW / 2;
        camera.targetY = player.y - camera.viewH / 2;

        // 平滑跟随
        camera.x = lerp(camera.x, camera.targetX, Math.min(1, dt * 8));
        camera.y = lerp(camera.y, camera.targetY, Math.min(1, dt * 8));

        // 限制在地图范围内
        camera.x = clamp(camera.x, 0, Math.max(0, WORLD_WIDTH - camera.viewW));
        camera.y = clamp(camera.y, 0, Math.max(0, WORLD_HEIGHT - camera.viewH));
    }

    // ===== 敌人生成管理 =====
    let spawnTimer = 0;
    let spawnInterval = 2.0; // 每2秒生成一个

    // ===== 怪物潮系统 =====
    const HORDE_INTERVAL = 300; // 每5分钟（300秒）触发一次怪物潮
    const HORDE_DURATION = 30; // 怪物潮持续30秒
    let hordeTimer = 0;
    let hordeActive = false;
    let hordeActiveTimer = 0; // 怪物潮剩余时间
    let hordeSpawnTimer = 0; // 怪物潮内生成计时器
    let hordeCount = 0; // 第几次怪物潮

    function updateSpawning(dt) {
        spawnTimer += dt;
        // 随时间加快生成速度
        spawnInterval = Math.max(0.3, 2.0 - gameTime * 0.02);

        if (spawnTimer >= spawnInterval) {
            spawnTimer = 0;
            const maxEnemies = Math.min(20 + Math.floor(gameTime / 10), 50);
            if (enemies.length < maxEnemies) {
                spawnEnemy();
                // 高难度时一次生成多个
                if (gameTime > 60 && Math.random() < 0.3) {
                    spawnEnemy();
                }
            }
        }

        // === 怪物潮逻辑 ===
        if (!hordeActive) {
            hordeTimer += dt;
            if (hordeTimer >= HORDE_INTERVAL) {
                // 触发怪物潮
                hordeActive = true;
                hordeTimer = 0;
                hordeActiveTimer = HORDE_DURATION;
                hordeSpawnTimer = 0;
                hordeCount++;
                // 警告提示
                addDamageText(player.x, player.y - 70, '⚠ 怪物潮来袭！', '#FF0000');
                screenShake = Math.max(screenShake, 15);
                // 切换紧张BGM
                switchBGM('boss');
                // 立即生成一波敌人
                for (let i = 0; i < 10 + hordeCount * 3; i++) {
                    spawnHordeEnemy();
                }
            }
        } else {
            // 怪物潮进行中
            hordeActiveTimer -= dt;
            hordeSpawnTimer += dt;
            // 每0.3秒生成一批敌人
            if (hordeSpawnTimer >= 0.3) {
                hordeSpawnTimer = 0;
                const hordeMaxEnemies = Math.min(80 + hordeCount * 10, 120);
                if (enemies.length < hordeMaxEnemies) {
                    const batchSize = 3 + Math.floor(hordeCount * 0.5);
                    for (let i = 0; i < batchSize; i++) {
                        spawnHordeEnemy();
                    }
                }
            }
            // 怪物潮结束
            if (hordeActiveTimer <= 0) {
                hordeActive = false;
                addDamageText(player.x, player.y - 70, '怪物潮已退去', '#00FF00');
                // 恢复普通BGM（如果Boss不在场）
                if (!bossAlive) {
                    switchBGM('normal');
                }
            }
        }
    }

    // 怪物潮专用生成：从四面八方同时涌入，偏向高级敌人
    function spawnHordeEnemy() {
        const difficulty = Math.min(gameTime / 30, 11);
        // 怪物潮偏向生成更多样的敌人，至少从第3种开始
        const minType = Math.min(2 + Math.floor(hordeCount * 0.5), enemyTypes.length - 3);
        const maxType = Math.min(minType + 3 + Math.floor(difficulty * 0.5), enemyTypes.length - 1);
        const typeIndex = randInt(minType, maxType);
        const type = enemyTypes[typeIndex];

        // 从摄像机视口外缘生成
        const spawnMargin = 60;
        const viewLeft = camera.x;
        const viewTop = camera.y;
        const viewRight = camera.x + camera.viewW;
        const viewBottom = camera.y + camera.viewH;

        let x, y;
        const side = randInt(0, 3);
        if (side === 0) {
            x = rand(viewLeft - spawnMargin, viewRight + spawnMargin);
            y = viewTop - spawnMargin;
        } else if (side === 1) {
            x = viewRight + spawnMargin;
            y = rand(viewTop - spawnMargin, viewBottom + spawnMargin);
        } else if (side === 2) {
            x = rand(viewLeft - spawnMargin, viewRight + spawnMargin);
            y = viewBottom + spawnMargin;
        } else {
            x = viewLeft - spawnMargin;
            y = rand(viewTop - spawnMargin, viewBottom + spawnMargin);
        }

        x = clamp(x, -50, WORLD_WIDTH + 50);
        y = clamp(y, -50, WORLD_HEIGHT + 50);

        const hpScale = 1 + difficulty * 0.3;
        const dmgScale = 1 + difficulty * 0.2;

        enemies.push({
            x: x,
            y: y,
            type: type,
            radius: type.radius,
            hp: type.hp * hpScale,
            maxHp: type.hp * hpScale,
            speed: type.speed,
            damage: type.damage * dmgScale,
            color: type.color,
            expDrop: type.expDrop,
            shape: type.shape,
            hitFlash: 0,
            vx: 0,
            vy: 0,
            knockbackTime: 0,
            ranged: type.ranged || false,
            attackRange: type.attackRange || 0,
            attackInterval: type.attackInterval || 0,
            attackTimer: type.attackInterval || 0,
            rageMode: type.rageMode || false,
            enraged: false,
            slowEffect: type.slowEffect || false,
            explodeOnDeath: type.explodeOnDeath || false,
            erratic: type.erratic || false,
            poisonAttack: type.poisonAttack || false,
            slowAura: type.slowAura || false,
            teleportAttack: type.teleportAttack || false,
            teleportInterval: type.teleportInterval || 0,
            teleportTimer: type.teleportInterval || 0,
            healer: type.healer || false,
            healRange: type.healRange || 0,
            healInterval: type.healInterval || 0,
            healTimer: type.healInterval || 0,
            healAmount: type.healAmount || 0,
        });
    }

    // ===== 音频系统 =====
    let audioCtx = null;
    let masterGain = null;
    let musicGain = null;
    let sfxGain = null;
    let musicNodes = [];
    let musicPlaying = false;
    let musicTimer = null;

    function initAudio() {
        if (audioCtx) return;
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            masterGain = audioCtx.createGain();
            masterGain.gain.value = 0.6;
            masterGain.connect(audioCtx.destination);

            musicGain = audioCtx.createGain();
            musicGain.gain.value = 0.25;
            musicGain.connect(masterGain);

            sfxGain = audioCtx.createGain();
            sfxGain.gain.value = 0.5;
            sfxGain.connect(masterGain);
        } catch (e) {
            console.warn('Web Audio API 不可用:', e);
        }
    }

    function resumeAudio() {
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    // --- 音效 ---
    function playHitSound() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        // 短促的金属碰撞声
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.08);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(sfxGain);
        osc.start(now);
        osc.stop(now + 0.1);

        // 加一点噪声让它更有打击感
        const noiseBuf = audioCtx.createBuffer(1, 2048, audioCtx.sampleRate);
        const noiseData = noiseBuf.getChannelData(0);
        for (let i = 0; i < noiseData.length; i++) noiseData[i] = (Math.random() * 2 - 1) * 0.5;
        const noise = audioCtx.createBufferSource();
        noise.buffer = noiseBuf;
        const noiseGain = audioCtx.createGain();
        noiseGain.gain.setValueAtTime(0.15, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        noise.connect(noiseGain);
        noiseGain.connect(sfxGain);
        noise.start(now);
        noise.stop(now + 0.05);
    }

    function playKillSound() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        // 击杀音效：下降音调
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.2);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(sfxGain);
        osc.start(now);
        osc.stop(now + 0.25);
    }

    function playChestHitSound() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        // 木质打击声
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(sfxGain);
        osc.start(now);
        osc.stop(now + 0.12);
    }

    function playChestOpenSound() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        // 宝箱打开：上升琶音
        const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
        for (let i = 0; i < notes.length; i++) {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = notes[i];
            const t = now + i * 0.06;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.2, t + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
            osc.connect(gain);
            gain.connect(sfxGain);
            osc.start(t);
            osc.stop(t + 0.2);
        }
    }

    function playPickupSound() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(sfxGain);
        osc.start(now);
        osc.stop(now + 0.12);
    }

    function playLevelUpSound() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const notes = [392, 523, 659, 784]; // G4, C5, E5, G5
        for (let i = 0; i < notes.length; i++) {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = notes[i];
            const t = now + i * 0.08;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.25, t + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
            osc.connect(gain);
            gain.connect(sfxGain);
            osc.start(t);
            osc.stop(t + 0.25);
        }
    }

    function playPlayerHurtSound() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.15);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(gain);
        gain.connect(sfxGain);
        osc.start(now);
        osc.stop(now + 0.2);
    }

    function playUltimateSound() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        // 大招音效：强烈上升琶音 + 低频冲击
        const notes = [261, 329, 392, 523, 659, 784, 1047]; // C4 E4 G4 C5 E5 G5 C6
        for (let i = 0; i < notes.length; i++) {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.value = notes[i];
            const t = now + i * 0.05;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.2, t + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            osc.connect(gain);
            gain.connect(sfxGain);
            osc.start(t);
            osc.stop(t + 0.3);
        }
        // 低频冲击
        const bass = audioCtx.createOscillator();
        const bassGain = audioCtx.createGain();
        bass.type = 'sine';
        bass.frequency.setValueAtTime(100, now);
        bass.frequency.exponentialRampToValueAtTime(50, now + 0.3);
        bassGain.gain.setValueAtTime(0.4, now);
        bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        bass.connect(bassGain);
        bassGain.connect(sfxGain);
        bass.start(now);
        bass.stop(now + 0.4);
    }

    function playBossSpawnSound() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        // Boss出现音效：低沉警报
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.linearRampToValueAtTime(200, now + 0.5);
        osc.frequency.linearRampToValueAtTime(80, now + 1.0);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
        osc.connect(gain);
        gain.connect(sfxGain);
        osc.start(now);
        osc.stop(now + 1.0);
    }

    function playBossKnifeClashSound() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        // 飞刀碰撞抵消声
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.08);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(sfxGain);
        osc.start(now);
        osc.stop(now + 0.1);
    }

    // ===== 语音喊出技能名 =====
    let speechAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;
    let lastSpeechTime = 0;
    function speakSkillName(name) {
        if (!speechAvailable) return;
        const now = Date.now();
        // 防止过于频繁的语音播报（至少间隔 0.8 秒）
        if (now - lastSpeechTime < 800) return;
        lastSpeechTime = now;
        try {
            window.speechSynthesis.cancel();
            const utter = new SpeechSynthesisUtterance(name);
            utter.lang = 'zh-CN';
            utter.rate = 1.1;
            utter.pitch = 0.8;
            utter.volume = 0.8;
            window.speechSynthesis.speak(utter);
        } catch (e) { /* 忽略 */ }
    }

    function playBossDeathSound() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        // Boss死亡：爆炸式下降
        const notes = [800, 600, 400, 200, 100];
        for (let i = 0; i < notes.length; i++) {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.value = notes[i];
            const t = now + i * 0.1;
            gain.gain.setValueAtTime(0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
            osc.connect(gain);
            gain.connect(sfxGain);
            osc.start(t);
            osc.stop(t + 0.2);
        }
        // 噪声爆炸
        const noiseBuf = audioCtx.createBuffer(1, 8192, audioCtx.sampleRate);
        const noiseData = noiseBuf.getChannelData(0);
        for (let i = 0; i < noiseData.length; i++) noiseData[i] = (Math.random() * 2 - 1);
        const noise = audioCtx.createBufferSource();
        noise.buffer = noiseBuf;
        const noiseGain = audioCtx.createGain();
        noiseGain.gain.setValueAtTime(0.3, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        noise.connect(noiseGain);
        noiseGain.connect(sfxGain);
        noise.start(now);
        noise.stop(now + 0.5);
    }

    // --- 背景音乐 ---
    // 程序生成的循环BGM，使用五声音阶
    // 普通模式：舒缓五声音阶
    const BGM_SCALE_NORMAL = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25]; // C D E G A C D E
    const BGM_BASS_NORMAL = [65.41, 73.42, 82.41, 98.00, 110.00]; // C2 D2 E2 G2 A2
    // Boss模式：紧张小调，更快节拍，更强鼓点
    const BGM_SCALE_BOSS = [196.00, 233.08, 261.63, 311.13, 349.23, 392.00, 466.16, 523.25]; // G3 Bb3 C4 Eb4 F4 G4 Bb4 C5 (小调音阶)
    const BGM_BASS_BOSS = [49.00, 58.27, 65.41, 77.78]; // G1 Bb1 C2 Eb2
    let bgmBeatIndex = 0;
    let bgmMode = 'normal'; // 'normal' 或 'boss'
    let bgmBeatDuration = 0.25; // 普通模式每拍0.25秒

    function startBGM() {
        if (!audioCtx || musicPlaying) return;
        musicPlaying = true;
        bgmBeatIndex = 0;
        scheduleBGM();
    }

    function stopBGM() {
        musicPlaying = false;
        if (musicTimer) {
            clearTimeout(musicTimer);
            musicTimer = null;
        }
        // 渐弱
        if (musicGain) {
            const now = audioCtx.currentTime;
            musicGain.gain.cancelScheduledValues(now);
            musicGain.gain.setValueAtTime(musicGain.gain.value, now);
            musicGain.gain.linearRampToValueAtTime(0, now + 0.5);
            setTimeout(() => {
                if (musicGain) musicGain.gain.value = 0.25;
            }, 600);
        }
    }

    // 切换BGM模式（Boss出现/死亡时调用）
    function switchBGM(mode) {
        if (bgmMode === mode) return;
        bgmMode = mode;
        if (mode === 'boss') {
            bgmBeatDuration = 0.18; // 更快节拍 ≈ 333 BPM
        } else {
            bgmBeatDuration = 0.25; // 恢复正常节拍
        }
        // 重置节拍索引，让新模式从头开始
        bgmBeatIndex = 0;
    }

    function scheduleBGM() {
        if (!musicPlaying || !audioCtx) return;
        const now = audioCtx.currentTime + 0.05;

        // 根据模式选择音阶和参数
        const scale = bgmMode === 'boss' ? BGM_SCALE_BOSS : BGM_SCALE_NORMAL;
        const bassNotes = bgmMode === 'boss' ? BGM_BASS_BOSS : BGM_BASS_NORMAL;

        // 每4拍一个小节
        const beatInBar = bgmBeatIndex % 16;

        if (bgmMode === 'boss') {
            // === Boss模式：紧张激烈的BGM ===
            // 旋律：每拍都弹（更密集）
            const noteIdx = Math.floor(Math.random() * scale.length);
            const freq = scale[noteIdx];
            playBGMNote(freq, now, bgmBeatDuration * 1.2, 'sawtooth', 0.12);

            // 副旋律：高八度，偶尔弹
            if (beatInBar % 2 === 1) {
                const harmIdx = Math.floor(Math.random() * scale.length);
                playBGMNote(scale[harmIdx] * 2, now, bgmBeatDuration * 0.8, 'square', 0.06);
            }

            // 低音：每2拍一个，更沉重
            if (beatInBar % 2 === 0) {
                const bassIdx = Math.floor(Math.random() * bassNotes.length);
                playBGMNote(bassNotes[bassIdx], now, bgmBeatDuration * 2, 'sawtooth', 0.18);
            }

            // 鼓点：每拍底鼓（更密集）
            playBGMDrum(now, 'kick');
            // 反拍军鼓
            if (beatInBar % 2 === 1) {
                playBGMDrum(now, 'snare');
            }
            // 每拍踩镲
            playBGMDrum(now, 'hihat');
        } else {
            // === 普通模式：舒缓的BGM ===
            // 旋律：偶数拍弹
            if (beatInBar % 2 === 0) {
                const noteIdx = Math.floor(Math.random() * scale.length);
                const freq = scale[noteIdx];
                playBGMNote(freq, now, bgmBeatDuration * 1.5, 'triangle', 0.15);
            }

            // 低音：每4拍一个
            if (beatInBar % 4 === 0) {
                const bassIdx = Math.floor(Math.random() * bassNotes.length);
                const freq = bassNotes[bassIdx];
                playBGMNote(freq, now, bgmBeatDuration * 3, 'sine', 0.2);
            }

            // 鼓点：偶数拍底鼓
            if (beatInBar % 2 === 0) {
                playBGMDrum(now, 'kick');
            }
            // 反拍踩镲
            if (beatInBar % 2 === 1) {
                playBGMDrum(now, 'hihat');
            }
        }

        bgmBeatIndex++;
        musicTimer = setTimeout(scheduleBGM, bgmBeatDuration * 1000);
    }

    function playBGMNote(freq, startTime, duration, type, vol) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(vol, startTime + 0.02);
        gain.gain.linearRampToValueAtTime(vol * 0.5, startTime + duration * 0.5);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.connect(gain);
        gain.connect(musicGain);
        osc.start(startTime);
        osc.stop(startTime + duration);
    }

    function playBGMDrum(time, type) {
        if (type === 'kick') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(120, time);
            osc.frequency.exponentialRampToValueAtTime(40, time + 0.1);
            gain.gain.setValueAtTime(0.3, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
            osc.connect(gain);
            gain.connect(musicGain);
            osc.start(time);
            osc.stop(time + 0.15);
        } else if (type === 'hihat') {
            const noiseBuf = audioCtx.createBuffer(1, 1024, audioCtx.sampleRate);
            const noiseData = noiseBuf.getChannelData(0);
            for (let i = 0; i < noiseData.length; i++) noiseData[i] = (Math.random() * 2 - 1);
            const noise = audioCtx.createBufferSource();
            noise.buffer = noiseBuf;
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.value = 6000;
            const gain = audioCtx.createGain();
            gain.gain.setValueAtTime(0.08, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(musicGain);
            noise.start(time);
            noise.stop(time + 0.05);
        } else if (type === 'snare') {
            // 军鼓：噪声 + 中频音，短促有力
            const noiseBuf = audioCtx.createBuffer(1, 4096, audioCtx.sampleRate);
            const noiseData = noiseBuf.getChannelData(0);
            for (let i = 0; i < noiseData.length; i++) noiseData[i] = (Math.random() * 2 - 1);
            const noise = audioCtx.createBufferSource();
            noise.buffer = noiseBuf;
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = 3000;
            filter.Q.value = 0.5;
            const noiseGain = audioCtx.createGain();
            noiseGain.gain.setValueAtTime(0.18, time);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
            noise.connect(filter);
            filter.connect(noiseGain);
            noiseGain.connect(musicGain);
            noise.start(time);
            noise.stop(time + 0.12);
            // 音调成分
            const osc = audioCtx.createOscillator();
            const oscGain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(200, time);
            osc.frequency.exponentialRampToValueAtTime(100, time + 0.1);
            oscGain.gain.setValueAtTime(0.12, time);
            oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
            osc.connect(oscGain);
            oscGain.connect(musicGain);
            osc.start(time);
            osc.stop(time + 0.1);
        }
    }

    // ===== 屏幕震动 =====
    let screenShake = 0;

    // ===== 伤害数字 =====
    const damageTexts = [];

    function addDamageText(x, y, text, color) {
        damageTexts.push({
            x: x, y: y,
            text: text,
            color: color,
            vy: -50,
            life: 0.8,
            maxLife: 0.8
        });
    }

    function updateDamageTexts(dt) {
        for (let i = damageTexts.length - 1; i >= 0; i--) {
            const d = damageTexts[i];
            d.y += d.vy * dt;
            d.vy += 100 * dt; // 减速
            d.life -= dt;
            if (d.life <= 0) {
                damageTexts.splice(i, 1);
            }
        }
    }

    function drawDamageTexts(ctx) {
        for (const d of damageTexts) {
            ctx.save();
            ctx.globalAlpha = d.life / d.maxLife;
            ctx.fillStyle = d.color;
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.lineWidth = 3;
            ctx.strokeText(d.text, d.x, d.y);
            ctx.fillText(d.text, d.x, d.y);
            ctx.restore();
        }
    }

    // ===== 怪物潮横幅绘制 =====
    function drawHordeBanner(ctx) {
        if (!hordeActive) {
            // 非怪物潮期间：如果距离下次怪物潮不到60秒，显示倒计时小提示
            const timeToHorde = HORDE_INTERVAL - hordeTimer;
            if (timeToHorde <= 60 && timeToHorde > 0) {
                ctx.save();
                ctx.font = 'bold 14px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                const alpha = 0.5 + Math.sin(gameTime * 4) * 0.3;
                ctx.globalAlpha = alpha;
                ctx.fillStyle = '#FF6600';
                ctx.strokeStyle = 'rgba(0,0,0,0.8)';
                ctx.lineWidth = 3;
                const text = '⚠ 怪物潮倒计时 ' + Math.ceil(timeToHorde) + ' 秒';
                const x = camera.x + camera.viewW / 2;
                const y = camera.y + 50;
                ctx.strokeText(text, x, y);
                ctx.fillText(text, x, y);
                ctx.restore();
            }
            return;
        }

        // 怪物潮进行中：屏幕顶部红色横幅
        ctx.save();
        const bannerY = camera.y + 30;
        const bannerH = 40;
        const bannerW = camera.viewW;
        const bannerX = camera.x;

        // 背景渐变
        const pulse = Math.sin(gameTime * 6) * 0.15 + 0.85;
        const gradient = ctx.createLinearGradient(bannerX, bannerY, bannerX, bannerY + bannerH);
        gradient.addColorStop(0, 'rgba(139,0,0,' + pulse + ')');
        gradient.addColorStop(0.5, 'rgba(255,0,0,' + (pulse * 0.8) + ')');
        gradient.addColorStop(1, 'rgba(139,0,0,' + pulse + ')');
        ctx.fillStyle = gradient;
        ctx.fillRect(bannerX, bannerY, bannerW, bannerH);

        // 边框
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 2;
        ctx.strokeRect(bannerX, bannerY, bannerW, bannerH);

        // 文字
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 4;
        const remaining = Math.ceil(hordeActiveTimer);
        const text = '☠ 怪物潮 #' + hordeCount + ' 进行中 — 剩余 ' + remaining + ' 秒 ☠';
        const cx = bannerX + bannerW / 2;
        const cy = bannerY + bannerH / 2;
        ctx.strokeText(text, cx, cy);
        ctx.fillText(text, cx, cy);

        // 底部进度条
        const barY = bannerY + bannerH + 4;
        const barW = bannerW * 0.6;
        const barX = bannerX + (bannerW - barW) / 2;
        const barH = 6;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX, barY, barW, barH);
        const progress = hordeActiveTimer / HORDE_DURATION;
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(barX, barY, barW * progress, barH);
        ctx.strokeStyle = '#FF6666';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);

        ctx.restore();
    }

    // ===== 全屏激光绘制 =====
    function drawUltimateLaser(ctx) {
        if (!player.ultActive) return;
        const t = player.ultTimer; // 剩余时间
        const maxT = 1.2;
        const progress = 1 - t / maxT; // 0→1
        const cam = camera;

        ctx.save();
        // 全屏闪光
        ctx.globalAlpha = Math.max(0, t / maxT) * 0.25;
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(cam.x - 50, cam.y - 50, canvas.width + 100, canvas.height + 100);

        // 多道横向激光线（覆盖整个屏幕高度）
        const numLasers = 12;
        for (let i = 0; i < numLasers; i++) {
            const yPos = cam.y + (canvas.height / numLasers) * i + (canvas.height / numLasers) / 2;
            // 激光从左到右扫过，带有随机偏移
            const offset = Math.sin(progress * Math.PI * 4 + i * 0.7) * 30;
            const laserWidth = 8 + Math.sin(progress * Math.PI * 6 + i) * 4;
            ctx.globalAlpha = Math.max(0, t / maxT) * 0.8;

            // 外发光
            ctx.shadowColor = '#00ffff';
            ctx.shadowBlur = 20;
            ctx.fillStyle = 'rgba(0, 255, 255, 0.6)';
            ctx.fillRect(cam.x - 50, yPos - laserWidth / 2 + offset * 0.3, canvas.width + 100, laserWidth);

            // 核心亮线
            ctx.shadowBlur = 10;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.fillRect(cam.x - 50, yPos - 1 + offset * 0.3, canvas.width + 100, 2);
        }

        // 竖向激光（从玩家位置发出）
        const px = player.x;
        const py = player.y;
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 30;
        for (let i = 0; i < 6; i++) {
            const angle = (progress * Math.PI * 2 + i * Math.PI / 3);
            const len = 2000;
            ctx.globalAlpha = Math.max(0, t / maxT) * 0.7;
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
            ctx.lineWidth = 12;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + Math.cos(angle) * len, py + Math.sin(angle) * len);
            ctx.stroke();

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + Math.cos(angle) * len, py + Math.sin(angle) * len);
            ctx.stroke();
        }

        // 玩家中心爆发光圈
        ctx.shadowBlur = 0;
        const burstR = 60 + progress * 200;
        const burstGrad = ctx.createRadialGradient(px, py, 0, px, py, burstR);
        burstGrad.addColorStop(0, `rgba(255, 255, 255, ${Math.max(0, t / maxT) * 0.8})`);
        burstGrad.addColorStop(0.4, `rgba(0, 255, 255, ${Math.max(0, t / maxT) * 0.4})`);
        burstGrad.addColorStop(1, 'rgba(0, 255, 255, 0)');
        ctx.fillStyle = burstGrad;
        ctx.beginPath();
        ctx.arc(px, py, burstR, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    // ===== 背景绘制 =====
    function drawBackground(ctx) {
        // 只绘制摄像机可见区域
        const vx = camera.x;
        const vy = camera.y;
        const vw = camera.viewW;
        const vh = camera.viewH;

        // 渐变背景
        const gradient = ctx.createLinearGradient(0, vy, 0, vy + vh);
        gradient.addColorStop(0, '#1a1a2e');
        gradient.addColorStop(1, '#16213e');
        ctx.fillStyle = gradient;
        ctx.fillRect(vx, vy, vw, vh);

        // 网格
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 1;
        const gridSize = 50;
        const startX = Math.floor(vx / gridSize) * gridSize;
        const startY = Math.floor(vy / gridSize) * gridSize;
        for (let x = startX; x <= vx + vw; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, vy);
            ctx.lineTo(x, vy + vh);
            ctx.stroke();
        }
        for (let y = startY; y <= vy + vh; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(vx, y);
            ctx.lineTo(vx + vw, y);
            ctx.stroke();
        }

        // 地图边界
        ctx.strokeStyle = 'rgba(233, 69, 96, 0.4)';
        ctx.lineWidth = 4;
        ctx.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

        // 小地图
        drawMinimap(ctx);
    }

    // ===== 小地图 =====
    function drawMinimap(ctx) {
        const mapW = 160;
        const mapH = mapW * (WORLD_HEIGHT / WORLD_WIDTH);
        const mapX = camera.x + camera.viewW - mapW - 15;
        const mapY = camera.y + 15;

        ctx.save();
        // 背景
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(mapX - 2, mapY - 2, mapW + 4, mapH + 4);
        ctx.strokeStyle = 'rgba(233, 69, 96, 0.6)';
        ctx.lineWidth = 2;
        ctx.strokeRect(mapX - 2, mapY - 2, mapW + 4, mapH + 4);

        // 内部
        ctx.fillStyle = 'rgba(22, 33, 62, 0.8)';
        ctx.fillRect(mapX, mapY, mapW, mapH);

        const sx = mapW / WORLD_WIDTH;
        const sy = mapH / WORLD_HEIGHT;

        // 宝箱
        for (const c of chests) {
            if (c.opened) continue;
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.arc(mapX + c.x * sx, mapY + c.y * sy, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // 装备掉落物
        for (const d of equipDrops) {
            ctx.fillStyle = d.equip.color;
            ctx.beginPath();
            ctx.arc(mapX + d.x * sx, mapY + d.y * sy, 3, 0, Math.PI * 2);
            ctx.fill();
            // 外圈
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(mapX + d.x * sx, mapY + d.y * sy, 5, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 敌人
        ctx.fillStyle = '#ff4444';
        for (const e of enemies) {
            ctx.beginPath();
            ctx.arc(mapX + e.x * sx, mapY + e.y * sy, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // 玩家
        ctx.fillStyle = '#4CAF50';
        ctx.beginPath();
        ctx.arc(mapX + player.x * sx, mapY + player.y * sy, 3, 0, Math.PI * 2);
        ctx.fill();

        // Boss
        for (const b of bosses) {
            ctx.fillStyle = b.color;
            ctx.beginPath();
            ctx.arc(mapX + b.x * sx, mapY + b.y * sy, 4, 0, Math.PI * 2);
            ctx.fill();
            // 外圈
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(mapX + b.x * sx, mapY + b.y * sy, 6, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 摄像机视口框
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(mapX + camera.x * sx, mapY + camera.y * sy, camera.viewW * sx, camera.viewH * sy);

        ctx.restore();
    }

    // ===== UI 更新 =====
    function updateHUD() {
        document.getElementById('hp-bar').style.width = (player.hp / player.maxHp * 100) + '%';
        document.getElementById('hp-text').textContent = `${Math.ceil(player.hp)}/${player.maxHp}`;
        document.getElementById('exp-bar').style.width = (player.exp / player.expNeeded * 100) + '%';
        document.getElementById('exp-text').textContent = `${Math.floor(player.exp)}/${player.expNeeded}`;
        document.getElementById('level-text').textContent = player.level;
        document.getElementById('knife-text').textContent = player.knifeCount;
        // 统计未打开的宝箱数
        let chestCount = 0;
        for (const c of chests) { if (!c.opened) chestCount++; }
        document.getElementById('chest-text').textContent = chestCount;
        document.getElementById('kill-text').textContent = player.kills;

        // 能量条
        const energyBar = document.getElementById('energy-bar');
        if (energyBar) {
            energyBar.style.width = (player.energy / player.maxEnergy * 100) + '%';
            const energyText = document.getElementById('energy-text');
            if (energyText) {
                if (player.energy >= player.maxEnergy) {
                    if (isMobile()) {
                        energyText.innerHTML = '<span style="color:#00ffff; font-weight:bold;">⚡点右下角释放大招!</span>';
                    } else {
                        energyText.innerHTML = '<span style="color:#00ffff; font-weight:bold;">按空格/J释放大招!</span>';
                    }
                } else {
                    energyText.textContent = Math.floor(player.energy) + '/' + player.maxEnergy;
                }
            }
        }

        // 同步大招按钮状态
        if (ultBtn) {
            if (player.energy >= player.maxEnergy && !player.ultActive) {
                ultBtn.classList.add('ready');
            } else {
                ultBtn.classList.remove('ready');
            }
        }

        const min = Math.floor(gameTime / 60);
        const sec = Math.floor(gameTime % 60);
        document.getElementById('time-text').textContent =
            `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }

    // ===== 游戏控制 =====
    function startGame() {
        initAudio();
        resumeAudio();
        player.reset();
        enemies.length = 0;
        expOrbs.length = 0;
        damageTexts.length = 0;
        chests.length = 0;
        gameTime = 0;
        spawnTimer = 0;
        chestSpawnTimer = 0;
        bossSpawnTimer = 0;
        bossAlive = false;
        bosses.length = 0;
        bossProjectiles.length = 0;
        clashParticles.length = 0;
        screenShake = 0;
        // 重置怪物潮
        hordeTimer = 0;
        hordeActive = false;
        hordeActiveTimer = 0;
        hordeSpawnTimer = 0;
        hordeCount = 0;
        // 重置BGM模式为普通
        bgmMode = 'normal';
        bgmBeatDuration = 0.25;
        // 重置装备系统
        resetEquipments();

        // 摄像机初始居中于玩家
        camera.x = player.x - camera.viewW / 2;
        camera.y = player.y - camera.viewH / 2;
        camera.x = clamp(camera.x, 0, Math.max(0, WORLD_WIDTH - camera.viewW));
        camera.y = clamp(camera.y, 0, Math.max(0, WORLD_HEIGHT - camera.viewH));
        camera.targetX = camera.x;
        camera.targetY = camera.y;

        // 开局生成1个宝箱
        spawnChest();

        // 重置技能
        for (const s of skills) {
            s.level = 0;
        }

        gameState = GameState.PLAYING;
        document.getElementById('start-screen').style.display = 'none';
        document.getElementById('gameover-screen').style.display = 'none';
        document.getElementById('hud').style.display = 'flex';
        document.getElementById('equipment-bar').style.display = 'flex';
        document.getElementById('mute-btn').style.display = 'flex';
        if (isMobile()) { ultBtn.style.display = 'flex'; }
        startBGM();
    }

    function gameOver() {
        gameState = GameState.GAMEOVER;
        stopBGM();
        const min = Math.floor(gameTime / 60);
        const sec = Math.floor(gameTime % 60);
        document.getElementById('gameover-stats').innerHTML = `
            等级：${player.level}<br>
            击杀数：${player.kills}<br>
            存活时间：${min}分${sec}秒
        `;
        document.getElementById('gameover-screen').style.display = 'flex';
        document.getElementById('hud').style.display = 'none';
        document.getElementById('equipment-bar').style.display = 'none';
        document.getElementById('mute-btn').style.display = 'none';
        ultBtn.style.display = 'none';
        ultBtn.classList.remove('ready');
    }

    // ===== 主循环 =====
    function gameLoop(timestamp) {
        if (lastTime === 0) lastTime = timestamp;
        const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // 最大50ms
        lastTime = timestamp;

        // 清屏
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 屏幕震动
        let shakeX = 0, shakeY = 0;
        if (screenShake > 0) {
            shakeX = rand(-screenShake, screenShake);
            shakeY = rand(-screenShake, screenShake);
            screenShake = Math.max(0, screenShake - 60 * dt);
        }

        // 摄像器变换：先平移到摄像机原点（反向偏移），再加震动
        ctx.save();
        ctx.translate(-camera.x + shakeX, -camera.y + shakeY);

        drawBackground(ctx);

        if (gameState === GameState.PLAYING) {
            gameTime += dt;

            // 更新
            player.update(dt);
            updateCamera(dt);
            updateSpawning(dt);
            updateEnemies(dt);
            updateChests(dt);
            updateBosses(dt);
            updateBossProjectiles(dt);
            updateClashParticles(dt);
            updateEquipDrops(dt);
            updateExpOrbs(dt);
            updateDamageTexts(dt);

            // 绘制
            drawExpOrbs(ctx);
            drawChests(ctx);
            drawEquipDrops(ctx);
            drawBossProjectiles(ctx);
            drawEnemies(ctx);
            drawClashParticles(ctx);
            drawBosses(ctx);
            player.draw(ctx);
            drawUltimateLaser(ctx);
            drawDamageTexts(ctx);
            drawHordeBanner(ctx);

            updateHUD();
        } else if (gameState === GameState.UPGRADE) {
            // 暂停游戏，只绘制
            drawExpOrbs(ctx);
            drawChests(ctx);
            drawEquipDrops(ctx);
            drawBossProjectiles(ctx);
            drawEnemies(ctx);
            drawClashParticles(ctx);
            drawBosses(ctx);
            player.draw(ctx);
            drawUltimateLaser(ctx);
            drawDamageTexts(ctx);
        } else if (gameState === GameState.GAMEOVER) {
            drawExpOrbs(ctx);
            drawChests(ctx);
            drawEquipDrops(ctx);
            drawBossProjectiles(ctx);
            drawEnemies(ctx);
            drawClashParticles(ctx);
            drawBosses(ctx);
            player.draw(ctx);
            drawUltimateLaser(ctx);
        }

        ctx.restore();

        requestAnimationFrame(gameLoop);
    }

    // ===== 初始化 =====
    function init() {
        resizeCanvas();
        initJoystick();

        // 模拟加载
        const loadingBar = document.getElementById('loading-bar');
        let progress = 0;
        const loadInterval = setInterval(() => {
            progress += 10;
            loadingBar.style.width = progress + '%';
            if (progress >= 100) {
                clearInterval(loadInterval);
                setTimeout(() => {
                    document.getElementById('loading-screen').style.display = 'none';
                    document.getElementById('start-screen').style.display = 'flex';
                    gameState = GameState.START;
                }, 300);
            }
        }, 80);

        // 按钮事件（同时支持电脑端click和手机端touchend）
        const startBtn = document.getElementById('start-btn');
        const restartBtn = document.getElementById('restart-btn');

        // 手机端用 touchend 触发（click 在 touch-action:none 下可能不触发）
        function bindBtnTap(el, handler) {
            let touched = false;
            el.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                touched = true;
                handler.call(el, e);
                setTimeout(() => { touched = false; }, 500);
            }, { passive: false });
            el.addEventListener('click', (e) => {
                // 如果 touchend 已处理，跳过 click（避免重复触发）
                if (touched) { e.preventDefault(); return; }
                handler.call(el, e);
            });
        }

        bindBtnTap(startBtn, startGame);
        bindBtnTap(restartBtn, startGame);

        // 静音按钮同样处理
        const muteBtn = document.getElementById('mute-btn');
        let muted = false;
        function toggleMute() {
            if (!audioCtx) return;
            muted = !muted;
            if (muted) {
                masterGain.gain.value = 0;
                muteBtn.textContent = '🔇';
            } else {
                masterGain.gain.value = 0.6;
                muteBtn.textContent = '🔊';
            }
        }
        bindBtnTap(muteBtn, toggleMute);

        // 开始游戏循环
        requestAnimationFrame(gameLoop);
    }

    // DOM Ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
