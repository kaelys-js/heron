'use strict';
(() => {
  var Nf = Object.defineProperty;
  var Uf = (i) => {
    throw TypeError(i);
  };
  var $m = (i, e, t) =>
    e in i ? Nf(i, e, { enumerable: !0, configurable: !0, writable: !0, value: t }) : (i[e] = t);
  var w = (i, e) => () => (i && (e = i((i = 0))), e);
  var mi = (i, e) => {
    for (var t in e) Nf(i, t, { get: e[t], enumerable: !0 });
  };
  var c = (i, e, t) => $m(i, typeof e != 'symbol' ? e + '' : e, t),
    ou = (i, e, t) => e.has(i) || Uf('Cannot ' + t);
  var a = (i, e, t) => (ou(i, e, 'read from private field'), t ? t.call(i) : e.get(i)),
    f = (i, e, t) =>
      e.has(i)
        ? Uf('Cannot add the same private member more than once')
        : e instanceof WeakSet
          ? e.add(i)
          : e.set(i, t),
    h = (i, e, t, o) => (ou(i, e, 'write to private field'), o ? o.call(i, t) : e.set(i, t), t),
    L = (i, e, t) => (ou(i, e, 'access private method'), t);
  var Tn = (i, e, t, o) => ({
    set _(n) {
      h(i, e, n, t);
    },
    get _() {
      return a(i, e, o);
    },
  });
  var gt,
    rr,
    Hf,
    ar,
    O,
    An,
    yt,
    Ln,
    I,
    le,
    lr,
    nu,
    cr,
    su,
    ur,
    qf,
    Ve,
    ru,
    $f,
    Bn,
    au,
    Wf,
    fe,
    Ne,
    gi,
    yi,
    fo,
    xi,
    Gf,
    Vn,
    fr,
    lu,
    jf,
    Qf,
    dr,
    Ce,
    cu,
    Yf,
    _f,
    Xf,
    Kf,
    Zf,
    Jf,
    xt,
    hr,
    pr,
    ed,
    td,
    uu,
    id,
    od,
    Ue,
    nd,
    fu,
    bi,
    De,
    He,
    du,
    hu,
    Nn,
    ho,
    mr,
    sd,
    rd,
    pu,
    ad,
    ld,
    cd,
    gr,
    oe = w(() => {
      (gt = 'generated'),
        (rr = 'source-over'),
        (Hf = 'resize'),
        (ar = 'visibilitychange'),
        (O = { x: 0, y: 0, z: 0 }),
        (An = { a: 1, b: 0, c: 0, d: 1 }),
        (yt = 'random'),
        (Ln = 'mid'),
        (I = 2),
        (le = Math.PI * I),
        (lr = 60),
        (nu = 1),
        (cr = 'true'),
        (su = 'false'),
        (ur = 'canvas'),
        (qf = 0),
        (Ve = 2),
        (ru = 100),
        ($f = 1),
        (Bn = 1),
        (au = 1),
        (Wf = 1),
        (fe = 255),
        (Ne = 360),
        (gi = 100),
        (yi = 100),
        (fo = 0),
        (xi = 0),
        (Gf = 60),
        (Vn = 0),
        (fr = 0.25),
        (lu = 0.5 + fr),
        (jf = 1),
        (Qf = 0),
        (dr = 1),
        (Ce = 1),
        (cu = 1),
        (Yf = 0),
        (_f = 120),
        (Xf = 0),
        (Kf = 0),
        (Zf = 1e4),
        (Jf = 0),
        (xt = 1),
        (hr = 0),
        (pr = 1),
        (ed = 1),
        (td = 0),
        (uu = 0),
        (id = 1),
        (od = 0),
        (Ue = 0),
        (nd = 1),
        (fu = 1),
        (bi = 1),
        (De = 0),
        (He = 1),
        (du = 0),
        (hu = 1),
        (Nn = 0),
        (ho = 3),
        (mr = 6),
        (sd = 1),
        (rd = 1),
        (pu = 0),
        (ad = 0),
        (ld = 0),
        (cd = 0),
        (gr = 1);
    });
  var _,
    Un = w(() => {
      (function (i) {
        (i.bottom = 'bottom'),
          (i.bottomLeft = 'bottom-left'),
          (i.bottomRight = 'bottom-right'),
          (i.left = 'left'),
          (i.none = 'none'),
          (i.right = 'right'),
          (i.top = 'top'),
          (i.topLeft = 'top-left'),
          (i.topRight = 'top-right'),
          (i.outside = 'outside'),
          (i.inside = 'inside');
      })(_ || (_ = {}));
    });
  function vi(i) {
    return 'z' in i ? i.z : O.z;
  }
  var Hn,
    mu,
    Ie,
    bt,
    ee,
    qn = w(() => {
      oe();
      Ie = class Ie {
        constructor(e = O.x, t = O.y, o = O.z) {
          f(this, Hn);
          c(this, 'x');
          c(this, 'y');
          c(this, 'z');
          (this.x = e), (this.y = t), (this.z = o);
        }
        static get origin() {
          return Ie.create(O.x, O.y, O.z);
        }
        get angle() {
          return Math.atan2(this.y, this.x);
        }
        set angle(e) {
          L(this, Hn, mu).call(this, e, this.length);
        }
        get length() {
          return Math.sqrt(this.getLengthSq());
        }
        set length(e) {
          L(this, Hn, mu).call(this, this.angle, e);
        }
        static clone(e) {
          return Ie.create(e.x, e.y, vi(e));
        }
        static create(e, t, o) {
          return typeof e == 'number' ? new Ie(e, t ?? O.y, o ?? O.z) : new Ie(e.x, e.y, vi(e));
        }
        add(e) {
          return Ie.create(this.x + e.x, this.y + e.y, this.z + vi(e));
        }
        addTo(e) {
          (this.x += e.x), (this.y += e.y), (this.z += vi(e));
        }
        copy() {
          return Ie.clone(this);
        }
        div(e) {
          return Ie.create(this.x / e, this.y / e, this.z / e);
        }
        divTo(e) {
          (this.x /= e), (this.y /= e), (this.z /= e);
        }
        getLengthSq() {
          return this.x ** Ve + this.y ** Ve;
        }
        mult(e) {
          return Ie.create(this.x * e, this.y * e, this.z * e);
        }
        multTo(e) {
          (this.x *= e), (this.y *= e), (this.z *= e);
        }
        normalize() {
          let e = this.length;
          e != hr && this.multTo(Wf / e);
        }
        rotate(e) {
          return Ie.create(
            this.x * Math.cos(e) - this.y * Math.sin(e),
            this.x * Math.sin(e) + this.y * Math.cos(e),
            O.z,
          );
        }
        setTo(e) {
          (this.x = e.x), (this.y = e.y), (this.z = vi(e));
        }
        sub(e) {
          return Ie.create(this.x - e.x, this.y - e.y, this.z - vi(e));
        }
        subFrom(e) {
          (this.x -= e.x), (this.y -= e.y), (this.z -= vi(e));
        }
      };
      (Hn = new WeakSet()),
        (mu = function (e, t) {
          (this.x = Math.cos(e) * t), (this.y = Math.sin(e) * t);
        });
      (bt = Ie),
        (ee = class i extends bt {
          constructor(e = O.x, t = O.y) {
            super(e, t, O.z);
          }
          static get origin() {
            return i.create(O.x, O.y);
          }
          static clone(e) {
            return i.create(e.x, e.y);
          }
          static create(e, t) {
            return typeof e == 'number' ? new i(e, t ?? O.y) : new i(e.x, e.y);
          }
        });
    });
  function yr(i) {
    return typeof i == 'boolean';
  }
  function Qe(i) {
    return typeof i == 'string';
  }
  function ze(i) {
    return typeof i == 'number';
  }
  function vt(i) {
    return typeof i == 'object' && i !== null;
  }
  function X(i) {
    return Array.isArray(i);
  }
  function x(i) {
    return i == null;
  }
  var B = w(() => {});
  function T() {
    return Y(jm(), 0, 1 - Number.EPSILON);
  }
  function gu(i, e) {
    return T() * (e - i) + i;
  }
  function fd(i) {
    return ud.nextFrame(i);
  }
  function dd(i) {
    ud.cancel(i);
  }
  function Y(i, e, t) {
    return Math.min(Math.max(i, e), t);
  }
  function xr(i, e, t, o) {
    return Math.floor((i * t + e * o) / (t + o));
  }
  function de(i) {
    let e = po(i),
      t = 0,
      o = br(i);
    return e === o && (o = t), gu(o, e);
  }
  function P(i) {
    return ze(i) ? i : de(i);
  }
  function br(i) {
    return ze(i) ? i : i.min;
  }
  function po(i) {
    return ze(i) ? i : i.max;
  }
  function D(i, e) {
    if (i === e || (e === void 0 && ze(i))) return i;
    let t = br(i),
      o = po(i);
    return e !== void 0 ? { min: Math.min(t, e), max: Math.max(o, e) } : D(t, o);
  }
  function K(i, e) {
    let t = i.x - e.x,
      o = i.y - e.y;
    return { dx: t, dy: o, distance: Math.hypot(t, o) };
  }
  function hd(i, e) {
    let t = i.x - e.x,
      o = i.y - e.y;
    return t * t + o * o;
  }
  function Se(i, e) {
    return Math.sqrt(hd(i, e));
  }
  function pd(i, e, t) {
    return hd(i, e) <= t * t;
  }
  function Ye(i) {
    return i * Gm;
  }
  function md(i, e, t) {
    if (ze(i)) return Ye(i);
    switch (i) {
      case _.top:
        return -Math.PI * 0.5;
      case _.topRight:
        return -Math.PI * fr;
      case _.right:
        return Vn;
      case _.bottomRight:
        return Math.PI * fr;
      case _.bottom:
        return Math.PI * 0.5;
      case _.bottomLeft:
        return Math.PI * lu;
      case _.left:
        return Math.PI;
      case _.topLeft:
        return -Math.PI * lu;
      case _.inside:
        return Math.atan2(t.y - e.y, t.x - e.x);
      case _.outside:
        return Math.atan2(e.y - t.y, e.x - t.x);
      default:
        return T() * le;
    }
  }
  function gd(i) {
    let e = ee.origin;
    return (e.length = 1), (e.angle = i), e;
  }
  function yu(i, e, t, o) {
    return ee.create((i.x * (t - o)) / (t + o) + (e.x * I * o) / (t + o), i.y);
  }
  function yd(i) {
    let { position: e, size: t } = i;
    return { x: e?.x ?? T() * t.width, y: e?.y ?? T() * t.height };
  }
  function vr(i) {
    return i ? (i.endsWith('%') ? parseFloat(i) / 100 : parseFloat(i)) : 1;
  }
  var Wm,
    Gm,
    jm,
    ud,
    te = w(() => {
      Un();
      oe();
      qn();
      B();
      (Wm = 180),
        (Gm = Math.PI / Wm),
        (jm = Math.random),
        (ud = {
          nextFrame: (i) => requestAnimationFrame(i),
          cancel: (i) => {
            cancelAnimationFrame(i);
          },
        });
    });
  var ft,
    wr = w(() => {
      (function (i) {
        (i.auto = 'auto'),
          (i.increase = 'increase'),
          (i.decrease = 'decrease'),
          (i.random = 'random');
      })(ft || (ft = {}));
    });
  var W,
    Mr = w(() => {
      (function (i) {
        (i.increasing = 'increasing'), (i.decreasing = 'decreasing');
      })(W || (W = {}));
    });
  var qe,
    xu = w(() => {
      (function (i) {
        (i.none = 'none'), (i.max = 'max'), (i.min = 'min');
      })(qe || (qe = {}));
    });
  var E,
    kr = w(() => {
      (function (i) {
        (i.bottom = 'bottom'), (i.left = 'left'), (i.right = 'right'), (i.top = 'top');
      })(E || (E = {}));
    });
  var mo,
    Pr = w(() => {
      (function (i) {
        (i.precise = 'precise'), (i.percent = 'percent');
      })(mo || (mo = {}));
    });
  var wt,
    Cr = w(() => {
      (function (i) {
        (i.max = 'max'), (i.min = 'min'), (i.random = 'random');
      })(wt || (wt = {}));
    });
  function _m(i, e) {
    let t = new Map(),
      o = e?.maxSize,
      n = e?.ttlMs,
      s = e?.keyFn,
      r = (p, m = new WeakSet()) => {
        if (p === null) return 'null';
        let g = typeof p;
        if (g === 'undefined') return 'undefined';
        if (g === 'number' || g === 'boolean' || g === 'string') return JSON.stringify(p);
        if (g === 'function')
          try {
            return p.toString();
          } catch {
            return '"[Function]"';
          }
        if (g === 'symbol')
          try {
            return p.toString();
          } catch {
            return '"[Symbol]"';
          }
        return Array.isArray(p)
          ? `[${p.map((b) => r(b, m)).join(',')}]`
          : m.has(p)
            ? '"[Circular]"'
            : (m.add(p),
              `{${Object.keys(p)
                .sort()
                .map((b) => `${JSON.stringify(b)}:${r(p[b], m)}`)
                .join(',')}}`);
      },
      l = (p) => r(p),
      u = (p) => (s ? s(p) : l(p)),
      d = () => {
        if (typeof o == 'number' && o >= Ym)
          for (; t.size > o; ) {
            let p = t.keys().next().value;
            if (p === void 0) break;
            t.delete(p);
          }
      };
    return (...p) => {
      let m = u(p),
        g = Date.now(),
        y = t.get(m);
      if (y !== void 0)
        if (n && g - y.ts > n) t.delete(m);
        else return t.delete(m), t.set(m, { value: y.value, ts: y.ts }), y.value;
      let b = i(...p);
      return t.set(m, { value: b, ts: g }), d(), b;
    };
  }
  function Xm() {
    return typeof matchMedia < 'u';
  }
  function Z() {
    return globalThis.document;
  }
  function xd(i) {
    if (Xm()) return matchMedia(i);
  }
  function bd(i) {
    if (!(typeof IntersectionObserver > 'u')) return new IntersectionObserver(i);
  }
  function vd(i) {
    if (!(typeof MutationObserver > 'u')) return new MutationObserver(i);
  }
  function A(i, e) {
    return i === e || (X(e) && e.includes(i));
  }
  function Km(i) {
    return Math.floor(T() * i.length);
  }
  function go(i, e, t = !0) {
    return i[e !== void 0 && t ? e % i.length : Km(i)];
  }
  function wd(i, e, t, o, n) {
    return Zm(Mt(i, o ?? Qm), e, t, n);
  }
  function Zm(i, e, t, o) {
    let n = !0;
    return (
      (!o || o === E.bottom) && (n = i.top < e.height + t.x),
      n && (!o || o === E.left) && (n = i.right > t.x),
      n && (!o || o === E.right) && (n = i.left < e.width + t.y),
      n && (!o || o === E.top) && (n = i.bottom > t.y),
      n
    );
  }
  function Mt(i, e) {
    return { bottom: i.y + e, left: i.x - e, right: i.x + e, top: i.y - e };
  }
  function G(i, ...e) {
    for (let t of e) {
      if (x(t)) continue;
      if (!vt(t)) {
        i = t;
        continue;
      }
      Array.isArray(t) ? Array.isArray(i) || (i = []) : (!vt(i) || Array.isArray(i)) && (i = {});
      let o = Object.keys(t),
        n = new Set(['__proto__', 'constructor', 'prototype']);
      if (
        !o.some((r) => {
          let l = t[r];
          return vt(l) || Array.isArray(l);
        })
      ) {
        let r = t,
          l = i;
        for (let u of o)
          if (!n.has(u) && u in r) {
            let d = r[u];
            d !== void 0 && (l[u] = d);
          }
        continue;
      }
      for (let r of o) {
        if (n.has(r)) continue;
        let l = t,
          u = i,
          d = l[r];
        u[r] = Array.isArray(d) ? d.map((p) => G(void 0, p)) : G(u[r], d);
      }
    }
    return i;
  }
  function $n(i) {
    return {
      position: i.getPosition(),
      radius: i.getRadius(),
      mass: i.getMass(),
      velocity: i.velocity,
      factor: ee.create(P(i.options.bounce.horizontal.value), P(i.options.bounce.vertical.value)),
    };
  }
  function Sr(i, e) {
    let { x: t, y: o } = i.velocity.sub(e.velocity),
      [n, s] = [i.position, e.position],
      { dx: r, dy: l } = K(s, n);
    if (t * r + o * l < 0) return;
    let d = -Math.atan2(l, r),
      p = i.mass,
      m = e.mass,
      g = i.velocity.rotate(d),
      y = e.velocity.rotate(d),
      b = yu(g, y, p, m),
      k = yu(y, g, p, m),
      M = b.rotate(-d),
      C = k.rotate(-d);
    (i.velocity.x = M.x * i.factor.x),
      (i.velocity.y = M.y * i.factor.y),
      (e.velocity.x = C.x * e.factor.x),
      (e.velocity.y = C.y * e.factor.y);
  }
  function j(i, e) {
    return X(i) ? i.map((o, n) => e(o, n)) : e(i, 0);
  }
  function ne(i, e, t) {
    return X(i) ? go(i, e, t) : i;
  }
  function bu(i, e) {
    return X(i) ? i.find((o, n) => e(o, n)) : e(i, 0) ? i : void 0;
  }
  function Or(i, e) {
    let t = i.value,
      o = i.animation,
      n = {
        delayTime: P(o.delay) * 1e3,
        enable: o.enable,
        value: P(i.value) * e,
        max: po(t) * e,
        min: br(t) * e,
        loops: 0,
        maxLoops: P(o.count),
        time: 0,
      },
      s = 1;
    if (o.enable) {
      switch (((n.decay = s - P(o.decay)), o.mode)) {
        case ft.increase:
          n.status = W.increasing;
          break;
        case ft.decrease:
          n.status = W.decreasing;
          break;
        case ft.random:
          n.status = T() >= 0.5 ? W.increasing : W.decreasing;
          break;
        default:
          break;
      }
      let r = o.mode === ft.auto;
      switch (o.startValue) {
        case wt.min:
          (n.value = n.min), r && (n.status = W.increasing);
          break;
        case wt.max:
          (n.value = n.max), r && (n.status = W.decreasing);
          break;
        case wt.random:
        default:
          (n.value = de(n)), r && (n.status = T() >= 0.5 ? W.increasing : W.decreasing);
          break;
      }
    }
    return (n.initialValue = n.value), n;
  }
  function Jm(i, e) {
    if (!(i.mode === mo.percent)) {
      let { mode: n, ...s } = i;
      return s;
    }
    return 'x' in i
      ? { x: (i.x / 100) * e.width, y: (i.y / 100) * e.height }
      : { width: (i.width / 100) * e.width, height: (i.height / 100) * e.height };
  }
  function Md(i, e) {
    return Jm(i, e);
  }
  function eg(i, e, t, o, n) {
    switch (e) {
      case qe.max:
        t >= n && i.destroy();
        break;
      case qe.min:
        t <= o && i.destroy();
        break;
      default:
        break;
    }
  }
  function yo(i, e, t, o, n) {
    if (i.destroyed || !e.enable || ((e.maxLoops ?? 0) > 0 && (e.loops ?? 0) > (e.maxLoops ?? 0)))
      return;
    let p = (e.velocity ?? 0) * n.factor,
      m = e.min,
      g = e.max,
      y = e.decay ?? 1;
    if (
      (e.time ?? (e.time = 0),
      (e.delayTime ?? 0) > 0 && e.time < (e.delayTime ?? 0) && (e.time += n.value),
      !((e.delayTime ?? 0) > 0 && e.time < (e.delayTime ?? 0)))
    ) {
      switch (e.status) {
        case W.increasing:
          e.value += p;
          break;
        case W.decreasing:
          e.value -= p;
          break;
        default:
          break;
      }
      switch ((e.velocity && y !== 1 && (e.velocity *= y), e.status)) {
        case W.increasing:
          e.value >= g &&
            (t ? (e.status = W.decreasing) : (e.value -= g), e.loops ?? (e.loops = 0), e.loops++);
          break;
        case W.decreasing:
          e.value <= m &&
            (t ? (e.status = W.increasing) : (e.value += g), e.loops ?? (e.loops = 0), e.loops++);
          break;
        default:
          break;
      }
      eg(i, o, e.value, m, g), i.destroyed || (e.value = Y(e.value, m, g));
    }
  }
  function kd(i) {
    let e = Z().createElement('div').style;
    for (let t in i) {
      let o = i[t];
      if (!(t in i) || x(o)) continue;
      let n = i.getPropertyValue?.(o);
      if (!n) continue;
      let s = i.getPropertyPriority?.(o);
      s ? e.setProperty(o, n, s) : e.setProperty(o, n);
    }
    return e;
  }
  function tg(i) {
    let e = Z().createElement('div').style,
      t = 10,
      o = {
        width: '100%',
        height: '100%',
        margin: '0',
        padding: '0',
        borderWidth: '0',
        position: 'fixed',
        zIndex: i.toString(t),
        'z-index': i.toString(t),
        top: '0',
        left: '0',
        'pointer-events': 'none',
      };
    for (let n in o) {
      let s = o[n];
      s !== void 0 && e.setProperty(n, s);
    }
    return e;
  }
  function se(i, e, t, o, n) {
    if (o) {
      let s = { passive: !0 };
      yr(n) ? (s.capture = n) : n !== void 0 && (s = n), i.addEventListener(e, t, s);
    } else {
      let s = n;
      i.removeEventListener(e, t, s);
    }
  }
  async function Rr(i, e, t, o = !1) {
    let n = e.get(i);
    return (!n || o) && ((n = await Promise.all([...t.values()].map((s) => s(i)))), e.set(i, n)), n;
  }
  async function Wn(i, e, t, o = !1) {
    let n = e.get(i);
    if (!n || o) {
      let s = await Promise.all([...t.entries()].map(([r, l]) => l(i).then((u) => [r, u])));
      (n = new Map(s)), e.set(i, n);
    }
    return n;
  }
  var Qm,
    Ym,
    Pd,
    ve = w(() => {
      te();
      oe();
      B();
      wr();
      Mr();
      xu();
      kr();
      Pr();
      Cr();
      qn();
      (Qm = 0), (Ym = 0);
      Pd = _m(tg);
    });
  var Fe,
    Dr,
    Cd = w(() => {
      oe();
      Dr = class {
        constructor() {
          f(this, Fe);
          h(this, Fe, new Map());
        }
        addEventListener(e, t) {
          this.removeEventListener(e, t);
          let o = a(this, Fe).get(e);
          o || ((o = []), a(this, Fe).set(e, o)), o.push(t);
        }
        dispatchEvent(e, t) {
          a(this, Fe)
            .get(e)
            ?.forEach((n) => {
              n(t);
            });
        }
        hasEventListener(e) {
          return !!a(this, Fe).get(e);
        }
        removeAllEventListeners(e) {
          e ? a(this, Fe).delete(e) : h(this, Fe, new Map());
        }
        removeEventListener(e, t) {
          let o = a(this, Fe).get(e);
          if (!o) return;
          let n = o.length,
            s = o.indexOf(t);
          s < Ue || (n === bi ? a(this, Fe).delete(e) : o.splice(s, bi));
        }
      };
      Fe = new WeakMap();
    });
  var re,
    xo = w(() => {
      (function (i) {
        (i.configAdded = 'configAdded'),
          (i.containerInit = 'containerInit'),
          (i.particlesSetup = 'particlesSetup'),
          (i.containerStarted = 'containerStarted'),
          (i.containerStopped = 'containerStopped'),
          (i.containerDestroyed = 'containerDestroyed'),
          (i.containerPaused = 'containerPaused'),
          (i.containerPlay = 'containerPlay'),
          (i.containerBuilt = 'containerBuilt'),
          (i.particleAdded = 'particleAdded'),
          (i.particleDestroyed = 'particleDestroyed'),
          (i.particleRemoved = 'particleRemoved');
      })(re || (re = {}));
    });
  var wi,
    Gn,
    bo,
    vo,
    wo,
    Mi,
    Mo,
    jn,
    vu,
    Ir,
    Sd = w(() => {
      ve();
      xo();
      Ir = class {
        constructor(e) {
          f(this, jn);
          c(this, 'colorManagers', new Map());
          c(this, 'easingFunctions', new Map());
          c(this, 'effectDrawers', new Map());
          c(this, 'initializers', { effects: new Map(), shapes: new Map(), updaters: new Map() });
          c(this, 'palettes', new Map());
          c(this, 'plugins', []);
          c(this, 'presets', new Map());
          c(this, 'shapeDrawers', new Map());
          c(this, 'updaters', new Map());
          f(this, wi, new Set());
          f(this, Gn, new Map());
          f(this, bo);
          f(this, vo, new Set());
          f(this, wo, !1);
          f(this, Mi, !1);
          f(this, Mo, new Set());
          h(this, bo, e);
        }
        get configs() {
          let e = {};
          for (let [t, o] of a(this, Gn)) e[t] = o;
          return e;
        }
        addColorManager(e, t) {
          this.colorManagers.set(e, t);
        }
        addConfig(e) {
          let t = e.key ?? e.name ?? 'default';
          a(this, Gn).set(t, e),
            a(this, bo).dispatchEvent(re.configAdded, { data: { name: t, config: e } });
        }
        addEasing(e, t) {
          this.easingFunctions.get(e) || this.easingFunctions.set(e, t);
        }
        addEffect(e, t) {
          this.initializers.effects.set(e, t);
        }
        addPalette(e, t) {
          this.palettes.set(e, t);
        }
        addParticleUpdater(e, t) {
          this.initializers.updaters.set(e, t);
        }
        addPlugin(e) {
          this.getPlugin(e.id) || this.plugins.push(e);
        }
        addPreset(e, t, o = !1) {
          (o || !this.getPreset(e)) && this.presets.set(e, t);
        }
        addShape(e, t) {
          for (let o of e) this.initializers.shapes.set(o, t);
        }
        clearPlugins(e) {
          this.effectDrawers.delete(e), this.shapeDrawers.delete(e), this.updaters.delete(e);
        }
        getEasing(e) {
          return this.easingFunctions.get(e) ?? ((t) => t);
        }
        getEffectDrawers(e, t = !1) {
          return Wn(e, this.effectDrawers, this.initializers.effects, t);
        }
        getPalette(e) {
          return this.palettes.get(e);
        }
        getPlugin(e) {
          return this.plugins.find((t) => t.id === e);
        }
        getPreset(e) {
          return this.presets.get(e);
        }
        async getShapeDrawers(e, t = !1) {
          return Wn(e, this.shapeDrawers, this.initializers.shapes, t);
        }
        async getUpdaters(e, t = !1) {
          return Rr(e, this.updaters, this.initializers.updaters, t);
        }
        async init() {
          if (!(a(this, wo) || a(this, Mi))) {
            h(this, Mi, !0), h(this, vo, new Set()), h(this, wi, new Set(a(this, Mo)));
            try {
              for (let e of a(this, wi))
                await L(this, jn, vu).call(this, e, a(this, vo), a(this, wi));
            } finally {
              a(this, Mo).clear(), h(this, Mi, !1), h(this, wo, !0);
            }
          }
        }
        loadParticlesOptions(e, t, ...o) {
          let n = this.updaters.get(e);
          n && n.forEach((s) => s.loadOptions?.(t, ...o));
        }
        async register(...e) {
          if (a(this, wo))
            throw new Error('Register plugins can only be done before calling tsParticles.load()');
          for (let t of e)
            a(this, Mi)
              ? await L(this, jn, vu).call(this, t, a(this, vo), a(this, wi))
              : a(this, Mo).add(t);
        }
      };
      (wi = new WeakMap()),
        (Gn = new WeakMap()),
        (bo = new WeakMap()),
        (vo = new WeakMap()),
        (wo = new WeakMap()),
        (Mi = new WeakMap()),
        (Mo = new WeakMap()),
        (jn = new WeakSet()),
        (vu = async function (e, t, o) {
          t.has(e) || (t.add(e), o.add(e), await e(a(this, bo)));
        });
    });
  function _e() {
    return og;
  }
  var ig,
    ko,
    og,
    Qn = w(() => {
      (ig = 'tsParticles - Error'),
        (ko =
          (i) =>
          (...e) => {
            i(...e);
          }),
        (og = {
          debug: ko(console.debug),
          error: (i, ...e) => {
            console.error(`${ig} - ${i}`, ...e);
          },
          info: ko(console.info),
          log: ko(console.log),
          trace: ko(console.trace),
          verbose: ko(console.log),
          warning: ko(console.warn),
        });
    });
  var zr,
    wu = w(() => {
      (function (i) {
        (i.darken = 'darken'), (i.enlighten = 'enlighten');
      })(zr || (zr = {}));
    });
  function Rd(i, e) {
    let t = Yn.get(i);
    return (
      t ||
        ((t = e()),
        Yn.size >= Od && [...Yn.keys()].slice(ng, Od * 0.5).forEach((n) => Yn.delete(n)),
        Yn.set(i, t)),
      t
    );
  }
  function sg(i, e) {
    if (e) {
      for (let t of i.colorManagers.values()) if (t.accepts(e)) return t.parseString(e);
    }
  }
  function dt(i, e, t, o = !0) {
    if (!e) return;
    let n = Qe(e) ? { value: e } : e;
    if (Qe(n.value)) return Dd(i, n.value, t, o);
    if (X(n.value)) {
      let s = go(n.value, t, o);
      return s ? dt(i, { value: s }) : void 0;
    }
    for (let s of i.colorManagers.values()) {
      let r = s.handleRangeColor(n);
      if (r) return r;
    }
  }
  function Dd(i, e, t, o = !0) {
    if (!e) return;
    let n = Qe(e) ? { value: e } : e;
    if (Qe(n.value)) return n.value === yt ? zd() : rg(i, n.value);
    if (X(n.value)) {
      let s = go(n.value, t, o);
      return s ? Dd(i, { value: s }) : void 0;
    }
    for (let s of i.colorManagers.values()) {
      let r = s.handleColor(n);
      if (r) return r;
    }
  }
  function Pt(i, e, t, o = !0) {
    let n = dt(i, e, t, o);
    return n ? Su(n) : void 0;
  }
  function Su(i) {
    let e = i.r / fe,
      t = i.g / fe,
      o = i.b / fe,
      n = Math.max(e, t, o),
      s = Math.min(e, t, o),
      r = { h: fo, l: (n + s) * 0.5, s: xi };
    return (
      n !== s &&
        ((r.s = r.l < 0.5 ? (n - s) / (n + s) : (n - s) / (I - n - s)),
        e === n
          ? (r.h = (t - o) / (n - s))
          : t === n
            ? (r.h = I + (o - e) / (n - s))
            : (r.h = I * I + (e - t) / (n - s))),
      (r.l *= yi),
      (r.s *= gi),
      (r.h *= Gf),
      r.h < fo && (r.h += Ne),
      r.h >= Ne && (r.h -= Ne),
      r
    );
  }
  function rg(i, e) {
    return sg(i, e);
  }
  function kt(i) {
    let e = ((i.h % Ne) + Ne) % Ne,
      t = Math.max(xi, Math.min(gi, i.s)),
      o = Math.max(Nn, Math.min(yi, i.l)),
      n = e / Ne,
      s = t / gi,
      r = o / yi;
    if (t === xi) {
      let b = Math.round(r * fe);
      return { r: b, g: b, b };
    }
    let l = (b, k, M) => {
        if ((M < 0 && M++, M > 1 && M--, M * mr < 1)) return b + (k - b) * mr * M;
        if (M * I < 1) return k;
        if (M * ho < 1 * I) {
          let F = I / ho;
          return b + (k - b) * (F - M) * mr;
        }
        return b;
      },
      u = r < 0.5 ? r * (sd + s) : r + s - r * s,
      d = I * r - u,
      p = rd / ho,
      m = Math.min(fe, fe * l(d, u, n + p)),
      g = Math.min(fe, fe * l(d, u, n)),
      y = Math.min(fe, fe * l(d, u, n - p));
    return { r: Math.round(m), g: Math.round(g), b: Math.round(y) };
  }
  function Id(i) {
    let e = kt(i);
    return { a: i.a, b: e.b, g: e.g, r: e.r };
  }
  function zd(i) {
    let e = i ?? pu,
      t = fe + He,
      o = () => Math.floor(gu(e, t));
    return { b: o(), g: o(), r: o() };
  }
  function Ct(i, e, t) {
    let o = t ?? Ce,
      n = `rgb-${i.r.toFixed(Mu)}-${i.g.toFixed(Mu)}-${i.b.toFixed(Mu)}-${e ? 'hdr' : 'sdr'}-${o.toString()}`;
    return Rd(n, () => (e ? Ed(i, t) : ag(i, t)));
  }
  function Ed(i, e) {
    return `color(display-p3 ${(i.r / fe).toString()} ${(i.g / fe).toString()} ${(i.b / fe).toString()} / ${(e ?? Ce).toString()})`;
  }
  function ag(i, e) {
    return `rgba(${i.r.toString()}, ${i.g.toString()}, ${i.b.toString()}, ${(e ?? Ce).toString()})`;
  }
  function St(i, e, t) {
    let o = t ?? Ce,
      n = `hsl-${i.h.toFixed(ku)}-${i.s.toFixed(ku)}-${i.l.toFixed(ku)}-${e ? 'hdr' : 'sdr'}-${o.toString()}`;
    return Rd(n, () => (e ? lg(i, t) : cg(i, t)));
  }
  function lg(i, e) {
    return Ed(kt(i), e);
  }
  function cg(i, e) {
    return `hsla(${i.h.toString()}, ${i.s.toString()}%, ${i.l.toString()}%, ${(e ?? Ce).toString()})`;
  }
  function _n(i, e, t, o) {
    let n = i,
      s = e;
    return (
      'r' in n || (n = kt(i)),
      'r' in s || (s = kt(e)),
      { b: xr(n.b, s.b, t, o), g: xr(n.g, s.g, t, o), r: xr(n.r, s.r, t, o) }
    );
  }
  function Po(i, e, t) {
    if (t === yt) return zd();
    if (t === Ln) {
      let o = i.getFillColor() ?? i.getStrokeColor(),
        n = e?.getFillColor() ?? e?.getStrokeColor();
      if (o && n && e) return _n(o, n, i.getRadius(), e.getRadius());
      {
        let s = o ?? n;
        if (s) return kt(s);
      }
    } else return t;
  }
  function Er(i, e, t, o) {
    let n = Qe(e) ? e : e.value;
    return n === yt ? (o ? dt(i, { value: n }) : t ? yt : Ln) : n === Ln ? Ln : dt(i, { value: n });
  }
  function Ou(i) {
    return i === void 0 ? void 0 : { h: i.h.value, s: i.s.value, l: i.l.value };
  }
  function Ru(i, e, t) {
    let o = {
      h: { enable: !1, value: i.h, min: fo, max: Ne },
      s: { enable: !1, value: i.s, min: xi, max: gi },
      l: { enable: !1, value: i.l, min: Nn, max: yi },
    };
    return e && (Pu(o.h, e.h, t), Pu(o.s, e.s, t), Pu(o.l, e.l, t)), o;
  }
  function Pu(i, e, t) {
    (i.enable = e.enable),
      (i.min = e.min),
      (i.max = e.max),
      i.enable
        ? ((i.velocity = (P(e.speed) / 100) * t),
          (i.decay = pr - P(e.decay)),
          (i.status = W.increasing),
          (i.loops = ld),
          (i.maxLoops = P(e.count)),
          (i.time = cd),
          (i.delayTime = P(e.delay) * 1e3),
          e.sync || ((i.velocity *= T()), (i.value *= T())),
          (i.initialValue = i.value),
          (i.offset = D(e.offset)))
        : (i.velocity = ad);
  }
  function Cu(i, e, t) {
    if (
      !i.enable ||
      ((i.maxLoops ?? 0) > 0 && (i.loops ?? 0) > (i.maxLoops ?? 0)) ||
      (i.time ?? (i.time = 0),
      (i.delayTime ?? 0) > 0 && i.time < (i.delayTime ?? 0) && (i.time += t.value),
      (i.delayTime ?? 0) > 0 && i.time < (i.delayTime ?? 0))
    )
      return;
    let d = i.offset ? de(i.offset) : 0,
      p = (i.velocity ?? 0) * t.factor + d * 3.6,
      m = i.decay ?? 1,
      g = i.max,
      y = i.min;
    !e || i.status === W.increasing
      ? ((i.value += p),
        i.value > g &&
          (i.loops ?? (i.loops = 0), i.loops++, e ? (i.status = W.decreasing) : (i.value -= g)))
      : ((i.value -= p),
        i.value < y && (i.loops ?? (i.loops = 0), i.loops++, (i.status = W.increasing))),
      i.velocity && m !== 1 && (i.velocity *= m),
      (i.value = Y(i.value, y, g));
  }
  function Du(i, e) {
    if (!i) return;
    let { h: t, s: o, l: n } = i;
    Cu(t, !1, e), Cu(o, !0, e), Cu(n, !0, e);
  }
  function Fd(i, e, t) {
    return { h: i.h, s: i.s, l: i.l + (e === zr.darken ? -hu : hu) * t };
  }
  var Yn,
    Od,
    ng,
    Mu,
    ku,
    Xn = w(() => {
      te();
      oe();
      B();
      wu();
      Mr();
      ve();
      (Yn = new Map()), (Od = 1e3), (ng = 0), (Mu = 2), (ku = 2);
    });
  function Td(i, e, t) {
    (i.fillStyle = t ?? 'rgba(0,0,0,0)'), i.fillRect(O.x, O.y, e.width, e.height);
  }
  function Ad(i, e, t, o) {
    if (!t) return;
    let n = i.globalAlpha;
    (i.globalAlpha = o), i.drawImage(t, O.x, O.y, e.width, e.height), (i.globalAlpha = n);
  }
  function Iu(i, e) {
    i.clearRect(O.x, O.y, e.width, e.height);
  }
  function Ld(i) {
    let {
        container: e,
        context: t,
        particle: o,
        delta: n,
        colorStyles: s,
        radius: r,
        opacity: l,
        transform: u,
      } = i,
      { effectDrawers: d, shapeDrawers: p } = e,
      m = o.getPosition(),
      g = o.getTransformData(u),
      y = gr,
      b = { x: m.x, y: m.y };
    t.setTransform(g.a, g.b, g.c, g.d, m.x, m.y), s.fill && (t.fillStyle = s.fill);
    let k = !!o.fillEnabled,
      M = o.strokeWidth ?? du;
    (t.lineWidth = M), s.stroke && (t.strokeStyle = s.stroke);
    let C = {
      context: t,
      particle: o,
      radius: r,
      drawRadius: r * y,
      opacity: l,
      delta: n,
      pixelRatio: e.retina.pixelRatio,
      fill: k,
      stroke: M > du,
      transformData: g,
      position: { ...m },
      drawPosition: b,
      drawScale: y,
    };
    for (let V of e.plugins) V.drawParticleTransform?.(C);
    let S = o.effect ? d.get(o.effect) : void 0,
      F = o.shape ? p.get(o.shape) : void 0;
    fg(S, C), pg(F, C), dg(F, C), hg(F, C), ug(S, C), t.resetTransform();
  }
  function ug(i, e) {
    if (!i?.drawAfter) return;
    let { particle: t } = e;
    t.effect && i.drawAfter(e);
  }
  function fg(i, e) {
    if (!i?.drawBefore) return;
    let { particle: t } = e;
    t.effect && i.drawBefore(e);
  }
  function dg(i, e) {
    if (!i) return;
    let { context: t, fill: o, particle: n, stroke: s } = e;
    n.shape &&
      (t.beginPath(), i.draw(e), n.shapeClose && t.closePath(), o && t.fill(), s && t.stroke());
  }
  function hg(i, e) {
    if (!i?.afterDraw) return;
    let { particle: t } = e;
    t.shape && i.afterDraw(e);
  }
  function pg(i, e) {
    if (!i?.beforeDraw) return;
    let { particle: t } = e;
    t.shape && i.beforeDraw(e);
  }
  function Bd(i, e, t, o) {
    e.drawParticle && e.drawParticle(i, t, o);
  }
  var zu = w(() => {
    oe();
  });
  function yg(i, e, t) {
    let o = e[t];
    o !== void 0 && (i[t] = (i[t] ?? jf) * o);
  }
  var mg,
    gg,
    Ot,
    Rt,
    Dt,
    It,
    zt,
    ht,
    Et,
    Kn,
    Ft,
    Tt,
    At,
    Lt,
    Bt,
    Vt,
    Co,
    Nt,
    Ut,
    Tr,
    So,
    Ar,
    Lr,
    Br,
    Vr,
    Fr,
    Vd = w(() => {
      zu();
      oe();
      Xn();
      (mg = 0), (gg = 1);
      Fr = class {
        constructor(e, t, o) {
          f(this, Ot);
          f(this, Rt);
          f(this, Dt);
          f(this, It);
          f(this, zt);
          f(this, ht);
          f(this, Et);
          f(this, Kn);
          f(this, Ft);
          f(this, Tt);
          f(this, At);
          f(this, Lt);
          f(this, Bt);
          f(this, Vt);
          f(this, Co);
          f(this, Nt);
          f(this, Ut);
          f(this, Tr, {});
          f(this, So, [void 0, void 0]);
          f(this, Ar, {});
          f(this, Lr, (e) => {
            for (let t of a(this, Nt)) t.afterDraw?.(e);
          });
          f(this, Br, (e, t, o, n, s, r) => {
            for (let l of a(this, Ut)) {
              if (l.getColorStyles) {
                let { fill: u, stroke: d } = l.getColorStyles(t, e, o, n);
                u && (s.fill = u), d && (s.stroke = d);
              }
              if (l.getTransformValues) {
                let u = l.getTransformValues(t);
                for (let d in u) yg(r, u, d);
              }
              l.beforeDraw?.(t);
            }
          });
          f(this, Vr, (e) => {
            let t, o;
            for (let n of a(this, zt))
              if (
                (!t && n.particleFillColor && (t = Pt(a(this, Co), n.particleFillColor(e))),
                !o && n.particleStrokeColor && (o = Pt(a(this, Co), n.particleStrokeColor(e))),
                t && o)
              )
                break;
            return (a(this, So)[mg] = t), (a(this, So)[gg] = o), a(this, So);
          });
          h(this, Co, e),
            h(this, ht, t),
            h(this, Rt, o),
            h(this, Et, null),
            h(this, Ut, []),
            h(this, Nt, []),
            h(this, zt, []),
            h(this, Ot, []),
            h(this, Dt, []),
            h(this, It, []),
            h(this, Ft, []),
            h(this, Tt, []),
            h(this, At, []),
            h(this, Lt, []),
            h(this, Vt, []),
            h(this, Bt, []);
        }
        get settings() {
          return a(this, Kn);
        }
        canvasClear() {
          a(this, ht).actualOptions.clear &&
            this.draw((e) => {
              Iu(e, a(this, Rt).size);
            });
        }
        clear() {
          let e = !1;
          for (let t of a(this, Ot)) if (((e = t.canvasClear?.() ?? !1), e)) break;
          e || this.canvasClear();
        }
        destroy() {
          this.stop(),
            h(this, Ut, []),
            h(this, Nt, []),
            h(this, zt, []),
            h(this, Ot, []),
            h(this, Dt, []),
            h(this, It, []),
            h(this, Ft, []),
            h(this, Tt, []),
            h(this, At, []),
            h(this, Lt, []),
            h(this, Vt, []),
            h(this, Bt, []);
        }
        draw(e) {
          let t = a(this, Et);
          if (t) return e(t);
        }
        drawParticle(e, t) {
          if (e.spawning || e.destroyed) return;
          let o = e.getRadius();
          if (o <= Qf) return;
          let n = e.getFillColor(),
            s = e.getStrokeColor(),
            [r, l] = a(this, Vr).call(this, e);
          if ((r ?? (r = n), l ?? (l = s), !r && !l)) return;
          let u = a(this, ht),
            d = e.options.zIndex,
            p = dr - e.zIndexFactor,
            { fillOpacity: m, opacity: g, strokeOpacity: y } = e.getOpacity(),
            b = a(this, Ar),
            k = a(this, Tr),
            M = r ? St(r, u.hdr, m * g) : void 0,
            C = l ? St(l, u.hdr, y * g) : M;
          (b.a = b.b = b.c = b.d = void 0),
            (k.fill = M),
            (k.stroke = C),
            this.draw((S) => {
              for (let F of a(this, At)) F.drawParticleSetup?.(S, e, t);
              a(this, Br).call(this, S, e, o, g, k, b),
                Ld({
                  container: u,
                  context: S,
                  particle: e,
                  delta: t,
                  colorStyles: k,
                  radius: o * p ** d.sizeRate,
                  opacity: g,
                  transform: b,
                }),
                a(this, Lr).call(this, e);
              for (let F of a(this, Tt)) F.drawParticleCleanup?.(S, e, t);
            });
        }
        drawParticlePlugins(e, t) {
          this.draw((o) => {
            for (let n of a(this, Ft)) Bd(o, n, e, t);
          });
        }
        drawParticles(e) {
          let { particles: t } = a(this, ht);
          this.clear(),
            t.update(e),
            this.draw((o) => {
              for (let n of a(this, Vt)) n.drawSettingsSetup?.(o, e);
              for (let n of a(this, Lt)) n.draw?.(o, e);
              t.drawParticles(e);
              for (let n of a(this, It)) n.clearDraw?.(o, e);
              for (let n of a(this, Bt)) n.drawSettingsCleanup?.(o, e);
            });
        }
        init() {
          this.initUpdaters(), this.initPlugins(), this.paint();
        }
        initPlugins() {
          h(this, zt, []),
            h(this, Ot, []),
            h(this, Dt, []),
            h(this, It, []),
            h(this, Ft, []),
            h(this, At, []),
            h(this, Tt, []),
            h(this, Lt, []),
            h(this, Vt, []),
            h(this, Bt, []);
          for (let e of a(this, ht).plugins)
            (e.particleFillColor ?? e.particleStrokeColor) && a(this, zt).push(e),
              e.canvasClear && a(this, Ot).push(e),
              e.canvasPaint && a(this, Dt).push(e),
              e.drawParticle && a(this, Ft).push(e),
              e.drawParticleSetup && a(this, At).push(e),
              e.drawParticleCleanup && a(this, Tt).push(e),
              e.draw && a(this, Lt).push(e),
              e.drawSettingsSetup && a(this, Vt).push(e),
              e.drawSettingsCleanup && a(this, Bt).push(e),
              e.clearDraw && a(this, It).push(e);
        }
        initUpdaters() {
          h(this, Ut, []), h(this, Nt, []);
          for (let e of a(this, ht).particleUpdaters)
            e.afterDraw && a(this, Nt).push(e),
              (e.getColorStyles ?? e.getTransformValues ?? e.beforeDraw) && a(this, Ut).push(e);
        }
        paint() {
          let e = !1;
          for (let t of a(this, Dt)) if (((e = t.canvasPaint?.() ?? !1), e)) break;
          e || this.paintBase();
        }
        paintBase(e) {
          this.draw((t) => {
            Td(t, a(this, Rt).size, e);
          });
        }
        paintImage(e, t) {
          this.draw((o) => {
            Ad(o, a(this, Rt).size, e, t);
          });
        }
        setContext(e) {
          h(this, Et, e), a(this, Et) && (a(this, Et).globalCompositeOperation = rr);
        }
        setContextSettings(e) {
          h(this, Kn, e);
        }
        stop() {
          this.draw((e) => {
            Iu(e, a(this, Rt).size);
          });
        }
      };
      (Ot = new WeakMap()),
        (Rt = new WeakMap()),
        (Dt = new WeakMap()),
        (It = new WeakMap()),
        (zt = new WeakMap()),
        (ht = new WeakMap()),
        (Et = new WeakMap()),
        (Kn = new WeakMap()),
        (Ft = new WeakMap()),
        (Tt = new WeakMap()),
        (At = new WeakMap()),
        (Lt = new WeakMap()),
        (Bt = new WeakMap()),
        (Vt = new WeakMap()),
        (Co = new WeakMap()),
        (Nt = new WeakMap()),
        (Ut = new WeakMap()),
        (Tr = new WeakMap()),
        (So = new WeakMap()),
        (Ar = new WeakMap()),
        (Lr = new WeakMap()),
        (Br = new WeakMap()),
        (Vr = new WeakMap());
    });
  function Ud(i, e, t = !1) {
    if (!e) return;
    let o = i,
      n = o.style,
      s = new Set();
    for (let r = 0; r < n.length; r++) {
      let l = n.item(r);
      l && s.add(l);
    }
    for (let r = 0; r < e.length; r++) {
      let l = e.item(r);
      l && s.add(l);
    }
    for (let r of s) {
      let l = e.getPropertyValue(r);
      l ? n.setProperty(r, l, t ? 'important' : '') : n.removeProperty(r);
    }
  }
  var Nd,
    xg,
    bg,
    he,
    ki,
    Pi,
    Zn,
    Jn,
    Oo,
    Ht,
    Ci,
    Ro,
    Ur,
    Hd,
    Hr,
    es,
    ts,
    is,
    Xe,
    qr,
    Nr,
    qd = w(() => {
      ve();
      oe();
      Xn();
      Vd();
      (Nd = new WeakMap()),
        (xg = (i) => {
          let e = Nd.get(i);
          if (e) return e;
          if (typeof i.transferControlToOffscreen != 'function')
            throw new TypeError('OffscreenCanvas is required but not supported by this browser');
          try {
            let t = i.transferControlToOffscreen();
            return Nd.set(i, t), t;
          } catch {
            throw new TypeError('OffscreenCanvas transfer failed');
          }
        }),
        (bg = (i) => typeof HTMLCanvasElement < 'u' && i instanceof HTMLCanvasElement);
      Nr = class {
        constructor(e, t) {
          f(this, Ur);
          c(this, 'domElement');
          c(this, 'render');
          c(this, 'renderCanvas');
          c(this, 'size');
          c(this, 'zoom', gr);
          f(this, he);
          f(this, ki);
          f(this, Pi);
          f(this, Zn);
          f(this, Jn);
          f(this, Oo);
          f(this, Ht);
          f(this, Ci);
          f(this, Ro);
          f(this, Hr, () => {
            for (let e of a(this, Ht)) e.resize?.();
          });
          f(this, es, () => {
            let e = this.domElement,
              t = a(this, he).actualOptions;
            if (e) {
              a(this, Ur, Hd) ? a(this, qr).call(this) : a(this, is).call(this);
              for (let o in t.style) {
                if (!o || !(o in t.style)) continue;
                let n = t.style[o];
                n && e.style.setProperty(o, n, 'important');
              }
            }
          });
          f(this, ts, () => {
            let e = this.domElement;
            if (!e) return;
            a(this, Xe).call(this, (o) => {
              o.disconnect();
            }),
              a(this, es).call(this),
              this.initBackground();
            let t = a(this, Oo);
            (e.style.pointerEvents = t),
              e.style.setProperty('pointer-events', t),
              a(this, Xe).call(this, (o) => {
                e instanceof Node && o.observe(e, { attributes: !0 });
              });
          });
          f(this, is, () => {
            let e = this.domElement,
              t = a(this, Zn);
            !e || !t || Ud(e, t, !0);
          });
          f(this, Xe, (e) => {
            a(this, Pi) && e(a(this, Pi));
          });
          f(this, qr, () => {
            let e = this.domElement;
            e && Ud(e, Pd(a(this, he).actualOptions.fullScreen.zIndex), !0);
          });
          h(this, Jn, e),
            h(this, he, t),
            (this.render = new Fr(e, t, this)),
            h(this, Ci, { height: 0, width: 0 });
          let o = t.retina.pixelRatio,
            n = a(this, Ci);
          (this.size = { height: n.height * o, width: n.width * o }),
            h(this, ki, !1),
            h(this, Ht, []),
            h(this, Oo, 'none');
        }
        destroy() {
          this.stop(),
            a(this, ki)
              ? (this.domElement?.remove(),
                (this.domElement = void 0),
                (this.renderCanvas = void 0))
              : a(this, is).call(this),
            this.render.destroy(),
            h(this, Ht, []);
        }
        getZoomCenter() {
          let e = a(this, he).retina.pixelRatio,
            { width: t, height: o } = this.size;
          return a(this, Ro) ? a(this, Ro) : { x: (t * 0.5) / e, y: (o * 0.5) / e };
        }
        init() {
          a(this, Xe).call(this, (e) => {
            e.disconnect();
          }),
            h(
              this,
              Pi,
              vd((e) => {
                for (let t of e)
                  t.type === 'attributes' && t.attributeName === 'style' && a(this, ts).call(this);
              }),
            ),
            this.resize(),
            a(this, es).call(this),
            this.initBackground(),
            a(this, Xe).call(this, (e) => {
              let t = this.domElement;
              !t || !(t instanceof Node) || e.observe(t, { attributes: !0 });
            }),
            this.initPlugins(),
            this.render.init();
        }
        initBackground() {
          let e = a(this, he),
            t = e.actualOptions,
            o = t.background,
            n = this.domElement;
          if (!n) return;
          let s = n.style,
            r = dt(a(this, Jn), o.color);
          r ? (s.backgroundColor = Ct(r, e.hdr, o.opacity)) : (s.backgroundColor = ''),
            (s.backgroundImage = o.image || ''),
            (s.backgroundPosition = o.position || ''),
            (s.backgroundRepeat = o.repeat || ''),
            (s.backgroundSize = o.size || '');
        }
        initPlugins() {
          h(this, Ht, []);
          for (let e of a(this, he).plugins) e.resize && a(this, Ht).push(e);
        }
        loadCanvas(e) {
          a(this, ki) && this.domElement && this.domElement.remove();
          let t = a(this, he),
            o = bg(e) ? e : void 0;
          (this.domElement = o),
            h(this, ki, o ? o.dataset[gt] === 'true' : !1),
            (this.renderCanvas = o ? xg(o) : e);
          let n = this.domElement;
          n && ((n.ariaHidden = 'true'), h(this, Zn, kd(n.style)));
          let s = a(this, Ci),
            r = this.renderCanvas;
          n
            ? ((s.height = n.offsetHeight), (s.width = n.offsetWidth))
            : ((s.height = r.height), (s.width = r.width));
          let l = a(this, he).retina.pixelRatio,
            u = this.size;
          (r.height = u.height = s.height * l), (r.width = u.width = s.width * l);
          let d = xd('(color-gamut: p3)');
          this.render.setContextSettings({
            alpha: !0,
            colorSpace: d?.matches && t.hdr ? 'display-p3' : 'srgb',
            desynchronized: !0,
            willReadFrequently: !1,
          }),
            this.render.setContext(r.getContext('2d', this.render.settings)),
            a(this, Xe).call(this, (p) => {
              p.disconnect();
            }),
            t.retina.init(),
            this.initBackground(),
            a(this, Xe).call(this, (p) => {
              let m = this.domElement;
              !m || !(m instanceof Node) || p.observe(m, { attributes: !0 });
            });
        }
        resize() {
          let e = this.domElement;
          if (!e) return !1;
          let t = a(this, he),
            o = this.renderCanvas;
          if (o === void 0) return !1;
          let n = a(t.canvas, Ci),
            s = { width: e.offsetWidth, height: e.offsetHeight },
            r = t.retina.pixelRatio,
            l = { width: s.width * r, height: s.height * r };
          if (
            s.height === n.height &&
            s.width === n.width &&
            l.height === o.height &&
            l.width === o.width
          )
            return !1;
          let u = { ...n };
          (n.height = s.height), (n.width = s.width);
          let d = this.size;
          return (
            (o.width = d.width = l.width),
            (o.height = d.height = l.height),
            a(this, he).started &&
              t.particles.setResizeFactor({
                width: n.width / u.width,
                height: n.height / u.height,
              }),
            !0
          );
        }
        setPointerEvents(e) {
          this.domElement && (h(this, Oo, e), a(this, ts).call(this));
        }
        setZoom(e, t) {
          (this.zoom = e), h(this, Ro, t);
        }
        stop() {
          a(this, Xe).call(this, (e) => {
            e.disconnect();
          }),
            h(this, Pi, void 0),
            this.render.stop();
        }
        async windowResize() {
          if (!this.domElement || !this.resize()) return;
          let e = a(this, he),
            t = e.updateActualOptions();
          e.particles.setDensity(), a(this, Hr).call(this), t && (await e.refresh());
        }
      };
      (he = new WeakMap()),
        (ki = new WeakMap()),
        (Pi = new WeakMap()),
        (Zn = new WeakMap()),
        (Jn = new WeakMap()),
        (Oo = new WeakMap()),
        (Ht = new WeakMap()),
        (Ci = new WeakMap()),
        (Ro = new WeakMap()),
        (Ur = new WeakSet()),
        (Hd = function () {
          return a(this, he).actualOptions.fullScreen.enable;
        }),
        (Hr = new WeakMap()),
        (es = new WeakMap()),
        (ts = new WeakMap()),
        (is = new WeakMap()),
        (Xe = new WeakMap()),
        (qr = new WeakMap());
    });
  var qt,
    Do,
    Ke,
    Si,
    Wr,
    os,
    ns,
    Gr,
    $r,
    $d = w(() => {
      ve();
      oe();
      $r = class {
        constructor(e) {
          f(this, qt);
          f(this, Do);
          f(this, Ke);
          f(this, Si);
          f(this, Wr, () => {
            let e = a(this, qt);
            e.actualOptions.pauseOnBlur &&
              (Z().hidden
                ? ((e.pageHidden = !0), e.pause())
                : ((e.pageHidden = !1), e.animationStatus ? e.play(!0) : e.draw(!0)));
          });
          f(this, os, () => {
            a(this, Si) && (clearTimeout(a(this, Si)), h(this, Si, void 0));
            let e = async () => {
              await a(this, qt).canvas.windowResize();
            };
            h(
              this,
              Si,
              setTimeout(() => {
                e();
              }, a(this, qt).actualOptions.resize.delay * 1e3),
            );
          });
          f(this, ns, (e) => {
            let t = a(this, Do);
            a(this, Gr).call(this, e), se(document, ar, t.visibilityChange, e, !1);
          });
          f(this, Gr, (e) => {
            let t = a(this, Do),
              o = a(this, qt);
            if (!o.actualOptions.resize.enable) return;
            if (typeof ResizeObserver > 'u') {
              se(globalThis, Hf, t.resize, e);
              return;
            }
            let s = o.canvas.domElement;
            a(this, Ke) && !e
              ? (s && a(this, Ke).unobserve(s), a(this, Ke).disconnect(), h(this, Ke, void 0))
              : !a(this, Ke) &&
                e &&
                s &&
                (h(
                  this,
                  Ke,
                  new ResizeObserver((r) => {
                    r.find((u) => u.target === s) && a(this, os).call(this);
                  }),
                ),
                a(this, Ke).observe(s));
          });
          h(this, qt, e),
            h(this, Do, {
              visibilityChange: () => {
                a(this, Wr).call(this);
              },
              resize: () => {
                a(this, os).call(this);
              },
            });
        }
        addListeners() {
          a(this, ns).call(this, !0);
        }
        removeListeners() {
          a(this, ns).call(this, !1);
        }
      };
      (qt = new WeakMap()),
        (Do = new WeakMap()),
        (Ke = new WeakMap()),
        (Si = new WeakMap()),
        (Wr = new WeakMap()),
        (os = new WeakMap()),
        (ns = new WeakMap()),
        (Gr = new WeakMap());
    });
  var ie,
    jr = w(() => {
      B();
      ie = class i {
        constructor() {
          c(this, 'value');
          this.value = '';
        }
        static create(e, t) {
          let o = new i();
          return o.load(e), t !== void 0 && (Qe(t) || X(t) ? o.load({ value: t }) : o.load(t)), o;
        }
        load(e) {
          x(e) || x(e.value) || (this.value = e.value);
        }
      };
    });
  var Qr,
    Eu = w(() => {
      jr();
      B();
      Qr = class {
        constructor() {
          c(this, 'color');
          c(this, 'image');
          c(this, 'opacity');
          c(this, 'position');
          c(this, 'repeat');
          c(this, 'size');
          (this.color = new ie()),
            (this.color.value = ''),
            (this.image = ''),
            (this.position = ''),
            (this.repeat = ''),
            (this.size = ''),
            (this.opacity = 1);
        }
        load(e) {
          x(e) ||
            (e.color !== void 0 && (this.color = ie.create(this.color, e.color)),
            e.image !== void 0 && (this.image = e.image),
            e.position !== void 0 && (this.position = e.position),
            e.repeat !== void 0 && (this.repeat = e.repeat),
            e.size !== void 0 && (this.size = e.size),
            e.opacity !== void 0 && (this.opacity = e.opacity));
        }
      };
    });
  var Yr,
    Fu = w(() => {
      B();
      Yr = class {
        constructor() {
          c(this, 'enable');
          c(this, 'zIndex');
          (this.enable = !0), (this.zIndex = 0);
        }
        load(e) {
          x(e) ||
            (e.enable !== void 0 && (this.enable = e.enable),
            e.zIndex !== void 0 && (this.zIndex = e.zIndex));
        }
      };
    });
  var _r,
    Tu = w(() => {
      B();
      _r = class {
        constructor() {
          c(this, 'delay');
          c(this, 'enable');
          (this.delay = 0.5), (this.enable = !0);
        }
        load(e) {
          x(e) ||
            (e.delay !== void 0 && (this.delay = e.delay),
            e.enable !== void 0 && (this.enable = e.enable));
        }
      };
    });
  var Oi,
    $t,
    Xr = w(() => {
      wr();
      Cr();
      B();
      te();
      (Oi = class {
        constructor() {
          c(this, 'count');
          c(this, 'decay');
          c(this, 'delay');
          c(this, 'enable');
          c(this, 'speed');
          c(this, 'sync');
          (this.count = 0),
            (this.enable = !1),
            (this.speed = 1),
            (this.decay = 0),
            (this.delay = 0),
            (this.sync = !1);
        }
        load(e) {
          x(e) ||
            (e.count !== void 0 && (this.count = D(e.count)),
            e.enable !== void 0 && (this.enable = e.enable),
            e.speed !== void 0 && (this.speed = D(e.speed)),
            e.decay !== void 0 && (this.decay = D(e.decay)),
            e.delay !== void 0 && (this.delay = D(e.delay)),
            e.sync !== void 0 && (this.sync = e.sync));
        }
      }),
        ($t = class extends Oi {
          constructor() {
            super();
            c(this, 'mode');
            c(this, 'startValue');
            (this.mode = ft.auto), (this.startValue = wt.random);
          }
          load(t) {
            super.load(t),
              !x(t) &&
                (t.mode !== void 0 && (this.mode = t.mode),
                t.startValue !== void 0 && (this.startValue = t.startValue));
          }
        });
    });
  var Io,
    Au = w(() => {
      Xr();
      B();
      te();
      Io = class extends Oi {
        constructor(t, o) {
          super();
          c(this, 'max');
          c(this, 'min');
          c(this, 'offset');
          (this.min = t), (this.max = o), (this.offset = 0), (this.sync = !0);
        }
        load(t) {
          super.load(t),
            !x(t) &&
              (t.max !== void 0 && (this.max = t.max),
              t.min !== void 0 && (this.min = t.min),
              t.offset !== void 0 && (this.offset = D(t.offset)));
        }
      };
    });
  var Kr,
    Lu = w(() => {
      oe();
      Au();
      B();
      Kr = class {
        constructor() {
          c(this, 'h', new Io(fo, Ne));
          c(this, 'l', new Io(Nn, yi));
          c(this, 's', new Io(xi, gi));
        }
        load(e) {
          x(e) || (this.h.load(e.h), this.s.load(e.s), this.l.load(e.l));
        }
      };
    });
  var pe,
    zo = w(() => {
      B();
      Lu();
      jr();
      pe = class i extends ie {
        constructor() {
          super();
          c(this, 'animation');
          this.animation = new Kr();
        }
        static create(t, o) {
          let n = new i();
          return n.load(t), o !== void 0 && (Qe(o) || X(o) ? n.load({ value: o }) : n.load(o)), n;
        }
        load(t) {
          if ((super.load(t), x(t))) return;
          let o = t.animation;
          o !== void 0 &&
            (o.enable === void 0 ? this.animation.load(t.animation) : this.animation.h.load(o));
        }
      };
    });
  var Zr,
    Wd = w(() => {
      ve();
      B();
      Zr = class {
        constructor() {
          c(this, 'close');
          c(this, 'options');
          c(this, 'type');
          (this.close = !0), (this.options = {}), (this.type = []);
        }
        load(e) {
          if (x(e)) return;
          let t = e.options;
          if (t !== void 0)
            for (let o in t) {
              let n = t[o];
              n && (this.options[o] = G(this.options[o] ?? {}, n));
            }
          e.close !== void 0 && (this.close = e.close), e.type !== void 0 && (this.type = e.type);
        }
      };
    });
  var Eo,
    Jr = w(() => {
      zo();
      B();
      te();
      Eo = class {
        constructor() {
          c(this, 'color');
          c(this, 'enable');
          c(this, 'opacity');
          (this.enable = !0), (this.opacity = 1);
        }
        load(e) {
          x(e) ||
            (e.color !== void 0 && (this.color = pe.create(this.color, e.color)),
            e.enable !== void 0 && (this.enable = e.enable),
            e.opacity !== void 0 && (this.opacity = D(e.opacity)));
        }
      };
    });
  var ea,
    Bu = w(() => {
      B();
      te();
      ea = class {
        constructor() {
          c(this, 'offset');
          c(this, 'value');
          (this.offset = 0), (this.value = 90);
        }
        load(e) {
          x(e) ||
            (e.offset !== void 0 && (this.offset = D(e.offset)),
            e.value !== void 0 && (this.value = D(e.value)));
        }
      };
    });
  var ta,
    Vu = w(() => {
      Pr();
      B();
      ta = class {
        constructor() {
          c(this, 'mode');
          c(this, 'radius');
          c(this, 'x');
          c(this, 'y');
          (this.x = 50), (this.y = 50), (this.mode = mo.percent), (this.radius = 0);
        }
        load(e) {
          x(e) ||
            (e.x !== void 0 && (this.x = e.x),
            e.y !== void 0 && (this.y = e.y),
            e.mode !== void 0 && (this.mode = e.mode),
            e.radius !== void 0 && (this.radius = e.radius));
        }
      };
    });
  var ia,
    Nu = w(() => {
      B();
      te();
      ia = class {
        constructor() {
          c(this, 'acceleration');
          c(this, 'enable');
          c(this, 'inverse');
          c(this, 'maxSpeed');
          (this.acceleration = 9.81), (this.enable = !1), (this.inverse = !1), (this.maxSpeed = 50);
        }
        load(e) {
          x(e) ||
            (e.acceleration !== void 0 && (this.acceleration = D(e.acceleration)),
            e.enable !== void 0 && (this.enable = e.enable),
            e.inverse !== void 0 && (this.inverse = e.inverse),
            e.maxSpeed !== void 0 && (this.maxSpeed = D(e.maxSpeed)));
        }
      };
    });
  var me,
    Uu,
    Fo,
    ss = w(() => {
      Xr();
      B();
      te();
      (me = class {
        constructor() {
          c(this, 'value');
          this.value = 0;
        }
        load(e) {
          x(e) || x(e.value) || (this.value = D(e.value));
        }
      }),
        (Uu = class extends me {
          constructor() {
            super(...arguments);
            c(this, 'animation', new Oi());
          }
          load(t) {
            if ((super.load(t), x(t))) return;
            let o = t.animation;
            o !== void 0 && this.animation.load(o);
          }
        }),
        (Fo = class extends Uu {
          constructor() {
            super();
            c(this, 'animation');
            this.animation = new $t();
          }
          load(t) {
            super.load(t);
          }
        });
    });
  var oa,
    Hu = w(() => {
      ss();
      ve();
      B();
      oa = class {
        constructor() {
          c(this, 'clamp');
          c(this, 'delay');
          c(this, 'enable');
          c(this, 'generator');
          c(this, 'options');
          (this.clamp = !0), (this.delay = new me()), (this.enable = !1), (this.options = {});
        }
        load(e) {
          x(e) ||
            (e.clamp !== void 0 && (this.clamp = e.clamp),
            this.delay.load(e.delay),
            e.enable !== void 0 && (this.enable = e.enable),
            (this.generator = e.generator),
            e.options && (this.options = G(this.options, e.options)));
        }
      };
    });
  var H,
    na = w(() => {
      (function (i) {
        (i.bounce = 'bounce'),
          (i.none = 'none'),
          (i.out = 'out'),
          (i.destroy = 'destroy'),
          (i.split = 'split');
      })(H || (H = {}));
    });
  var sa,
    qu = w(() => {
      na();
      B();
      sa = class {
        constructor() {
          c(this, 'bottom');
          c(this, 'default');
          c(this, 'left');
          c(this, 'right');
          c(this, 'top');
          this.default = H.out;
        }
        load(e) {
          x(e) ||
            (e.default !== void 0 && (this.default = e.default),
            (this.bottom = e.bottom ?? e.default),
            (this.left = e.left ?? e.default),
            (this.right = e.right ?? e.default),
            (this.top = e.top ?? e.default));
        }
      };
    });
  var ra,
    $u = w(() => {
      ve();
      B();
      te();
      ra = class {
        constructor() {
          c(this, 'acceleration');
          c(this, 'enable');
          c(this, 'position');
          (this.acceleration = 0), (this.enable = !1);
        }
        load(e) {
          x(e) ||
            (e.acceleration !== void 0 && (this.acceleration = D(e.acceleration)),
            e.enable !== void 0 && (this.enable = e.enable),
            e.position && (this.position = G({}, e.position)));
        }
      };
    });
  var aa,
    Wu = w(() => {
      Un();
      B();
      Bu();
      Vu();
      Nu();
      Hu();
      qu();
      $u();
      te();
      aa = class {
        constructor() {
          c(this, 'angle');
          c(this, 'center');
          c(this, 'decay');
          c(this, 'direction');
          c(this, 'distance');
          c(this, 'drift');
          c(this, 'enable');
          c(this, 'gravity');
          c(this, 'outModes');
          c(this, 'path');
          c(this, 'random');
          c(this, 'size');
          c(this, 'speed');
          c(this, 'spin');
          c(this, 'straight');
          c(this, 'vibrate');
          c(this, 'warp');
          (this.angle = new ea()),
            (this.center = new ta()),
            (this.decay = 0),
            (this.distance = {}),
            (this.direction = _.none),
            (this.drift = 0),
            (this.enable = !1),
            (this.gravity = new ia()),
            (this.path = new oa()),
            (this.outModes = new sa()),
            (this.random = !1),
            (this.size = !1),
            (this.speed = 2),
            (this.spin = new ra()),
            (this.straight = !1),
            (this.vibrate = !1),
            (this.warp = !1);
        }
        load(e) {
          if (x(e)) return;
          this.angle.load(ze(e.angle) ? { value: e.angle } : e.angle),
            this.center.load(e.center),
            e.decay !== void 0 && (this.decay = D(e.decay)),
            e.direction !== void 0 && (this.direction = e.direction),
            e.distance !== void 0 &&
              (this.distance = ze(e.distance)
                ? { horizontal: e.distance, vertical: e.distance }
                : { ...e.distance }),
            e.drift !== void 0 && (this.drift = D(e.drift)),
            e.enable !== void 0 && (this.enable = e.enable),
            this.gravity.load(e.gravity);
          let t = e.outModes;
          t !== void 0 && (vt(t) ? this.outModes.load(t) : this.outModes.load({ default: t })),
            this.path.load(e.path),
            e.random !== void 0 && (this.random = e.random),
            e.size !== void 0 && (this.size = e.size),
            e.speed !== void 0 && (this.speed = D(e.speed)),
            this.spin.load(e.spin),
            e.straight !== void 0 && (this.straight = e.straight),
            e.vibrate !== void 0 && (this.vibrate = e.vibrate),
            e.warp !== void 0 && (this.warp = e.warp);
        }
      };
    });
  var la,
    Gu = w(() => {
      zo();
      B();
      te();
      la = class {
        constructor() {
          c(this, 'color');
          c(this, 'opacity');
          c(this, 'width');
          this.width = 0;
        }
        load(e) {
          x(e) ||
            (e.color !== void 0 && (this.color = pe.create(this.color, e.color)),
            e.width !== void 0 && (this.width = D(e.width)),
            e.opacity !== void 0 && (this.opacity = D(e.opacity)));
        }
      };
    });
  var To,
    ju = w(() => {
      zo();
      Jr();
      Gu();
      B();
      To = class {
        constructor() {
          c(this, 'color');
          c(this, 'fill');
          c(this, 'stroke');
        }
        load(e) {
          x(e) ||
            (e.color !== void 0 && (this.color = pe.create(this.color, e.color)),
            e.fill !== void 0 && (this.fill ?? (this.fill = new Eo()), this.fill.load(e.fill)),
            e.stroke !== void 0 &&
              (this.stroke ?? (this.stroke = new la()), this.stroke.load(e.stroke)));
        }
      };
    });
  var rs,
    Qu = w(() => {
      ss();
      rs = class extends me {
        constructor() {
          super(), (this.value = 1);
        }
      };
    });
  var Ao,
    Yu = w(() => {
      Qu();
      B();
      Ao = class {
        constructor() {
          c(this, 'horizontal');
          c(this, 'vertical');
          (this.horizontal = new rs()), (this.vertical = new rs());
        }
        load(e) {
          x(e) || (this.horizontal.load(e.horizontal), this.vertical.load(e.vertical));
        }
      };
    });
  var ca,
    _u = w(() => {
      B();
      ca = class {
        constructor() {
          c(this, 'enable');
          c(this, 'height');
          c(this, 'width');
          (this.enable = !1), (this.width = 1920), (this.height = 1080);
        }
        load(e) {
          if (x(e)) return;
          e.enable !== void 0 && (this.enable = e.enable);
          let t = e.width;
          t !== void 0 && (this.width = t);
          let o = e.height;
          o !== void 0 && (this.height = o);
        }
      };
    });
  var Ri,
    ua = w(() => {
      (function (i) {
        (i.delete = 'delete'), (i.wait = 'wait');
      })(Ri || (Ri = {}));
    });
  var fa,
    Xu = w(() => {
      ua();
      B();
      fa = class {
        constructor() {
          c(this, 'mode');
          c(this, 'value');
          (this.mode = Ri.delete), (this.value = 0);
        }
        load(e) {
          x(e) ||
            (e.mode !== void 0 && (this.mode = e.mode),
            e.value !== void 0 && (this.value = e.value));
        }
      };
    });
  var da,
    Ku = w(() => {
      _u();
      Xu();
      B();
      da = class {
        constructor() {
          c(this, 'density');
          c(this, 'limit');
          c(this, 'value');
          (this.density = new ca()), (this.limit = new fa()), (this.value = 0);
        }
        load(e) {
          x(e) ||
            (this.density.load(e.density),
            this.limit.load(e.limit),
            e.value !== void 0 && (this.value = e.value));
        }
      };
    });
  var ha,
    Zu = w(() => {
      ve();
      B();
      ha = class {
        constructor() {
          c(this, 'close');
          c(this, 'options');
          c(this, 'type');
          (this.close = !0), (this.options = {}), (this.type = 'circle');
        }
        load(e) {
          if (x(e)) return;
          let t = e.options;
          if (t !== void 0)
            for (let o in t) {
              let n = t[o];
              n && (this.options[o] = G(this.options[o] ?? {}, n));
            }
          e.close !== void 0 && (this.close = e.close), e.type !== void 0 && (this.type = e.type);
        }
      };
    });
  var pa,
    Ju = w(() => {
      ss();
      B();
      pa = class extends me {
        constructor() {
          super();
          c(this, 'opacityRate');
          c(this, 'sizeRate');
          c(this, 'velocityRate');
          (this.opacityRate = 1), (this.sizeRate = 1), (this.velocityRate = 1);
        }
        load(t) {
          super.load(t),
            !x(t) &&
              (t.opacityRate !== void 0 && (this.opacityRate = t.opacityRate),
              t.sizeRate !== void 0 && (this.sizeRate = t.sizeRate),
              t.velocityRate !== void 0 && (this.velocityRate = t.velocityRate));
        }
      };
    });
  var Di,
    Ii,
    ga,
    ma,
    ef = w(() => {
      ve();
      B();
      zo();
      Wd();
      Jr();
      Wu();
      ju();
      Yu();
      Ku();
      Zu();
      Ju();
      ma = class {
        constructor(e, t) {
          c(this, 'bounce');
          c(this, 'effect');
          c(this, 'groups');
          c(this, 'move');
          c(this, 'number');
          c(this, 'paint');
          c(this, 'palette');
          c(this, 'reduceDuplicates');
          c(this, 'shape');
          c(this, 'zIndex');
          f(this, Di);
          f(this, Ii);
          f(this, ga, (e) => {
            let t = a(this, Ii).getPalette(e);
            if (!t) return;
            let o = t.colors,
              n = 0,
              s = 1,
              r = 0,
              l = {},
              u = X(o) ? o : [o],
              d = u.flatMap((m) => {
                let g = m.fill,
                  y = m.stroke,
                  b = g
                    ? { color: { value: g.value }, enable: g.enable, opacity: g.opacity }
                    : void 0;
                return y
                  ? [
                      {
                        fill: b,
                        stroke: {
                          color: { value: y.value },
                          opacity: y.opacity,
                          width: y.width || n,
                        },
                      },
                    ]
                  : [{ fill: b }];
              }),
              p = d.length > s ? d : (d[r] ?? l);
            this.load({ paint: p, blend: { enable: !0, mode: t.blendMode } });
          });
          h(this, Ii, e),
            h(this, Di, t),
            (this.bounce = new Ao()),
            (this.effect = new Zr()),
            (this.groups = {}),
            (this.move = new aa()),
            (this.number = new da()),
            (this.paint = new To()),
            (this.paint.color = new pe()),
            (this.paint.color.value = '#fff'),
            (this.paint.fill = new Eo()),
            (this.paint.fill.enable = !0),
            (this.reduceDuplicates = !1),
            (this.shape = new ha()),
            (this.zIndex = new pa());
        }
        load(e) {
          if (x(e)) return;
          if (
            (e.palette && ((this.palette = e.palette), a(this, ga).call(this, this.palette)),
            e.groups !== void 0)
          )
            for (let o of Object.keys(e.groups)) {
              if (!(o in e.groups)) continue;
              let n = e.groups[o];
              n !== void 0 && (this.groups[o] = G(this.groups[o] ?? {}, n));
            }
          e.reduceDuplicates !== void 0 && (this.reduceDuplicates = e.reduceDuplicates),
            this.bounce.load(e.bounce),
            this.effect.load(e.effect),
            this.move.load(e.move),
            this.number.load(e.number);
          let t = e.paint;
          if (
            (t &&
              (X(t)
                ? (this.paint = j(t, (o) => {
                    let n = new To();
                    return n.load(o), n;
                  }))
                : X(this.paint)
                  ? ((this.paint = new To()), this.paint.load(t))
                  : this.paint.load(t)),
            this.shape.load(e.shape),
            this.zIndex.load(e.zIndex),
            a(this, Di))
          ) {
            for (let n of a(this, Ii).plugins)
              n.loadParticlesOptions && n.loadParticlesOptions(a(this, Di), this, e);
            let o = a(this, Ii).updaters.get(a(this, Di));
            if (o) for (let n of o) n.loadOptions && n.loadOptions(this, e);
          }
        }
      };
      (Di = new WeakMap()), (Ii = new WeakMap()), (ga = new WeakMap());
    });
  function tf(i, ...e) {
    for (let t of e) i.load(t);
  }
  function Lo(i, e, ...t) {
    let o = new ma(i, e);
    return tf(o, ...t), o;
  }
  var Bo = w(() => {
    ef();
  });
  var Vo,
    Wt,
    xa,
    ba,
    ya,
    of = w(() => {
      ve();
      B();
      Eu();
      Fu();
      Tu();
      Bo();
      te();
      ya = class {
        constructor(e, t) {
          c(this, 'autoPlay');
          c(this, 'background');
          c(this, 'clear');
          c(this, 'defaultThemes');
          c(this, 'delay');
          c(this, 'detectRetina');
          c(this, 'duration');
          c(this, 'fpsLimit');
          c(this, 'fullScreen');
          c(this, 'hdr');
          c(this, 'key');
          c(this, 'name');
          c(this, 'palette');
          c(this, 'particles');
          c(this, 'pauseOnBlur');
          c(this, 'pauseOnOutsideViewport');
          c(this, 'preset');
          c(this, 'resize');
          c(this, 'smooth');
          c(this, 'style');
          c(this, 'zLayers');
          f(this, Vo);
          f(this, Wt);
          f(this, xa, (e) => {
            let t = a(this, Wt).getPalette(e);
            t &&
              this.load({
                background: { color: t.background },
                blend: { enable: !0, mode: t.blendMode },
                particles: { palette: e },
              });
          });
          f(this, ba, (e) => {
            this.load(a(this, Wt).getPreset(e));
          });
          h(this, Wt, e),
            h(this, Vo, t),
            (this.autoPlay = !0),
            (this.background = new Qr()),
            (this.clear = !0),
            (this.defaultThemes = {}),
            (this.delay = 0),
            (this.fullScreen = new Yr()),
            (this.detectRetina = !0),
            (this.duration = 0),
            (this.fpsLimit = 120),
            (this.hdr = !0),
            (this.particles = Lo(a(this, Wt), a(this, Vo))),
            (this.pauseOnBlur = !0),
            (this.pauseOnOutsideViewport = !0),
            (this.resize = new _r()),
            (this.smooth = !1),
            (this.style = {}),
            (this.zLayers = 100);
        }
        load(e) {
          if (x(e)) return;
          e.preset !== void 0 &&
            ((this.preset = e.preset),
            j(this.preset, (s) => {
              a(this, ba).call(this, s);
            })),
            e.palette !== void 0 &&
              ((this.palette = e.palette), a(this, xa).call(this, this.palette)),
            e.autoPlay !== void 0 && (this.autoPlay = e.autoPlay),
            e.clear !== void 0 && (this.clear = e.clear),
            e.key !== void 0 && (this.key = e.key),
            e.name !== void 0 && (this.name = e.name),
            e.delay !== void 0 && (this.delay = D(e.delay));
          let t = e.detectRetina;
          t !== void 0 && (this.detectRetina = t),
            e.duration !== void 0 && (this.duration = D(e.duration));
          let o = e.fpsLimit;
          o !== void 0 && (this.fpsLimit = o),
            e.hdr !== void 0 && (this.hdr = e.hdr),
            e.pauseOnBlur !== void 0 && (this.pauseOnBlur = e.pauseOnBlur),
            e.pauseOnOutsideViewport !== void 0 &&
              (this.pauseOnOutsideViewport = e.pauseOnOutsideViewport),
            e.zLayers !== void 0 && (this.zLayers = e.zLayers),
            this.background.load(e.background);
          let n = e.fullScreen;
          yr(n) ? (this.fullScreen.enable = n) : this.fullScreen.load(n),
            this.particles.load(e.particles),
            this.resize.load(e.resize),
            (this.style = G(this.style, e.style)),
            e.smooth !== void 0 && (this.smooth = e.smooth),
            a(this, Wt).plugins.forEach((s) => {
              s.loadOptions(a(this, Vo), this, e);
            });
        }
      };
      (Vo = new WeakMap()), (Wt = new WeakMap()), (xa = new WeakMap()), (ba = new WeakMap());
    });
  var we,
    nf = w(() => {
      (function (i) {
        (i.normal = 'normal'), (i.inside = 'inside'), (i.outside = 'outside');
      })(we || (we = {}));
    });
  function vg(i, e, t, o) {
    let n = e.options[i];
    return G({ close: e.close }, ne(n, t, o));
  }
  function wg(i, e, t, o) {
    let n = e.options[i];
    return G({ close: e.close }, ne(n, t, o));
  }
  function Gd(i) {
    if (!A(i.outMode, i.checkModes)) return;
    let e = i.radius * I;
    i.coord > i.maxCoord - e ? i.setCb(-i.radius) : i.coord < e && i.setCb(i.radius);
  }
  var zi,
    Ei,
    No,
    Gt,
    ae,
    as,
    wa,
    Ma,
    ls,
    cs,
    ka,
    Pa,
    us,
    fs,
    Ca,
    ds,
    va,
    jd = w(() => {
      qn();
      Xn();
      te();
      ve();
      oe();
      xo();
      Un();
      na();
      kr();
      nf();
      Bo();
      va = class {
        constructor(e, t) {
          c(this, 'backColor');
          c(this, 'bubble');
          c(this, 'destroyed');
          c(this, 'direction');
          c(this, 'effect');
          c(this, 'effectClose');
          c(this, 'effectData');
          c(this, 'fillColor');
          c(this, 'fillEnabled');
          c(this, 'fillOpacity');
          c(this, 'group');
          c(this, 'id');
          c(this, 'ignoresResizeRatio');
          c(this, 'initialPosition');
          c(this, 'initialVelocity');
          c(this, 'isRotating');
          c(this, 'justWarped');
          c(this, 'lastPathTime');
          c(this, 'misplaced');
          c(this, 'moveCenter');
          c(this, 'offset');
          c(this, 'opacity');
          c(this, 'options');
          c(this, 'outType');
          c(this, 'pathRotation');
          c(this, 'position');
          c(this, 'randomIndexData');
          c(this, 'retina');
          c(this, 'roll');
          c(this, 'rotation');
          c(this, 'shape');
          c(this, 'shapeClose');
          c(this, 'shapeData');
          c(this, 'sides');
          c(this, 'size');
          c(this, 'slow');
          c(this, 'spawning');
          c(this, 'strokeColor');
          c(this, 'strokeOpacity');
          c(this, 'strokeWidth');
          c(this, 'unbreakable');
          c(this, 'velocity');
          c(this, 'zIndexFactor');
          f(this, zi, { fillOpacity: Ce, opacity: Ce, strokeOpacity: Ce });
          f(this, Ei, bt.origin);
          f(this, No, { sin: 0, cos: 0 });
          f(this, Gt, { a: 1, b: 0, c: 0, d: 1 });
          f(this, ae);
          f(this, as);
          f(this, wa, (e, t) => {
            let o = qf,
              n = e ? bt.create(e.x, e.y, t) : void 0,
              s = a(this, ae),
              r = s.particlePositionPlugins,
              l = this.options.move.outModes,
              u = this.getRadius(),
              d = s.canvas.size,
              p = new AbortController(),
              { signal: m } = p;
            for (; !m.aborted; ) {
              for (let k of r) {
                let M = k.particlePosition?.(n, this);
                if (M) return bt.create(M.x, M.y, t);
              }
              let g = yd({ size: d, position: n }),
                y = bt.create(g.x, g.y, t);
              a(this, ls).call(this, y, u, l.left ?? l.default),
                a(this, ls).call(this, y, u, l.right ?? l.default),
                a(this, cs).call(this, y, u, l.top ?? l.default),
                a(this, cs).call(this, y, u, l.bottom ?? l.default);
              let b = !0;
              for (let k of s.particles.checkParticlePositionPlugins)
                if (((b = k.checkParticlePosition?.(this, y, o) ?? !0), !b)) break;
              if (b) return y;
              (o += ed), (n = void 0);
            }
            return n;
          });
          f(this, Ma, () => {
            let e = this.options.move,
              t = gd(this.direction),
              o = t.copy();
            if (e.direction === _.inside || e.direction === _.outside) return o;
            let n = Ye(P(e.angle.value)),
              s = Ye(P(e.angle.offset)),
              r = { left: s - n * 0.5, right: s + n * 0.5 };
            return (
              e.straight || (o.angle += de(D(r.left, r.right))),
              e.random && typeof e.speed == 'number' && (o.length *= T()),
              o
            );
          });
          f(this, ls, (e, t, o) => {
            Gd({
              outMode: o,
              checkModes: [H.bounce],
              coord: e.x,
              maxCoord: a(this, ae).canvas.size.width,
              setCb: (n) => (e.x += n),
              radius: t,
            });
          });
          f(this, cs, (e, t, o) => {
            Gd({
              outMode: o,
              checkModes: [H.bounce],
              coord: e.y,
              maxCoord: a(this, ae).canvas.size.height,
              setCb: (n) => (e.y += n),
              radius: t,
            });
          });
          f(this, ka, (e, t) => {
            let o = this.getRadius(),
              n = a(this, ae).canvas.size,
              s = this.position,
              r = t === H.bounce;
            return e === E.bottom
              ? { inside: r ? s.y + o < n.height : s.y - o < n.height, reason: 'default' }
              : e === E.left
                ? { inside: r ? s.x - o > De : s.x + o > De, reason: 'default' }
                : e === E.right
                  ? { inside: r ? s.x + o < n.width : s.x - o < n.width, reason: 'default' }
                  : e === E.top
                    ? { inside: r ? s.y - o > De : s.y + o > De, reason: 'default' }
                    : {
                        inside: s.x >= -o && s.y >= -o && s.y <= n.height + o && s.x <= n.width + o,
                        reason: 'default',
                      };
          });
          f(this, Pa, (e, t) => ({
            canvasSize: a(this, ae).canvas.size,
            direction: e,
            outMode: t,
            particle: this,
            radius: this.getRadius(),
          }));
          f(this, us, (e) => {
            let t = a(this, ka).call(this, e.direction, e.outMode),
              o = a(this, ae),
              n = this.shape ? o.shapeDrawers.get(this.shape) : void 0,
              s = this.effect ? o.effectDrawers.get(this.effect) : void 0,
              r = n?.isInsideCanvas,
              l = s?.isInsideCanvas;
            if (!r && !l) return t;
            let u = a(this, Pa).call(this, e.direction, e.outMode),
              d = r ? a(this, ds).call(this, r(u), 'shape') : void 0,
              p = l ? a(this, ds).call(this, l(u), 'effect') : void 0;
            if (d && p) {
              let m = Math.max(d.margin ?? De, p.margin ?? De);
              return {
                inside: d.inside && p.inside,
                margin: m > De ? m : void 0,
                reason: 'combined',
              };
            }
            return d ?? p ?? t;
          });
          f(this, fs, (e) =>
            !e || !this.roll || (!this.backColor && !this.roll.alter) || !this.isShowingBack()
              ? e
              : this.backColor
                ? this.backColor
                : this.roll.alter
                  ? Fd(e, this.roll.alter.type, this.roll.alter.value)
                  : e,
          );
          f(this, Ca, (e) => {
            let t = a(this, ae),
              o = Math.floor(P(this.options.zIndex.value)),
              n = a(this, wa).call(this, e, Y(o, td, t.zLayers));
            if (!n) throw new Error('a valid position cannot be found for particle');
            (this.position = n), (this.initialPosition = this.position.copy());
            let s = t.canvas.size;
            switch (
              ((this.moveCenter = {
                ...Md(this.options.move.center, s),
                radius: this.options.move.center.radius,
                mode: this.options.move.center.mode,
              }),
              (this.direction = md(this.options.move.direction, this.position, this.moveCenter)),
              this.options.move.direction)
            ) {
              case _.inside:
                this.outType = we.inside;
                break;
              case _.outside:
                this.outType = we.outside;
                break;
              default:
                break;
            }
            this.offset = ee.origin;
          });
          f(this, ds, (e, t) =>
            typeof e == 'boolean'
              ? { inside: e, reason: t }
              : { inside: e.inside, margin: e.margin, reason: e.reason ?? t },
          );
          h(this, as, e), h(this, ae, t);
        }
        destroy(e) {
          if (this.unbreakable || this.destroyed) return;
          (this.destroyed = !0), (this.bubble.inRange = !1), (this.slow.inRange = !1);
          let t = a(this, ae);
          (this.shape ? t.shapeDrawers.get(this.shape) : void 0)?.particleDestroy?.(this);
          for (let n of t.particleDestroyedPlugins) n.particleDestroyed?.(this, e);
          for (let n of t.particleUpdaters) n.particleDestroyed?.(this, e);
          a(this, ae).dispatchEvent(re.particleDestroyed, { particle: this });
        }
        draw(e) {
          let t = a(this, ae),
            o = t.canvas.render;
          o.drawParticlePlugins(this, e), o.drawParticle(this, e);
        }
        getAngle() {
          return this.rotation + (this.pathRotation ? this.velocity.angle : De);
        }
        getFillColor() {
          return a(this, fs).call(this, this.bubble.color ?? Ou(this.fillColor));
        }
        getMass() {
          return this.getRadius() ** Ve * Math.PI * 0.5;
        }
        getOpacity() {
          let e = this.options.zIndex,
            t = dr - this.zIndexFactor,
            o = t ** e.opacityRate,
            n = this.bubble.opacity ?? P(this.opacity?.value ?? Ce),
            s = this.fillOpacity ?? Ce,
            r = this.strokeOpacity ?? Ce;
          return (
            (a(this, zi).fillOpacity = n * s * o),
            (a(this, zi).opacity = n * o),
            (a(this, zi).strokeOpacity = n * r * o),
            a(this, zi)
          );
        }
        getPosition() {
          return (
            (a(this, Ei).x = this.position.x + this.offset.x),
            (a(this, Ei).y = this.position.y + this.offset.y),
            (a(this, Ei).z = this.position.z),
            a(this, Ei)
          );
        }
        getRadius() {
          return this.bubble.radius ?? this.size.value;
        }
        getRotateData() {
          let e = this.getAngle();
          return (a(this, No).sin = Math.sin(e)), (a(this, No).cos = Math.cos(e)), a(this, No);
        }
        getStrokeColor() {
          return a(this, fs).call(this, this.bubble.color ?? Ou(this.strokeColor));
        }
        getTransformData(e) {
          let t = this.getRotateData(),
            o = this.isRotating;
          return (
            (a(this, Gt).a = t.cos * (e.a ?? An.a)),
            (a(this, Gt).b = o ? t.sin * (e.b ?? He) : (e.b ?? An.b)),
            (a(this, Gt).c = o ? -t.sin * (e.c ?? He) : (e.c ?? An.c)),
            (a(this, Gt).d = t.cos * (e.d ?? An.d)),
            a(this, Gt)
          );
        }
        init(e, t, o, n) {
          let s = a(this, ae);
          (this.id = e),
            (this.group = n),
            (this.justWarped = !1),
            (this.effectClose = !0),
            (this.shapeClose = !0),
            (this.pathRotation = !1),
            (this.lastPathTime = 0),
            (this.destroyed = !1),
            (this.unbreakable = !1),
            (this.isRotating = !1),
            (this.rotation = 0),
            (this.misplaced = !1),
            (this.retina = {
              maxDistance: {},
              maxSpeed: 0,
              moveDrift: 0,
              moveSpeed: 0,
              sizeAnimationSpeed: 0,
            }),
            (this.size = { value: 1, max: 1, min: 1, enable: !1 }),
            (this.outType = we.normal),
            (this.ignoresResizeRatio = !0);
          let r = s.actualOptions,
            l = Lo(a(this, as), s, r.particles),
            u = l.reduceDuplicates,
            d = l.effect.type,
            p = l.shape.type;
          (this.effect = ne(d, this.id, u)), (this.shape = ne(p, this.id, u));
          let m = l.effect,
            g = l.shape;
          if (o) {
            if (o.effect?.type && o.effect.type !== this.effect) {
              let S = o.effect.type,
                F = ne(S, this.id, u);
              F && ((this.effect = F), m.load(o.effect));
            }
            if (o.shape?.type && o.shape.type !== this.shape) {
              let S = o.shape.type,
                F = ne(S, this.id, u);
              F && ((this.shape = F), g.load(o.shape));
            }
          }
          if (this.effect === yt) {
            let S = [...a(this, ae).effectDrawers.keys()];
            this.effect = S[Math.floor(T() * S.length)];
          }
          if (this.shape === yt) {
            let S = [...a(this, ae).shapeDrawers.keys()];
            this.shape = S[Math.floor(T() * S.length)];
          }
          (this.effectData = this.effect ? vg(this.effect, m, this.id, u) : void 0),
            (this.shapeData = this.shape ? wg(this.shape, g, this.id, u) : void 0),
            l.load(o);
          let y = this.effectData,
            b = this.shapeData;
          y && l.load(y.particles),
            b && l.load(b.particles),
            (this.effectClose = y?.close ?? l.effect.close),
            (this.shapeClose = b?.close ?? l.shape.close),
            (this.options = l),
            s.retina.initParticle(this);
          for (let S of s.particleUpdaters) S.preInit?.(this);
          (this.bubble = { inRange: !1 }),
            (this.slow = { inRange: !1, factor: 1 }),
            a(this, Ca).call(this, t),
            (this.initialVelocity = a(this, Ma).call(this)),
            (this.velocity = this.initialVelocity.copy()),
            (this.zIndexFactor = this.position.z / s.zLayers),
            (this.sides = 24);
          let k, M;
          this.effect && (k = s.effectDrawers.get(this.effect)),
            k?.loadEffect && k.loadEffect(this),
            this.shape && (M = s.shapeDrawers.get(this.shape)),
            M?.loadShape && M.loadShape(this);
          let C = M?.getSidesCount;
          C && (this.sides = C(this)), (this.spawning = !1);
          for (let S of s.particleUpdaters) S.init(this);
          k?.particleInit?.(s, this), M?.particleInit?.(s, this);
          for (let S of s.particleCreatedPlugins) S.particleCreated?.(this);
        }
        isInsideCanvas(e) {
          return a(this, us).call(this, { direction: e }).inside;
        }
        isInsideCanvasForOutMode(e, t) {
          return a(this, us).call(this, { direction: t, outMode: e }).inside;
        }
        isShowingBack() {
          if (!this.roll) return !1;
          let e = this.roll.angle;
          if (this.roll.horizontal && this.roll.vertical) {
            let t = e % le,
              o = t < De ? t + le : t;
            return o >= Math.PI * 0.5 && o < Math.PI * ho * 0.5;
          }
          if (this.roll.horizontal) {
            let t = (e + Math.PI * 0.5) % (Math.PI * I),
              o = t < De ? t + Math.PI * I : t;
            return o >= Math.PI && o < Math.PI * I;
          }
          if (this.roll.vertical) {
            let t = e % (Math.PI * I),
              o = t < De ? t + Math.PI * I : t;
            return o >= Math.PI && o < Math.PI * I;
          }
          return !1;
        }
        isVisible() {
          return !this.destroyed && !this.spawning && this.isInsideCanvas();
        }
        reset() {
          for (let e of a(this, ae).particleUpdaters) e.reset?.(this);
        }
      };
      (zi = new WeakMap()),
        (Ei = new WeakMap()),
        (No = new WeakMap()),
        (Gt = new WeakMap()),
        (ae = new WeakMap()),
        (as = new WeakMap()),
        (wa = new WeakMap()),
        (Ma = new WeakMap()),
        (ls = new WeakMap()),
        (cs = new WeakMap()),
        (ka = new WeakMap()),
        (Pa = new WeakMap()),
        (us = new WeakMap()),
        (fs = new WeakMap()),
        (Ca = new WeakMap()),
        (ds = new WeakMap());
    });
  var Fi,
    Qd = w(() => {
      (function (i) {
        (i.circle = 'circle'), (i.rectangle = 'rectangle');
      })(Fi || (Fi = {}));
    });
  var Sa,
    q,
    ce,
    sf = w(() => {
      Qd();
      te();
      oe();
      (Sa = class {
        constructor(e, t, o) {
          c(this, 'position');
          c(this, 'type');
          (this.position = { x: e, y: t }), (this.type = o);
        }
        _resetPosition(e, t) {
          (this.position.x = e), (this.position.y = t);
        }
      }),
        (q = class i extends Sa {
          constructor(t, o, n) {
            super(t, o, Fi.circle);
            c(this, 'radius');
            this.radius = n;
          }
          contains(t) {
            return pd(t, this.position, this.radius);
          }
          intersects(t) {
            let o = this.position,
              n = t.position,
              s = this.radius,
              r = Math.abs(n.x - o.x),
              l = Math.abs(n.y - o.y);
            if (t instanceof i || t.type === Fi.circle) {
              let u = t,
                d = s + u.radius,
                p = Math.hypot(r, l);
              return d > p;
            } else if (t instanceof ce || t.type === Fi.rectangle) {
              let u = t,
                { width: d, height: p } = u.size;
              return (
                Math.pow(r - d, Ve) + Math.pow(l - p, Ve) <= s ** Ve ||
                (r <= s + d && l <= s + p) ||
                r <= d ||
                l <= p
              );
            }
            return !1;
          }
          reset(t, o, n) {
            return this._resetPosition(t, o), (this.radius = n), this;
          }
        }),
        (ce = class i extends Sa {
          constructor(t, o, n, s) {
            super(t, o, Fi.rectangle);
            c(this, 'size');
            this.size = { height: s, width: n };
          }
          contains(t) {
            let o = this.size.width,
              n = this.size.height,
              s = this.position;
            return t.x >= s.x && t.x <= s.x + o && t.y >= s.y && t.y <= s.y + n;
          }
          intersects(t) {
            if (t instanceof q) return t.intersects(this);
            if (!(t instanceof i)) return !1;
            let o = this.size.width,
              n = this.size.height,
              s = this.position,
              r = t.position,
              l = t.size,
              u = l.width,
              d = l.height;
            return r.x < s.x + o && r.x + u > s.x && r.y < s.y + n && r.y + d > s.y;
          }
          reset(t, o, n, s) {
            return this._resetPosition(t, o), (this.size.width = n), (this.size.height = s), this;
          }
        });
    });
  var $e,
    jt,
    Oa,
    Uo,
    Ho,
    Ra,
    qo,
    Oe,
    Yd,
    _d,
    Xd,
    Kd,
    rf,
    hs,
    Zd = w(() => {
      sf();
      hs = class {
        constructor(e) {
          f(this, Oe);
          f(this, $e);
          f(this, jt, new Map());
          f(this, Oa, []);
          f(this, Uo);
          f(this, Ho);
          f(this, Ra, []);
          f(this, qo);
          h(this, $e, e), h(this, Uo, 0), h(this, qo, 0);
        }
        clear() {
          a(this, jt).clear();
          let e = a(this, Ho);
          e && h(this, $e, e), h(this, Ho, void 0);
        }
        insert(e) {
          let { x: t, y: o } = e.getPosition(),
            n = L(this, Oe, Xd).call(this, t, o);
          a(this, jt).has(n) || a(this, jt).set(n, []), a(this, jt).get(n)?.push(e);
        }
        query(e, t, o = []) {
          let n = L(this, Oe, Kd).call(this, e);
          if (!n) return o;
          let s = Math.floor(n.minX / a(this, $e)),
            r = Math.floor(n.maxX / a(this, $e)),
            l = Math.floor(n.minY / a(this, $e)),
            u = Math.floor(n.maxY / a(this, $e));
          for (let d = s; d <= r; d++)
            for (let p = l; p <= u; p++) {
              let m = `${d}_${p}`,
                g = a(this, jt).get(m);
              if (g) for (let y of g) (t && !t(y)) || (e.contains(y.getPosition()) && o.push(y));
            }
          return o;
        }
        queryCircle(e, t, o, n = []) {
          let s = L(this, Oe, Yd).call(this, e.x, e.y, t),
            r = this.query(s, o, n);
          return L(this, Oe, rf).call(this), r;
        }
        queryRectangle(e, t, o, n = []) {
          let s = L(this, Oe, _d).call(this, e.x, e.y, t.width, t.height),
            r = this.query(s, o, n);
          return L(this, Oe, rf).call(this), r;
        }
        setCellSize(e) {
          h(this, Ho, e);
        }
      };
      ($e = new WeakMap()),
        (jt = new WeakMap()),
        (Oa = new WeakMap()),
        (Uo = new WeakMap()),
        (Ho = new WeakMap()),
        (Ra = new WeakMap()),
        (qo = new WeakMap()),
        (Oe = new WeakSet()),
        (Yd = function (e, t, o) {
          var n, s;
          return ((n = a(this, Oa))[(s = Tn(this, Uo)._++)] ?? (n[s] = new q(e, t, o))).reset(
            e,
            t,
            o,
          );
        }),
        (_d = function (e, t, o, n) {
          var s, r;
          return ((s = a(this, Ra))[(r = Tn(this, qo)._++)] ?? (s[r] = new ce(e, t, o, n))).reset(
            e,
            t,
            o,
            n,
          );
        }),
        (Xd = function (e, t) {
          let o = Math.floor(e / a(this, $e)),
            n = Math.floor(t / a(this, $e));
          return `${o}_${n}`;
        }),
        (Kd = function (e) {
          if (e instanceof q) {
            let t = e.radius,
              { x: o, y: n } = e.position;
            return { minX: o - t, maxX: o + t, minY: n - t, maxY: n + t };
          }
          if (e instanceof ce) {
            let { x: t, y: o } = e.position,
              { width: n, height: s } = e.size;
            return { minX: t, maxX: t + n, minY: o, maxY: o + s };
          }
          return null;
        }),
        (rf = function () {
          h(this, Uo, 0), h(this, qo, 0);
        });
    });
  var ue,
    J,
    Ti,
    Qt,
    $o,
    ge,
    Yt,
    _t,
    Wo,
    Xt,
    Kt,
    Zt,
    Go,
    Jt,
    ye,
    Ia,
    ps,
    ms,
    jo,
    Ai,
    za,
    gs,
    Ea,
    Fa,
    ys,
    Ta,
    Aa,
    La,
    Da,
    Jd = w(() => {
      oe();
      xo();
      ua();
      jd();
      Zd();
      Qn();
      Bo();
      Da = class {
        constructor(e, t) {
          c(this, 'checkParticlePositionPlugins');
          c(this, 'grid');
          f(this, ue);
          f(this, J);
          f(this, Ti);
          f(this, Qt);
          f(this, $o);
          f(this, ge);
          f(this, Yt);
          f(this, _t);
          f(this, Wo);
          f(this, Xt);
          f(this, Kt);
          f(this, Zt);
          f(this, Go);
          f(this, Jt);
          f(this, ye);
          f(this, Ia, (...e) => {
            a(this, Xt).push(...e);
          });
          f(this, ps, (e, t, o, n) => {
            let s = e.number;
            if (!s.density.enable) {
              o === void 0
                ? h(this, Qt, s.limit.value)
                : (n?.number.limit.value ?? s.limit.value) &&
                  a(this, Ti).set(o, n?.number.limit.value ?? s.limit.value);
              return;
            }
            let r = a(this, za).call(this, s.density),
              l = s.value,
              u = s.limit.value > uu ? s.limit.value : l,
              d = Math.min(l, u) * r + t,
              p = Math.min(this.count, this.filter((m) => m.group === o).length);
            o === void 0 ? h(this, Qt, s.limit.value * r) : a(this, Ti).set(o, s.limit.value * r),
              p < d
                ? this.push(Math.abs(d - p), void 0, e, o)
                : p > d && this.removeQuantity(p - d, o);
          });
          f(this, ms, (e) => {
            let t = Math.max(Math.floor(e), xt);
            return Array.from({ length: t }, () => []);
          });
          f(this, jo, (e) => {
            let t = a(this, ye).length - xt;
            return t <= Ue ? Ue : Math.min(Math.max(Math.floor(e), Ue), t);
          });
          f(this, Ai, (e, t) => {
            let o = Ue,
              n = e.length;
            for (; o < n; ) {
              let s = Math.floor((o + n) / I),
                r = e[s];
              if (!r) {
                n = s;
                continue;
              }
              r.id < t ? (o = s + xt) : (n = s);
            }
            return o;
          });
          f(this, za, (e) => {
            let t = a(this, J);
            if (!e.enable) return fu;
            let o = t.canvas.size,
              n = t.retina.pixelRatio;
            return !o.width || !o.height
              ? fu
              : (o.width * o.height) / (e.height * e.width * n ** Ve);
          });
          f(this, gs, (e) => {
            let t = a(this, jo).call(this, e.position.z),
              o = a(this, ye)[t];
            o && (o.splice(a(this, Ai).call(this, o, e.id), Vn, e), a(this, ge).set(e.id, t));
          });
          f(this, Ea, (e, t, o) => {
            let n = a(this, ue)[e];
            return !n || n.group !== t
              ? !1
              : (a(this, ue).splice(e, bi),
                a(this, Fa).call(this, n),
                n.destroy(o),
                a(this, J).dispatchEvent(re.particleRemoved, { particle: n }),
                a(this, Ia).call(this, n),
                !0);
          });
          f(this, Fa, (e) => {
            let t = a(this, ge).get(e.id) ?? a(this, jo).call(this, e.position.z),
              o = a(this, ye)[t];
            if (!o) {
              a(this, ge).delete(e.id);
              return;
            }
            let n = a(this, Ai).call(this, o, e.id);
            if (o[n]?.id !== e.id) {
              a(this, ge).delete(e.id);
              return;
            }
            o.splice(n, bi), a(this, ge).delete(e.id);
          });
          f(this, ys, (e) => {
            let t = Math.max(Math.floor(e), xt);
            if (a(this, ye).length !== t) {
              h(this, ye, a(this, ms).call(this, t));
              return;
            }
            for (let o of a(this, ye)) o.length = Ue;
          });
          f(this, Ta, (e) => {
            let t = a(this, jo).call(this, e.position.z),
              o = a(this, ge).get(e.id);
            if (o === void 0) {
              a(this, gs).call(this, e);
              return;
            }
            if (o === t) return;
            let n = a(this, ye)[o];
            if (n) {
              let r = a(this, Ai).call(this, n, e.id);
              n[r]?.id === e.id && n.splice(r, bi);
            }
            let s = a(this, ye)[t];
            if (!s) {
              a(this, ge).set(e.id, t);
              return;
            }
            s.splice(a(this, Ai).call(this, s, e.id), Vn, e), a(this, ge).set(e.id, t);
          });
          f(this, Aa, (e) => {
            let t = new Set(),
              o = a(this, Go);
            for (let n of a(this, ue)) {
              o &&
                !n.ignoresResizeRatio &&
                ((n.position.x *= o.width),
                (n.position.y *= o.height),
                (n.initialPosition.x *= o.width),
                (n.initialPosition.y *= o.height)),
                (n.ignoresResizeRatio = !1);
              for (let s of a(this, Yt)) s.particleReset?.(n);
              for (let s of a(this, _t)) {
                if (n.destroyed) break;
                s.particleUpdate?.(n, e);
              }
              if (n.destroyed) {
                t.add(n);
                continue;
              }
              this.grid.insert(n);
            }
            return t;
          });
          f(this, La, (e, t) => {
            for (let o of a(this, ue)) {
              if (o.destroyed) {
                t.add(o);
                continue;
              }
              for (let n of a(this, J).particleUpdaters) n.update(o, e);
              if (!o.spawning) for (let n of a(this, Kt)) n.postParticleUpdate?.(o, e);
              a(this, Ta).call(this, o);
            }
          });
          h(this, Wo, e),
            h(this, J, t),
            h(this, $o, 0),
            h(this, ue, []),
            h(this, Xt, []),
            h(this, Qt, 0),
            h(this, Ti, new Map()),
            h(this, ge, new Map()),
            h(this, ye, a(this, ms).call(this, a(this, J).zLayers)),
            (this.grid = new hs(ru)),
            (this.checkParticlePositionPlugins = []),
            h(this, Yt, []),
            h(this, _t, []),
            h(this, Zt, []),
            h(this, Kt, []),
            h(this, Jt, []);
        }
        get count() {
          return a(this, ue).length;
        }
        addParticle(e, t, o, n) {
          let s = a(this, J).actualOptions.particles.number.limit.mode,
            r = o === void 0 ? a(this, Qt) : (a(this, Ti).get(o) ?? a(this, Qt)),
            l = this.count;
          if (r > uu)
            switch (s) {
              case Ri.delete: {
                let u = l + id - r;
                u > od && this.removeQuantity(u);
                break;
              }
              case Ri.wait:
                if (l >= r) return;
                break;
              default:
                break;
            }
          try {
            let u = a(this, Xt).pop() ?? new va(a(this, Wo), a(this, J));
            u.init(a(this, $o), e, t, o);
            let d = !0;
            if ((n && (d = n(u)), !d)) {
              a(this, Xt).push(u);
              return;
            }
            return (
              a(this, ue).push(u),
              a(this, gs).call(this, u),
              Tn(this, $o)._++,
              a(this, J).dispatchEvent(re.particleAdded, { particle: u }),
              u
            );
          } catch (u) {
            _e().warning(`error adding particle: ${u}`);
          }
        }
        clear() {
          h(this, ue, []), a(this, ge).clear(), a(this, ys).call(this, a(this, J).zLayers);
        }
        destroy() {
          h(this, ue, []),
            (a(this, Xt).length = 0),
            a(this, ge).clear(),
            h(this, ye, []),
            (this.checkParticlePositionPlugins = []),
            h(this, Yt, []),
            h(this, _t, []),
            h(this, Zt, []),
            h(this, Kt, []),
            h(this, Jt, []);
        }
        drawParticles(e) {
          for (let t = a(this, ye).length - xt; t >= Ue; t--) {
            let o = a(this, ye)[t];
            if (o) for (let n of o) n.draw(e);
          }
        }
        filter(e) {
          return a(this, ue).filter(e);
        }
        find(e) {
          return a(this, ue).find(e);
        }
        get(e) {
          return a(this, ue)[e];
        }
        async init() {
          let e = a(this, J),
            t = e.actualOptions;
          (this.checkParticlePositionPlugins = []),
            h(this, Jt, []),
            h(this, _t, []),
            h(this, Zt, []),
            h(this, Yt, []),
            h(this, Kt, []),
            a(this, ge).clear(),
            a(this, ys).call(this, e.zLayers),
            (this.grid = new hs(ru * e.retina.pixelRatio));
          for (let n of e.plugins)
            n.redrawInit && (await n.redrawInit()),
              n.checkParticlePosition && this.checkParticlePositionPlugins.push(n),
              n.update && a(this, Jt).push(n),
              n.particleUpdate && a(this, _t).push(n),
              n.postUpdate && a(this, Zt).push(n),
              n.particleReset && a(this, Yt).push(n),
              n.postParticleUpdate && a(this, Kt).push(n);
          await a(this, J).initDrawersAndUpdaters();
          for (let n of a(this, J).effectDrawers.values()) await n.init?.(e);
          for (let n of a(this, J).shapeDrawers.values()) await n.init?.(e);
          let o = !1;
          for (let n of e.plugins) if (((o = n.particlesInitialization?.() ?? o), o)) break;
          if (!o) {
            let n = t.particles,
              s = n.groups;
            for (let r in s) {
              let l = s[r];
              if (l)
                for (let u = this.count, d = 0; d < l.number.value && u < n.number.value; u++, d++)
                  this.addParticle(void 0, l, r);
            }
            for (let r = this.count; r < n.number.value; r++) this.addParticle();
          }
        }
        push(e, t, o, n) {
          for (let s = 0; s < e; s++) this.addParticle(t, o, n);
        }
        async redraw() {
          this.clear(),
            await this.init(),
            a(this, J).canvas.render.drawParticles({ value: 0, factor: 0 });
        }
        remove(e, t, o) {
          this.removeAt(a(this, ue).indexOf(e), void 0, t, o);
        }
        removeAt(e, t = $f, o, n) {
          if (e < Ue || e > this.count) return;
          let s = 0;
          for (let r = e; s < t && r < this.count; r++)
            a(this, Ea).call(this, r, o, n) && (r--, s++);
        }
        removeQuantity(e, t) {
          this.removeAt(Ue, e, t);
        }
        setDensity() {
          let e = a(this, J).actualOptions,
            t = e.particles.groups,
            o = 0;
          for (let n of a(this, J).plugins)
            n.particlesDensityCount && (o += n.particlesDensityCount());
          for (let n in t) {
            let s = t[n];
            if (!s) continue;
            let r = Lo(a(this, Wo), a(this, J), s);
            a(this, ps).call(this, r, o, n);
          }
          a(this, ps).call(this, e.particles, o);
        }
        setResizeFactor(e) {
          h(this, Go, e);
        }
        update(e) {
          this.grid.clear();
          for (let o of a(this, Jt)) o.update?.(e);
          let t = a(this, Aa).call(this, e);
          for (let o of a(this, Zt)) o.postUpdate?.(e);
          if ((a(this, La).call(this, e, t), t.size)) for (let o of t) this.remove(o);
          h(this, Go, void 0);
        }
      };
      (ue = new WeakMap()),
        (J = new WeakMap()),
        (Ti = new WeakMap()),
        (Qt = new WeakMap()),
        ($o = new WeakMap()),
        (ge = new WeakMap()),
        (Yt = new WeakMap()),
        (_t = new WeakMap()),
        (Wo = new WeakMap()),
        (Xt = new WeakMap()),
        (Kt = new WeakMap()),
        (Zt = new WeakMap()),
        (Go = new WeakMap()),
        (Jt = new WeakMap()),
        (ye = new WeakMap()),
        (Ia = new WeakMap()),
        (ps = new WeakMap()),
        (ms = new WeakMap()),
        (jo = new WeakMap()),
        (Ai = new WeakMap()),
        (za = new WeakMap()),
        (gs = new WeakMap()),
        (Ea = new WeakMap()),
        (Fa = new WeakMap()),
        (ys = new WeakMap()),
        (Ta = new WeakMap()),
        (Aa = new WeakMap()),
        (La = new WeakMap());
    });
  var xs,
    Ba,
    eh = w(() => {
      oe();
      te();
      Ba = class {
        constructor(e) {
          c(this, 'pixelRatio');
          c(this, 'reduceFactor');
          f(this, xs);
          h(this, xs, e), (this.pixelRatio = Bn), (this.reduceFactor = au);
        }
        init() {
          let e = a(this, xs),
            t = e.actualOptions;
          (this.pixelRatio = t.detectRetina ? devicePixelRatio : Bn), (this.reduceFactor = au);
          let o = this.pixelRatio,
            n = e.canvas,
            s = n.domElement;
          s && ((n.size.width = s.offsetWidth * o), (n.size.height = s.offsetHeight * o));
        }
        initParticle(e) {
          let t = e.options,
            o = this.pixelRatio,
            n = t.move,
            s = n.distance,
            r = e.retina;
          (r.maxSpeed = P(n.gravity.maxSpeed) * o),
            (r.moveDrift = P(n.drift) * o),
            (r.moveSpeed = P(n.speed) * o);
          let l = r.maxDistance;
          (l.horizontal = s.horizontal === void 0 ? void 0 : s.horizontal * o),
            (l.vertical = s.vertical === void 0 ? void 0 : s.vertical * o);
        }
      };
      xs = new WeakMap();
    });
  var th = {};
  mi(th, { Container: () => af });
  function Ze(i) {
    return !i.destroyed;
  }
  function Mg(i, e, t = lr, o = !1) {
    (i.value = e), (i.factor = o ? lr / t : (lr * e) / 1e3);
  }
  function Qo(i, e, ...t) {
    let o = new ya(i, e);
    return tf(o, ...t), o;
  }
  var Yo,
    Li,
    Bi,
    bs,
    Vi,
    Ni,
    _o,
    Ui,
    Hi,
    Je,
    qi,
    vs,
    et,
    tt,
    xe,
    $i,
    Wi,
    Va,
    af,
    ih = w(() => {
      te();
      oe();
      qd();
      $d();
      xo();
      of();
      Jd();
      eh();
      Qn();
      Bo();
      af = class {
        constructor(e) {
          c(this, 'actualOptions');
          c(this, 'canvas');
          c(this, 'destroyed');
          c(this, 'effectDrawers');
          c(this, 'fpsLimit');
          c(this, 'hdr');
          c(this, 'id');
          c(this, 'pageHidden');
          c(this, 'particleCreatedPlugins');
          c(this, 'particleDestroyedPlugins');
          c(this, 'particlePositionPlugins');
          c(this, 'particleUpdaters');
          c(this, 'particles');
          c(this, 'plugins');
          c(this, 'retina');
          c(this, 'shapeDrawers');
          c(this, 'started');
          c(this, 'zLayers');
          f(this, Yo);
          f(this, Li);
          f(this, Bi, { value: 0, factor: 0 });
          f(this, bs);
          f(this, Vi);
          f(this, Ni);
          f(this, _o);
          f(this, Ui);
          f(this, Hi);
          f(this, Je);
          f(this, qi);
          f(this, vs);
          f(this, et);
          f(this, tt);
          f(this, xe);
          f(this, $i);
          f(this, Wi);
          f(this, Va, (e) => {
            try {
              if (!a(this, $i) && a(this, Je) !== void 0 && e < a(this, Je) + 1e3 / this.fpsLimit) {
                this.draw(!1);
                return;
              }
              if (
                (a(this, Je) ?? h(this, Je, e),
                Mg(a(this, Bi), e - a(this, Je), this.fpsLimit, a(this, $i)),
                this.addLifeTime(a(this, Bi).value),
                h(this, Je, e),
                a(this, Bi).value > 1e3)
              ) {
                this.draw(!1);
                return;
              }
              if ((this.canvas.render.drawParticles(a(this, Bi)), !this.alive())) {
                this.destroy();
                return;
              }
              this.animationStatus && this.draw(!1);
            } catch (t) {
              _e().error('error in animation loop', t);
            }
          });
          let { dispatchCallback: t, pluginManager: o, id: n, onDestroy: s, sourceOptions: r } = e;
          h(this, xe, o),
            h(this, bs, t),
            h(this, vs, s),
            (this.id = Symbol(n)),
            (this.fpsLimit = 120),
            (this.hdr = !1),
            h(this, $i, !1),
            h(this, Yo, 0),
            h(this, Ni, 0),
            h(this, qi, 0),
            h(this, Ui, !0),
            (this.started = !1),
            (this.destroyed = !1),
            h(this, tt, !0),
            h(this, Je, 0),
            (this.zLayers = 100),
            (this.pageHidden = !1),
            h(this, Wi, r),
            h(this, Hi, r),
            (this.effectDrawers = new Map()),
            (this.shapeDrawers = new Map()),
            (this.particleUpdaters = []),
            (this.retina = new Ba(this)),
            (this.canvas = new Nr(a(this, xe), this)),
            (this.particles = new Da(a(this, xe), this)),
            (this.plugins = []),
            (this.particleDestroyedPlugins = []),
            (this.particleCreatedPlugins = []),
            (this.particlePositionPlugins = []),
            h(this, et, Qo(a(this, xe), this)),
            (this.actualOptions = Qo(a(this, xe), this)),
            h(this, _o, new $r(this)),
            this.dispatchEvent(re.containerBuilt);
        }
        get animationStatus() {
          return !a(this, tt) && !this.pageHidden && Ze(this);
        }
        get options() {
          return a(this, et);
        }
        get sourceOptions() {
          return a(this, Wi);
        }
        addLifeTime(e) {
          h(this, qi, a(this, qi) + e);
        }
        alive() {
          return !a(this, Ni) || a(this, qi) <= a(this, Ni);
        }
        destroy(e = !0) {
          if (Ze(this)) {
            this.stop(), this.particles.destroy(), this.canvas.destroy();
            for (let [, t] of this.effectDrawers) t.destroy?.(this);
            for (let [, t] of this.shapeDrawers) t.destroy?.(this);
            for (let t of this.plugins) t.destroy?.();
            (this.effectDrawers = new Map()),
              (this.shapeDrawers = new Map()),
              (this.particleUpdaters = []),
              (this.plugins.length = 0),
              a(this, xe).clearPlugins(this),
              (this.destroyed = !0),
              a(this, vs).call(this, e),
              this.dispatchEvent(re.containerDestroyed);
          }
        }
        dispatchEvent(e, t) {
          a(this, bs).call(this, e, { container: this, data: t });
        }
        draw(e) {
          if (!Ze(this)) return;
          let t = e;
          h(
            this,
            Vi,
            fd((o) => {
              t && (h(this, Je, void 0), (t = !1)), a(this, Va).call(this, o);
            }),
          );
        }
        async export(e, t = {}) {
          for (let o of this.plugins) {
            if (!o.export) continue;
            let n = await o.export(e, t);
            if (n.supported) return n.blob;
          }
          _e().error(`Export plugin with type ${e} not found`);
        }
        async init() {
          if (!Ze(this)) return;
          let e = new Map();
          for (let u of a(this, xe).plugins) {
            let d = await u.getPlugin(this);
            d.preInit && (await d.preInit()), e.set(u, d);
          }
          await this.initDrawersAndUpdaters(),
            h(this, et, Qo(a(this, xe), this, a(this, Hi), this.sourceOptions)),
            (this.actualOptions = Qo(a(this, xe), this, a(this, et))),
            (this.plugins.length = 0),
            (this.particleDestroyedPlugins.length = 0),
            (this.particleCreatedPlugins.length = 0),
            (this.particlePositionPlugins.length = 0);
          for (let [u, d] of e)
            u.needsPlugin(this.actualOptions) &&
              (this.plugins.push(d),
              d.particleCreated && this.particleCreatedPlugins.push(d),
              d.particleDestroyed && this.particleDestroyedPlugins.push(d),
              d.particlePosition && this.particlePositionPlugins.push(d));
          this.retina.init(),
            this.canvas.init(),
            this.updateActualOptions(),
            this.canvas.initBackground(),
            this.canvas.resize();
          let {
            delay: t,
            duration: o,
            fpsLimit: n,
            hdr: s,
            smooth: r,
            zLayers: l,
          } = this.actualOptions;
          (this.hdr = s),
            (this.zLayers = l),
            h(this, Ni, P(o) * 1e3),
            h(this, Yo, P(t) * 1e3),
            h(this, qi, 0),
            (this.fpsLimit = n > Xf ? n : _f),
            h(this, $i, r);
          for (let u of this.plugins) await u.init?.();
          await this.particles.init(),
            this.dispatchEvent(re.containerInit),
            this.particles.setDensity();
          for (let u of this.plugins) u.particlesSetup?.();
          this.dispatchEvent(re.particlesSetup);
        }
        async initDrawersAndUpdaters() {
          let e = a(this, xe);
          (this.effectDrawers = await e.getEffectDrawers(this, !0)),
            (this.shapeDrawers = await e.getShapeDrawers(this, !0)),
            (this.particleUpdaters = await e.getUpdaters(this, !0));
        }
        pause() {
          if (
            Ze(this) &&
            (a(this, Vi) !== void 0 && (dd(a(this, Vi)), h(this, Vi, void 0)), !a(this, tt))
          ) {
            for (let e of this.plugins) e.pause?.();
            this.pageHidden || h(this, tt, !0), this.dispatchEvent(re.containerPaused);
          }
        }
        play(e) {
          if (!Ze(this)) return;
          let t = a(this, tt) || e;
          if (a(this, Ui) && !this.actualOptions.autoPlay) {
            h(this, Ui, !1);
            return;
          }
          if ((a(this, tt) && h(this, tt, !1), t)) for (let o of this.plugins) o.play && o.play();
          this.dispatchEvent(re.containerPlay), this.draw(t ?? !1);
        }
        async refresh() {
          if (Ze(this)) return this.stop(), this.start();
        }
        async reset(e) {
          if (Ze(this))
            return (
              h(this, Hi, e),
              h(this, Wi, e),
              h(this, et, Qo(a(this, xe), this, a(this, Hi), this.sourceOptions)),
              (this.actualOptions = Qo(a(this, xe), this, a(this, et))),
              this.refresh()
            );
        }
        async start() {
          !Ze(this) ||
            this.started ||
            (await this.init(),
            (this.started = !0),
            await new Promise((e) => {
              let t = async () => {
                a(this, _o).addListeners();
                for (let o of this.plugins) await o.start?.();
                this.dispatchEvent(re.containerStarted), this.play(), e();
              };
              h(
                this,
                Li,
                setTimeout(
                  () => {
                    t();
                  },
                  a(this, Yo),
                ),
              );
            }));
        }
        stop() {
          if (!(!Ze(this) || !this.started)) {
            a(this, Li) && (clearTimeout(a(this, Li)), h(this, Li, void 0)),
              h(this, Ui, !0),
              (this.started = !1),
              a(this, _o).removeListeners(),
              this.pause(),
              this.particles.clear(),
              this.canvas.stop();
            for (let e of this.plugins) e.stop?.();
            (this.particleCreatedPlugins.length = 0),
              (this.particleDestroyedPlugins.length = 0),
              (this.particlePositionPlugins.length = 0),
              h(this, Wi, a(this, et)),
              this.dispatchEvent(re.containerStopped);
          }
        }
        updateActualOptions() {
          let e = !1;
          for (let t of this.plugins) t.updateActualOptions && (e = t.updateActualOptions() || e);
          return e;
        }
      };
      (Yo = new WeakMap()),
        (Li = new WeakMap()),
        (Bi = new WeakMap()),
        (bs = new WeakMap()),
        (Vi = new WeakMap()),
        (Ni = new WeakMap()),
        (_o = new WeakMap()),
        (Ui = new WeakMap()),
        (Hi = new WeakMap()),
        (Je = new WeakMap()),
        (qi = new WeakMap()),
        (vs = new WeakMap()),
        (et = new WeakMap()),
        (tt = new WeakMap()),
        (xe = new WeakMap()),
        ($i = new WeakMap()),
        (Wi = new WeakMap()),
        (Va = new WeakMap());
    });
  async function kg(i) {
    let e = ne(i.url, i.index);
    if (!e) return i.fallback;
    let t = await fetch(e);
    return t.ok
      ? await t.json()
      : (_e().error(`${t.status.toString()} while retrieving config file`), i.fallback);
  }
  var Na,
    Pg,
    Cg,
    Ha,
    Xo,
    ws,
    Ua,
    oh = w(() => {
      oe();
      ve();
      Cd();
      Sd();
      Qn();
      te();
      Na = '100%';
      (Pg = (i) => {
        var n, s, r, l, u, d;
        let e = Z(),
          t;
        if (i instanceof HTMLCanvasElement || i.tagName.toLowerCase() === ur)
          (t = i),
            (n = t.dataset)[(s = gt)] ?? (n[s] = su),
            t.dataset[gt] === cr &&
              ((r = t.style).width || (r.width = Na),
              (l = t.style).height || (l.height = Na),
              (t.style.pointerEvents = 'none'),
              t.style.setProperty('pointer-events', 'none'));
        else {
          let p = i.getElementsByTagName(ur),
            m = p.item(Kf);
          m
            ? ((t = m), (t.dataset[gt] = su))
            : ((t = e.createElement(ur)), (t.dataset[gt] = cr), i.appendChild(t)),
            (u = t.style).width || (u.width = Na),
            (d = t.style).height || (d.height = Na),
            (t.style.pointerEvents = 'none'),
            t.style.setProperty('pointer-events', 'none');
        }
        return t;
      }),
        (Cg = (i, e) => {
          let t = Z(),
            o = e ?? t.getElementById(i);
          return (
            o ||
            ((o = t.createElement('canvas')), (o.id = i), (o.dataset[gt] = cr), t.body.append(o), o)
          );
        }),
        (Ua = class {
          constructor() {
            c(this, 'pluginManager', new Ir(this));
            f(this, Ha, []);
            f(this, Xo, new Dr());
            f(this, ws, !1);
          }
          get items() {
            return a(this, Ha);
          }
          get version() {
            return '4.1.0';
          }
          addEventListener(e, t) {
            a(this, Xo).addEventListener(e, t);
          }
          checkVersion(e) {
            if (this.version !== e)
              throw new Error(
                `The tsParticles version is different from the loaded plugins version. Engine version: ${this.version}. Plugin version: ${e}`,
              );
          }
          dispatchEvent(e, t) {
            a(this, Xo).dispatchEvent(e, t);
          }
          async init() {
            a(this, ws) || (await this.pluginManager.init(), h(this, ws, !0));
          }
          item(e) {
            let t = this.items,
              o = t[e];
            if (o?.destroyed) {
              t.splice(e, cu);
              return;
            }
            return o;
          }
          async load(e) {
            await this.init();
            let t;
            typeof HTMLElement < 'u' && e.element instanceof HTMLElement && (t = e.element);
            let { Container: o } = await Promise.resolve().then(() => (ih(), th)),
              n = e.id ?? t?.id ?? `tsparticles${Math.floor(T() * Zf).toString()}`,
              { index: s, url: r } = e,
              l = r ? await kg({ fallback: e.options, url: r, index: s }) : e.options,
              u = ne(l, s),
              { items: d } = this,
              p = d.findIndex((y) => y.id.description === n),
              m = new o({
                dispatchCallback: (y, b) => {
                  this.dispatchEvent(y, b);
                },
                id: n,
                onDestroy: (y) => {
                  if (!y) return;
                  let b = this.items,
                    k = b.indexOf(m);
                  k >= Yf && b.splice(k, cu);
                },
                pluginManager: this.pluginManager,
                sourceOptions: u,
              });
            if (p >= Jf) {
              let y = this.item(p),
                b = y ? xt : hr;
              y && !y.destroyed && y.destroy(!1), d.splice(p, b, m);
            } else d.push(m);
            let g =
              typeof OffscreenCanvas < 'u' && e.element instanceof OffscreenCanvas
                ? e.element
                : Pg(Cg(n, t));
            return m.canvas.loadCanvas(g), await m.start(), m;
          }
          async refresh(e = !0) {
            e && (await Promise.all(this.items.map((t) => t.refresh())));
          }
          removeEventListener(e, t) {
            a(this, Xo).removeEventListener(e, t);
          }
        });
      (Ha = new WeakMap()), (Xo = new WeakMap()), (ws = new WeakMap());
    });
  function nh() {
    return new Ua();
  }
  var sh = w(() => {
    oh();
  });
  var Me,
    rh = w(() => {
      (function (i) {
        (i.clockwise = 'clockwise'),
          (i.counterClockwise = 'counter-clockwise'),
          (i.random = 'random');
      })(Me || (Me = {}));
    });
  var ah,
    lh = w(() => {
      (function (i) {
        (i.linear = 'linear'), (i.radial = 'radial'), (i.random = 'random');
      })(ah || (ah = {}));
    });
  var it,
    ch = w(() => {
      (function (i) {
        (i.easeInBack = 'ease-in-back'),
          (i.easeInBounce = 'ease-in-bounce'),
          (i.easeInCirc = 'ease-in-circ'),
          (i.easeInCubic = 'ease-in-cubic'),
          (i.easeInElastic = 'ease-in-elastic'),
          (i.easeInExpo = 'ease-in-expo'),
          (i.easeInGaussian = 'ease-in-gaussian'),
          (i.easeInLinear = 'ease-in-linear'),
          (i.easeInQuad = 'ease-in-quad'),
          (i.easeInQuart = 'ease-in-quart'),
          (i.easeInQuint = 'ease-in-quint'),
          (i.easeInSigmoid = 'ease-in-sigmoid'),
          (i.easeInSine = 'ease-in-sine'),
          (i.easeInSmoothstep = 'ease-in-smoothstep'),
          (i.easeOutBack = 'ease-out-back'),
          (i.easeOutBounce = 'ease-out-bounce'),
          (i.easeOutCirc = 'ease-out-circ'),
          (i.easeOutCubic = 'ease-out-cubic'),
          (i.easeOutElastic = 'ease-out-elastic'),
          (i.easeOutExpo = 'ease-out-expo'),
          (i.easeOutGaussian = 'ease-out-gaussian'),
          (i.easeOutLinear = 'ease-out-linear'),
          (i.easeOutQuad = 'ease-out-quad'),
          (i.easeOutQuart = 'ease-out-quart'),
          (i.easeOutQuint = 'ease-out-quint'),
          (i.easeOutSigmoid = 'ease-out-sigmoid'),
          (i.easeOutSine = 'ease-out-sine'),
          (i.easeOutSmoothstep = 'ease-out-smoothstep'),
          (i.easeInOutBack = 'ease-in-out-back'),
          (i.easeInOutBounce = 'ease-in-out-bounce'),
          (i.easeInOutCirc = 'ease-in-out-circ'),
          (i.easeInOutCubic = 'ease-in-out-cubic'),
          (i.easeInOutElastic = 'ease-in-out-elastic'),
          (i.easeInOutExpo = 'ease-in-out-expo'),
          (i.easeInOutGaussian = 'ease-in-out-gaussian'),
          (i.easeInOutLinear = 'ease-in-out-linear'),
          (i.easeInOutQuad = 'ease-in-out-quad'),
          (i.easeInOutQuart = 'ease-in-out-quart'),
          (i.easeInOutQuint = 'ease-in-out-quint'),
          (i.easeInOutSigmoid = 'ease-in-out-sigmoid'),
          (i.easeInOutSine = 'ease-in-out-sine'),
          (i.easeInOutSmoothstep = 'ease-in-out-smoothstep');
      })(it || (it = {}));
    });
  var uh = w(() => {
    oe();
    sf();
    qn();
    Un();
    rh();
    kr();
    wr();
    ua();
    na();
    Pr();
    wu();
    xu();
    lh();
    nf();
    Cr();
    ch();
    xo();
    Mr();
    zo();
    Xr();
    Eu();
    Au();
    Fu();
    Lu();
    of();
    jr();
    Yu();
    Qu();
    ef();
    Jr();
    ju();
    Gu();
    Wu();
    Bu();
    Vu();
    Nu();
    qu();
    Hu();
    $u();
    Ku();
    Xu();
    _u();
    Zu();
    Ju();
    Tu();
    ss();
    zu();
    Xn();
    Qn();
    te();
    Bo();
    ve();
    B();
  });
  var qa,
    v = w(() => {
      sh();
      uh();
      qa = nh();
    });
  var fh = {};
  mi(fh, { BlendPluginInstance: () => lf });
  var ks,
    Ko,
    lf,
    dh = w(() => {
      v();
      lf = class {
        constructor(e) {
          f(this, ks);
          f(this, Ko);
          h(this, ks, e);
        }
        drawParticleCleanup(e, t) {
          t.options.blend?.enable &&
            ((e.globalCompositeOperation = t.originalBlendMode ?? rr),
            (t.originalBlendMode = void 0));
        }
        drawParticleSetup(e, t) {
          t.options.blend?.enable &&
            ((t.originalBlendMode = e.globalCompositeOperation),
            (e.globalCompositeOperation = t.options.blend.mode));
        }
        drawSettingsCleanup(e) {
          a(this, Ko) && (e.globalCompositeOperation = a(this, Ko));
        }
        drawSettingsSetup(e) {
          let t = e.globalCompositeOperation,
            o = a(this, ks).actualOptions.blend;
          h(this, Ko, t), (e.globalCompositeOperation = o?.enable ? o.mode : t);
        }
      };
      (ks = new WeakMap()), (Ko = new WeakMap());
    });
  function wh(i) {
    let e = i.initialPosition,
      { dx: t, dy: o } = K(e, i.position),
      n = Math.abs(t),
      s = Math.abs(o),
      { maxDistance: r } = i.retina,
      l = r.horizontal,
      u = r.vertical;
    if (!l && !u) return;
    let d = (l && n >= l) ?? !1,
      p = (u && s >= u) ?? !1;
    if ((d || p) && !i.misplaced)
      (i.misplaced = (!!l && n > l) || (!!u && s > u)),
        l && (i.velocity.x = i.velocity.y * 0.5 - i.velocity.x),
        u && (i.velocity.y = i.velocity.x * 0.5 - i.velocity.y);
    else if ((!l || n < l) && (!u || s < u) && i.misplaced) i.misplaced = !1;
    else if (i.misplaced) {
      let m = i.position,
        g = i.velocity;
      l && ((m.x < e.x && g.x < ei) || (m.x > e.x && g.x > ei)) && (g.x *= -T()),
        u && ((m.y < e.y && g.y < ei) || (m.y > e.y && g.y > ei)) && (g.y *= -T());
    }
  }
  function Mh(i, e, t, o, n, s, r) {
    Bg(i, r);
    let l = i.gravity,
      u = l?.enable && l.inverse ? -We : We;
    n && t && (i.velocity.x += (n * r.factor) / (bh * t)),
      l?.enable && t && (i.velocity.y += (u * (l.acceleration * r.factor)) / (bh * t));
    let d = i.moveDecay;
    i.velocity.multTo(d ?? Lg);
    let p = i.velocity.mult(t);
    l?.enable &&
      o > ei &&
      ((!l.inverse && p.y >= ei && p.y >= o) || (l.inverse && p.y <= ei && p.y <= -o)) &&
      ((p.y = u * o), t && (i.velocity.y = p.y / t));
    let m = i.options.zIndex,
      g = (We - i.zIndexFactor) ** m.velocityRate;
    p.multTo(g), p.multTo(s);
    let { position: y } = i;
    y.addTo(p),
      e.vibrate &&
        ((y.x += Math.sin(y.x * Math.cos(y.y)) * s), (y.y += Math.cos(y.y * Math.sin(y.x)) * s));
  }
  function kh(i, e, t, o) {
    if (!e.spin) return;
    let n = e.spin.direction === Me.clockwise,
      s = { x: n ? Math.cos : Math.sin, y: n ? Math.sin : Math.cos };
    (e.position.x = e.spin.center.x + e.spin.radius * s.x(e.spin.angle) * o),
      (e.position.y = e.spin.center.y + e.spin.radius * s.y(e.spin.angle) * o),
      (e.spin.radius += e.spin.acceleration * o);
    let r = Math.max(i.canvas.size.width, i.canvas.size.height),
      l = r * 0.5;
    e.spin.radius > l
      ? ((e.spin.radius = l), (e.spin.acceleration *= -We))
      : e.spin.radius < vh && ((e.spin.radius = vh), (e.spin.acceleration *= -We)),
      (e.spin.angle += t * Tg * (We - e.spin.radius / r));
  }
  function Bg(i, e) {
    let t = i.options,
      o = t.move.path;
    if (!o.enable) return;
    let s = i.pathDelay ?? Ag;
    if (i.lastPathTime <= s) {
      i.lastPathTime += e.value;
      return;
    }
    let r = i.pathGenerator?.generate(i, e);
    r && i.velocity.addTo(r),
      o.clamp &&
        ((i.velocity.x = Y(i.velocity.x, -We, We)), (i.velocity.y = Y(i.velocity.y, -We, We))),
      (i.lastPathTime -= s);
  }
  function Ph(i) {
    return i.slow.inRange ? i.slow.factor : We;
  }
  function Ch(i, e) {
    let t = e.options,
      o = t.move.spin;
    if (!o.enable) return;
    let n = o.position ?? { x: 50, y: 50 },
      s = 0.01,
      r = { x: n.x * s * i.canvas.size.width, y: n.y * s * i.canvas.size.height },
      l = e.getPosition(),
      u = Se(l, r),
      d = P(o.acceleration);
    (e.retina.spinAcceleration = d * i.retina.pixelRatio),
      (e.spin = {
        center: r,
        direction: e.velocity.x >= ei ? Me.clockwise : Me.counterClockwise,
        angle: T() * le,
        radius: u,
        acceleration: e.retina.spinAcceleration,
      });
  }
  var ei,
    We,
    bh,
    vh,
    Tg,
    Ag,
    Lg,
    Sh = w(() => {
      v();
      (ei = 0), (We = 1), (bh = 60), (vh = 0), (Tg = 0.01), (Ag = 0), (Lg = 1);
    });
  var Oh = {};
  mi(Oh, { MovePluginInstance: () => cf });
  var Vg,
    Ng,
    ji,
    Ps,
    Cs,
    uf,
    cf,
    Rh = w(() => {
      v();
      Sh();
      (Vg = 1),
        (Ng = 1),
        (cf = class {
          constructor(e, t) {
            f(this, Cs);
            c(this, 'availablePathGenerators');
            c(this, 'pathGenerators');
            f(this, ji);
            f(this, Ps);
            h(this, Ps, e),
              h(this, ji, t),
              (this.availablePathGenerators = new Map()),
              (this.pathGenerators = new Map());
          }
          destroy() {
            (this.availablePathGenerators = new Map()), (this.pathGenerators = new Map());
          }
          isEnabled(e) {
            return !e.destroyed && e.options.move.enable;
          }
          particleCreated(e) {
            let t = e.options,
              o = t.move,
              n = o.gravity,
              s = o.path;
            if (
              ((e.moveDecay = pr - P(o.decay)), (e.pathDelay = P(s.delay.value) * 1e3), s.generator)
            ) {
              let r = this.pathGenerators.get(s.generator);
              r ||
                ((r = this.availablePathGenerators.get(s.generator)),
                r && (this.pathGenerators.set(s.generator, r), r.init())),
                (e.pathGenerator = r);
            }
            (e.gravity = { enable: n.enable, acceleration: P(n.acceleration), inverse: n.inverse }),
              Ch(a(this, ji), e);
          }
          particleDestroyed(e) {
            e.pathGenerator?.reset(e);
          }
          particleUpdate(e, t) {
            let o = e.options,
              n = o.move;
            if (!n.enable) return;
            let s = a(this, ji),
              r = Ph(e),
              l = s.retina.reduceFactor,
              u = e.retina.moveSpeed,
              d = e.retina.moveDrift,
              p = e.size.max,
              m = n.size ? e.getRadius() / p : Vg,
              g = t.factor || Ng,
              y = u * m * r * g * 0.5,
              b = e.retina.maxSpeed;
            n.spin.enable ? kh(s, e, y, l) : Mh(e, n, y, b, d, l, t), wh(e);
          }
          preInit() {
            return L(this, Cs, uf).call(this);
          }
          redrawInit() {
            return L(this, Cs, uf).call(this);
          }
          update() {
            for (let e of this.pathGenerators.values()) e.update();
          }
        });
      (ji = new WeakMap()),
        (Ps = new WeakMap()),
        (Cs = new WeakSet()),
        (uf = async function () {
          let e = await a(this, Ps).getPathGenerators?.(a(this, ji), !0);
          if (e) {
            (this.availablePathGenerators = e), (this.pathGenerators = new Map());
            for (let t of this.pathGenerators.values()) t.init();
          }
        });
    });
  var yl,
    qh = w(() => {
      v();
      yl = class {
        constructor() {
          c(this, 'enable');
          c(this, 'mode');
          (this.enable = !1), (this.mode = []);
        }
        load(e) {
          x(e) ||
            (e.enable !== void 0 && (this.enable = e.enable),
            e.mode !== void 0 && (this.mode = e.mode));
        }
      };
    });
  var Te,
    pf = w(() => {
      (function (i) {
        (i.circle = 'circle'), (i.rectangle = 'rectangle');
      })(Te || (Te = {}));
    });
  var Bs,
    mf = w(() => {
      v();
      pf();
      Bs = class {
        constructor() {
          c(this, 'enable');
          c(this, 'mode');
          c(this, 'selectors');
          c(this, 'type');
          (this.selectors = []), (this.enable = !1), (this.mode = []), (this.type = Te.circle);
        }
        load(e) {
          x(e) ||
            (e.selectors !== void 0 && (this.selectors = e.selectors),
            e.enable !== void 0 && (this.enable = e.enable),
            e.mode !== void 0 && (this.mode = e.mode),
            e.type !== void 0 && (this.type = e.type));
        }
      };
    });
  var xl,
    $h = w(() => {
      v();
      xl = class {
        constructor() {
          c(this, 'enable');
          c(this, 'mode');
          (this.enable = !1), (this.mode = []);
        }
        load(e) {
          x(e) ||
            (e.enable !== void 0 && (this.enable = e.enable),
            e.mode !== void 0 && (this.mode = e.mode));
        }
      };
    });
  var bl,
    Wh = w(() => {
      v();
      qh();
      mf();
      $h();
      bl = class {
        constructor() {
          c(this, 'onClick');
          c(this, 'onDiv');
          c(this, 'onHover');
          (this.onClick = new yl()), (this.onDiv = new Bs()), (this.onHover = new xl());
        }
        load(e) {
          if (x(e)) return;
          this.onClick.load(e.onClick);
          let t = e.onDiv;
          t !== void 0 &&
            (this.onDiv = j(t, (o) => {
              let n = new Bs();
              return n.load(o), n;
            })),
            this.onHover.load(e.onHover);
        }
      };
    });
  var ii,
    vl = w(() => {
      (function (i) {
        (i.canvas = 'canvas'), (i.parent = 'parent'), (i.window = 'window');
      })(ii || (ii = {}));
    });
  var sn,
    Vs,
    wl,
    gf = w(() => {
      v();
      wl = class {
        constructor(e, t) {
          f(this, sn);
          f(this, Vs);
          h(this, Vs, e), h(this, sn, t);
        }
        load(e) {
          if (x(e) || !a(this, sn)) return;
          let t = a(this, Vs).interactors?.get(a(this, sn));
          if (t) for (let o of t) o.loadModeOptions && o.loadModeOptions(this, e);
        }
      };
      (sn = new WeakMap()), (Vs = new WeakMap());
    });
  var rn,
    yf = w(() => {
      v();
      Wh();
      vl();
      gf();
      rn = class {
        constructor(e, t) {
          c(this, 'detectsOn');
          c(this, 'events');
          c(this, 'modes');
          (this.detectsOn = ii.window), (this.events = new bl()), (this.modes = new wl(e, t));
        }
        load(e) {
          if (x(e)) return;
          let t = e.detectsOn;
          t !== void 0 && (this.detectsOn = t),
            this.events.load(e.events),
            this.modes.load(e.modes);
        }
      };
    });
  var Gh,
    xf,
    bf,
    Ns,
    be,
    Ml,
    _i,
    kl,
    Pl,
    Cl = w(() => {
      (Gh = 'click'),
        (xf = 'pointerdown'),
        (bf = 'pointerup'),
        (Ns = 'pointerleave'),
        (be = 'pointermove'),
        (Ml = 'touchstart'),
        (_i = 'touchend'),
        (kl = 'touchmove'),
        (Pl = 'touchcancel');
    });
  var Wg,
    an,
    Xi,
    ot,
    ln,
    Ge,
    Ki,
    Ol,
    Rl,
    Dl,
    Us,
    Il,
    Hs,
    Zi,
    cn,
    qs,
    zl,
    El,
    Sl,
    jh = w(() => {
      v();
      Cl();
      vl();
      (Wg = 500),
        (Sl = class {
          constructor(e, t) {
            f(this, an, !0);
            f(this, Xi);
            f(this, ot);
            f(this, ln);
            f(this, Ge);
            f(this, Ki);
            f(this, Ol, (e) => {
              let t = a(this, ot),
                o = a(this, Ge),
                n = t.actualOptions;
              if (a(this, an)) {
                let s = o.interactivityData.mouse,
                  r = s.position;
                if (!r) return;
                (s.clickPosition = { ...r }), (s.clickTime = performance.now());
                let l = n.interactivity?.events.onClick;
                if (!l?.mode) return;
                j(l.mode, (u) => {
                  o.handleClickMode(u);
                });
              }
              e.type === 'touchend' &&
                setTimeout(() => {
                  a(this, Zi).call(this);
                }, Wg);
            });
            f(this, Rl, () => {
              a(this, Zi).call(this);
            });
            f(this, Dl, (e) => {
              let t = a(this, ln),
                o = a(this, ot),
                n = a(this, Ge),
                s = o.actualOptions,
                r = n.interactivityData.element;
              if (!r) return;
              let l = r,
                u = o.canvas;
              u.setPointerEvents(l === u.domElement ? 'initial' : 'none'),
                !(
                  e &&
                  !(
                    s.interactivity?.events.onHover.enable || s.interactivity?.events.onClick.enable
                  )
                ) &&
                  (se(r, be, t.mouseMove, e),
                  se(r, Ml, t.touchStart, e),
                  se(r, kl, t.touchMove, e),
                  e
                    ? s.interactivity?.events.onClick.enable
                      ? (se(r, _i, t.touchEndClick, e),
                        se(r, bf, t.mouseUp, e),
                        se(r, xf, t.mouseDown, e))
                      : se(r, _i, t.touchEnd, e)
                    : (se(r, _i, t.touchEndClick, e),
                      se(r, bf, t.mouseUp, e),
                      se(r, xf, t.mouseDown, e),
                      se(r, _i, t.touchEnd, e)),
                  se(r, Ns, t.mouseLeave, e),
                  se(r, Pl, t.touchCancel, e));
            });
            f(this, Us, (e) => {
              let t = a(this, ln),
                o = a(this, ot),
                n = a(this, Ge),
                s = o.actualOptions,
                r = s.interactivity?.detectsOn,
                l = o.canvas.domElement;
              r === ii.window
                ? (n.interactivityData.element = Z())
                : r === ii.parent && l
                  ? (n.interactivityData.element = l.parentElement ?? l.parentNode)
                  : (n.interactivityData.element = l),
                a(this, Dl).call(this, e),
                se(document, ar, t.visibilityChange, e, !1);
            });
            f(this, Il, () => {
              let { interactivityData: e } = a(this, Ge),
                { mouse: t } = e;
              (t.clicking = !0), (t.downPosition = t.position);
            });
            f(this, Hs, (e) => {
              let t = a(this, ot),
                o = a(this, Ge),
                n = t.actualOptions,
                { mouse: s } = o.interactivityData;
              s.inside = !0;
              let r = !1,
                l = s.position;
              if (!(!l || !n.interactivity?.events.onClick.enable)) {
                for (let u of a(this, Xi)) if (((r = u.clickPositionValid?.(l) ?? !1), r)) break;
                r || a(this, Ol).call(this, e), (s.clicking = !1);
              }
            });
            f(this, Zi, () => {
              let { interactivityData: e } = a(this, Ge),
                { mouse: t } = e;
              delete t.position,
                delete t.clickPosition,
                delete t.downPosition,
                (e.status = Ns),
                (t.inside = !1),
                (t.clicking = !1);
            });
            f(this, cn, (e) => {
              let t = a(this, ot),
                o = a(this, Ge),
                n = t.actualOptions,
                s = o.interactivityData,
                r = t.canvas.domElement;
              if (!s.element) return;
              s.mouse.inside = !0;
              let l;
              if (e.type.startsWith('pointer')) {
                h(this, an, !0);
                let d = e;
                if (s.element === Z()) {
                  if (r) {
                    let p = r.getBoundingClientRect();
                    l = { x: d.clientX - p.left, y: d.clientY - p.top };
                  }
                } else if (n.interactivity?.detectsOn === ii.parent) {
                  let p = d.target,
                    m = d.currentTarget;
                  if (r) {
                    let g = p.getBoundingClientRect(),
                      y = m.getBoundingClientRect(),
                      b = r.getBoundingClientRect();
                    l = {
                      x: d.offsetX + I * g.left - (y.left + b.left),
                      y: d.offsetY + I * g.top - (y.top + b.top),
                    };
                  } else l = { x: d.offsetX, y: d.offsetY };
                } else d.target === r && (l = { x: d.offsetX, y: d.offsetY });
              } else if ((h(this, an, e.type !== 'touchmove'), r)) {
                let d = e,
                  p = d.touches[d.touches.length - nd],
                  m = r.getBoundingClientRect();
                if (!p) return;
                l = { x: p.clientX - m.left, y: p.clientY - m.top };
              }
              let u = t.retina.pixelRatio;
              l && ((l.x *= u), (l.y *= u)), (s.mouse.position = l), (s.status = be);
            });
            f(this, qs, (e) => {
              let t = e,
                o = Array.from(t.changedTouches);
              for (let n of o) a(this, Ki).delete(n.identifier);
              a(this, Zi).call(this);
            });
            f(this, zl, (e) => {
              let t = e,
                o = Array.from(t.changedTouches);
              for (let n of o) a(this, Ki).delete(n.identifier);
              a(this, Hs).call(this, e);
            });
            f(this, El, (e) => {
              let t = e,
                o = Array.from(t.changedTouches);
              for (let n of o) a(this, Ki).set(n.identifier, performance.now());
              a(this, cn).call(this, e);
            });
            h(this, ot, e),
              h(this, Xi, []),
              h(this, Ge, t),
              h(this, Ki, new Map()),
              h(this, ln, {
                mouseDown: () => {
                  a(this, Il).call(this);
                },
                mouseLeave: () => {
                  a(this, Zi).call(this);
                },
                mouseMove: (o) => {
                  a(this, cn).call(this, o);
                },
                mouseUp: (o) => {
                  a(this, Hs).call(this, o);
                },
                touchStart: (o) => {
                  a(this, El).call(this, o);
                },
                touchMove: (o) => {
                  a(this, cn).call(this, o);
                },
                touchEnd: (o) => {
                  a(this, qs).call(this, o);
                },
                touchCancel: (o) => {
                  a(this, qs).call(this, o);
                },
                touchEndClick: (o) => {
                  a(this, zl).call(this, o);
                },
                visibilityChange: () => {
                  a(this, Rl).call(this);
                },
              });
          }
          addListeners() {
            a(this, Us).call(this, !0);
          }
          init() {
            a(this, Xi).length = 0;
            for (let e of a(this, ot).plugins.filter((t) => !!t.clickPositionValid))
              a(this, Xi).push(e);
          }
          removeListeners() {
            a(this, Us).call(this, !1);
          }
        });
      (an = new WeakMap()),
        (Xi = new WeakMap()),
        (ot = new WeakMap()),
        (ln = new WeakMap()),
        (Ge = new WeakMap()),
        (Ki = new WeakMap()),
        (Ol = new WeakMap()),
        (Rl = new WeakMap()),
        (Dl = new WeakMap()),
        (Us = new WeakMap()),
        (Il = new WeakMap()),
        (Hs = new WeakMap()),
        (Zi = new WeakMap()),
        (cn = new WeakMap()),
        (qs = new WeakMap()),
        (zl = new WeakMap()),
        (El = new WeakMap());
    });
  var pt,
    $s = w(() => {
      (function (i) {
        (i.external = 'external'), (i.particles = 'particles');
      })(pt || (pt = {}));
    });
  var Gg,
    jg,
    Qh,
    Ae,
    nt,
    Ji,
    st,
    eo,
    oi,
    ni,
    Ws,
    Tl,
    Fl,
    Yh = w(() => {
      v();
      Cl();
      jh();
      $s();
      (Gg = 1),
        (jg = 1),
        (Qh = 0),
        (Fl = class {
          constructor(e, t) {
            c(this, 'interactivityData');
            f(this, Ae);
            f(this, nt);
            f(this, Ji);
            f(this, st);
            f(this, eo);
            f(this, oi);
            f(this, ni);
            f(this, Ws);
            f(this, Tl, (e) => {
              let t = a(this, nt);
              if (!(t.destroyed || !t.actualOptions.pauseOnOutsideViewport))
                for (let o of e)
                  o.target === this.interactivityData.element &&
                    (o.isIntersecting ? t.play() : t.pause());
            });
            h(this, nt, t),
              h(this, Ws, e),
              h(this, eo, []),
              h(this, st, []),
              h(this, ni, []),
              h(this, Ae, new Map()),
              h(this, Ji, new Sl(t, this)),
              (this.interactivityData = { mouse: { clicking: !1, inside: !1 } }),
              h(
                this,
                oi,
                bd((o) => {
                  a(this, Tl).call(this, o);
                }),
              );
          }
          addClickHandler(e) {
            let t = a(this, nt),
              o = this.interactivityData;
            if (t.destroyed) return;
            let n = o.element;
            if (!n) return;
            let s = (y, b, k) => {
                if (t.destroyed) return;
                let M = t.retina.pixelRatio,
                  C = { x: b.x * M, y: b.y * M },
                  S = t.particles.grid.queryCircle(C, k * M);
                e(y, S);
              },
              r = (y) => {
                if (t.destroyed) return;
                let b = y,
                  k = { x: b.offsetX, y: b.offsetY };
                s(y, k, Gg);
              },
              l = () => {
                t.destroyed || ((m = !0), (g = !1));
              },
              u = () => {
                t.destroyed || (g = !0);
              },
              d = (y) => {
                if (!t.destroyed) {
                  if (m && !g) {
                    let b = y,
                      k = b.touches[b.touches.length - jg];
                    if (!k) return;
                    let M = t.canvas.domElement,
                      C = M ? M.getBoundingClientRect() : void 0,
                      S = { x: k.clientX - (C ? C.left : Qh), y: k.clientY - (C ? C.top : Qh) };
                    s(y, S, Math.max(k.radiusX, k.radiusY));
                  }
                  (m = !1), (g = !1);
                }
              },
              p = () => {
                t.destroyed || ((m = !1), (g = !1));
              },
              m = !1,
              g = !1;
            a(this, Ae).set(Gh, r),
              a(this, Ae).set(Ml, l),
              a(this, Ae).set(kl, u),
              a(this, Ae).set(_i, d),
              a(this, Ae).set(Pl, p);
            for (let [y, b] of a(this, Ae)) n.addEventListener(y, b);
          }
          addListeners() {
            a(this, Ji).addListeners();
          }
          clearClickHandlers() {
            let e = a(this, nt),
              t = this.interactivityData;
            if (!e.destroyed) {
              for (let [o, n] of a(this, Ae)) t.element?.removeEventListener(o, n);
              a(this, Ae).clear();
            }
          }
          externalInteract(e) {
            for (let t of a(this, st)) {
              let o = this.interactivityData;
              t.isEnabled(o) && t.interact(o, e);
            }
          }
          handleClickMode(e) {
            if (a(this, nt).destroyed) return;
            let t = this.interactivityData;
            for (let o of a(this, st)) o.handleClickMode?.(e, t);
          }
          init() {
            a(this, Ji).init();
            for (let e of a(this, eo)) {
              switch (e.type) {
                case pt.external:
                  a(this, st).push(e);
                  break;
                case pt.particles:
                  a(this, ni).push(e);
                  break;
              }
              e.init();
            }
          }
          async initInteractors() {
            let e = await a(this, Ws).getInteractors?.(a(this, nt), !0);
            e && (h(this, eo, e), h(this, st, []), h(this, ni, []));
          }
          particlesInteract(e, t) {
            let o = this.interactivityData;
            for (let n of a(this, st)) n.clear(e, t);
            for (let n of a(this, ni)) n.isEnabled(e, o) && n.interact(e, o, t);
          }
          removeListeners() {
            a(this, Ji).removeListeners();
          }
          reset(e) {
            let t = this.interactivityData;
            for (let o of a(this, st)) o.isEnabled(t) && o.reset(t, e);
            for (let o of a(this, ni)) o.isEnabled(e, t) && o.reset(t, e);
          }
          startObserving() {
            let e = this.interactivityData;
            e.element instanceof HTMLElement && a(this, oi) && a(this, oi).observe(e.element);
          }
          stopObserving() {
            let e = this.interactivityData;
            e.element instanceof HTMLElement && a(this, oi) && a(this, oi).unobserve(e.element);
          }
          updateMaxDistance() {
            let e = 0;
            for (let o of a(this, eo)) o.maxDistance > e && (e = o.maxDistance);
            let t = a(this, nt);
            t.particles.grid.setCellSize(e * t.retina.pixelRatio);
          }
        });
      (Ae = new WeakMap()),
        (nt = new WeakMap()),
        (Ji = new WeakMap()),
        (st = new WeakMap()),
        (eo = new WeakMap()),
        (oi = new WeakMap()),
        (ni = new WeakMap()),
        (Ws = new WeakMap()),
        (Tl = new WeakMap());
    });
  var _h = {};
  mi(_h, { InteractivityPluginInstance: () => vf });
  var si,
    un,
    vf,
    Xh = w(() => {
      Yh();
      yf();
      vf = class {
        constructor(e, t) {
          c(this, 'interactionManager');
          f(this, si);
          f(this, un);
          h(this, si, t),
            h(this, un, e),
            (this.interactionManager = new Fl(e, t)),
            (a(this, si).addClickHandler = (o) => {
              this.interactionManager.addClickHandler(o);
            });
        }
        addClickHandler(e) {
          this.interactionManager.addClickHandler(e);
        }
        clearClickHandlers() {
          this.interactionManager.clearClickHandlers();
        }
        destroy() {
          this.clearClickHandlers(), a(this, un).interactors?.delete(a(this, si));
        }
        particleCreated(e) {
          let t = e,
            o = new rn(a(this, un), a(this, si));
          o.load(a(this, si).actualOptions.interactivity),
            o.load(t.options.interactivity),
            (t.interactivity = o);
        }
        particleReset(e) {
          this.interactionManager.reset(e);
        }
        postParticleUpdate(e, t) {
          this.interactionManager.particlesInteract(e, t);
        }
        postUpdate(e) {
          this.interactionManager.externalInteract(e), this.interactionManager.updateMaxDistance();
        }
        async preInit() {
          await this.interactionManager.initInteractors(), this.interactionManager.init();
        }
        async redrawInit() {
          await this.interactionManager.initInteractors(), this.interactionManager.init();
        }
        start() {
          return (
            this.interactionManager.addListeners(),
            this.interactionManager.startObserving(),
            Promise.resolve()
          );
        }
        stop() {
          this.interactionManager.removeListeners(), this.interactionManager.stopObserving();
        }
      };
      (si = new WeakMap()), (un = new WeakMap());
    });
  var jp = {};
  mi(jp, { ImagePreloaderInstance: () => Df });
  var Js,
    er,
    Df,
    Qp = w(() => {
      Df = class {
        constructor(e, t) {
          f(this, Js);
          f(this, er);
          h(this, er, e), h(this, Js, t);
        }
        destroy() {
          a(this, er).images?.delete(a(this, Js));
        }
      };
      (Js = new WeakMap()), (er = new WeakMap());
    });
  var um = {};
  mi(um, { OverlapPluginInstance: () => If });
  var Jy,
    ir,
    Nc,
    If,
    fm = w(() => {
      v();
      (Jy = 0),
        (If = class {
          constructor(e) {
            f(this, ir);
            f(this, Nc, (e, t, o) => {
              let n = e.options.collisions;
              if (!n?.enable) return !1;
              let s = n.overlap;
              if (s.enable) return !1;
              let r = s.retries;
              if (r >= Jy && o > r) throw new Error("Particle is overlapping and can't be placed");
              return !!a(this, ir).particles.find(
                (l) => Se(t, l.position) < e.getRadius() + l.getRadius(),
              );
            });
            h(this, ir, e);
          }
          checkParticlePosition(e, t, o) {
            return !a(this, Nc).call(this, e, t, o);
          }
        });
      (ir = new WeakMap()), (Nc = new WeakMap());
    });
  function ox(i) {
    return [...i].sort((e, t) => e - t).join('_');
  }
  function zf(i, e) {
    let t = ox(i.map((n) => n.id)),
      o = e.get(t);
    return o === void 0 && ((o = T()), e.set(t, o)), o;
  }
  var mm = w(() => {
    v();
  });
  var wm = {};
  mi(wm, { LinkInstance: () => Ef });
  var gm,
    ym,
    xm,
    nx,
    sx,
    Dn,
    mt,
    di,
    In,
    Be,
    bm,
    Ff,
    Tf,
    vm,
    Ef,
    Mm = w(() => {
      v();
      mm();
      (gm = 0),
        (ym = 0),
        (xm = 0),
        (nx = 1),
        (sx = 0),
        (Ef = class {
          constructor(e, t) {
            f(this, Be);
            f(this, Dn, new Map());
            f(this, mt);
            f(this, di);
            f(this, In);
            h(this, In, e), h(this, mt, t), h(this, di, { links: new Map(), triangles: new Map() });
          }
          drawParticle(e, t) {
            let { links: o, options: n } = t;
            if (!o?.length || !n.links) return;
            let s = n.links,
              r = t.retina.linksWidth ?? ym,
              l = t.getPosition(),
              u = t.options.twinkle?.links,
              d = s.triangles.enable,
              p = d ? new Set(o.map((C) => C.destination.id)) : null,
              m = e.globalAlpha,
              g = '',
              y = -1,
              b = -1,
              k = !1,
              M = () => {
                k && (e.stroke(), (k = !1));
              };
            for (let C of o) {
              if (s.frequency < nx && L(this, Be, Tf).call(this, t, C.destination) > s.frequency)
                continue;
              let S = C.destination.getPosition();
              if (
                (d && !C.isWarped && p && (M(), L(this, Be, bm).call(this, n, t, C, p, l, S, e)),
                C.opacity <= gm || r <= ym || !s.enable)
              )
                continue;
              let F = C.opacity,
                V = C.color,
                z = u?.enable && T() < u.frequency ? dt(a(this, In), u.color) : void 0;
              if ((u && z && ((V = z), (F = P(u.opacity))), !V)) {
                let Q =
                  s.id !== void 0
                    ? a(this, mt).particles.linksColors.get(s.id)
                    : a(this, mt).particles.linksColor;
                V = Po(t, C.destination, Q);
              }
              if (!V) continue;
              let Re = L(this, Be, Ff).call(this, V);
              if (
                ((Re !== g || r !== y || F !== b) &&
                  (M(),
                  (e.strokeStyle = Re),
                  (e.lineWidth = r),
                  (e.globalAlpha = F),
                  (g = Re),
                  (y = r),
                  (b = F),
                  e.beginPath(),
                  (k = !0)),
                C.isWarped)
              ) {
                let Q = a(this, mt).canvas.size,
                  hi = S.x - l.x,
                  ut = S.y - l.y,
                  Pe = O.x,
                  pi = O.y;
                Math.abs(hi) > Q.width * 0.5 && (Pe = hi > xm ? -Q.width : Q.width),
                  Math.abs(ut) > Q.height * 0.5 && (pi = ut > xm ? -Q.height : Q.height),
                  e.moveTo(l.x, l.y),
                  e.lineTo(S.x + Pe, S.y + pi),
                  e.moveTo(l.x - Pe, l.y - pi),
                  e.lineTo(S.x, S.y);
              } else e.moveTo(l.x, l.y), e.lineTo(S.x, S.y);
            }
            M(), (e.globalAlpha = m);
          }
          init() {
            return (
              a(this, di).links.clear(),
              a(this, di).triangles.clear(),
              a(this, Dn).clear(),
              Promise.resolve()
            );
          }
          particleCreated(e) {
            if (((e.links = []), !e.options.links)) return;
            (e.linksDistance = e.options.links.distance), (e.linksWidth = e.options.links.width);
            let t = a(this, mt).retina.pixelRatio;
            (e.retina.linksDistance = e.linksDistance * t),
              (e.retina.linksWidth = e.linksWidth * t);
          }
          particleDestroyed(e) {
            e.links = [];
          }
        });
      (Dn = new WeakMap()),
        (mt = new WeakMap()),
        (di = new WeakMap()),
        (In = new WeakMap()),
        (Be = new WeakSet()),
        (bm = function (e, t, o, n, s, r, l) {
          let u = o.destination,
            d = e.links?.triangles;
          if (!d?.enable || !u.options.links?.triangles.enable) return;
          let p = u.links;
          if (p?.length)
            for (let m of p) {
              if (
                m.isWarped ||
                L(this, Be, Tf).call(this, u, m.destination) > u.options.links.frequency ||
                !n.has(m.destination.id)
              )
                continue;
              let g = m.destination;
              if (L(this, Be, vm).call(this, t, u, g) > (e.links?.triangles.frequency ?? sx))
                continue;
              let y = d.opacity ?? (o.opacity + m.opacity) * 0.5,
                b = dt(a(this, In), d.color) ?? o.color;
              if (!b || y <= gm) continue;
              let k = g.getPosition();
              l.save(),
                (l.fillStyle = L(this, Be, Ff).call(this, b)),
                (l.globalAlpha = y),
                l.beginPath(),
                l.moveTo(s.x, s.y),
                l.lineTo(r.x, r.y),
                l.lineTo(k.x, k.y),
                l.closePath(),
                l.fill(),
                l.restore();
            }
        }),
        (Ff = function (e) {
          let t = `${e.r},${e.g},${e.b}`,
            o = a(this, Dn).get(t);
          return o || ((o = Ct(e, a(this, mt).hdr)), a(this, Dn).set(t, o)), o;
        }),
        (Tf = function (e, t) {
          return zf([e, t], a(this, di).links);
        }),
        (vm = function (e, t, o) {
          return zf([e, t, o], a(this, di).triangles);
        });
    });
  v();
  v();
  var Ms = class {
    constructor() {
      c(this, 'enable');
      c(this, 'mode');
      (this.mode = 'destination-out'), (this.enable = !1);
    }
    load(e) {
      x(e) ||
        (e.mode !== void 0 && (this.mode = e.mode),
        e.enable !== void 0 && (this.enable = e.enable));
    }
  };
  var $a = class {
    constructor() {
      c(this, 'id', 'blend');
    }
    async getPlugin(e) {
      let { BlendPluginInstance: t } = await Promise.resolve().then(() => (dh(), fh));
      return new t(e);
    }
    loadOptions(e, t, o) {
      if (!this.needsPlugin(t) && !this.needsPlugin(o)) return;
      let n = t.blend;
      n?.load || (t.blend = n = new Ms()), n.load(o?.blend);
    }
    loadParticlesOptions(e, t, o) {
      t.blend ?? (t.blend = new Ms()), t.blend.load(o?.blend);
    }
    needsPlugin(e) {
      return !!e?.blend?.enable || !!e?.particles?.blend?.enable;
    }
  };
  async function hh(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        e.pluginManager.addPlugin(new $a());
      });
  }
  v();
  v();
  var Sg = 0;
  function ph(i) {
    let { context: e, particle: t, radius: o } = i;
    t.circleRange ?? (t.circleRange = { min: Sg, max: le });
    let n = t.circleRange;
    e.arc(O.x, O.y, o, n.min, n.max, !1);
  }
  var Og = 12,
    Rg = 360,
    mh = 0,
    Wa = class {
      draw(e) {
        ph(e);
      }
      getSidesCount() {
        return Og;
      }
      particleInit(e, t) {
        let o = t.shapeData,
          n = o?.angle ?? { max: Rg, min: mh };
        t.circleRange = vt(n) ? { min: Ye(n.min), max: Ye(n.max) } : { min: mh, max: Ye(n) };
      }
    };
  async function gh(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        e.pluginManager.addShape(['circle'], () => Promise.resolve(new Wa()));
      });
  }
  var Gi;
  (function (i) {
    (i[(i.r = 1)] = 'r'), (i[(i.g = 2)] = 'g'), (i[(i.b = 3)] = 'b'), (i[(i.a = 4)] = 'a');
  })(Gi || (Gi = {}));
  var Dg = /^#?([a-f\d])([a-f\d])([a-f\d])([a-f\d])?$/i,
    Ig = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i,
    Ga = 16,
    zg = 1,
    Eg = 255,
    Zo,
    ja,
    Qa = class {
      constructor() {
        f(this, Zo);
      }
      accepts(e) {
        return e.startsWith('#');
      }
      handleColor(e) {
        return L(this, Zo, ja).call(this, e.value);
      }
      handleRangeColor(e) {
        return L(this, Zo, ja).call(this, e.value);
      }
      parseString(e) {
        return L(this, Zo, ja).call(this, e);
      }
    };
  (Zo = new WeakSet()),
    (ja = function (e) {
      if (typeof e != 'string' || !this.accepts(e)) return;
      let t = e.replace(Dg, (n, s, r, l, u) => s + s + r + r + l + l + (u === void 0 ? '' : u + u)),
        o = Ig.exec(t);
      return o
        ? {
            a: o[Gi.a] ? Number.parseInt(o[Gi.a], Ga) / Eg : zg,
            b: Number.parseInt(o[Gi.b] ?? '0', Ga),
            g: Number.parseInt(o[Gi.g] ?? '0', Ga),
            r: Number.parseInt(o[Gi.r] ?? '0', Ga),
          }
        : void 0;
    });
  async function yh(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        e.pluginManager.addColorManager('hex', new Qa());
      });
  }
  v();
  var Jo;
  (function (i) {
    (i[(i.h = 1)] = 'h'), (i[(i.s = 2)] = 's'), (i[(i.l = 3)] = 'l'), (i[(i.a = 5)] = 'a');
  })(Jo || (Jo = {}));
  var Fg =
      /hsla?\(\s*(\d+)\s*[\s,]\s*(\d+)%\s*[\s,]\s*(\d+)%\s*([\s,]\s*(0|1|0?\.\d+|(\d{1,3})%)\s*)?\)/i,
    Ya = class {
      accepts(e) {
        return e.startsWith('hsl');
      }
      handleColor(e) {
        let t = e.value,
          o = t.hsl ?? e.value;
        if (!(!('h' in o) || !('s' in o) || !('l' in o))) return kt(o);
      }
      handleRangeColor(e) {
        let t = e.value,
          o = t.hsl ?? e.value;
        if (!(!('h' in o) || !('s' in o) || !('l' in o)))
          return kt({ h: P(o.h), l: P(o.l), s: P(o.s) });
      }
      parseString(e) {
        if (!this.accepts(e)) return;
        let t = Fg.exec(e),
          o = 4,
          n = 1,
          s = 10;
        return t
          ? Id({
              a: t.length > o ? vr(t[Jo.a]) : n,
              h: Number.parseInt(t[Jo.h] ?? '0', s),
              l: Number.parseInt(t[Jo.l] ?? '0', s),
              s: Number.parseInt(t[Jo.s] ?? '0', s),
            })
          : void 0;
      }
    };
  async function xh(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        e.pluginManager.addColorManager('hsl', new Ya());
      });
  }
  v();
  var Ss,
    _a = class {
      constructor(e) {
        c(this, 'id', 'move');
        f(this, Ss);
        h(this, Ss, e);
      }
      async getPlugin(e) {
        let { MovePluginInstance: t } = await Promise.resolve().then(() => (Rh(), Oh));
        return new t(a(this, Ss), e);
      }
      loadOptions() {}
      needsPlugin() {
        return !0;
      }
    };
  Ss = new WeakMap();
  async function Dh(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        var n;
        let t = e,
          o = t.pluginManager;
        (n = o.initializers).pathGenerators ?? (n.pathGenerators = new Map()),
          o.pathGenerators ?? (o.pathGenerators = new Map()),
          (o.addPathGenerator = (s, r) => {
            var l;
            (l = o.initializers).pathGenerators ?? (l.pathGenerators = new Map()),
              o.initializers.pathGenerators.set(s, r);
          }),
          (o.getPathGenerators = async (s, r = !1) => {
            var l;
            return (
              (l = o.initializers).pathGenerators ?? (l.pathGenerators = new Map()),
              o.pathGenerators ?? (o.pathGenerators = new Map()),
              Wn(s, o.pathGenerators, o.initializers.pathGenerators, r)
            );
          }),
          e.pluginManager.addPlugin(new _a(e.pluginManager));
      });
  }
  v();
  v();
  v();
  var Xa = class extends $t {
    constructor() {
      super();
      c(this, 'destroy');
      (this.destroy = qe.none), (this.speed = 2);
    }
    load(t) {
      super.load(t), !x(t) && t.destroy !== void 0 && (this.destroy = t.destroy);
    }
  };
  var Ka = class extends Fo {
    constructor() {
      super();
      c(this, 'animation');
      (this.animation = new Xa()), (this.value = 1);
    }
    load(t) {
      if (x(t)) return;
      super.load(t);
      let o = t.animation;
      o !== void 0 && this.animation.load(o);
    }
  };
  var Os,
    Za = class {
      constructor(e) {
        f(this, Os);
        h(this, Os, e);
      }
      init(e) {
        let t = e.options.opacity,
          o = 1;
        if (!t) return;
        e.opacity = Or(t, o);
        let n = t.animation;
        n.enable &&
          ((e.opacity.velocity = (P(n.speed) / 100) * a(this, Os).retina.reduceFactor),
          n.sync || (e.opacity.velocity *= T()));
      }
      isEnabled(e) {
        return (
          !e.destroyed &&
          !e.spawning &&
          !!e.opacity &&
          e.opacity.enable &&
          ((e.opacity.maxLoops ?? 0) <= 0 ||
            ((e.opacity.maxLoops ?? 0) > 0 && (e.opacity.loops ?? 0) < (e.opacity.maxLoops ?? 0)))
        );
      }
      loadOptions(e, ...t) {
        e.opacity ?? (e.opacity = new Ka());
        for (let o of t) e.opacity.load(o?.opacity);
      }
      reset(e) {
        e.opacity && ((e.opacity.time = 0), (e.opacity.loops = 0));
      }
      update(e, t) {
        !this.isEnabled(e) ||
          !e.opacity ||
          !e.options.opacity ||
          yo(e, e.opacity, !0, e.options.opacity.animation.destroy, t);
      }
    };
  Os = new WeakMap();
  async function Ih(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        e.pluginManager.addParticleUpdater('opacity', (t) => Promise.resolve(new Za(t)));
      });
  }
  v();
  v();
  v();
  var Ja = 0,
    zh = 0;
  function Eh(i) {
    if (
      (i.outMode !== H.bounce && i.outMode !== H.split) ||
      (i.direction !== E.left && i.direction !== E.right)
    )
      return;
    i.bounds.right < zh && i.direction === E.left
      ? (i.particle.position.x = i.size + i.offset.x)
      : i.bounds.left > i.canvasSize.width &&
        i.direction === E.right &&
        (i.particle.position.x = i.canvasSize.width - i.size - i.offset.x);
    let e = i.particle.velocity.x,
      t = !1;
    if (
      i.outOfCanvas &&
      ((i.direction === E.right && e > Ja) || (i.direction === E.left && e < Ja))
    ) {
      let n = P(i.particle.options.bounce.horizontal.value);
      (i.particle.velocity.x *= -n), (t = !0);
    }
    if (!t) return;
    let o = i.offset.x + i.size;
    i.outOfCanvas && i.direction === E.right
      ? (i.particle.position.x = i.canvasSize.width - o)
      : i.outOfCanvas && i.direction === E.left && (i.particle.position.x = o),
      i.outMode === H.split && i.particle.destroy();
  }
  function Fh(i) {
    if (
      (i.outMode !== H.bounce && i.outMode !== H.split) ||
      (i.direction !== E.bottom && i.direction !== E.top)
    )
      return;
    i.bounds.bottom < zh && i.direction === E.top
      ? (i.particle.position.y = i.size + i.offset.y)
      : i.bounds.top > i.canvasSize.height &&
        i.direction === E.bottom &&
        (i.particle.position.y = i.canvasSize.height - i.size - i.offset.y);
    let e = i.particle.velocity.y,
      t = !1;
    if (
      i.outOfCanvas &&
      ((i.direction === E.bottom && e > Ja) || (i.direction === E.top && e < Ja))
    ) {
      let n = P(i.particle.options.bounce.vertical.value);
      (i.particle.velocity.y *= -n), (t = !0);
    }
    if (!t) return;
    let o = i.offset.y + i.size;
    i.outOfCanvas && i.direction === E.bottom
      ? (i.particle.position.y = i.canvasSize.height - o)
      : i.outOfCanvas && i.direction === E.top && (i.particle.position.y = o),
      i.outMode === H.split && i.particle.destroy();
  }
  var Rs,
    Ds,
    el = class {
      constructor(e) {
        c(this, 'modes');
        f(this, Rs);
        f(this, Ds);
        h(this, Rs, e),
          (this.modes = [H.bounce, H.split]),
          h(
            this,
            Ds,
            e.plugins.filter((t) => t.particleBounce !== void 0),
          );
      }
      update(e, t, o, n) {
        if (!this.modes.includes(n)) return;
        let s = a(this, Rs),
          r = !1;
        for (let y of a(this, Ds)) if (((r = y.particleBounce?.(e, o, t) ?? !1), r)) break;
        if (r) return;
        let l = e.getPosition(),
          u = e.offset,
          d = e.getRadius(),
          p = Mt(l, d),
          m = s.canvas.size,
          g = !e.isInsideCanvasForOutMode(n, t);
        Eh({
          particle: e,
          outMode: n,
          direction: t,
          bounds: p,
          canvasSize: m,
          offset: u,
          outOfCanvas: g,
          size: d,
        }),
          Fh({
            particle: e,
            outMode: n,
            direction: t,
            bounds: p,
            canvasSize: m,
            offset: u,
            outOfCanvas: g,
            size: d,
          });
      }
    };
  (Rs = new WeakMap()), (Ds = new WeakMap());
  v();
  var tl = 0,
    il = class {
      constructor(e) {
        c(this, 'modes');
        this.modes = [H.destroy];
      }
      update(e, t, o, n) {
        if (this.modes.includes(n)) {
          switch (e.outType) {
            case we.normal:
            case we.outside:
              if (e.isInsideCanvasForOutMode(n, t)) return;
              break;
            case we.inside: {
              let { dx: s, dy: r } = K(e.position, e.moveCenter),
                { x: l, y: u } = e.velocity;
              if (
                (l < tl && s > e.moveCenter.radius) ||
                (u < tl && r > e.moveCenter.radius) ||
                (l >= tl && s < -e.moveCenter.radius) ||
                (u >= tl && r < -e.moveCenter.radius)
              )
                return;
              break;
            }
          }
          e.destroy(!0);
        }
      }
    };
  v();
  var ol = 0,
    Is,
    nl = class {
      constructor(e) {
        c(this, 'modes');
        f(this, Is);
        h(this, Is, e), (this.modes = [H.none]);
      }
      update(e, t, o, n) {
        if (
          !this.modes.includes(n) ||
          ((e.options.move.distance.horizontal && (t === E.left || t === E.right)) ??
            (e.options.move.distance.vertical && (t === E.top || t === E.bottom)))
        )
          return;
        let s = e.options.move.gravity,
          r = a(this, Is),
          l = r.canvas.size,
          u = e.getRadius();
        if (s.enable) {
          let d = e.position;
          ((!s.inverse && d.y > l.height + u && t === E.bottom) ||
            (s.inverse && d.y < -u && t === E.top)) &&
            e.destroy();
        } else {
          if (
            (e.velocity.y > ol && e.position.y <= l.height + u) ||
            (e.velocity.y < ol && e.position.y >= -u) ||
            (e.velocity.x > ol && e.position.x <= l.width + u) ||
            (e.velocity.x < ol && e.position.x >= -u)
          )
            return;
          wd(e.position, r.canvas.size, O, u, t) || e.destroy();
        }
      }
    };
  Is = new WeakMap();
  v();
  var sl = 0,
    rl = 0,
    zs = ee.origin,
    Es,
    al = class {
      constructor(e) {
        c(this, 'modes');
        f(this, Es);
        h(this, Es, e), (this.modes = [H.out]);
      }
      update(e, t, o, n) {
        if (!this.modes.includes(n)) return;
        let s = a(this, Es);
        switch (e.outType) {
          case we.inside: {
            let { x: r, y: l } = e.velocity;
            zs.setTo(O),
              (zs.length = e.moveCenter.radius),
              (zs.angle = e.velocity.angle + Math.PI),
              zs.addTo(e.moveCenter);
            let { dx: u, dy: d } = K(e.position, zs);
            if (
              (r <= sl && u >= rl) ||
              (l <= sl && d >= rl) ||
              (r >= sl && u <= rl) ||
              (l >= sl && d <= rl)
            )
              return;
            (e.position.x = Math.floor(de({ min: 0, max: s.canvas.size.width }))),
              (e.position.y = Math.floor(de({ min: 0, max: s.canvas.size.height })));
            let { dx: p, dy: m } = K(e.position, e.moveCenter);
            (e.direction = Math.atan2(-m, -p)),
              (e.velocity.angle = e.direction),
              (e.justWarped = !0);
            break;
          }
          default: {
            if (e.isInsideCanvasForOutMode(n, t)) return;
            switch (e.outType) {
              case we.outside: {
                (e.position.x =
                  Math.floor(de({ min: -e.moveCenter.radius, max: e.moveCenter.radius })) +
                  e.moveCenter.x),
                  (e.position.y =
                    Math.floor(de({ min: -e.moveCenter.radius, max: e.moveCenter.radius })) +
                    e.moveCenter.y);
                let { dx: r, dy: l } = K(e.position, e.moveCenter);
                e.moveCenter.radius &&
                  ((e.direction = Math.atan2(l, r)), (e.velocity.angle = e.direction)),
                  (e.justWarped = !0);
                break;
              }
              case we.normal: {
                let r = e.options.move.warp,
                  l = s.canvas.size,
                  u = {
                    bottom: l.height + e.getRadius() + e.offset.y,
                    left: -e.getRadius() - e.offset.x,
                    right: l.width + e.getRadius() + e.offset.x,
                    top: -e.getRadius() - e.offset.y,
                  },
                  d = e.getRadius(),
                  p = Mt(e.position, d);
                t === E.right && p.left > l.width + e.offset.x
                  ? ((e.position.x = u.left),
                    (e.initialPosition.x = e.position.x),
                    r || ((e.position.y = T() * l.height), (e.initialPosition.y = e.position.y)),
                    (e.justWarped = !0))
                  : t === E.left &&
                    p.right < -e.offset.x &&
                    ((e.position.x = u.right),
                    (e.initialPosition.x = e.position.x),
                    r || ((e.position.y = T() * l.height), (e.initialPosition.y = e.position.y)),
                    (e.justWarped = !0)),
                  t === E.bottom && p.top > l.height + e.offset.y
                    ? (r || ((e.position.x = T() * l.width), (e.initialPosition.x = e.position.x)),
                      (e.position.y = u.top),
                      (e.initialPosition.y = e.position.y),
                      (e.justWarped = !0))
                    : t === E.top &&
                      p.bottom < -e.offset.y &&
                      (r || ((e.position.x = T() * l.width), (e.initialPosition.x = e.position.x)),
                      (e.position.y = u.bottom),
                      (e.initialPosition.y = e.position.y),
                      (e.justWarped = !0));
                break;
              }
            }
            break;
          }
        }
      }
    };
  Es = new WeakMap();
  var Ug = (i, e) =>
      i.default === e || i.bottom === e || i.left === e || i.right === e || i.top === e,
    Fs,
    Qi,
    Yi,
    ll = class {
      constructor(e) {
        c(this, 'updaters');
        f(this, Fs);
        f(this, Qi, (e, t, o) => {
          let n = e.options.move.outModes;
          !this.updaters.has(t) && Ug(n, t) && this.updaters.set(t, o(a(this, Fs)));
        });
        f(this, Yi, (e, t, o, n) => {
          for (let s of this.updaters.values()) s.update(e, n, t, o);
        });
        h(this, Fs, e), (this.updaters = new Map());
      }
      init(e) {
        a(this, Qi).call(this, e, H.bounce, (t) => new el(t)),
          a(this, Qi).call(this, e, H.out, (t) => new al(t)),
          a(this, Qi).call(this, e, H.destroy, (t) => new il(t)),
          a(this, Qi).call(this, e, H.none, (t) => new nl(t));
      }
      isEnabled(e) {
        return !e.destroyed && !e.spawning;
      }
      update(e, t) {
        let o = e.options.move.outModes;
        (e.justWarped = !1),
          a(this, Yi).call(this, e, t, o.bottom ?? o.default, E.bottom),
          a(this, Yi).call(this, e, t, o.left ?? o.default, E.left),
          a(this, Yi).call(this, e, t, o.right ?? o.default, E.right),
          a(this, Yi).call(this, e, t, o.top ?? o.default, E.top);
      }
    };
  (Fs = new WeakMap()), (Qi = new WeakMap()), (Yi = new WeakMap());
  async function Th(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        e.pluginManager.addParticleUpdater('outModes', (t) => Promise.resolve(new ll(t)));
      });
  }
  v();
  var ff = 1,
    Ts,
    en,
    cl = class {
      constructor(e, t) {
        f(this, Ts);
        f(this, en);
        h(this, Ts, t), h(this, en, e);
      }
      init(e) {
        let t = a(this, Ts),
          o = e.options,
          n = ne(o.paint, e.id, o.reduceDuplicates),
          s = n?.color,
          r = s ?? void 0,
          l = n?.fill,
          u = n?.stroke;
        if (l) {
          let d = pe.create(r === void 0 ? void 0 : pe.create(void 0, r), l.color);
          (e.fillEnabled = l.enable),
            (e.fillOpacity = P(l.opacity)),
            (e.fillAnimation = d.animation);
          let p = Pt(a(this, en), d);
          p && (e.fillColor = Ru(p, e.fillAnimation, t.retina.reduceFactor));
        } else
          (e.fillEnabled = !1),
            (e.fillAnimation = void 0),
            (e.fillColor = void 0),
            (e.fillOpacity = ff);
        if (u) {
          let d = pe.create(r === void 0 ? void 0 : pe.create(void 0, r), u.color);
          (e.strokeWidth = P(u.width) * t.retina.pixelRatio),
            (e.strokeOpacity = P(u.opacity ?? ff)),
            (e.strokeAnimation = d.animation);
          let p = Pt(a(this, en), d) ?? e.getFillColor();
          p && (e.strokeColor = Ru(p, e.strokeAnimation, t.retina.reduceFactor));
        } else
          (e.strokeAnimation = void 0),
            (e.strokeColor = void 0),
            (e.strokeOpacity = ff),
            (e.strokeWidth = 0);
      }
      isEnabled(e) {
        let { fillAnimation: t, fillColor: o, strokeAnimation: n, strokeColor: s } = e,
          r =
            !!t &&
            ((o?.h.value !== void 0 && o.h.enable) ||
              (o?.s.value !== void 0 && o.s.enable) ||
              (o?.l.value !== void 0 && o.l.enable)),
          l =
            !!n &&
            ((s?.h.value !== void 0 && s.h.enable) ||
              (s?.s.value !== void 0 && s.s.enable) ||
              (s?.l.value !== void 0 && s.l.enable));
        return !e.destroyed && !e.spawning && (r || l);
      }
      update(e, t) {
        this.isEnabled(e) && (Du(e.fillColor, t), Du(e.strokeColor, t));
      }
    };
  (Ts = new WeakMap()), (en = new WeakMap());
  async function ul(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        e.pluginManager.addParticleUpdater('paint', (t) =>
          Promise.resolve(new cl(e.pluginManager, t)),
        );
      });
  }
  v();
  var tn;
  (function (i) {
    (i[(i.r = 1)] = 'r'), (i[(i.g = 2)] = 'g'), (i[(i.b = 3)] = 'b'), (i[(i.a = 5)] = 'a');
  })(tn || (tn = {}));
  var Hg =
      /rgba?\(\s*(\d{1,3})\s*[\s,]\s*(\d{1,3})\s*[\s,]\s*(\d{1,3})\s*([\s,]\s*(0|1|0?\.\d+|(\d{1,3})%)\s*)?\)/i,
    fl = class {
      accepts(e) {
        return e.startsWith('rgb');
      }
      handleColor(e) {
        let t = e.value,
          o = t.rgb ?? e.value;
        if (!(!('r' in o) || !('g' in o) || !('b' in o))) return o;
      }
      handleRangeColor(e) {
        let t = e.value,
          o = t.rgb ?? e.value;
        if (!(!('r' in o) || !('g' in o) || !('b' in o)))
          return { r: P(o.r), g: P(o.g), b: P(o.b) };
      }
      parseString(e) {
        if (!this.accepts(e)) return;
        let t = Hg.exec(e),
          o = 10;
        return t
          ? {
              a: t.length > 4 ? vr(t[tn.a]) : 1,
              b: parseInt(t[tn.b] ?? '0', o),
              g: parseInt(t[tn.g] ?? '0', o),
              r: parseInt(t[tn.r] ?? '0', o),
            }
          : void 0;
      }
    };
  async function Ah(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        e.pluginManager.addColorManager('rgb', new fl());
      });
  }
  v();
  v();
  v();
  var dl = class extends $t {
    constructor() {
      super();
      c(this, 'destroy');
      (this.destroy = qe.none), (this.speed = 5);
    }
    load(t) {
      super.load(t), !x(t) && t.destroy !== void 0 && (this.destroy = t.destroy);
    }
  };
  var hl = class extends Fo {
    constructor() {
      super();
      c(this, 'animation');
      (this.animation = new dl()), (this.value = 3);
    }
    load(t) {
      if ((super.load(t), x(t))) return;
      let o = t.animation;
      o !== void 0 && this.animation.load(o);
    }
  };
  var on = 0,
    nn,
    pl = class {
      constructor(e) {
        f(this, nn);
        h(this, nn, e);
      }
      init(e) {
        let t = a(this, nn),
          o = e.options.size;
        if (!o) return;
        let n = o.animation;
        n.enable &&
          ((e.size.velocity = (e.retina.sizeAnimationSpeed / 100) * t.retina.reduceFactor),
          !n.sync && (e.size.velocity *= T()));
      }
      isEnabled(e) {
        return (
          !e.destroyed &&
          !e.spawning &&
          e.size.enable &&
          ((e.size.maxLoops ?? on) <= on ||
            ((e.size.maxLoops ?? on) > on && (e.size.loops ?? on) < (e.size.maxLoops ?? on)))
        );
      }
      loadOptions(e, ...t) {
        e.size ?? (e.size = new hl());
        for (let o of t) e.size.load(o?.size);
      }
      preInit(e) {
        let t = a(this, nn).retina.pixelRatio,
          o = e.options,
          n = o.size;
        n && ((e.size = Or(n, t)), (e.retina.sizeAnimationSpeed = P(n.animation.speed) * t));
      }
      reset(e) {
        (e.size.time = 0), (e.size.loops = 0);
      }
      update(e, t) {
        !this.isEnabled(e) ||
          !e.options.size ||
          yo(e, e.size, !0, e.options.size.animation.destroy, t);
      }
    };
  nn = new WeakMap();
  async function Lh(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        e.pluginManager.addParticleUpdater('size', (t) => Promise.resolve(new pl(t)));
      });
  }
  async function Bh(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register(async (e) => {
        await Promise.all([hh(e), yh(e), xh(e), Ah(e), Dh(e), gh(e), ul(e), Ih(e), Th(e), Lh(e)]);
      });
  }
  v();
  var As = new Map();
  As.set(it.easeInQuad, (i) => i ** 2);
  As.set(it.easeOutQuad, (i) => 1 - (1 - i) ** 2);
  As.set(it.easeInOutQuad, (i) => (i < 0.5 ? 2 * i ** 2 : 1 - (-2 * i + 2) ** 2 / 2));
  async function Vh(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        for (let [t, o] of As) e.pluginManager.addEasing(t, o);
      });
  }
  v();
  v();
  var Ls = ['emoji'];
  function Nh(i, e) {
    let { context: t, opacity: o } = i,
      n = t.globalAlpha,
      s = e.width,
      r = s * 0.5;
    (t.globalAlpha = o), t.drawImage(e, -r, -r, s, s), (t.globalAlpha = n);
  }
  v();
  var qg = 255,
    TC = He / qg;
  function ml(i, e, t) {
    i.beginPath(), i.moveTo(e.x, e.y), i.lineTo(t.x, t.y), i.closePath();
  }
  async function df(i, e) {
    try {
      await Z().fonts.load(`${e ?? '400'} 36px '${i ?? 'Verdana'}'`);
    } catch {}
  }
  var hf = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
    Uh = 0,
    $g = 0,
    ti,
    gl = class {
      constructor() {
        f(this, ti, new Map());
      }
      destroy() {
        for (let [e, t] of a(this, ti))
          t instanceof ImageBitmap && t.close(), a(this, ti).delete(e);
      }
      draw(e) {
        let t = e.particle.emojiDataKey;
        if (!t) return;
        let o = a(this, ti).get(t);
        o && Nh(e, o);
      }
      async init(e) {
        let t = e.actualOptions,
          o = t.particles.shape;
        if (!Ls.some((r) => A(r, o.type))) return;
        let n = [df(hf)],
          s = Ls.map((r) => o.options[r])[$g];
        j(s, (r) => {
          r.font && n.push(df(r.font));
        }),
          await Promise.all(n);
      }
      particleDestroy(e) {
        e.emojiDataKey = void 0;
      }
      particleInit(e, t) {
        let o = t.shapeData;
        if (!o.value) return;
        let n = ne(o.value, t.randomIndexData);
        if (!n) return;
        let s =
            typeof n == 'string'
              ? { font: o.font ?? hf, padding: o.padding ?? Uh, value: n }
              : { font: hf, padding: Uh, ...o, ...n },
          r = s.font,
          l = s.value,
          u = `${l}_${r}`;
        if (a(this, ti).has(u)) {
          t.emojiDataKey = u;
          return;
        }
        let d = s.padding * I,
          p = po(t.size.value),
          m = p + d,
          g = m * I,
          y = new OffscreenCanvas(g, g),
          b = y.getContext('2d', e.canvas.render.settings);
        if (!b) return;
        (b.font = `400 ${(p * I).toString()}px ${r}`),
          (b.textBaseline = 'middle'),
          (b.textAlign = 'center'),
          b.fillText(l, m, m);
        let k = y instanceof HTMLCanvasElement ? y : y.transferToImageBitmap();
        a(this, ti).set(u, k), (t.emojiDataKey = u);
      }
    };
  ti = new WeakMap();
  async function Hh(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        e.pluginManager.addShape(Ls, () => Promise.resolve(new gl()));
      });
  }
  v();
  v();
  yf();
  var ri,
    Al = class {
      constructor(e) {
        c(this, 'id', 'interactivity');
        f(this, ri);
        h(this, ri, e);
      }
      async getPlugin(e) {
        let { InteractivityPluginInstance: t } = await Promise.resolve().then(() => (Xh(), _h));
        return new t(a(this, ri), e);
      }
      loadOptions(e, t, o) {
        if (!this.needsPlugin()) return;
        let n = t.interactivity;
        n?.load || (t.interactivity = n = new rn(a(this, ri), e)), n.load(o?.interactivity);
        let s = a(this, ri).interactors?.get(e);
        if (s) for (let r of s) r.loadOptions && r.loadOptions(t, o);
      }
      loadParticlesOptions(e, t, o) {
        o?.interactivity && (t.interactivity = G({}, o.interactivity));
        let n = a(this, ri).interactors?.get(e);
        if (n) for (let s of n) s.loadParticlesOptions?.(t, o);
      }
      needsPlugin() {
        return !0;
      }
    };
  ri = new WeakMap();
  $s();
  var $ = class {
    constructor(e) {
      c(this, 'type', pt.external);
      c(this, 'container');
      this.container = e;
    }
  };
  $s();
  var ai = class {
    constructor(e) {
      c(this, 'type', pt.particles);
      c(this, 'container');
      this.container = e;
    }
  };
  Cl();
  pf();
  vl();
  $s();
  v();
  function Qg(i, e) {
    let t = j(e, (o) => i.matches(o));
    return X(t) ? t.some((o) => o) : t;
  }
  function li(i, e) {
    return !!bu(e, (t) => t.enable && A(i, t.mode));
  }
  function ci(i, e, t) {
    j(e, (o) => {
      let n = o.mode;
      o.enable && A(i, n) && Yg(o, t);
    });
  }
  function Yg(i, e) {
    let t = i.selectors;
    j(t, (o) => {
      e(o, i);
    });
  }
  function Ll(i, e) {
    if (!(!e || !i)) return bu(i, (t) => Qg(e, t.selectors));
  }
  mf();
  gf();
  async function Kh(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        var n;
        let t = e,
          o = t.pluginManager;
        o.addPlugin(new Al(o)),
          (n = o.initializers).interactors ?? (n.interactors = new Map()),
          o.interactors ?? (o.interactors = new Map()),
          (o.addInteractor = (s, r) => {
            var l;
            (l = o.initializers).interactors ?? (l.interactors = new Map()),
              o.initializers.interactors.set(s, r);
          }),
          (o.getInteractors = async (s, r = !1) => {
            var l;
            return (
              o.interactors ?? (o.interactors = new Map()),
              (l = o.initializers).interactors ?? (l.interactors = new Map()),
              Rr(s, o.interactors, o.initializers.interactors, r)
            );
          }),
          (o.setOnClickHandler = (s) => {
            let { items: r } = t;
            if (!r.length)
              throw new Error('Click handlers can only be set after calling tsParticles.load()');
            r.forEach((l) => {
              l.addClickHandler?.(s);
            });
          });
      });
  }
  function N(i) {
    if (!i.pluginManager.addInteractor)
      throw new Error('tsParticles Interactivity Plugin is not loaded');
  }
  v();
  v();
  var _g = 1,
    Zh = 0,
    wf = ee.origin;
  function Jh(i, e, t, o, n, s, r) {
    let l = e.actualOptions.interactivity?.modes.attract;
    if (!l) return;
    let u = e.particles.grid.query(n, s);
    for (let d of u) {
      let { dx: p, dy: m, distance: g } = K(d.position, t),
        y = l.speed * l.factor,
        b = Y(i.getEasing(l.easing)(He - g / o) * y, _g, l.maxSpeed);
      (wf.x = g ? (p / g) * b : y), (wf.y = g ? (m / g) * b : y), r?.(d), d.position.subFrom(wf);
    }
  }
  function ep(i, e, t, o, n) {
    e.attract ?? (e.attract = { particles: [] });
    let { attract: s } = e;
    if (
      (s.finish ||
        (s.count ?? (s.count = 0), s.count++, s.count === e.particles.count && (s.finish = !0)),
      s.clicking)
    ) {
      let r = t.mouse.clickPosition,
        l = e.retina.attractModeDistance;
      if (!l || l < Zh || !r) return;
      Jh(i, e, r, l, new q(r.x, r.y, l), (u) => o(u), n);
    } else s.clicking === !1 && (s.particles = []);
  }
  function tp(i, e, t, o, n) {
    let s = t.mouse.position,
      r = e.retina.attractModeDistance;
    !r || r < Zh || !s || Jh(i, e, s, r, new q(s.x, s.y, r), (l) => o(l), n);
  }
  v();
  var Bl = class {
    constructor() {
      c(this, 'distance');
      c(this, 'duration');
      c(this, 'easing');
      c(this, 'factor');
      c(this, 'maxSpeed');
      c(this, 'restore');
      c(this, 'speed');
      (this.distance = 200),
        (this.duration = 0.4),
        (this.easing = it.easeOutQuad),
        (this.factor = 1),
        (this.maxSpeed = 50),
        (this.speed = 1),
        (this.restore = { enable: !1, delay: 0, speed: 0.08, follow: !0 });
    }
    load(e) {
      x(e) ||
        (e.distance !== void 0 && (this.distance = e.distance),
        e.duration !== void 0 && (this.duration = e.duration),
        e.easing !== void 0 && (this.easing = e.easing),
        e.factor !== void 0 && (this.factor = e.factor),
        e.maxSpeed !== void 0 && (this.maxSpeed = e.maxSpeed),
        e.speed !== void 0 && (this.speed = e.speed),
        e.restore !== void 0 &&
          ((this.restore.enable = e.restore.enable ?? this.restore.enable),
          (this.restore.delay = e.restore.delay ?? this.restore.delay),
          (this.restore.speed = e.restore.speed ?? this.restore.speed),
          (this.restore.follow = e.restore.follow ?? this.restore.follow)));
    }
  };
  var Gs = 'attract',
    Xg = 0,
    Kg = 0.001,
    Zg = 1,
    ip = 0.5,
    to,
    fn,
    dn,
    rt,
    io,
    op,
    Mf,
    Vl = class extends $ {
      constructor(t, o) {
        super(o);
        f(this, io);
        c(this, 'handleClickMode');
        f(this, to);
        f(this, fn);
        f(this, dn);
        f(this, rt);
        h(this, dn, t),
          h(this, fn, 0),
          h(this, to, new Set()),
          h(this, rt, new Map()),
          o.attract ?? (o.attract = { particles: [] }),
          (this.handleClickMode = (n, s) => {
            let r = this.container.actualOptions,
              l = r.interactivity?.modes.attract;
            if (!(!l || n !== Gs)) {
              o.attract ?? (o.attract = { particles: [] }),
                (o.attract.clicking = !0),
                (o.attract.count = 0);
              for (let u of o.attract.particles)
                this.isEnabled(s, u) && u.velocity.setTo(u.initialVelocity);
              (o.attract.particles = []),
                (o.attract.finish = !1),
                setTimeout(() => {
                  o.destroyed ||
                    (o.attract ?? (o.attract = { particles: [] }), (o.attract.clicking = !1));
                }, l.duration * 1e3);
            }
          });
      }
      get maxDistance() {
        return a(this, fn);
      }
      clear() {}
      init() {
        let t = this.container,
          o = t.actualOptions.interactivity?.modes.attract;
        o &&
          (h(this, fn, o.distance),
          (t.retina.attractModeDistance = o.distance * t.retina.pixelRatio));
      }
      interact(t) {
        a(this, to).clear();
        let o = this.container,
          n = o.actualOptions,
          s = t.status === be,
          r = n.interactivity?.events;
        if (!r) return;
        let { enable: l, mode: u } = r.onHover,
          { enable: d, mode: p } = r.onClick;
        s && l && A(Gs, u)
          ? tp(
              a(this, dn),
              this.container,
              t,
              (m) => this.isEnabled(t, m),
              (m) => {
                L(this, io, Mf).call(this, m);
              },
            )
          : d &&
            A(Gs, p) &&
            ep(
              a(this, dn),
              this.container,
              t,
              (m) => this.isEnabled(t, m),
              (m) => {
                L(this, io, Mf).call(this, m);
              },
            ),
          L(this, io, op).call(this);
      }
      isEnabled(t, o) {
        let n = this.container,
          s = n.actualOptions,
          r = t.mouse,
          l = (o?.interactivity ?? s.interactivity)?.events;
        if ((!r.position || !l?.onHover.enable) && (!r.clickPosition || !l?.onClick.enable))
          return !1;
        let u = l.onHover.mode,
          d = l.onClick.mode;
        return A(Gs, u) || A(Gs, d);
      }
      loadModeOptions(t, ...o) {
        t.attract ?? (t.attract = new Bl());
        for (let n of o) t.attract.load(n?.attract);
      }
      reset() {}
    };
  (to = new WeakMap()),
    (fn = new WeakMap()),
    (dn = new WeakMap()),
    (rt = new WeakMap()),
    (io = new WeakSet()),
    (op = function () {
      let t = this.container.actualOptions.interactivity?.modes.attract?.restore;
      if (!t?.enable || !a(this, rt).size) return;
      let o = Date.now(),
        n = t.delay * 1e3,
        s = Math.max(Kg, Math.min(Zg, t.speed));
      for (let [r, l] of a(this, rt)) {
        if (a(this, to).has(r)) continue;
        if (r.destroyed) {
          a(this, rt).delete(r);
          continue;
        }
        let u = l.target;
        if (o - l.lastInteractionTime < n) continue;
        let d = u.x - r.position.x,
          p = u.y - r.position.y,
          m = u.z - r.position.z;
        if (t.follow && r.options.move.enable) {
          let { x: g, y, z: b } = r.velocity,
            k = g * g + y * y + b * b;
          if (k > Xg) {
            let M = (d * g + p * y + m * b) / k;
            (d -= g * M), (p -= y * M), (m -= b * M);
          }
        }
        if (
          ((r.position.x += d * s),
          (r.position.y += p * s),
          (r.position.z += m * s),
          Math.abs(d) <= ip && Math.abs(p) <= ip)
        ) {
          (r.position.x = u.x), (r.position.y = u.y), (r.position.z = u.z), a(this, rt).delete(r);
          continue;
        }
      }
    }),
    (Mf = function (t) {
      if (
        (a(this, to).add(t),
        !this.container.actualOptions.interactivity?.modes.attract?.restore?.enable)
      )
        return;
      let n = Date.now(),
        s = a(this, rt).get(t);
      s || ((s = { target: t.position.copy(), lastInteractionTime: n }), a(this, rt).set(t, s)),
        (s.lastInteractionTime = n);
    });
  async function np(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        N(e),
          e.pluginManager.addInteractor?.('externalAttract', (t) =>
            Promise.resolve(new Vl(e.pluginManager, t)),
          );
      });
  }
  v();
  v();
  var Jg = 2,
    ey = Math.PI * 0.5,
    ap = 10,
    ty = 0,
    sp = 0;
  function lp(i, e, t, o, n) {
    let s = i.particles.grid.query(o, n);
    for (let r of s)
      o instanceof q
        ? Sr($n(r), {
            position: e,
            radius: t,
            mass: t ** Jg * ey,
            velocity: ee.origin,
            factor: ee.origin,
          })
        : o instanceof ce && oy(r, Mt(e, t));
  }
  function iy(i, e, t, o) {
    let n = Z().querySelectorAll(e);
    n.length &&
      n.forEach((s) => {
        let r = s,
          l = i.retina.pixelRatio,
          u = {
            x: (r.offsetLeft + r.offsetWidth * 0.5) * l,
            y: (r.offsetTop + r.offsetHeight * 0.5) * l,
          },
          d = r.offsetWidth * 0.5 * l,
          p = ap * l,
          m =
            t.type === Te.circle
              ? new q(u.x, u.y, d + p)
              : new ce(
                  r.offsetLeft * l - p,
                  r.offsetTop * l - p,
                  r.offsetWidth * l + p * I,
                  r.offsetHeight * l + p * I,
                );
        o(u, d, m);
      });
  }
  function cp(i, e, t, o) {
    ci(t, e, (n, s) => {
      iy(i, n, s, (r, l, u) => {
        lp(i, r, l, u, o);
      });
    });
  }
  function up(i, e, t) {
    let o = i.retina.pixelRatio,
      n = ap * o,
      s = e.mouse.position,
      r = i.retina.bounceModeDistance;
    !r || r < ty || !s || lp(i, s, r, new q(s.x, s.y, r + n), t);
  }
  function rp(i) {
    let e = { bounced: !1 },
      { pSide: t, pOtherSide: o, rectSide: n, rectOtherSide: s, velocity: r, factor: l } = i;
    return (
      o.min < s.min ||
        o.min > s.max ||
        o.max < s.min ||
        o.max > s.max ||
        (((t.max >= n.min && t.max <= (n.max + n.min) * 0.5 && r > sp) ||
          (t.min <= n.max && t.min > (n.max + n.min) * 0.5 && r < sp)) &&
          ((e.velocity = r * -l), (e.bounced = !0))),
      e
    );
  }
  function oy(i, e) {
    let t = i.getPosition(),
      o = i.getRadius(),
      n = Mt(t, o),
      s = i.options.bounce,
      r = rp({
        pSide: { min: n.left, max: n.right },
        pOtherSide: { min: n.top, max: n.bottom },
        rectSide: { min: e.left, max: e.right },
        rectOtherSide: { min: e.top, max: e.bottom },
        velocity: i.velocity.x,
        factor: P(s.horizontal.value),
      });
    r.bounced &&
      (r.velocity !== void 0 && (i.velocity.x = r.velocity),
      r.position !== void 0 && (i.position.x = r.position));
    let l = rp({
      pSide: { min: n.top, max: n.bottom },
      pOtherSide: { min: n.left, max: n.right },
      rectSide: { min: e.top, max: e.bottom },
      rectOtherSide: { min: e.left, max: e.right },
      velocity: i.velocity.y,
      factor: P(s.vertical.value),
    });
    l.bounced &&
      (l.velocity !== void 0 && (i.velocity.y = l.velocity),
      l.position !== void 0 && (i.position.y = l.position));
  }
  v();
  var Nl = class {
    constructor() {
      c(this, 'distance');
      this.distance = 200;
    }
    load(e) {
      x(e) || (e.distance !== void 0 && (this.distance = e.distance));
    }
  };
  var Ul = 'bounce',
    hn,
    Hl = class extends $ {
      constructor(t) {
        super(t);
        f(this, hn);
        h(this, hn, 0);
      }
      get maxDistance() {
        return a(this, hn);
      }
      clear() {}
      init() {
        let t = this.container,
          o = t.actualOptions.interactivity?.modes.bounce;
        o &&
          (h(this, hn, o.distance),
          (t.retina.bounceModeDistance = o.distance * t.retina.pixelRatio));
      }
      interact(t) {
        let o = this.container,
          n = o.actualOptions,
          s = n.interactivity?.events,
          r = t.status === be;
        if (!s) return;
        let l = s.onHover.enable,
          u = s.onHover.mode,
          d = s.onDiv;
        r && l && A(Ul, u)
          ? up(this.container, t, (p) => this.isEnabled(t, p))
          : cp(this.container, d, Ul, (p) => this.isEnabled(t, p));
      }
      isEnabled(t, o) {
        let n = this.container,
          s = n.actualOptions,
          r = t.mouse,
          l = (o?.interactivity ?? s.interactivity)?.events;
        if (!l) return !1;
        let u = l.onDiv;
        return (!!r.position && l.onHover.enable && A(Ul, l.onHover.mode)) || li(Ul, u);
      }
      loadModeOptions(t, ...o) {
        t.bounce ?? (t.bounce = new Nl());
        for (let n of o) t.bounce.load(n?.bounce);
      }
      reset() {}
    };
  hn = new WeakMap();
  async function fp(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        N(e), e.pluginManager.addInteractor?.('externalBounce', (t) => Promise.resolve(new Hl(t)));
      });
  }
  v();
  v();
  v();
  var pn = class {
    constructor() {
      c(this, 'color');
      c(this, 'distance');
      c(this, 'duration');
      c(this, 'mix');
      c(this, 'opacity');
      c(this, 'size');
      (this.distance = 200), (this.duration = 0.4), (this.mix = !1);
    }
    load(e) {
      if (!x(e)) {
        if (
          (e.distance !== void 0 && (this.distance = e.distance),
          e.duration !== void 0 && (this.duration = e.duration),
          e.mix !== void 0 && (this.mix = e.mix),
          e.opacity !== void 0 && (this.opacity = e.opacity),
          e.color !== void 0)
        ) {
          let t = X(this.color) ? void 0 : this.color;
          this.color = j(e.color, (o) => ie.create(t, o));
        }
        e.size !== void 0 && (this.size = e.size);
      }
    }
  };
  v();
  var ql = class extends pn {
    constructor() {
      super();
      c(this, 'selectors');
      this.selectors = [];
    }
    load(t) {
      super.load(t), !x(t) && t.selectors !== void 0 && (this.selectors = t.selectors);
    }
  };
  var $l = class extends pn {
    constructor() {
      super(...arguments);
      c(this, 'divs');
    }
    load(t) {
      super.load(t),
        !x(t) &&
          (this.divs = j(t.divs, (o) => {
            let n = new ql();
            return n.load(o), n;
          }));
    }
  };
  var je;
  (function (i) {
    (i.color = 'color'), (i.opacity = 'opacity'), (i.size = 'size');
  })(je || (je = {}));
  v();
  function kf(i, e, t, o) {
    if (e >= t) {
      let n = i + (e - t) * o;
      return Y(n, i, e);
    } else if (e < t) {
      let n = i - (t - e) * o;
      return Y(n, e, i);
    }
  }
  var oo = 'bubble',
    Pf = 0,
    ny = 0,
    Wl = 1,
    dp = 1,
    sy = 0,
    ry = 0,
    Cf = 1,
    mn,
    js,
    jl,
    Ql,
    gn,
    Qs,
    Ys,
    _s,
    Yl,
    Gl = class extends $ {
      constructor(t, o) {
        super(o);
        c(this, 'handleClickMode');
        f(this, mn);
        f(this, js);
        f(this, jl, (t) => {
          let o = this.container,
            n = o.actualOptions,
            s = t.mouse.clickPosition,
            r = n.interactivity?.modes.bubble;
          if (!r || !s) return;
          o.bubble ?? (o.bubble = {});
          let l = o.retina.bubbleModeDistance;
          if (!l || l < Pf) return;
          let u = o.particles.grid.queryCircle(s, l, (p) => this.isEnabled(t, p)),
            { bubble: d } = o;
          for (let p of u) {
            if (!d.clicking) continue;
            p.bubble.inRange = !d.durationEnd;
            let m = p.getPosition(),
              g = Se(m, s),
              y = (performance.now() - (t.mouse.clickTime ?? ny)) / 1e3;
            y > r.duration && (d.durationEnd = !0),
              y > r.duration * I && ((d.clicking = !1), (d.durationEnd = !1));
            let b = {
              bubbleObj: { optValue: o.retina.bubbleModeSize, value: p.bubble.radius },
              particlesObj: { optValue: p.size.max, value: p.size.value },
              type: je.size,
            };
            a(this, _s).call(this, p, g, y, b);
            let k = {
              bubbleObj: { optValue: r.opacity, value: p.bubble.opacity },
              particlesObj: { optValue: p.opacity?.max ?? Wl, value: p.opacity?.value ?? Wl },
              type: je.opacity,
            };
            a(this, _s).call(this, p, g, y, k),
              !d.durationEnd && g <= l ? a(this, gn).call(this, p, g) : delete p.bubble.color;
          }
        });
        f(this, Ql, (t) => {
          let o = this.container,
            n = t.mouse.position,
            s = o.retina.bubbleModeDistance;
          if (!s || s < Pf || !n) return;
          let r = o.particles.grid.queryCircle(n, s, (l) => this.isEnabled(t, l));
          for (let l of r) {
            l.bubble.inRange = !0;
            let u = l.getPosition(),
              d = Se(u, n),
              p = dp - d / s;
            d <= s
              ? p >= ry &&
                t.status === be &&
                (a(this, Ys).call(this, l, p),
                a(this, Qs).call(this, l, p),
                a(this, gn).call(this, l, p))
              : this.reset(t, l),
              t.status === Ns && this.reset(t, l);
          }
        });
        f(this, gn, (t, o, n) => {
          let s = this.container.actualOptions,
            r = n ?? s.interactivity?.modes.bubble;
          if (r) {
            if (!t.bubble.finalColor) {
              let l = r.color;
              if (!l) return;
              let u = ne(l);
              t.bubble.finalColor = Pt(a(this, js), u);
            }
            if (t.bubble.finalColor)
              if (r.mix) {
                t.bubble.color = void 0;
                let l = t.getFillColor();
                t.bubble.color = l
                  ? Su(_n(l, t.bubble.finalColor, dp - o, o))
                  : t.bubble.finalColor;
              } else t.bubble.color = t.bubble.finalColor;
          }
        });
        f(this, Qs, (t, o, n) => {
          let s = this.container,
            r = s.actualOptions,
            l = n?.opacity ?? r.interactivity?.modes.bubble?.opacity;
          if (!l) return;
          let u = t.opacity?.value ?? Wl,
            d = kf(u, l, t.opacity?.max ?? Wl, o);
          d !== void 0 && (t.bubble.opacity = d);
        });
        f(this, Ys, (t, o, n) => {
          let s = this.container,
            r = n?.size ? n.size * s.retina.pixelRatio : s.retina.bubbleModeSize;
          if (r === void 0) return;
          let l = t.size.value,
            u = kf(l, r, t.size.max, o);
          u !== void 0 && (t.bubble.radius = u);
        });
        f(this, _s, (t, o, n, s) => {
          let r = this.container,
            l = s.bubbleObj.optValue,
            u = r.actualOptions,
            d = u.interactivity?.modes.bubble;
          if (!d || l === void 0) return;
          let p = d.duration,
            m = r.retina.bubbleModeDistance,
            g = s.particlesObj.optValue,
            y = s.bubbleObj.value,
            b = s.particlesObj.value ?? sy,
            k = s.type;
          if (!(!m || m < Pf || l === g))
            if ((r.bubble ?? (r.bubble = {}), r.bubble.durationEnd))
              y &&
                (k === je.size && delete t.bubble.radius,
                k === je.opacity && delete t.bubble.opacity);
            else if (o <= m) {
              if ((y ?? b) !== l) {
                let C = b - (n * (b - l)) / p;
                k === je.size && (t.bubble.radius = C), k === je.opacity && (t.bubble.opacity = C);
              }
            } else
              k === je.size && delete t.bubble.radius, k === je.opacity && delete t.bubble.opacity;
        });
        f(this, Yl, (t, o, n, s) => {
          let r = this.container,
            l = Z().querySelectorAll(n),
            u = r.actualOptions.interactivity?.modes.bubble;
          !u ||
            !l.length ||
            l.forEach((d) => {
              let p = d,
                m = r.retina.pixelRatio,
                g = {
                  x: (p.offsetLeft + p.offsetWidth * 0.5) * m,
                  y: (p.offsetTop + p.offsetHeight * 0.5) * m,
                },
                y = p.offsetWidth * 0.5 * m,
                b =
                  s.type === Te.circle
                    ? new q(g.x, g.y, y)
                    : new ce(
                        p.offsetLeft * m,
                        p.offsetTop * m,
                        p.offsetWidth * m,
                        p.offsetHeight * m,
                      ),
                k = r.particles.grid.query(b, (M) => this.isEnabled(t, M));
              for (let M of k) {
                if (!b.contains(M.getPosition())) continue;
                M.bubble.inRange = !0;
                let C = u.divs,
                  S = Ll(C, p);
                (!M.bubble.div || M.bubble.div !== p) && (this.clear(M, o, !0), (M.bubble.div = p)),
                  a(this, Ys).call(this, M, Cf, S),
                  a(this, Qs).call(this, M, Cf, S),
                  a(this, gn).call(this, M, Cf, S);
              }
            });
        });
        h(this, js, t),
          h(this, mn, 0),
          o.bubble ?? (o.bubble = {}),
          (this.handleClickMode = (n) => {
            n === oo && (o.bubble ?? (o.bubble = {}), (o.bubble.clicking = !0));
          });
      }
      get maxDistance() {
        return a(this, mn);
      }
      clear(t, o, n) {
        (t.bubble.inRange && !n) ||
          (delete t.bubble.div,
          delete t.bubble.opacity,
          delete t.bubble.radius,
          delete t.bubble.color);
      }
      init() {
        let t = this.container,
          o = t.actualOptions.interactivity?.modes.bubble;
        o &&
          (h(this, mn, o.distance),
          (t.retina.bubbleModeDistance = o.distance * t.retina.pixelRatio),
          o.size !== void 0 && (t.retina.bubbleModeSize = o.size * t.retina.pixelRatio));
      }
      interact(t, o) {
        let n = this.container.actualOptions,
          s = n.interactivity?.events;
        if (!s) return;
        let r = s.onHover,
          l = s.onClick,
          u = r.enable,
          d = r.mode,
          p = l.enable,
          m = l.mode,
          g = s.onDiv;
        u && A(oo, d)
          ? a(this, Ql).call(this, t)
          : p && A(oo, m)
            ? a(this, jl).call(this, t)
            : ci(oo, g, (y, b) => {
                a(this, Yl).call(this, t, o, y, b);
              });
      }
      isEnabled(t, o) {
        let n = this.container,
          s = n.actualOptions,
          r = t.mouse,
          l = (o?.interactivity ?? s.interactivity)?.events;
        if (!l) return !1;
        let { onClick: u, onDiv: d, onHover: p } = l,
          m = li(oo, d);
        return m || (p.enable && r.position) || (u.enable && r.clickPosition)
          ? A(oo, p.mode) || A(oo, u.mode) || m
          : !1;
      }
      loadModeOptions(t, ...o) {
        t.bubble ?? (t.bubble = new $l());
        for (let n of o) t.bubble.load(n?.bubble);
      }
      reset(t, o) {
        o.bubble.inRange = !1;
      }
    };
  (mn = new WeakMap()),
    (js = new WeakMap()),
    (jl = new WeakMap()),
    (Ql = new WeakMap()),
    (gn = new WeakMap()),
    (Qs = new WeakMap()),
    (Ys = new WeakMap()),
    (_s = new WeakMap()),
    (Yl = new WeakMap());
  async function hp(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        N(e),
          e.pluginManager.addInteractor?.('externalBubble', (t) =>
            Promise.resolve(new Gl(e.pluginManager, t)),
          );
      });
  }
  v();
  v();
  v();
  var _l = class {
    constructor() {
      c(this, 'opacity');
      this.opacity = 0.5;
    }
    load(e) {
      x(e) || (e.opacity !== void 0 && (this.opacity = e.opacity));
    }
  };
  var Xl = class {
    constructor() {
      c(this, 'distance');
      c(this, 'links');
      c(this, 'radius');
      (this.distance = 80), (this.links = new _l()), (this.radius = 60);
    }
    load(e) {
      x(e) ||
        (e.distance !== void 0 && (this.distance = e.distance),
        this.links.load(e.links),
        e.radius !== void 0 && (this.radius = e.radius));
    }
  };
  v();
  var pp = 0,
    mp = 1,
    ay = 0;
  function ly(i, e, t, o, n) {
    let s = Math.floor(o.getRadius() / t.getRadius()),
      r = t.getFillColor(),
      l = o.getFillColor();
    if (!r || !l) return;
    let u = t.getPosition(),
      d = o.getPosition(),
      p = _n(r, l, t.getRadius(), o.getRadius()),
      m = e.createLinearGradient(u.x, u.y, d.x, d.y);
    return (
      m.addColorStop(pp, St(r, i.hdr, n)),
      m.addColorStop(Y(s, pp, mp), Ct(p, i.hdr, n)),
      m.addColorStop(mp, St(l, i.hdr, n)),
      m
    );
  }
  function cy(i, e, t, o, n) {
    ml(i, o, n), (i.lineWidth = e), (i.strokeStyle = t), i.stroke();
  }
  function uy(i, e, t, o) {
    let n = i.actualOptions,
      s = n.interactivity?.modes.connect;
    if (s) return ly(i, e, t, o, s.links.opacity);
  }
  function gp(i, e, t) {
    i.canvas.render.draw((o) => {
      let n = uy(i, o, e, t);
      if (!n) return;
      let s = e.getPosition(),
        r = t.getPosition();
      cy(o, e.retina.linksWidth ?? ay, n, s, r);
    });
  }
  var fy = 'connect',
    yp = 0,
    yn,
    Kl = class extends $ {
      constructor(t) {
        super(t);
        f(this, yn);
        h(this, yn, 0);
      }
      get maxDistance() {
        return a(this, yn);
      }
      clear() {}
      init() {
        let t = this.container,
          o = t.actualOptions.interactivity?.modes.connect;
        o &&
          (h(this, yn, o.distance),
          (t.retina.connectModeDistance = o.distance * t.retina.pixelRatio),
          (t.retina.connectModeRadius = o.radius * t.retina.pixelRatio));
      }
      interact(t) {
        let o = this.container;
        if (o.actualOptions.interactivity?.events.onHover.enable && t.status === 'pointermove') {
          let s = t.mouse.position,
            { connectModeDistance: r, connectModeRadius: l } = o.retina;
          if (!r || r < yp || !l || l < yp || !s) return;
          let u = Math.abs(l),
            d = o.particles.grid.queryCircle(s, u, (p) => this.isEnabled(t, p));
          d.forEach((p, m) => {
            let g = p.getPosition(),
              y = 1;
            for (let b of d.slice(m + y)) {
              let k = b.getPosition(),
                M = Math.abs(r),
                C = Math.abs(g.x - k.x),
                S = Math.abs(g.y - k.y);
              C < M && S < M && gp(o, p, b);
            }
          });
        }
      }
      isEnabled(t, o) {
        let n = this.container,
          s = t.mouse,
          r = (o?.interactivity ?? n.actualOptions.interactivity)?.events;
        return r?.onHover.enable && s.position ? A(fy, r.onHover.mode) : !1;
      }
      loadModeOptions(t, ...o) {
        t.connect ?? (t.connect = new Xl());
        for (let n of o) t.connect.load(n?.connect);
      }
      reset() {}
    };
  yn = new WeakMap();
  async function xp(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        N(e), e.pluginManager.addInteractor?.('externalConnect', (t) => Promise.resolve(new Kl(t)));
      });
  }
  v();
  v();
  var Sf = 0.5,
    bp = 10,
    dy = 0;
  function vp(i, e) {
    let t = i.particles.grid.query(e);
    for (let o of t) o.destroy();
  }
  function hy(i, e, t) {
    let o = Z().querySelectorAll(e);
    o.length &&
      o.forEach((n) => {
        let s = n,
          r = i.retina.pixelRatio,
          l = {
            x: (s.offsetLeft + s.offsetWidth * Sf) * r,
            y: (s.offsetTop + s.offsetHeight * Sf) * r,
          },
          u = s.offsetWidth * Sf * r,
          d = bp * r,
          p =
            t.type === Te.circle
              ? new q(l.x, l.y, u + d)
              : new ce(
                  s.offsetLeft * r - d,
                  s.offsetTop * r - d,
                  s.offsetWidth * r + d * I,
                  s.offsetHeight * r + d * I,
                );
        vp(i, p);
      });
  }
  function wp(i, e, t) {
    ci(t, e, (o, n) => {
      hy(i, o, n);
    });
  }
  function Mp(i, e) {
    let t = i.retina.pixelRatio,
      o = bp * t,
      n = e.mouse.position,
      s = i.retina.destroyModeDistance;
    !s || s < dy || !n || vp(i, new q(n.x, n.y, s + o));
  }
  v();
  var Zl = class {
    constructor() {
      c(this, 'distance');
      this.distance = 200;
    }
    load(e) {
      x(e) || (e.distance !== void 0 && (this.distance = e.distance));
    }
  };
  var Jl = 'destroy',
    xn,
    ec = class extends $ {
      constructor(t) {
        super(t);
        f(this, xn);
        h(this, xn, 0);
      }
      get maxDistance() {
        return a(this, xn);
      }
      clear() {}
      init() {
        let t = this.container,
          o = t.actualOptions.interactivity?.modes.destroy;
        o &&
          (h(this, xn, o.distance),
          (t.retina.destroyModeDistance = o.distance * t.retina.pixelRatio));
      }
      interact(t) {
        let o = this.container,
          n = o.actualOptions,
          s = n.interactivity?.events,
          r = t.status === be;
        if (!s) return;
        let l = s.onHover.enable,
          u = s.onHover.mode,
          d = s.onDiv;
        r && l && A(Jl, u) ? Mp(this.container, t) : wp(this.container, d, Jl);
      }
      isEnabled(t, o) {
        let n = this.container,
          s = n.actualOptions,
          r = t.mouse,
          l = (o?.interactivity ?? s.interactivity)?.events;
        if (!l) return !1;
        let u = l.onDiv;
        return (!!r.position && l.onHover.enable && A(Jl, l.onHover.mode)) || li(Jl, u);
      }
      loadModeOptions(t, ...o) {
        t.destroy ?? (t.destroy = new Zl());
        for (let n of o) t.destroy.load(n?.destroy);
      }
      reset() {}
    };
  xn = new WeakMap();
  async function kp(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        N(e),
          e.pluginManager.addInteractor?.('externalDestroy', async (t) =>
            Promise.resolve(new ec(t)),
          );
      });
  }
  v();
  v();
  v();
  var tc = class {
    constructor() {
      c(this, 'blink');
      c(this, 'color');
      c(this, 'consent');
      c(this, 'opacity');
      (this.blink = !1), (this.consent = !1), (this.opacity = 1);
    }
    load(e) {
      x(e) ||
        (e.blink !== void 0 && (this.blink = e.blink),
        e.color !== void 0 && (this.color = ie.create(this.color, e.color)),
        e.consent !== void 0 && (this.consent = e.consent),
        e.opacity !== void 0 && (this.opacity = e.opacity));
    }
  };
  var ic = class {
    constructor() {
      c(this, 'distance');
      c(this, 'links');
      (this.distance = 100), (this.links = new tc());
    }
    load(e) {
      x(e) || (e.distance !== void 0 && (this.distance = e.distance), this.links.load(e.links));
    }
  };
  v();
  var py = 0;
  function my(i, e, t, o, n, s, r = !1) {
    ml(i, t, o), (i.strokeStyle = Ct(n, r, s)), (i.lineWidth = e), i.stroke();
  }
  function Pp(i, e, t, o, n) {
    i.canvas.render.draw((s) => {
      let r = e.getPosition();
      my(s, e.retina.linksWidth ?? py, r, n, t, o, i.hdr);
    });
  }
  var gy = 'grab',
    yy = 0,
    xy = 0,
    bn,
    Xs,
    oc = class extends $ {
      constructor(t, o) {
        super(o);
        f(this, bn);
        f(this, Xs);
        h(this, Xs, t), h(this, bn, 0);
      }
      get maxDistance() {
        return a(this, bn);
      }
      clear() {}
      init() {
        let t = this.container,
          o = t.actualOptions.interactivity?.modes.grab;
        o &&
          (h(this, bn, o.distance), (t.retina.grabModeDistance = o.distance * t.retina.pixelRatio));
      }
      interact(t) {
        let o = this.container,
          n = o.actualOptions,
          s = n.interactivity;
        if (!s?.modes.grab || !s.events.onHover.enable || t.status !== be) return;
        let r = t.mouse.position;
        if (!r) return;
        let l = o.retina.grabModeDistance;
        if (!l || l < yy) return;
        let u = o.particles.grid.queryCircle(r, l, (d) => this.isEnabled(t, d));
        for (let d of u) {
          let p = d.getPosition(),
            m = Se(p, r);
          if (m > l) continue;
          let g = s.modes.grab.links,
            y = g.opacity,
            b = y - (m * y) / l;
          if (b <= xy) continue;
          let k = g.color ?? d.options.links?.color;
          if (!o.particles.grabLineColor && k) {
            let C = s.modes.grab.links;
            o.particles.grabLineColor = Er(a(this, Xs), k, C.blink, C.consent);
          }
          let M = Po(d, void 0, o.particles.grabLineColor);
          M && Pp(o, d, M, b, r);
        }
      }
      isEnabled(t, o) {
        let n = this.container,
          s = t.mouse,
          r = (o?.interactivity ?? n.actualOptions.interactivity)?.events;
        return !!r?.onHover.enable && !!s.position && A(gy, r.onHover.mode);
      }
      loadModeOptions(t, ...o) {
        t.grab ?? (t.grab = new ic());
        for (let n of o) t.grab.load(n?.grab);
      }
      reset() {}
    };
  (bn = new WeakMap()), (Xs = new WeakMap());
  async function Cp(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        N(e),
          e.pluginManager.addInteractor?.('externalGrab', (t) =>
            Promise.resolve(new oc(e.pluginManager, t)),
          );
      });
  }
  v();
  v();
  var nc = class {
    constructor() {
      c(this, 'force');
      c(this, 'smooth');
      (this.force = 2), (this.smooth = 10);
    }
    load(e) {
      x(e) ||
        (e.force !== void 0 && (this.force = e.force),
        e.smooth !== void 0 && (this.smooth = e.smooth));
    }
  };
  var by = 'parallax',
    rc,
    Sp,
    sc = class extends $ {
      constructor(t) {
        super(t);
        f(this, rc);
        c(this, 'maxDistance', 0);
      }
      clear() {}
      init() {}
      interact(t) {
        for (let o of this.container.particles.filter((n) => this.isEnabled(t, n)))
          L(this, rc, Sp).call(this, t, o);
      }
      isEnabled(t, o) {
        let n = this.container,
          s = t.mouse,
          r = (o?.interactivity ?? n.actualOptions.interactivity)?.events;
        return !!r?.onHover.enable && !!s.position && A(by, r.onHover.mode);
      }
      loadModeOptions(t, ...o) {
        t.parallax ?? (t.parallax = new nc());
        for (let n of o) t.parallax.load(n?.parallax);
      }
      reset() {}
    };
  (rc = new WeakSet()),
    (Sp = function (t, o) {
      if (!this.isEnabled(t, o)) return;
      let n = this.container,
        s = n.actualOptions,
        r = s.interactivity?.modes.parallax;
      if (!r) return;
      let l = r.force,
        u = t.mouse.position;
      if (!u) return;
      let d = n.canvas.size,
        p = { x: d.width * 0.5, y: d.height * 0.5 },
        m = r.smooth,
        g = o.getRadius() / l,
        y = { x: (u.x - p.x) * g, y: (u.y - p.y) * g },
        { offset: b } = o;
      (b.x += (y.x - b.x) / m), (b.y += (y.y - b.y) / m);
    });
  async function Op(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        N(e),
          e.pluginManager.addInteractor?.('externalParallax', (t) => Promise.resolve(new sc(t)));
      });
  }
  v();
  var Rp = 'pause',
    ac = class extends $ {
      constructor(t) {
        super(t);
        c(this, 'handleClickMode');
        c(this, 'maxDistance', 0);
        this.handleClickMode = (o) => {
          if (o !== Rp) return;
          let n = this.container;
          n.animationStatus ? n.pause() : n.play();
        };
      }
      clear() {}
      init() {}
      interact() {}
      isEnabled(t, o) {
        let n = this.container,
          s = n.actualOptions,
          r = (o?.interactivity ?? s.interactivity)?.events;
        return !!r && A(Rp, r.onClick.mode);
      }
      reset() {}
    };
  async function Dp(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        N(e), e.pluginManager.addInteractor?.('externalPause', (t) => Promise.resolve(new ac(t)));
      });
  }
  v();
  v();
  var lc = class {
    constructor() {
      c(this, 'default');
      c(this, 'groups');
      c(this, 'particles');
      c(this, 'quantity');
      (this.default = !0), (this.groups = []), (this.quantity = 4);
    }
    load(e) {
      if (x(e)) return;
      e.default !== void 0 && (this.default = e.default),
        e.groups !== void 0 && (this.groups = e.groups.map((o) => o)),
        this.groups.length || (this.default = !0);
      let t = e.quantity;
      t !== void 0 && (this.quantity = D(t)), (this.particles = j(e.particles, (o) => G({}, o)));
    }
  };
  var Ip = 'push',
    vy = 0,
    cc = class extends $ {
      constructor(t) {
        super(t);
        c(this, 'handleClickMode');
        c(this, 'maxDistance', 0);
        this.handleClickMode = (o, n) => {
          if (o !== Ip) return;
          let s = this.container,
            r = s.actualOptions,
            l = r.interactivity?.modes.push;
          if (!l) return;
          let u = P(l.quantity);
          if (u <= vy) return;
          let d = go([void 0, ...l.groups]),
            p = d !== void 0 ? s.actualOptions.particles.groups[d] : void 0,
            m = ne(l.particles),
            g = G(p, m);
          s.particles.push(u, n.mouse.position, g, d);
        };
      }
      clear() {}
      init() {}
      interact() {}
      isEnabled(t, o) {
        let n = this.container,
          s = n.actualOptions,
          r = t.mouse,
          l = (o?.interactivity ?? s.interactivity)?.events;
        return !!l && r.clicking && r.inside && !!r.position && A(Ip, l.onClick.mode);
      }
      loadModeOptions(t, ...o) {
        t.push ?? (t.push = new lc());
        for (let n of o) t.push.load(n?.push);
      }
      reset() {}
    };
  async function zp(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        N(e), e.pluginManager.addInteractor?.('externalPush', (t) => Promise.resolve(new cc(t)));
      });
  }
  v();
  v();
  var uc = class {
    constructor() {
      c(this, 'quantity');
      this.quantity = 2;
    }
    load(e) {
      if (x(e)) return;
      let t = e.quantity;
      t !== void 0 && (this.quantity = D(t));
    }
  };
  var Ep = 'remove',
    fc = class extends $ {
      constructor(t) {
        super(t);
        c(this, 'handleClickMode');
        c(this, 'maxDistance', 0);
        this.handleClickMode = (o) => {
          let n = this.container,
            s = n.actualOptions;
          if (!s.interactivity?.modes.remove || o !== Ep) return;
          let r = P(s.interactivity.modes.remove.quantity);
          for (let l = 0; l < r; l++) n.particles.get(l)?.destroy();
        };
      }
      clear() {}
      init() {}
      interact() {}
      isEnabled(t, o) {
        let n = this.container,
          s = n.actualOptions,
          r = t.mouse,
          l = (o?.interactivity ?? s.interactivity)?.events;
        return !!l && r.clicking && r.inside && !!r.position && A(Ep, l.onClick.mode);
      }
      loadModeOptions(t, ...o) {
        t.remove ?? (t.remove = new uc());
        for (let n of o) t.remove.load(n?.remove);
      }
      reset() {}
    };
  async function Fp(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        N(e), e.pluginManager.addInteractor?.('externalRemove', (t) => Promise.resolve(new fc(t)));
      });
  }
  v();
  v();
  v();
  var vn = class {
    constructor() {
      c(this, 'distance');
      c(this, 'duration');
      c(this, 'easing');
      c(this, 'factor');
      c(this, 'maxSpeed');
      c(this, 'restore');
      c(this, 'speed');
      (this.distance = 200),
        (this.duration = 0.4),
        (this.factor = 100),
        (this.speed = 1),
        (this.maxSpeed = 50),
        (this.easing = it.easeOutQuad),
        (this.restore = { enable: !1, delay: 0, speed: 0.08, follow: !0 });
    }
    load(e) {
      x(e) ||
        (e.distance !== void 0 && (this.distance = e.distance),
        e.duration !== void 0 && (this.duration = e.duration),
        e.easing !== void 0 && (this.easing = e.easing),
        e.factor !== void 0 && (this.factor = e.factor),
        e.speed !== void 0 && (this.speed = e.speed),
        e.maxSpeed !== void 0 && (this.maxSpeed = e.maxSpeed),
        e.restore !== void 0 &&
          ((this.restore.enable = e.restore.enable ?? this.restore.enable),
          (this.restore.delay = e.restore.delay ?? this.restore.delay),
          (this.restore.speed = e.restore.speed ?? this.restore.speed),
          (this.restore.follow = e.restore.follow ?? this.restore.follow)));
    }
  };
  v();
  var dc = class extends vn {
    constructor() {
      super();
      c(this, 'selectors');
      this.selectors = [];
    }
    load(t) {
      super.load(t), !x(t) && t.selectors !== void 0 && (this.selectors = t.selectors);
    }
  };
  var hc = class extends vn {
    constructor() {
      super(...arguments);
      c(this, 'divs');
    }
    load(t) {
      super.load(t),
        !x(t) &&
          (this.divs = j(t.divs, (o) => {
            let n = new dc();
            return n.load(o), n;
          }));
    }
  };
  var no = 'repulse',
    wy = 0,
    My = 6,
    ky = 3,
    Py = 2,
    Cy = 0,
    Sy = 0,
    Oy = 1,
    Ry = 0.001,
    Dy = 1,
    Tp = 0.5,
    ui,
    so,
    wn,
    ro,
    Ks,
    at,
    mc,
    gc,
    Zs,
    ao,
    Ap,
    yc,
    Of,
    pc = class extends $ {
      constructor(t, o) {
        super(o);
        f(this, ao);
        c(this, 'handleClickMode');
        f(this, ui);
        f(this, so);
        f(this, wn);
        f(this, ro);
        f(this, Ks);
        f(this, at);
        f(this, mc, (t) => {
          let o = this.container,
            n = o.actualOptions.interactivity?.modes.repulse;
          if (!n) return;
          let s = o.repulse ?? { particles: [] };
          if (
            (s.finish ||
              (s.count ?? (s.count = 0),
              s.count++,
              s.count === o.particles.count && (s.finish = !0)),
            s.clicking)
          ) {
            let r = o.retina.repulseModeDistance;
            if (!r || r < wy) return;
            let l = Math.pow(r / My, ky),
              u = t.mouse.clickPosition;
            if (u === void 0) return;
            let d = new q(u.x, u.y, l),
              p = o.particles.grid.query(d, (m) => this.isEnabled(t, m));
            for (let m of p) {
              let { dx: g, dy: y, distance: b } = K(u, m.position),
                k = b ** Py,
                M = n.speed,
                C = (-l * M) / k;
              k <= l &&
                (L(this, ao, Of).call(this, m),
                s.particles.push(m),
                (a(this, ui).x = g),
                (a(this, ui).y = y),
                (a(this, ui).length = C),
                m.velocity.setTo(a(this, ui)));
            }
          } else if (s.clicking === !1) {
            for (let r of s.particles) r.velocity.setTo(r.initialVelocity);
            s.particles = [];
          }
        });
        f(this, gc, (t) => {
          let o = this.container,
            n = t.mouse.position,
            s = o.retina.repulseModeDistance;
          !s || s < Cy || !n || a(this, Zs).call(this, t, n, s, new q(n.x, n.y, s));
        });
        f(this, Zs, (t, o, n, s, r) => {
          let l = this.container,
            u = l.particles.grid.query(s, (M) => this.isEnabled(t, M)),
            d = l.actualOptions.interactivity?.modes.repulse;
          if (!d) return;
          let { easing: p, speed: m, factor: g, maxSpeed: y } = d,
            b = a(this, Ks).getEasing(p),
            k = (r?.speed ?? m) * g;
          for (let M of u) {
            let { dx: C, dy: S, distance: F } = K(M.position, o),
              V = Y(b(Oy - F / n) * k, Sy, y);
            (a(this, ro).x = F ? (C / F) * V : k),
              (a(this, ro).y = F ? (S / F) * V : k),
              L(this, ao, Of).call(this, M),
              M.position.addTo(a(this, ro));
          }
        });
        f(this, yc, (t, o, n) => {
          let s = this.container,
            r = s.actualOptions.interactivity?.modes.repulse;
          if (!r) return;
          let l = Z().querySelectorAll(o);
          l.length &&
            l.forEach((u) => {
              let d = u,
                p = s.retina.pixelRatio,
                m = {
                  x: (d.offsetLeft + d.offsetWidth * 0.5) * p,
                  y: (d.offsetTop + d.offsetHeight * 0.5) * p,
                },
                g = d.offsetWidth * 0.5 * p,
                y =
                  n.type === Te.circle
                    ? new q(m.x, m.y, g)
                    : new ce(
                        d.offsetLeft * p,
                        d.offsetTop * p,
                        d.offsetWidth * p,
                        d.offsetHeight * p,
                      ),
                b = r.divs,
                k = Ll(b, d);
              a(this, Zs).call(this, t, m, g, y, k);
            });
        });
        h(this, Ks, t),
          h(this, wn, 0),
          h(this, ro, ee.origin),
          h(this, so, new Set()),
          h(this, ui, ee.origin),
          h(this, at, new Map()),
          o.repulse ?? (o.repulse = { particles: [] }),
          (this.handleClickMode = (n, s) => {
            let r = this.container.actualOptions,
              l = r.interactivity?.modes.repulse;
            if (!l || n !== no) return;
            o.repulse ?? (o.repulse = { particles: [] });
            let u = o.repulse;
            (u.clicking = !0), (u.count = 0);
            for (let d of o.repulse.particles)
              this.isEnabled(s, d) && d.velocity.setTo(d.initialVelocity);
            (u.particles = []),
              (u.finish = !1),
              setTimeout(() => {
                o.destroyed || (u.clicking = !1);
              }, l.duration * 1e3);
          });
      }
      get maxDistance() {
        return a(this, wn);
      }
      clear() {}
      init() {
        let t = this.container,
          o = t.actualOptions.interactivity?.modes.repulse;
        o &&
          (h(this, wn, o.distance),
          (t.retina.repulseModeDistance = o.distance * t.retina.pixelRatio));
      }
      interact(t) {
        a(this, so).clear();
        let o = this.container,
          n = o.actualOptions,
          s = t.status === be,
          r = n.interactivity?.events;
        if (!r) return;
        let l = r.onHover,
          u = l.enable,
          d = l.mode,
          p = r.onClick,
          m = p.enable,
          g = p.mode,
          y = r.onDiv;
        s && u && A(no, d)
          ? a(this, gc).call(this, t)
          : m && A(no, g)
            ? a(this, mc).call(this, t)
            : ci(no, y, (b, k) => {
                a(this, yc).call(this, t, b, k);
              }),
          L(this, ao, Ap).call(this);
      }
      isEnabled(t, o) {
        let n = this.container,
          s = n.actualOptions,
          r = t.mouse,
          l = (o?.interactivity ?? s.interactivity)?.events;
        if (!l) return !1;
        let u = l.onDiv,
          d = l.onHover,
          p = l.onClick,
          m = li(no, u);
        if (!(m || (d.enable && r.position) || (p.enable && r.clickPosition))) return !1;
        let g = d.mode,
          y = p.mode;
        return A(no, g) || A(no, y) || m;
      }
      loadModeOptions(t, ...o) {
        t.repulse ?? (t.repulse = new hc());
        for (let n of o) t.repulse.load(n?.repulse);
      }
      reset() {}
    };
  (ui = new WeakMap()),
    (so = new WeakMap()),
    (wn = new WeakMap()),
    (ro = new WeakMap()),
    (Ks = new WeakMap()),
    (at = new WeakMap()),
    (mc = new WeakMap()),
    (gc = new WeakMap()),
    (Zs = new WeakMap()),
    (ao = new WeakSet()),
    (Ap = function () {
      let t = this.container.actualOptions.interactivity?.modes.repulse?.restore;
      if (!t?.enable || !a(this, at).size) return;
      let o = Date.now(),
        n = t.delay * 1e3,
        s = Math.max(Ry, Math.min(Dy, t.speed));
      for (let [r, l] of a(this, at)) {
        if (a(this, so).has(r)) continue;
        if (r.destroyed) {
          a(this, at).delete(r);
          continue;
        }
        let u = l.target;
        if (o - l.lastInteractionTime < n) continue;
        t.follow &&
          r.options.move.enable &&
          ((u.x += r.velocity.x), (u.y += r.velocity.y), (u.z += r.velocity.z));
        let d = u.x - r.position.x,
          p = u.y - r.position.y,
          m = u.z - r.position.z;
        if (
          ((r.position.x += d * s),
          (r.position.y += p * s),
          (r.position.z += m * s),
          Math.abs(d) <= Tp && Math.abs(p) <= Tp)
        ) {
          (r.position.x = u.x), (r.position.y = u.y), (r.position.z = u.z), a(this, at).delete(r);
          continue;
        }
      }
    }),
    (yc = new WeakMap()),
    (Of = function (t) {
      a(this, so).add(t);
      let o = this.container.actualOptions.interactivity?.modes.repulse?.restore;
      if (!o?.enable) return;
      let n = Date.now(),
        s = a(this, at).get(t);
      s || ((s = { target: t.position.copy(), lastInteractionTime: n }), a(this, at).set(t, s)),
        (s.lastInteractionTime = n),
        o.follow &&
          t.options.move.enable &&
          ((s.target.x += t.velocity.x),
          (s.target.y += t.velocity.y),
          (s.target.z += t.velocity.z));
    });
  async function Lp(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        N(e);
        let t = e.pluginManager;
        t.addInteractor?.('externalRepulse', (o) => Promise.resolve(new pc(t, o)));
      });
  }
  v();
  v();
  var xc = class {
    constructor() {
      c(this, 'factor');
      c(this, 'radius');
      (this.factor = 3), (this.radius = 200);
    }
    load(e) {
      x(e) ||
        (e.factor !== void 0 && (this.factor = e.factor),
        e.radius !== void 0 && (this.radius = e.radius));
    }
  };
  var Iy = 'slow',
    zy = 0,
    Mn,
    bc = class extends $ {
      constructor(t) {
        super(t);
        f(this, Mn);
        h(this, Mn, 0);
      }
      get maxDistance() {
        return a(this, Mn);
      }
      clear(t, o, n) {
        (t.slow.inRange && !n) || (t.slow.factor = 1);
      }
      init() {
        let t = this.container,
          o = t.actualOptions.interactivity?.modes.slow;
        o && (h(this, Mn, o.radius), (t.retina.slowModeRadius = o.radius * t.retina.pixelRatio));
      }
      interact() {}
      isEnabled(t, o) {
        let n = this.container,
          s = t.mouse,
          r = (o?.interactivity ?? n.actualOptions.interactivity)?.events;
        return !!r?.onHover.enable && !!s.position && A(Iy, r.onHover.mode);
      }
      loadModeOptions(t, ...o) {
        t.slow ?? (t.slow = new xc());
        for (let n of o) t.slow.load(n?.slow);
      }
      reset(t, o) {
        o.slow.inRange = !1;
        let n = this.container,
          s = n.actualOptions,
          r = t.mouse.position,
          l = n.retina.slowModeRadius,
          u = s.interactivity?.modes.slow;
        if (!u || !l || l < zy || !r) return;
        let d = o.getPosition(),
          p = Se(r, d),
          m = p / l,
          g = u.factor,
          { slow: y } = o;
        p > l || ((y.inRange = !0), (y.factor = m / g));
      }
    };
  Mn = new WeakMap();
  async function Bp(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        N(e), e.pluginManager.addInteractor?.('externalSlow', (t) => Promise.resolve(new bc(t)));
      });
  }
  v();
  var vc = ['image', 'images'],
    Ey = 0,
    Fy = 1,
    Ty =
      /(#(?:[0-9a-f]{2}){2,4}|(#[0-9a-f]{3})|(rgb|hsl)a?\((-?\d+%?[,\s]+){2,3}\s*[\d.]+%?\))|currentcolor/gi;
  function Ay(i, e, t, o = !1) {
    let { svgData: n } = i;
    if (!n) return '';
    let s = St(e, o, t);
    if (n.includes('fill')) return n.replaceAll(Ty, () => s);
    let r = n.indexOf('>');
    return `${n.substring(Ey, r)} fill="${s}"${n.substring(r)}`;
  }
  async function kn(i) {
    return new Promise((e) => {
      i.loading = !0;
      let t = new Image();
      (i.element = t),
        t.addEventListener('load', () => {
          (i.loading = !1), e();
        }),
        t.addEventListener('error', () => {
          (i.element = void 0),
            (i.error = !0),
            (i.loading = !1),
            _e().error(`Error loading image: ${i.source}`),
            e();
        }),
        (t.src = i.source);
    });
  }
  async function Vp(i) {
    if (i.type !== 'svg') {
      await kn(i);
      return;
    }
    i.loading = !0;
    let e = await fetch(i.source);
    e.ok ? (i.svgData = await e.text()) : (_e().error('Image not found'), (i.error = !0)),
      (i.loading = !1);
  }
  function Np(i, e, t, o, n = !1) {
    let s = Ay(i, t, o.opacity?.value ?? Fy, n),
      r = {
        color: t,
        gif: e.gif,
        data: { ...i, svgData: s },
        loaded: !1,
        ratio: e.width / e.height,
        replaceColor: e.replaceColor,
        source: e.src,
      };
    return new Promise((l) => {
      let u = new Blob([s], { type: 'image/svg+xml' }),
        d = URL.createObjectURL(u),
        p = new Image();
      p.addEventListener('load', () => {
        (r.loaded = !0), (r.element = p), l(r), URL.revokeObjectURL(d);
      });
      let m = async () => {
        URL.revokeObjectURL(d);
        let g = { ...i, error: !1, loading: !0 };
        await kn(g), (r.loaded = !0), (r.element = g.element), l(r);
      };
      p.addEventListener('error', () => {
        m();
      }),
        (p.src = d);
    });
  }
  v();
  v();
  var wc = [0, 4, 2, 1],
    Rf = [8, 8, 4, 2];
  var Mc = class {
    constructor(e) {
      c(this, 'data');
      c(this, 'pos');
      (this.pos = 0), (this.data = new Uint8ClampedArray(e));
    }
    getString(e) {
      let t = this.data.slice(this.pos, this.pos + e);
      return (this.pos += t.length), t.reduce((o, n) => o + String.fromCharCode(n), '');
    }
    nextByte() {
      return this.data[this.pos++];
    }
    nextTwoBytes() {
      return (this.pos += 2), this.data[this.pos - 2] + (this.data[this.pos - 1] << 8);
    }
    readSubBlocks() {
      let e = '',
        t;
      do {
        t = this.data[this.pos++];
        for (let s = t; --s >= 0; e += String.fromCharCode(this.data[this.pos++]));
      } while (t !== 0);
      return e;
    }
    readSubBlocksBin() {
      let e = this.data[this.pos],
        t = 0,
        o = 0,
        n = 1;
      for (let r = 0; e !== o; r += e + n, e = this.data[this.pos + r]) t += e;
      let s = new Uint8Array(t);
      e = this.data[this.pos++];
      for (let r = 0; e !== o; e = this.data[this.pos++])
        for (let l = e; --l >= o; s[r++] = this.data[this.pos++]);
      return s;
    }
    skipSubBlocks() {
      for (let e = 1, t = 0; this.data[this.pos] !== t; this.pos += this.data[this.pos] + e);
      this.pos++;
    }
  };
  var Le;
  (function (i) {
    (i[(i.Replace = 0)] = 'Replace'),
      (i[(i.Combine = 1)] = 'Combine'),
      (i[(i.RestoreBackground = 2)] = 'RestoreBackground'),
      (i[(i.RestorePrevious = 3)] = 'RestorePrevious'),
      (i[(i.UndefinedA = 4)] = 'UndefinedA'),
      (i[(i.UndefinedB = 5)] = 'UndefinedB'),
      (i[(i.UndefinedC = 6)] = 'UndefinedC'),
      (i[(i.UndefinedD = 7)] = 'UndefinedD');
  })(Le || (Le = {}));
  var lt;
  (function (i) {
    (i[(i.Extension = 33)] = 'Extension'),
      (i[(i.ApplicationExtension = 255)] = 'ApplicationExtension'),
      (i[(i.GraphicsControlExtension = 249)] = 'GraphicsControlExtension'),
      (i[(i.PlainTextExtension = 1)] = 'PlainTextExtension'),
      (i[(i.CommentExtension = 254)] = 'CommentExtension'),
      (i[(i.Image = 44)] = 'Image'),
      (i[(i.EndOfFile = 59)] = 'EndOfFile');
  })(lt || (lt = {}));
  var Ly = 0,
    By = 0,
    Up = 0,
    Hp = 0;
  function $p(i, e) {
    let t = [];
    for (let o = 0; o < e; o++)
      t.push({ r: i.data[i.pos], g: i.data[i.pos + 1], b: i.data[i.pos + 2] }), (i.pos += 3);
    return t;
  }
  function Vy(i, e, t, o) {
    switch (i.nextByte()) {
      case lt.GraphicsControlExtension: {
        let n = e.frames[t(!1)];
        i.pos++;
        let s = i.nextByte();
        (n.GCreserved = (s & 224) >>> 5),
          (n.disposalMethod = (s & 28) >>> 2),
          (n.userInputDelayFlag = (s & 2) === 2);
        let r = (s & 1) === 1;
        n.delayTime = i.nextTwoBytes() * 10;
        let l = i.nextByte();
        r && o(l), i.pos++;
        break;
      }
      case lt.ApplicationExtension: {
        i.pos++;
        let n = {
          identifier: i.getString(8),
          authenticationCode: i.getString(3),
          data: i.readSubBlocksBin(),
        };
        e.applicationExtensions.push(n);
        break;
      }
      case lt.CommentExtension: {
        e.comments.push([t(!1), i.readSubBlocks()]);
        break;
      }
      case lt.PlainTextExtension: {
        if (e.globalColorTable.length === 0)
          throw new EvalError('plain text extension without global color table');
        i.pos++,
          (e.frames[t(!1)].plainTextData = {
            left: i.nextTwoBytes(),
            top: i.nextTwoBytes(),
            width: i.nextTwoBytes(),
            height: i.nextTwoBytes(),
            charSize: { width: i.nextTwoBytes(), height: i.nextTwoBytes() },
            foregroundColor: i.nextByte(),
            backgroundColor: i.nextByte(),
            text: i.readSubBlocks(),
          });
        break;
      }
      default:
        i.skipSubBlocks();
        break;
    }
  }
  function qp(i, e, t) {
    let o = e >>> 3,
      n = e & 7;
    return ((i[o] + (i[o + 1] << 8) + (i[o + 2] << 16)) & (((1 << t) - 1) << n)) >>> n;
  }
  async function Ny(i, e, t, o, n, s, r) {
    let l = e.frames[o(!0)];
    (l.left = i.nextTwoBytes()),
      (l.top = i.nextTwoBytes()),
      (l.width = i.nextTwoBytes()),
      (l.height = i.nextTwoBytes());
    let u = i.nextByte(),
      d = (u & 128) === 128,
      p = (u & 64) === 64;
    (l.sortFlag = (u & 32) === 32), (l.reserved = (u & 24) >>> 3);
    let m = 1 << ((u & 7) + 1);
    d && (l.localColorTable = $p(i, m));
    let g = (C) => {
        let { r: S, g: F, b: V } = (d ? l.localColorTable : e.globalColorTable)[C];
        return C !== n(null)
          ? { r: S, g: F, b: V, a: 255 }
          : { r: S, g: F, b: V, a: t ? Math.trunc((S + F + V) / 3) : 0 };
      },
      y = (() => {
        try {
          return new ImageData(l.width, l.height, s);
        } catch (C) {
          if (C instanceof DOMException && C.name === 'IndexSizeError') return null;
          throw C;
        }
      })();
    if (y == null) throw new EvalError('GIF frame size is to large');
    let b = i.nextByte(),
      k = i.readSubBlocksBin(),
      M = 1 << b;
    if (p) {
      for (let C = 0, S = b + 1, F = 0, V = [[0]], z = 0; z < 4; z++) {
        if (wc[z] < l.height) {
          let Re = 0,
            Q = 0,
            hi = !1;
          for (; !hi; ) {
            let ut = C;
            if (((C = qp(k, F, S)), (F += S + 1), C === M)) {
              (S = b + 1), (V.length = M + 2);
              for (let Pe = 0; Pe < V.length; Pe++) V[Pe] = Pe < M ? [Pe] : [];
            } else {
              C >= V.length
                ? V.push(V[ut].concat(V[ut][0]))
                : ut !== M && V.push(V[ut].concat(V[C][0]));
              for (let Pe of V[C]) {
                let { r: pi, g: Um, b: Hm, a: qm } = g(Pe);
                y.data.set([pi, Um, Hm, qm], wc[z] * l.width + Rf[z] * Q + (Re % (l.width * 4))),
                  (Re += 4);
              }
              V.length === 1 << S && S < 12 && S++;
            }
            Re === l.width * 4 * (Q + 1) && (Q++, wc[z] + Rf[z] * Q >= l.height && (hi = !0));
          }
        }
        r?.(
          i.pos / (i.data.length - 1),
          o(!1) + 1,
          y,
          { x: l.left, y: l.top },
          { width: e.width, height: e.height },
        );
      }
      (l.image = y), (l.bitmap = await createImageBitmap(y));
    } else {
      let C = 0,
        S = b + 1,
        F = 0,
        V = -4,
        z = [[0]];
      for (;;) {
        let Re = C;
        if (((C = qp(k, F, S)), (F += S), C === M)) {
          (S = b + 1), (z.length = M + 2);
          for (let Q = 0; Q < z.length; Q++) z[Q] = Q < M ? [Q] : [];
        } else {
          if (C === M + 1) break;
          C >= z.length
            ? z.push(z[Re].concat(z[Re][0]))
            : Re !== M && z.push(z[Re].concat(z[C][0]));
          for (let Q of z[C]) {
            let { r: hi, g: ut, b: Pe, a: pi } = g(Q);
            (V += 4), y.data.set([hi, ut, Pe, pi], V);
          }
          z.length >= 1 << S && S < 12 && S++;
        }
      }
      (l.image = y),
        (l.bitmap = await createImageBitmap(y)),
        r?.(
          (i.pos + 1) / i.data.length,
          o(!1) + 1,
          l.image,
          { x: l.left, y: l.top },
          { width: e.width, height: e.height },
        );
    }
  }
  async function Uy(i, e, t, o, n, s, r) {
    switch (i.nextByte()) {
      case lt.EndOfFile:
        return !0;
      case lt.Image:
        await Ny(i, e, t, o, n, s, r);
        break;
      case lt.Extension:
        Vy(i, e, o, n);
        break;
      default:
        throw new EvalError('undefined block found');
    }
    return !1;
  }
  function Hy(i) {
    for (let e of i.applicationExtensions)
      if (e.identifier + e.authenticationCode === 'NETSCAPE2.0')
        return e.data[1] + (e.data[2] << 8);
    return Number.NaN;
  }
  async function qy(i, e, t, o) {
    o ?? (o = !1);
    let n = await fetch(i);
    if (!n.ok && n.status === 404) throw new EvalError('file not found');
    let s = await n.arrayBuffer(),
      r = {
        width: 0,
        height: 0,
        totalTime: 0,
        colorRes: 0,
        pixelAspectRatio: 0,
        frames: [],
        sortFlag: !1,
        globalColorTable: [],
        backgroundImage: new ImageData(1, 1, e),
        comments: [],
        applicationExtensions: [],
      },
      l = new Mc(new Uint8ClampedArray(s));
    if (l.getString(6) !== 'GIF89a') throw new Error('not a supported GIF file');
    (r.width = l.nextTwoBytes()), (r.height = l.nextTwoBytes());
    let u = l.nextByte(),
      d = (u & 128) === 128;
    (r.colorRes = (u & 112) >>> 4), (r.sortFlag = (u & 8) === 8);
    let p = 1 << ((u & 7) + 1),
      m = l.nextByte();
    (r.pixelAspectRatio = l.nextByte()),
      r.pixelAspectRatio !== 0 && (r.pixelAspectRatio = (r.pixelAspectRatio + 15) / 64),
      d && (r.globalColorTable = $p(l, p));
    let g = (() => {
      try {
        return new ImageData(r.width, r.height, e);
      } catch (z) {
        if (z instanceof DOMException && z.name === 'IndexSizeError') return null;
        throw z;
      }
    })();
    if (g == null) throw new Error('GIF frame size is to large');
    let { r: y, g: b, b: k } = r.globalColorTable[m];
    g.data.set(d ? [y, b, k, 255] : [0, 0, 0, 0]);
    for (let z = 4; z < g.data.length; z *= 2) g.data.copyWithin(z, 0, z);
    r.backgroundImage = g;
    let M = -1,
      C = !0,
      S = -1,
      F = (z) => (z && (C = !0), M),
      V = (z) => (z != null && (S = z), S);
    try {
      do
        C &&
          (r.frames.push({
            left: 0,
            top: 0,
            width: 0,
            height: 0,
            disposalMethod: Le.Replace,
            image: new ImageData(1, 1, e),
            plainTextData: null,
            userInputDelayFlag: !1,
            delayTime: 0,
            sortFlag: !1,
            localColorTable: [],
            reserved: 0,
            GCreserved: 0,
          }),
          M++,
          (S = -1),
          (C = !1));
      while (!(await Uy(l, r, o, F, V, e, t)));
      r.frames.length--;
      for (let z of r.frames) {
        if (z.userInputDelayFlag && z.delayTime === 0) {
          r.totalTime = 1 / 0;
          break;
        }
        r.totalTime += z.delayTime;
      }
      return r;
    } catch (z) {
      throw z instanceof EvalError
        ? new Error(`error while parsing frame ${M.toString()} "${z.message}"`, { cause: z })
        : z;
    }
  }
  function Wp(i, e) {
    let { context: t, radius: o, particle: n, delta: s } = i,
      r = n.image;
    if (!r?.gifData || !r.gif) return;
    let l = new OffscreenCanvas(r.gifData.width, r.gifData.height),
      u = l.getContext('2d', e);
    if (!u) throw new Error('could not create offscreen canvas context');
    (u.imageSmoothingQuality = 'low'),
      (u.imageSmoothingEnabled = !1),
      u.clearRect(O.x, O.y, l.width, l.height),
      n.gifLoopCount ?? (n.gifLoopCount = r.gifLoopCount ?? Hp);
    let d = n.gifFrame ?? Ly,
      p = { x: -r.gifData.width * 0.5, y: -r.gifData.height * 0.5 },
      m = r.gifData.frames[d];
    if ((n.gifTime ?? (n.gifTime = By), !!m.bitmap)) {
      switch ((t.scale(o / r.gifData.width, o / r.gifData.height), m.disposalMethod)) {
        case Le.UndefinedA:
        case Le.UndefinedB:
        case Le.UndefinedC:
        case Le.UndefinedD:
        case Le.Replace:
          u.drawImage(m.bitmap, m.left, m.top),
            t.drawImage(l, p.x, p.y),
            u.clearRect(O.x, O.y, l.width, l.height);
          break;
        case Le.Combine:
          u.drawImage(m.bitmap, m.left, m.top), t.drawImage(l, p.x, p.y);
          break;
        case Le.RestoreBackground:
          u.drawImage(m.bitmap, m.left, m.top),
            t.drawImage(l, p.x, p.y),
            u.clearRect(O.x, O.y, l.width, l.height),
            r.gifData.globalColorTable.length
              ? u.putImageData(r.gifData.backgroundImage, p.x, p.y)
              : u.putImageData(r.gifData.frames[Up].image, p.x + m.left, p.y + m.top);
          break;
        case Le.RestorePrevious:
          {
            let g = u.getImageData(O.x, O.y, l.width, l.height);
            u.drawImage(m.bitmap, m.left, m.top),
              t.drawImage(l, p.x, p.y),
              u.clearRect(O.x, O.y, l.width, l.height),
              u.putImageData(g, O.x, O.y);
          }
          break;
      }
      if (((n.gifTime += s.value), n.gifTime > m.delayTime)) {
        if (((n.gifTime -= m.delayTime), ++d >= r.gifData.frames.length)) {
          if (--n.gifLoopCount <= Hp) return;
          (d = Up), u.clearRect(O.x, O.y, l.width, l.height);
        }
        n.gifFrame = d;
      }
      t.scale(r.gifData.width / o, r.gifData.height / o);
    }
  }
  async function Gp(i, e) {
    if (i.type !== 'gif') {
      await kn(i);
      return;
    }
    i.loading = !0;
    try {
      (i.gifData = await qy(i.source, e)),
        (i.gifLoopCount = Hy(i.gifData)),
        i.gifLoopCount || (i.gifLoopCount = 1 / 0);
    } catch {
      i.error = !0;
    }
    i.loading = !1;
  }
  var $y = 12,
    Pn,
    ct,
    Pc,
    kc = class {
      constructor(e, t) {
        f(this, Pn);
        f(this, ct);
        f(this, Pc, async (e, t) => {
          if (!a(this, ct).loadImage) throw new Error('Image shape not initialized');
          await a(this, ct).loadImage(e, {
            gif: t.gif,
            name: t.name,
            replaceColor: t.replaceColor,
            src: t.src,
          });
        });
        h(this, ct, e), h(this, Pn, t);
      }
      draw(e) {
        let { context: t, radius: o, particle: n, opacity: s } = e,
          r = n.image,
          l = r?.element;
        if (r) {
          if (((t.globalAlpha = s), r.gif && r.gifData)) Wp(e, a(this, Pn).canvas.render.settings);
          else if (l) {
            let u = r.ratio,
              d = { x: -o, y: -o },
              p = o * I;
            t.drawImage(l, d.x, d.y, p, p / u);
          }
          t.globalAlpha = nu;
        }
      }
      getSidesCount() {
        return $y;
      }
      async init(e) {
        let t = e.actualOptions;
        if (!t.preload || !a(this, ct).loadImage) return;
        let o = [];
        for (let n of t.preload) o.push(a(this, ct).loadImage(e, n));
        await Promise.all(o);
      }
      loadShape(e) {
        let t = a(this, Pn);
        if (!e.shape || !vc.includes(e.shape)) return;
        let o = e.shapeData;
        !o ||
          a(this, ct)
            .getImages?.(t)
            ?.find((r) => r.name === o.name || r.source === o.src) ||
          a(this, Pc)
            .call(this, t, o)
            .then(() => {
              this.loadShape(e);
            });
      }
      particleInit(e, t) {
        if (t.shape !== 'image' && t.shape !== 'images') return;
        let o = a(this, ct).getImages?.(e),
          n = t.shapeData;
        if (!n) return;
        let s = t.getFillColor(),
          r = o?.find((u) => u.name === n.name || u.source === n.src);
        if (!r) return;
        let l = n.replaceColor;
        if (r.loading) {
          setTimeout(() => {
            this.particleInit(e, t);
          });
          return;
        }
        (async () => {
          let u;
          r.svgData && s
            ? (u = await Np(r, n, s, t, e.hdr))
            : (u = {
                color: s,
                data: r,
                element: r.element,
                gif: r.gif,
                gifData: r.gifData,
                gifLoopCount: r.gifLoopCount,
                loaded: !0,
                ratio: n.width && n.height ? n.width / n.height : (r.ratio ?? Bn),
                replaceColor: l,
                source: n.src,
              }),
            u.ratio || (u.ratio = 1);
          let d = n.close ?? t.shapeClose,
            p = { image: u, close: d };
          (t.image = p.image), (t.shapeClose = p.close);
        })();
      }
    };
  (Pn = new WeakMap()), (ct = new WeakMap()), (Pc = new WeakMap());
  v();
  var Cc = class {
    constructor() {
      c(this, 'gif');
      c(this, 'height');
      c(this, 'name');
      c(this, 'replaceColor');
      c(this, 'src');
      c(this, 'width');
      (this.src = ''), (this.gif = !1);
    }
    load(e) {
      x(e) ||
        (e.gif !== void 0 && (this.gif = e.gif),
        e.height !== void 0 && (this.height = e.height),
        e.name !== void 0 && (this.name = e.name),
        e.replaceColor !== void 0 && (this.replaceColor = e.replaceColor),
        e.src !== void 0 && (this.src = e.src),
        e.width !== void 0 && (this.width = e.width));
    }
  };
  var tr,
    Sc = class {
      constructor(e) {
        c(this, 'id', 'image-preloader');
        f(this, tr);
        h(this, tr, e);
      }
      async getPlugin(e) {
        let { ImagePreloaderInstance: t } = await Promise.resolve().then(() => (Qp(), jp));
        return new t(a(this, tr), e);
      }
      loadOptions(e, t, o) {
        if (!o?.preload) return;
        t.preload ?? (t.preload = []);
        let n = t.preload;
        for (let s of o.preload) {
          let r = n.find((l) => l.name === s.name || l.src === s.src);
          if (r) r.load(s);
          else {
            let l = new Cc();
            l.load(s), n.push(l);
          }
        }
      }
      needsPlugin() {
        return !0;
      }
    };
  tr = new WeakMap();
  var Wy = 3;
  function Gy(i) {
    i.getImages ??
      (i.getImages = (e) => {
        i.images ?? (i.images = new Map());
        let t = i.images.get(e);
        return t || ((t = []), i.images.set(e, t)), t;
      }),
      i.loadImage ??
        (i.loadImage = async (e, t) => {
          if (!i.getImages) throw new Error('No images collection found');
          if (!t.name && !t.src) throw new Error('No image source provided');
          i.images ?? (i.images = new Map());
          let o = i.getImages(e);
          if (!o.some((n) => n.name === t.name || n.source === t.src))
            try {
              let n = {
                gif: t.gif,
                name: t.name ?? t.src,
                source: t.src,
                type: t.src.substring(t.src.length - Wy),
                error: !1,
                loading: !0,
                replaceColor: t.replaceColor,
                ratio: t.width && t.height ? t.width / t.height : void 0,
              };
              o.push(n), i.images.set(e, o);
              let s;
              t.gif
                ? (s = (r) => Gp(r, { colorSpace: 'srgb' }))
                : t.replaceColor
                  ? (s = Vp)
                  : (s = kn),
                await s(n);
            } catch {
              throw new Error(`${t.name ?? t.src} not found`);
            }
        });
  }
  async function Yp(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        Gy(e),
          e.pluginManager.addPlugin(new Sc(e)),
          e.pluginManager.addShape(vc, (t) => Promise.resolve(new kc(e, t)));
      });
  }
  v();
  v();
  v();
  var Oc = class extends me {
    constructor() {
      super();
      c(this, 'sync');
      this.sync = !1;
    }
    load(t) {
      x(t) || (super.load(t), t.sync !== void 0 && (this.sync = t.sync));
    }
  };
  v();
  var Rc = class extends me {
    constructor() {
      super();
      c(this, 'sync');
      this.sync = !1;
    }
    load(t) {
      x(t) || (super.load(t), t.sync !== void 0 && (this.sync = t.sync));
    }
  };
  var Dc = class {
    constructor() {
      c(this, 'count');
      c(this, 'delay');
      c(this, 'duration');
      (this.count = 0), (this.delay = new Oc()), (this.duration = new Rc());
    }
    load(e) {
      x(e) ||
        (e.count !== void 0 && (this.count = e.count),
        this.delay.load(e.delay),
        this.duration.load(e.duration));
    }
  };
  v();
  var Cn = 0,
    jy = -1,
    _p = 0,
    Xp = 0;
  function Kp(i, e, t) {
    if (!i.life) return;
    let o = i.life,
      n = !1;
    if (i.spawning)
      if (((o.delayTime += e.value), o.delayTime >= i.life.delay))
        (n = !0), (i.spawning = !1), (o.delayTime = Cn), (o.time = Cn);
      else return;
    if (o.duration === jy || (n ? (o.time = Cn) : (o.time += e.value), o.time < o.duration)) return;
    if (((o.time = Cn), i.life.count > _p && i.life.count--, i.life.count === _p)) {
      i.destroy();
      return;
    }
    let s = D(Xp, t.width),
      r = D(Xp, t.width);
    (i.position.x = de(s)),
      (i.position.y = de(r)),
      (i.spawning = !0),
      (o.delayTime = Cn),
      (o.time = Cn),
      i.reset();
    let l = i.options.life;
    l && ((o.delay = P(l.delay.value) * 1e3), (o.duration = P(l.duration.value) * 1e3));
  }
  var lo = 0,
    Zp = 1,
    Jp = -1,
    Sn,
    Ic = class {
      constructor(e) {
        f(this, Sn);
        h(this, Sn, e);
      }
      init(e) {
        let t = a(this, Sn),
          o = e.options,
          n = o.life;
        if (!n) return;
        let s = n.delay.sync ? Zp : T(),
          r = n.duration.sync ? Zp : T();
        (e.life = {
          delay: t.retina.reduceFactor
            ? ((P(n.delay.value) * s) / t.retina.reduceFactor) * 1e3
            : lo,
          delayTime: lo,
          duration: t.retina.reduceFactor
            ? ((P(n.duration.value) * r) / t.retina.reduceFactor) * 1e3
            : lo,
          time: lo,
          count: n.count,
        }),
          e.life.duration <= lo && (e.life.duration = Jp),
          e.life.count <= lo && (e.life.count = Jp),
          (e.spawning = e.life.delay > lo);
      }
      isEnabled(e) {
        return !e.destroyed;
      }
      loadOptions(e, ...t) {
        e.life ?? (e.life = new Dc());
        for (let o of t) e.life.load(o?.life);
      }
      update(e, t) {
        !this.isEnabled(e) || !e.life || Kp(e, t, a(this, Sn).canvas.size);
      }
    };
  Sn = new WeakMap();
  async function em(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        e.pluginManager.addParticleUpdater('life', (t) => Promise.resolve(new Ic(t)));
      });
  }
  function tm(i) {
    let { context: e, particle: t, radius: o } = i,
      n = t.shapeData,
      s = 0;
    e.moveTo(-o, s), e.lineTo(o, s), (e.lineCap = n?.cap ?? 'butt');
  }
  var Qy = 1,
    zc = class {
      draw(e) {
        tm(e);
      }
      getSidesCount() {
        return Qy;
      }
    };
  async function im(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        e.pluginManager.addShape(['line'], () => Promise.resolve(new zc()));
      });
  }
  v();
  v();
  var Ec = class {
    constructor() {
      c(this, 'distance');
      c(this, 'enable');
      c(this, 'rotate');
      (this.distance = 200), (this.enable = !1), (this.rotate = { x: 3e3, y: 3e3 });
    }
    load(e) {
      if (
        !x(e) &&
        (e.distance !== void 0 && (this.distance = D(e.distance)),
        e.enable !== void 0 && (this.enable = e.enable),
        e.rotate)
      ) {
        let t = e.rotate.x;
        t !== void 0 && (this.rotate.x = t);
        let o = e.rotate.y;
        o !== void 0 && (this.rotate.y = o);
      }
    }
  };
  var om = 1e3,
    Yy = 1,
    co,
    Fc = class extends ai {
      constructor(t) {
        super(t);
        f(this, co);
        h(this, co, 0);
      }
      get maxDistance() {
        return a(this, co);
      }
      clear() {}
      init() {}
      interact(t) {
        if (!t.options.attract?.enable) return;
        let o = this.container;
        if (x(t.attractDistance)) {
          let l = P(t.options.attract.distance);
          l > a(this, co) && h(this, co, l), (t.attractDistance = l * o.retina.pixelRatio);
        }
        let n = t.attractDistance,
          s = t.getPosition(),
          r = o.particles.grid.queryCircle(s, n);
        for (let l of r) {
          if (t === l || !l.options.attract?.enable || l.destroyed || l.spawning) continue;
          let u = l.getPosition(),
            { dx: d, dy: p } = K(s, u),
            m = t.options.attract.rotate,
            g = d / (m.x * om),
            y = p / (m.y * om),
            b = l.size.value / t.size.value,
            k = Yy / b;
          (t.velocity.x -= g * b),
            (t.velocity.y -= y * b),
            (l.velocity.x += g * k),
            (l.velocity.y += y * k);
        }
      }
      isEnabled(t) {
        return t.options.attract?.enable ?? !1;
      }
      loadParticlesOptions(t, ...o) {
        t.attract ?? (t.attract = new Ec());
        for (let n of o) t.attract.load(n?.attract);
      }
      reset() {}
    };
  co = new WeakMap();
  async function nm(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        N(e),
          e.pluginManager.addInteractor?.('particlesAttract', (t) => Promise.resolve(new Fc(t)));
      });
  }
  v();
  v();
  var fi;
  (function (i) {
    (i.absorb = 'absorb'), (i.bounce = 'bounce'), (i.destroy = 'destroy');
  })(fi || (fi = {}));
  v();
  var Tc = class {
    constructor() {
      c(this, 'speed');
      this.speed = 2;
    }
    load(e) {
      x(e) || (e.speed !== void 0 && (this.speed = e.speed));
    }
  };
  v();
  var Ac = class {
    constructor() {
      c(this, 'enable');
      c(this, 'retries');
      (this.enable = !0), (this.retries = 0);
    }
    load(e) {
      x(e) ||
        (e.enable !== void 0 && (this.enable = e.enable),
        e.retries !== void 0 && (this.retries = e.retries));
    }
  };
  var Lc = class {
    constructor() {
      c(this, 'absorb');
      c(this, 'bounce');
      c(this, 'enable');
      c(this, 'maxSpeed');
      c(this, 'mode');
      c(this, 'overlap');
      (this.absorb = new Tc()),
        (this.bounce = new Ao()),
        (this.enable = !1),
        (this.maxSpeed = 50),
        (this.mode = fi.bounce),
        (this.overlap = new Ac());
    }
    load(e) {
      x(e) ||
        (this.absorb.load(e.absorb),
        this.bounce.load(e.bounce),
        e.enable !== void 0 && (this.enable = e.enable),
        e.maxSpeed !== void 0 && (this.maxSpeed = D(e.maxSpeed)),
        e.mode !== void 0 && (this.mode = e.mode),
        this.overlap.load(e.overlap));
    }
  };
  v();
  var _y = 0;
  function sm(i, e, t, o, n, s) {
    if (!i.options.collisions || !t.options.collisions) return;
    let r = i.options.collisions.absorb.speed,
      l = Y(r * n.factor, _y, o);
    (i.size.value = Math.sqrt(e * e + l * l)),
      (t.size.value -= l),
      t.size.value <= s && ((t.size.value = 0), t.destroy());
  }
  function rm(i, e, t, o) {
    let n = i.getRadius(),
      s = e.getRadius();
    !n && s
      ? i.destroy()
      : n && !s
        ? e.destroy()
        : n && s && (n >= s ? sm(i, n, e, s, t, o) : sm(e, s, i, n, t, o));
  }
  v();
  var Xy = 1e-6,
    Ky = 1e-4,
    Zy = 1,
    am = (i) => {
      i.options.collisions &&
        (i.collisionMaxSpeed ?? (i.collisionMaxSpeed = P(i.options.collisions.maxSpeed)),
        i.velocity.length > i.collisionMaxSpeed && (i.velocity.length = i.collisionMaxSpeed));
    };
  function Bc(i, e) {
    let t = i.getMass(),
      o = e.getMass(),
      n = i.velocity.length,
      s = e.velocity.length,
      r = t * n * n + o * s * s;
    Sr($n(i), $n(e));
    let l = i.velocity.length,
      u = e.velocity.length,
      d = t * l * l + o * u * u;
    if (d > r * Xy) {
      let p = Math.sqrt(r / d);
      Math.abs(p - Zy) > Ky && ((i.velocity.length = l * p), (e.velocity.length = u * p));
    }
    am(i), am(e);
  }
  function lm(i, e) {
    !i.unbreakable && !e.unbreakable && Bc(i, e);
    let t = i.getRadius(),
      o = e.getRadius();
    !t && o
      ? i.destroy()
      : t && !o
        ? e.destroy()
        : t && o && (i.getRadius() >= e.getRadius() ? e : i).destroy();
  }
  function cm(i, e, t, o) {
    if (!(!i.options.collisions || !e.options.collisions))
      switch (i.options.collisions.mode) {
        case fi.absorb: {
          rm(i, e, t, o);
          break;
        }
        case fi.bounce: {
          Bc(i, e);
          break;
        }
        case fi.destroy: {
          lm(i, e);
          break;
        }
        default:
          break;
      }
  }
  var Vc = class extends ai {
    constructor(t) {
      super(t);
      c(this, 'maxDistance');
      this.maxDistance = 0;
    }
    clear() {}
    init() {}
    interact(t, o, n) {
      if (t.destroyed || t.spawning) return;
      let s = this.container,
        r = t.getPosition(),
        l = t.getRadius(),
        u = s.particles.grid.queryCircle(r, l * I);
      for (let d of u) {
        if (
          t === d ||
          t.id >= d.id ||
          !t.options.collisions?.enable ||
          !d.options.collisions?.enable ||
          t.options.collisions.mode !== d.options.collisions.mode ||
          d.destroyed ||
          d.spawning
        )
          continue;
        let p = d.getPosition(),
          m = d.getRadius();
        if (Math.abs(Math.round(r.z) - Math.round(p.z)) > l + m) continue;
        let g = Se(r, p),
          y = l + m;
        g > y || cm(t, d, n, s.retina.pixelRatio);
      }
    }
    isEnabled(t) {
      return !!t.options.collisions?.enable;
    }
    loadParticlesOptions(t, ...o) {
      t.collisions ?? (t.collisions = new Lc());
      for (let n of o) t.collisions.load(n?.collisions);
    }
    reset() {}
  };
  var Uc = class {
    constructor() {
      c(this, 'id', 'overlap');
    }
    async getPlugin(e) {
      let { OverlapPluginInstance: t } = await Promise.resolve().then(() => (fm(), um));
      return new t(e);
    }
    loadOptions() {}
    needsPlugin() {
      return !0;
    }
  };
  async function dm(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        N(e),
          e.pluginManager.addPlugin(new Uc()),
          e.pluginManager.addInteractor?.('particlesCollisions', (t) => Promise.resolve(new Vc(t)));
      });
  }
  v();
  v();
  var On,
    Hc = class extends q {
      constructor(t, o, n, s) {
        super(t, o, n);
        f(this, On);
        h(this, On, s);
      }
      contains(t) {
        if (super.contains(t)) return !0;
        let { width: o, height: n } = a(this, On),
          { x: s, y: r } = t;
        return (
          super.contains({ x: s - o, y: r }) ||
          super.contains({ x: s + o, y: r }) ||
          super.contains({ x: s, y: r - n }) ||
          super.contains({ x: s, y: r + n }) ||
          super.contains({ x: s - o, y: r - n }) ||
          super.contains({ x: s + o, y: r + n }) ||
          super.contains({ x: s - o, y: r + n }) ||
          super.contains({ x: s + o, y: r - n })
        );
      }
      intersects(t) {
        if (super.intersects(t)) return !0;
        let { width: o, height: n } = a(this, On),
          s = t.position,
          r = [
            { x: -o, y: 0 },
            { x: o, y: 0 },
            { x: 0, y: -n },
            { x: 0, y: n },
            { x: -o, y: -n },
            { x: o, y: n },
            { x: -o, y: n },
            { x: o, y: -n },
          ];
        for (let l of r) {
          let u = { x: s.x + l.x, y: s.y + l.y },
            d;
          if (t instanceof q) d = new q(u.x, u.y, t.radius);
          else {
            let p = t;
            d = new ce(u.x, u.y, p.size.width, p.size.height);
          }
          if (super.intersects(d)) return !0;
        }
        return !1;
      }
    };
  On = new WeakMap();
  v();
  v();
  var qc = class {
    constructor() {
      c(this, 'blur');
      c(this, 'color');
      c(this, 'enable');
      (this.blur = 5), (this.color = new ie()), (this.color.value = '#000'), (this.enable = !1);
    }
    load(e) {
      x(e) ||
        (e.blur !== void 0 && (this.blur = e.blur),
        (this.color = ie.create(this.color, e.color)),
        e.enable !== void 0 && (this.enable = e.enable));
    }
  };
  v();
  var $c = class {
    constructor() {
      c(this, 'color');
      c(this, 'enable');
      c(this, 'frequency');
      c(this, 'opacity');
      (this.enable = !1), (this.frequency = 1);
    }
    load(e) {
      x(e) ||
        (e.color !== void 0 && (this.color = ie.create(this.color, e.color)),
        e.enable !== void 0 && (this.enable = e.enable),
        e.frequency !== void 0 && (this.frequency = e.frequency),
        e.opacity !== void 0 && (this.opacity = e.opacity));
    }
  };
  var Wc = class {
    constructor() {
      c(this, 'blink');
      c(this, 'color');
      c(this, 'consent');
      c(this, 'distance');
      c(this, 'enable');
      c(this, 'frequency');
      c(this, 'id');
      c(this, 'opacity');
      c(this, 'shadow');
      c(this, 'triangles');
      c(this, 'warp');
      c(this, 'width');
      (this.blink = !1),
        (this.color = new ie()),
        (this.color.value = '#fff'),
        (this.consent = !1),
        (this.distance = 100),
        (this.enable = !1),
        (this.frequency = 1),
        (this.opacity = 1),
        (this.shadow = new qc()),
        (this.triangles = new $c()),
        (this.width = 1),
        (this.warp = !1);
    }
    load(e) {
      x(e) ||
        (e.id !== void 0 && (this.id = e.id),
        e.blink !== void 0 && (this.blink = e.blink),
        (this.color = ie.create(this.color, e.color)),
        e.consent !== void 0 && (this.consent = e.consent),
        e.distance !== void 0 && (this.distance = e.distance),
        e.enable !== void 0 && (this.enable = e.enable),
        e.frequency !== void 0 && (this.frequency = e.frequency),
        e.opacity !== void 0 && (this.opacity = e.opacity),
        this.shadow.load(e.shadow),
        this.triangles.load(e.triangles),
        e.width !== void 0 && (this.width = e.width),
        e.warp !== void 0 && (this.warp = e.warp));
    }
  };
  var ex = 1,
    tx = 0;
  function ix(i, e, t) {
    let { dx: o, dy: n } = K(i, e),
      s = { x: Math.abs(o), y: Math.abs(n) },
      r = { x: Math.min(s.x, t.width - s.x), y: Math.min(s.y, t.height - s.y) };
    return Math.hypot(r.x, r.y);
  }
  var uo,
    or,
    Rn,
    hm,
    pm,
    Gc = class extends ai {
      constructor(t, o) {
        super(o);
        f(this, Rn);
        f(this, uo);
        f(this, or);
        h(this, or, t), h(this, uo, 0);
      }
      get maxDistance() {
        return a(this, uo);
      }
      clear() {}
      init() {
        (this.container.particles.linksColor = void 0),
          (this.container.particles.linksColors = new Map());
      }
      interact(t) {
        if (!t.options.links) return;
        (t.links = []),
          t.linksDistance && t.linksDistance > a(this, uo) && h(this, uo, t.linksDistance);
        let o = t.getPosition(),
          n = this.container,
          s = n.canvas.size;
        if (o.x < O.x || o.y < O.y || o.x > s.width || o.y > s.height) return;
        let r = t.options.links,
          l = r.opacity,
          u = t.retina.linksDistance ?? tx,
          d = r.warp,
          p = d ? new Hc(o.x, o.y, u, s) : new q(o.x, o.y, u),
          m = n.particles.grid.query(p);
        for (let g of m) {
          let y = g.options.links;
          if (
            t === g ||
            !y?.enable ||
            r.id !== y.id ||
            g.spawning ||
            g.destroyed ||
            !g.links ||
            t.links.some((F) => F.destination === g) ||
            g.links.some((F) => F.destination === t)
          )
            continue;
          let b = g.getPosition();
          if (b.x < O.x || b.y < O.y || b.x > s.width || b.y > s.height) continue;
          let k = K(o, b).distance,
            M = d && y.warp ? ix(o, b, s) : k,
            C = Math.min(k, M);
          if (C > u) continue;
          let S = (ex - C / u) * l;
          L(this, Rn, pm).call(this, t),
            t.links.push({
              destination: g,
              opacity: S,
              color: L(this, Rn, hm).call(this, t, g),
              isWarped: M < k,
            });
        }
      }
      isEnabled(t) {
        return !!t.options.links?.enable;
      }
      loadParticlesOptions(t, ...o) {
        t.links ?? (t.links = new Wc());
        for (let n of o) t.links.load(n?.links);
      }
      reset() {}
    };
  (uo = new WeakMap()),
    (or = new WeakMap()),
    (Rn = new WeakSet()),
    (hm = function (t, o) {
      let n = this.container,
        s = t.options.links;
      if (!s) return;
      let r = s.id !== void 0 ? n.particles.linksColors.get(s.id) : n.particles.linksColor;
      return Po(t, o, r);
    }),
    (pm = function (t) {
      if (!t.options.links) return;
      let o = this.container,
        n = t.options.links,
        s = n.id === void 0 ? o.particles.linksColor : o.particles.linksColors.get(n.id);
      s ||
        ((s = Er(a(this, or), n.color, n.blink, n.consent)),
        n.id === void 0 ? (o.particles.linksColor = s) : o.particles.linksColors.set(n.id, s));
    });
  var nr,
    jc = class {
      constructor(e) {
        c(this, 'id', 'links');
        f(this, nr);
        h(this, nr, e);
      }
      async getPlugin(e) {
        let { LinkInstance: t } = await Promise.resolve().then(() => (Mm(), wm));
        return new t(a(this, nr), e);
      }
      loadOptions() {}
      needsPlugin() {
        return !0;
      }
    };
  nr = new WeakMap();
  async function km(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        let t = e.pluginManager;
        N(e),
          t.addPlugin(new jc(t)),
          t.addInteractor?.('particlesLinks', (o) => Promise.resolve(new Gc(t, o)));
      });
  }
  v();
  v();
  var Pm = new Map(),
    rx = 0;
  function ax(i) {
    let e = Pm.get(i);
    if (e) return e;
    let t = le / i,
      o = !!(i % I),
      n = (-Math.PI + (o ? rx : t)) * 0.5,
      s = [];
    for (let r = 0; r < i; r++) {
      let l = n + r * t;
      s[r] = { x: Math.cos(l), y: Math.sin(l) };
    }
    return Pm.set(i, s), s;
  }
  function Cm(i, e) {
    let { context: t, radius: o } = i,
      n = e.count.numerator / e.count.denominator,
      s = ax(n);
    t.beginPath();
    for (let r = 0; r < s.length; r++) {
      let l = s[r];
      if (!l) continue;
      let u = l.x * o,
        d = l.y * o;
      r ? t.lineTo(u, d) : t.moveTo(u, d);
    }
    t.closePath();
  }
  var lx = 5,
    zn = class {
      draw(e) {
        let { particle: t, radius: o } = e,
          n = this.getSidesData(t, o);
        Cm(e, n);
      }
      getSidesCount(e) {
        let t = e.shapeData;
        return Math.round(P(t?.sides ?? lx));
      }
    };
  var cx = 2.66,
    ux = 3,
    Qc = class extends zn {
      getSidesData(e, t) {
        let { sides: o } = e;
        return { count: { denominator: 1, numerator: o }, length: (t * cx) / (o / ux) };
      }
    };
  var Af = 3,
    fx = 2.66,
    dx = 3,
    Yc = class extends zn {
      getSidesCount() {
        return Af;
      }
      getSidesData(e, t) {
        return { count: { denominator: 1, numerator: Af }, length: (t * fx) / (Af / dx) };
      }
    };
  async function hx(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        e.pluginManager.addShape(['polygon'], () => Promise.resolve(new Qc()));
      });
  }
  async function px(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        e.pluginManager.addShape(['triangle'], () => Promise.resolve(new Yc()));
      });
  }
  async function Sm(i) {
    i.checkVersion('4.1.0'), await Promise.all([hx(i), px(i)]);
  }
  v();
  v();
  v();
  var _c = class {
    constructor() {
      c(this, 'decay');
      c(this, 'enable');
      c(this, 'speed');
      c(this, 'sync');
      (this.enable = !1), (this.speed = 0), (this.decay = 0), (this.sync = !1);
    }
    load(e) {
      x(e) ||
        (e.enable !== void 0 && (this.enable = e.enable),
        e.speed !== void 0 && (this.speed = D(e.speed)),
        e.decay !== void 0 && (this.decay = D(e.decay)),
        e.sync !== void 0 && (this.sync = e.sync));
    }
  };
  var Xc = class extends me {
    constructor() {
      super();
      c(this, 'animation');
      c(this, 'direction');
      c(this, 'path');
      (this.animation = new _c()),
        (this.direction = Me.clockwise),
        (this.path = !1),
        (this.value = 0);
    }
    load(t) {
      x(t) ||
        (super.load(t),
        t.direction !== void 0 && (this.direction = t.direction),
        this.animation.load(t.animation),
        t.path !== void 0 && (this.path = t.path));
    }
  };
  var mx = 360,
    sr,
    Kc = class {
      constructor(e) {
        f(this, sr);
        h(this, sr, e);
      }
      init(e) {
        let t = e.options.rotate;
        if (!t) return;
        (e.rotate = { enable: t.animation.enable, value: Ye(P(t.value)), min: 0, max: le }),
          (e.pathRotation = t.path);
        let o = t.direction;
        switch (
          (o === Me.random && (o = Math.floor(T() * I) > 0 ? Me.counterClockwise : Me.clockwise), o)
        ) {
          case Me.counterClockwise:
          case 'counterClockwise':
            e.rotate.status = W.decreasing;
            break;
          case Me.clockwise:
            e.rotate.status = W.increasing;
            break;
          default:
            break;
        }
        let n = t.animation;
        n.enable &&
          ((e.rotate.decay = He - P(n.decay)),
          (e.rotate.velocity = (P(n.speed) / mx) * a(this, sr).retina.reduceFactor),
          n.sync || (e.rotate.velocity *= T())),
          (e.rotation = e.rotate.value);
      }
      isEnabled(e) {
        let t = e.options.rotate;
        return t ? !e.destroyed && !e.spawning && (!!t.value || t.animation.enable || t.path) : !1;
      }
      loadOptions(e, ...t) {
        e.rotate ?? (e.rotate = new Xc());
        for (let o of t) e.rotate.load(o?.rotate);
      }
      update(e, t) {
        this.isEnabled(e) &&
          ((e.isRotating = !!e.rotate),
          e.rotate && (yo(e, e.rotate, !1, qe.none, t), (e.rotation = e.rotate.value)));
      }
    };
  sr = new WeakMap();
  async function Om(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        e.pluginManager.addParticleUpdater('rotate', (t) => Promise.resolve(new Kc(t)));
      });
  }
  v();
  function Rm(i) {
    let { context: e, radius: t } = i,
      o = t * Math.SQRT1_2,
      n = o * I;
    e.rect(-o, -o, n, n);
  }
  var gx = 4,
    Zc = class {
      draw(e) {
        Rm(e);
      }
      getSidesCount() {
        return gx;
      }
    };
  async function Dm(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        e.pluginManager.addShape(['edge', 'square'], () => Promise.resolve(new Zc()));
      });
  }
  v();
  var En = { x: 0, y: 0 };
  function Im(i) {
    let { context: e, particle: t, radius: o } = i,
      n = t.sides,
      s = t.starInset ?? 2;
    e.moveTo(En.x, En.y - o);
    for (let r = 0; r < n; r++)
      e.rotate(Math.PI / n),
        e.lineTo(En.x, En.y - o * s),
        e.rotate(Math.PI / n),
        e.lineTo(En.x, En.y - o);
  }
  var yx = 2,
    xx = 5,
    Jc = class {
      draw(e) {
        Im(e);
      }
      getSidesCount(e) {
        let t = e.shapeData;
        return Math.round(P(t?.sides ?? xx));
      }
      particleInit(e, t) {
        let o = t.shapeData;
        t.starInset = P(o?.inset ?? yx);
      }
    };
  async function zm(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        e.pluginManager.addShape(['star'], () => Promise.resolve(new Jc()));
      });
  }
  async function Em(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register(async (e) => {
        let t = async (o) => {
          await Kh(o),
            await Promise.all([
              Op(o),
              np(o),
              fp(o),
              hp(o),
              xp(o),
              kp(o),
              Cp(o),
              Dp(o),
              zp(o),
              Fp(o),
              Lp(o),
              Bp(o),
              nm(o),
              dm(o),
              km(o),
            ]);
        };
        await Promise.all([
          Bh(e),
          t(e),
          Vh(e),
          Hh(e),
          Yp(e),
          im(e),
          Sm(e),
          Dm(e),
          zm(e),
          em(e),
          ul(e),
          Om(e),
        ]);
      });
  }
  v();
  v();
  v();
  var eu = class {
    constructor() {
      c(this, 'angle');
      c(this, 'move');
      (this.angle = 50), (this.move = 10);
    }
    load(e) {
      x(e) ||
        (e.angle !== void 0 && (this.angle = D(e.angle)),
        e.move !== void 0 && (this.move = D(e.move)));
    }
  };
  var tu = class {
    constructor() {
      c(this, 'distance');
      c(this, 'enable');
      c(this, 'speed');
      (this.distance = 5), (this.enable = !1), (this.speed = new eu());
    }
    load(e) {
      if (
        !x(e) &&
        (e.distance !== void 0 && (this.distance = D(e.distance)),
        e.enable !== void 0 && (this.enable = e.enable),
        e.speed !== void 0)
      )
        if (ze(e.speed)) this.speed.load({ angle: e.speed });
        else {
          let t = e.speed;
          'min' in t ? this.speed.load({ angle: t }) : this.speed.load(e.speed);
        }
    }
  };
  v();
  var bx = 0,
    vx = 60;
  function Fm(i, e, t) {
    let { wobble: o } = e.options,
      { wobble: n } = e;
    if (!o?.enable || !n) return;
    let s = i.retina.reduceFactor,
      r = n.angleSpeed * t.factor * s,
      l = n.moveSpeed * t.factor * s,
      u = (l * (e.retina.wobbleDistance ?? bx)) / (1e3 / vx),
      d = le,
      { position: p } = e;
    (n.angle += r),
      n.angle > d && (n.angle -= d),
      (p.x += u * Math.cos(n.angle)),
      (p.y += u * Math.abs(Math.sin(n.angle)));
  }
  var wx = 360,
    Mx = 10,
    kx = 0,
    Fn,
    iu = class {
      constructor(e) {
        f(this, Fn);
        h(this, Fn, e);
      }
      init(e) {
        let t = e.options.wobble;
        t?.enable
          ? (e.wobble = {
              angle: T() * le,
              angleSpeed: P(t.speed.angle) / wx,
              moveSpeed: P(t.speed.move) / Mx,
            })
          : (e.wobble = { angle: 0, angleSpeed: 0, moveSpeed: 0 }),
          (e.retina.wobbleDistance = P(t?.distance ?? kx) * a(this, Fn).retina.pixelRatio);
      }
      isEnabled(e) {
        return !e.destroyed && !e.spawning && !!e.options.wobble?.enable;
      }
      loadOptions(e, ...t) {
        e.wobble ?? (e.wobble = new tu());
        for (let o of t) e.wobble.load(o?.wobble);
      }
      update(e, t) {
        this.isEnabled(e) && Fm(a(this, Fn), e, t);
      }
    };
  Fn = new WeakMap();
  async function Tm(i) {
    i.checkVersion('4.1.0'),
      await i.pluginManager.register((e) => {
        e.pluginManager.addParticleUpdater('wobble', (t) => Promise.resolve(new iu(t)));
      });
  }
  var ke = {
    name: 'heron',
    displayName: 'Heron',
    tagline: 'Stand still. Strike well.',
    bundleId: 'com.resistjs.heron',
    appGroup: 'group.com.resistjs.heron',
    urlScheme: 'heron',
    serviceType: '_heron._tcp',
    mdnsType: 'heron',
    spotlightDomain: 'com.resistjs.heron.jobs',
    keychainService: 'com.resistjs.heron',
    capacitorPluginName: 'HeronNative',
    colors: {
      $comment:
        '9 base hex values + their human-readable names. The full 22-token CSS system in ui/src/app.css is generated from these by apply-brand (status colors + text scale are static across brands; everything else derives).',
      primary: '#4a5b6d',
      primaryName: 'Heron Slate',
      accent: '#c89b4a',
      accentName: 'Heron Dawn',
      accentSecondary: '#7a8c6d',
      accentSecondaryName: 'Heron Reed',
      darkBg: '#0e1014',
      darkSurface: '#14181f',
      lightBg: '#f7f5f0',
      lightSurface: '#fffefa',
      textOnDark: '#e8eaed',
      textOnLight: '#1a1f26',
      tokens: {
        $comment:
          '22-token CSS system, derived from the 9 bases. apply-brand writes these into the AUTO-GENERATED block in ui/src/app.css. The shadcn-shaped token graph (--background, --foreground, --primary, --accent, --sidebar-*, status.*) maps onto the brand palette here. light = warm-paper register, dark = slate-tinted black register.',
        light: {
          background: '#f7f5f0',
          foreground: '#1a1f26',
          card: '#fffefa',
          cardForeground: '#1a1f26',
          popover: '#fffefa',
          popoverForeground: '#1a1f26',
          primary: '#4a5b6d',
          primaryForeground: '#fffefa',
          secondary: '#efeae0',
          secondaryForeground: '#1a1f26',
          muted: '#efeae0',
          mutedForeground: '#6b7585',
          accent: '#c89b4a',
          accentForeground: '#1a1f26',
          accentSecondary: '#7a8c6d',
          accentSecondaryForeground: '#1a1f26',
          destructive: '#a85459',
          destructiveForeground: '#fffefa',
          border: '#e0d8c8',
          input: '#e0d8c8',
          ring: '#c89b4a',
          sidebar: '#efeae0',
          sidebarForeground: '#1a1f26',
          sidebarPrimary: '#4a5b6d',
          sidebarPrimaryForeground: '#fffefa',
          sidebarAccent: '#e8e0cc',
          sidebarAccentForeground: '#1a1f26',
          sidebarBorder: '#e0d8c8',
          sidebarRing: '#c89b4a',
          chart: ['#c89b4a', '#7a8c6d', '#4a5b6d', '#a8823a', '#5c6f50'],
        },
        dark: {
          background: '#0e1014',
          foreground: '#e8eaed',
          card: '#14181f',
          cardForeground: '#e8eaed',
          popover: '#1a1f29',
          popoverForeground: '#e8eaed',
          primary: '#c89b4a',
          primaryForeground: '#14181f',
          secondary: '#1a1f29',
          secondaryForeground: '#e8eaed',
          muted: '#1a1f29',
          mutedForeground: '#a8b0bb',
          accent: '#c89b4a',
          accentForeground: '#14181f',
          accentSecondary: '#7a8c6d',
          accentSecondaryForeground: '#0e1014',
          destructive: '#b3666b',
          destructiveForeground: '#f4e8e9',
          border: '#232a35',
          input: '#232a35',
          ring: '#c89b4a',
          sidebar: '#0e1014',
          sidebarForeground: '#a8b0bb',
          sidebarPrimary: '#c89b4a',
          sidebarPrimaryForeground: '#14181f',
          sidebarAccent: '#1a1f29',
          sidebarAccentForeground: '#e8eaed',
          sidebarBorder: '#1a1f29',
          sidebarRing: '#c89b4a',
          chart: ['#d4a866', '#8a9b7d', '#6b7c8d', '#b88f4a', '#7a8c6d'],
        },
      },
    },
    fonts: {
      $comment:
        'Typography system. apply-brand generates the @font-face declarations and the cascade defaults (body=sans, h1-h4=display, code/.font-mono=mono) into ui/src/app.css AUTO-GENERATED block. woff2 files live at ui/static/fonts/ -- self-hosted, no CDN.',
      display: {
        family: 'Fraunces',
        fallback:
          "'Iowan Old Style', 'Apple Garamond', Baskerville, 'Times New Roman', Times, Georgia, serif",
        weights: '400 700',
        axes: ['opsz', 'wght', 'SOFT'],
        files: [
          { subset: 'latin', path: '/fonts/fraunces-latin.woff2' },
          { subset: 'latin-ext', path: '/fonts/fraunces-latin-ext.woff2' },
        ],
      },
      body: {
        family: 'Inter',
        fallback:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        weights: '400 700',
        axes: ['wght'],
        files: [
          { subset: 'latin', path: '/fonts/inter-latin.woff2' },
          { subset: 'latin-ext', path: '/fonts/inter-latin-ext.woff2' },
        ],
      },
      mono: {
        family: 'IBM Plex Mono',
        fallback:
          "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
        weights: ['400', '500'],
        files: [
          { weight: '400', subset: 'latin', path: '/fonts/ibm-plex-mono-400-latin.woff2' },
          { weight: '400', subset: 'latin-ext', path: '/fonts/ibm-plex-mono-400-latin-ext.woff2' },
          { weight: '500', subset: 'latin', path: '/fonts/ibm-plex-mono-500-latin.woff2' },
          { weight: '500', subset: 'latin-ext', path: '/fonts/ibm-plex-mono-500-latin-ext.woff2' },
        ],
      },
      japaneseFallback:
        "'Hiragino Sans', 'Hiragino Kaku Gothic Pro', 'Yu Gothic', 'Yu Gothic UI', 'Meiryo', 'Noto Sans JP', system-ui, -apple-system, sans-serif",
      subsetUnicodeRanges: {
        $comment:
          "Unicode ranges for the @font-face declarations. Pulled from Google Fonts CSS output. Keeping them in brand.json means swapping in a new font (or a new subset) doesn't require an apply-brand code change.",
        latin:
          'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
        'latin-ext':
          'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
      },
    },
    voice: {
      $comment:
        'Brand voice as data -- consumed by AUTO-GENERATED:<section> markers inside the .md docs. Narrative .md files (BRAND, VOICE, COLORS, TYPOGRAPHY, MASCOT, SOCIAL-CARD, PRESS, REBRAND-PROCESS) carry markers that apply-brand fills from this block + the rest of brand.json.',
      tagline: 'Stand still. Strike well.',
      subline: 'A thinking partner for career transitions. Patient, precise, local-first.',
      origin:
        'The heron stands motionless in shallow water. It waits. It watches. It evaluates every passing form. Then, when the moment is exactly right, it strikes -- once, precisely, and the work is done.',
      mission:
        "Help one person make one excellent career move, instead of fifty mediocre ones. The wrong era for spray-and-pray is the era we're in.",
      philosophy:
        "Recruiters' attention is finite. So is yours. Quality over quantity, by design -- the system actively discourages applications below a 4/5 score.",
      personality: ['calm', 'sophisticated', 'patient', 'precise', 'local-first'],
      antiBrands: ['LinkedIn', 'AI-slop', 'hustle-bro', 'wellness-coddling'],
      principles: [
        {
          name: 'Specific over abstract',
          description:
            "Concrete numbers, named tools, real workflows. Not 'AI-powered' or 'next-generation'.",
        },
        {
          name: 'Quiet over loud',
          description: 'No exclamation marks. No urgency-by-typography. Calm carries weight.',
        },
        {
          name: 'Earned over claimed',
          description:
            "Don't say 'easy' -- show the four-line quickstart. Don't say 'powerful' -- show the feature.",
        },
        {
          name: 'Patient over urgent',
          description:
            'Heron is for considered decisions. Manufactured urgency contradicts the brand at every layer.',
        },
        {
          name: 'Local-first over cloud-default',
          description: 'Data on disk. AI bring-your-own-key. No cloud aggregator.',
        },
        {
          name: 'Filter over cannon',
          description:
            'The autonomous-apply gate is below 4/5 by default. The brand promise made operational.',
        },
      ],
      antiPatterns: [
        {
          name: 'Hustle-bro tone',
          example:
            '"Crush your job search! \u{1F680}" \u2192 no. "A thinking partner for career transitions." \u2192 yes.',
        },
        {
          name: 'Empty futurism',
          example:
            '"Welcome to the future of work!" \u2192 no. (just describe what the thing does)',
        },
        {
          name: 'Decorative emojis',
          example:
            '\u{1F680} \u{1F4A1} \u{1F3AF} \u{1F4C8} \u{1F525} -- none of these. Punctuation only.',
        },
        {
          name: 'Manufactured urgency',
          example: `"Get started in seconds!" / "Limited time!" \u2192 no. Time is the user's.`,
        },
        {
          name: 'AI-slop adjectives',
          example:
            '"Powerful AI" / "Next-generation" / "Revolutionary" \u2192 no. Specifics or nothing.',
        },
        {
          name: 'Wellness coddling',
          example: `"You've got this! \u{1F4AA}" \u2192 no. The user is an adult.`,
        },
        {
          name: 'Easy claims',
          example: `"It's easy!" \u2192 never. Show the four lines, let them judge.`,
        },
        {
          name: 'Welcoming language',
          example: `"Welcome to Heron!" / "Let's get started!" -- no. Open with what the page is for.`,
        },
        {
          name: 'Just-doing',
          example: `"Just paste the URL" -- no. "Paste the URL." The word 'just' minimizes.`,
        },
        {
          name: 'We-language',
          example: `"We think you'll love it!" \u2192 no. The brand is the brand, not the maintainer.`,
        },
      ],
      boilerplate: {
        short:
          'Heron -- a thinking partner for career transitions. Patient. Precise. Local-first. Open source.',
        medium:
          'Heron is an open-source job-search assistant for the wrong era of spray-and-pray. It tracks your pipeline, scores every role A-F, generates ATS-optimized CVs, scans 11 ATSes, and triages recruiter email -- all locally. Your data never leaves your machine.',
        long: "The heron stands motionless in shallow water. It waits. It watches. It evaluates every passing form. Then, when the moment is exactly right, it strikes -- once, precisely, and the work is done. Heron is a thinking partner for people in career transition who'd rather make one excellent move than fifty mediocre ones. It runs entirely on your machine: pipeline tracking, A-F role evaluation, ATS-optimized CVs, 11-portal scanning, recruiter email triage, interview prep, and opt-in autonomous apply. Open source. AI-agnostic. Your data stays yours.",
      },
      quotes: [
        "Recruiters' attention is finite. So is yours. The wrong era for spray-and-pray is the era we're in. Heron is the alternative.",
        "Local-first isn't a feature, it's a posture. Your career data is the most concentrated personal data you'll ever generate. Treating it like analytics fodder for a SaaS isn't a tradeoff we made.",
        "We score every role before applying. Below four out of five, the system actively discourages you. The recruiter's time is worth as much as yours.",
        "The heron stands still. Then it strikes. That's the whole product, in two sentences.",
      ],
    },
    mascot: {
      $comment:
        "Mascot identity -- the friendly cartoon Heron that IS the brand mark (it replaced the stopgap Lucide 'bird' glyph). Source: branding/mascot.png (raw) -> branding/assets/mascot.png (cleaned transparent master, via `pnpm mascot`). EVERYTHING derives from the master: logo.svg embed, all platform icons, the splash, and the Swift image asset. Fed into the MASCOT.md template.",
      image: 'branding/assets/mascot.png',
      rawSource: 'branding/mascot.png',
      subject: 'Great Blue Heron -- friendly cartoon character',
      pose: '3/4 head-and-shoulders, beak to the right, large warm eyes, small crest tuft',
      styleReferences: [
        'Duolingo Duo',
        'flat vector app mascot',
        'rounded thick-outline cartoon',
        'friendly modern app mark',
      ],
      tiers: {
        mark: {
          use: '\u226464px contexts -- favicon, app icon, inline UI',
          treatment: 'mascot head on the gradient squircle',
        },
        illustration: {
          use: '\u2265200px contexts -- splash, landing pages, marketing, press',
          treatment: 'full cartoon mascot, animated where the surface allows',
        },
      },
      antiStyles: [
        'photo-realistic',
        '3D-rendered',
        'aggressive or scary',
        'over-detailed or cluttered',
        'off-brand colors',
      ],
    },
    repo: {
      owner: 'kaelys-js',
      name: 'heron',
      url: 'https://github.com/kaelys-js/heron',
      issues: 'https://github.com/kaelys-js/heron/issues',
      docs: 'https://github.com/kaelys-js/heron#readme',
      description:
        'Stand still. Strike well. A local-first, AI-agnostic thinking partner for career transitions. Multi-user, open source.',
      homepage: 'https://heron.app',
      topics: [
        'ai-agent',
        'anthropic',
        'better-auth',
        'capacitor',
        'claude',
        'claude-code',
        'drizzle-orm',
        'electron',
        'heron',
        'interview-prep',
        'ios',
        'job-search',
        'local-first',
        'open-source',
        'passkey',
        'resume',
        'svelte',
        'sveltekit',
        'typescript',
        'watchos',
      ],
    },
    community: {
      discord: { url: 'https://discord.gg/MyFbztUK5U', serverId: '1507162919421612134' },
    },
  };
  var qT = {
      openNotifications: `${ke.name}:open-notifications`,
      notify: `${ke.name}:notify`,
      netStatus: `${ke.name}:net-status`,
    },
    $T = ke.name,
    WT = {
      authed: `${ke.name}:authed`,
      bearerToken: `${ke.name}:bearer-token`,
      theme: `${ke.name}:theme`,
      quietHours: `${ke.name}:quiet-hours`,
      collapseCardPrefix: `${ke.name}:cc`,
      collapseGroupPrefix: `${ke.name}:cg`,
      pushPrefs: `${ke.name}:push-prefs`,
    };
  var Lf = ke.colors.accent,
    Px = ke.colors.accentSecondary,
    Am = '#e8d6a8';
  function Lm(i, e) {
    let t = i === 'bottom';
    return {
      fullScreen: { enable: !1 },
      detectRetina: !0,
      fpsLimit: 60,
      pauseOnBlur: !0,
      pauseOnOutsideViewport: !0,
      particles: {
        number: { value: e },
        color: { value: [Lf, Am, Lf, Am, Px] },
        shape: { type: 'circle' },
        size: { value: t ? { min: 1, max: 3 } : { min: 2, max: 4 } },
        opacity: { value: { min: 0, max: 0.6 }, animation: { enable: !0, speed: 1, sync: !1 } },
        move: {
          enable: !0,
          speed: t ? 0.1 : 0.12,
          direction: t ? 'top' : 'none',
          random: !0,
          straight: !1,
          outModes: { default: 'out' },
        },
        zIndex: { value: { min: 0, max: 100 } },
        wobble: { enable: !0, distance: 8, speed: { min: -2, max: 2 } },
        shadow: { enable: !0, color: Lf, blur: 6 },
      },
    };
  }
  var Bf = null,
    Bm = [];
  function Cx() {
    return (
      typeof window < 'u' &&
      typeof window.matchMedia == 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }
  async function Vf() {
    if (typeof document > 'u' || Cx()) return;
    let i = Array.from(document.querySelectorAll('[data-heron-particles]')).filter(
      (e) => !e.dataset.heronParticlesMounted,
    );
    if (i.length) {
      Bf ||
        (Bf = Em(qa)
          .then(() => Tm(qa))
          .then(() => {})),
        await Bf;
      for (let e of i) {
        if (e.dataset.heronParticlesMounted) continue;
        (e.dataset.heronParticlesMounted = '1'),
          e.id || (e.id = 'heron-particles-' + Math.random().toString(36).slice(2, 8));
        let t = e.dataset.zone === 'top-right' ? 'top-right' : 'bottom',
          o = Number(e.dataset.count) || 12,
          n = await qa.load({ id: e.id, element: e, options: Lm(t, o) });
        n && Bm.push(n);
      }
    }
  }
  function Vm() {
    for (let i of Bm.splice(0))
      try {
        i.destroy();
      } catch {}
    document
      .querySelectorAll('[data-heron-particles][data-heron-particles-mounted]')
      .forEach((i) => delete i.dataset.heronParticlesMounted);
  }
  window.heronParticles = { mount: Vf, destroy: Vm };
  function Nm() {
    Vf();
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', Nm) : Nm();
})();
