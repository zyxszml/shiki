/**
 * 多维液态玻璃二阶弹簧阻尼物理模型
 * 特性：
 * 1. 维度与情绪感知的动态刚度/阻尼（如“孤寂暴雨”沉重黏滞、“梦境”失重漂浮、“炽烈”活泼高弹）
 * 2. 惯性抛掷（Momentum Flick）：快速滑过松手后延续惯性滑行
 * 3. 边界撞击回弹（Boundary Impact）：高速碰撞胶囊左右两端时触发压缩反弹与冲击波回调
 */
(function (global) {
  'use strict';

class SpringLensPhysics {
  /**
   * @param {number} initialProgress 初始进度 [0, 1]
   * @param {object} options
   * @param {(side: number, intensity: number) => void} [options.onBoundaryImpact] 撞壁回调（side: 0 左端 / 1 右端）
   */
  constructor(initialProgress = 0, options = {}) {
    this.target = initialProgress;
    this.position = initialProgress;
    this.velocity = 0;

    // 弹簧与流体形变状态
    this.squash = 0;
    this.squashVel = 0;
    this.tilt = 0;
    this.tiltVel = 0;

    // 交互态权重
    this.hoverTarget = 0;
    this.hover = 0;
    this.pressTarget = 0;
    this.press = 0;

    // 维度物理调制状态
    this.dimensionId = 'time';
    this.elasticity = 1.0;
    this.onBoundaryImpact = options.onBoundaryImpact || null;
    this._lastImpactMs = 0;
  }

  /**
   * 设定当前维度物理特征
   * @param {'time'|'mood'|'space'} dimId
   */
  setDimension(dimId) {
    this.dimensionId = dimId;
  }

  /**
   * 设定弹性敏感度 [0.4, 1.8]
   * @param {number} val
   */
  setElasticity(val) {
    this.elasticity = Math.max(0.4, Math.min(1.8, val));
  }

  /**
   * 设定目标位置
   * @param {number} val [0, 1]
   * @param {boolean} immediate 是否立即跳转（用于减弱动态模式或初始化）
   */
  setTarget(val, immediate = false) {
    const clamped = Math.max(0, Math.min(1, val));
    this.target = clamped;
    if (immediate) {
      this.position = clamped;
      this.velocity = 0;
      this.squash = 0;
      this.squashVel = 0;
      this.tilt = 0;
      this.tiltVel = 0;
    }
  }

  /**
   * 惯性抛掷释放：根据指针释放瞬间的归一化水平速度延续平滑滑行
   * @param {number} normVel 归一化速度（progress/秒）
   * @param {boolean} reducedMotion
   * @returns {number} 估算的新目标进度
   */
  releaseWithVelocity(normVel, reducedMotion = false) {
    if (reducedMotion || Math.abs(normVel) < 0.16) {
      return this.target;
    }
    const clampedVel = Math.max(-3.6, Math.min(3.6, normVel));
    const glideFactor = this.dimensionId === 'mood' && this.position > 0.72
      ? 0.24 // 失重梦境飘得更远
      : this.dimensionId === 'mood' && this.position > 0.48 && this.position < 0.80
        ? 0.08 // 孤寂雨夜阻尼感更重
        : 0.15;

    const nextTarget = Math.max(0, Math.min(1, this.position + clampedVel * glideFactor));
    this.target = nextTarget;
    this.velocity = this.velocity * 0.4 + clampedVel * 0.55;
    return nextTarget;
  }

  /**
   * 设定悬停激活度
   * @param {boolean} active
   */
  setHovered(active) {
    this.hoverTarget = active ? 1 : 0;
  }

  /**
   * 设定按压拖拽激活度
   * @param {boolean} active
   */
  setPressed(active) {
    this.pressTarget = active ? 1 : 0;
  }

  /**
   * 计算当前维度与进度对应的弹簧刚度与阻尼
   */
  #getSpringParams() {
    let stiffness = 215;
    let damping = 22.5;

    if (this.dimensionId === 'mood') {
      const s = Math.max(0, Math.min(3, this.position * 3));
      if (s < 1) {
        // 澄明 -> 炽烈：从轻快变为高弹跃动
        const t = s;
        stiffness = 235 + t * 65;
        damping = 21.5 - t * 5.0;
      } else if (s < 2) {
        // 炽烈 -> 孤寂：急剧沉淀为深沉黏滞阻尼
        const t = s - 1;
        stiffness = 300 - t * 165;
        damping = 16.5 + t * 10.5;
      } else {
        // 孤寂 -> 梦境：融化为低重力长惯性漂浮
        const t = s - 2;
        stiffness = 135 - t * 22;
        damping = 27.0 - t * 12.5;
      }
    } else if (this.dimensionId === 'space') {
      stiffness = 188;
      damping = 20.5;
    }

    // 弹性倍率越高，阻尼略低、形变响应更显著
    const dampScale = 1.18 - (this.elasticity - 1.0) * 0.36;
    return {
      stiffness: stiffness * (0.85 + 0.15 * this.elasticity),
      damping: Math.max(9.5, damping * dampScale),
    };
  }

  /**
   * 单帧推进物理积分
   * @param {number} dtSec 帧间隔（秒）
   * @param {boolean} reducedMotion 是否开启减弱动态偏好
   * @returns {boolean} 是否仍有显著动态变化
   */
  step(dtSec, reducedMotion = false) {
    const dt = Math.min(dtSec, 0.04);

    if (reducedMotion) {
      this.position += (this.target - this.position) * Math.min(1, dt * 18);
      if (Math.abs(this.target - this.position) < 0.0002) {
        this.position = this.target;
      }
      this.velocity = 0;
      this.squash = 0;
      this.tilt = 0;
      this.hover = 0;
      this.press += (this.pressTarget - this.press) * Math.min(1, dt * 15);
      return Math.abs(this.target - this.position) > 0.0002 || Math.abs(this.pressTarget - this.press) > 0.001;
    }

    const { stiffness, damping } = this.#getSpringParams();
    const force = (this.target - this.position) * stiffness;
    const accel = force - this.velocity * damping;
    this.velocity += accel * dt;
    this.position += this.velocity * dt;

    // 速度驱动的液态果冻形变（受弹性倍率调节）
    const speedNorm = Math.min(2.1, Math.abs(this.velocity) * 0.48 * this.elasticity);
    const desiredSquash = speedNorm * 0.098;
    const sForce = (desiredSquash - this.squash) * 280 - this.squashVel * 19;
    this.squashVel += sForce * dt;
    this.squash += this.squashVel * dt;

    // 速度方向驱动的玻璃微倾角
    const desiredTilt = Math.max(-0.095, Math.min(0.095, -this.velocity * 0.026 * this.elasticity));
    const tForce = (desiredTilt - this.tilt) * 240 - this.tiltVel * 20;
    this.tiltVel += tForce * dt;
    this.tilt += this.tiltVel * dt;

    // 悬停微浮与按压手势膨胀平滑收敛
    this.hover += (this.hoverTarget - this.hover) * Math.min(1, dt * 10);
    if (Math.abs(this.hoverTarget - this.hover) < 0.001) {
      this.hover = this.hoverTarget;
    }
    this.press += (this.pressTarget - this.press) * Math.min(1, dt * 14);

    // 边界碰撞检测与弹性震荡冲击波
    const now = performance.now();
    if (this.position < 0) {
      const impactSpeed = Math.abs(this.velocity);
      this.position = 0;
      if (this.velocity < -0.22 && now - this._lastImpactMs > 180) {
        this._lastImpactMs = now;
        this.squashVel -= Math.min(0.8, impactSpeed * 0.35);
        this.onBoundaryImpact?.(0, Math.min(1, impactSpeed * 0.55));
      }
      this.velocity *= -0.32;
    } else if (this.position > 1) {
      const impactSpeed = Math.abs(this.velocity);
      this.position = 1;
      if (this.velocity > 0.22 && now - this._lastImpactMs > 180) {
        this._lastImpactMs = now;
        this.squashVel -= Math.min(0.8, impactSpeed * 0.35);
        this.onBoundaryImpact?.(1, Math.min(1, impactSpeed * 0.55));
      }
      this.velocity *= -0.32;
    }

    const active =
      Math.abs(this.target - this.position) > 0.00015 ||
      Math.abs(this.velocity) > 0.0005 ||
      Math.abs(this.squash) > 0.0004 ||
      Math.abs(this.tilt) > 0.0004 ||
      Math.abs(this.hoverTarget - this.hover) > 0.002 ||
      Math.abs(this.pressTarget - this.press) > 0.002;

    return active;
  }
}

  global.SHIKI = global.SHIKI || {};
  global.SHIKI.SpringLensPhysics = SpringLensPhysics;
})(window);
