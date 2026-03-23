const RecursionMath = (() => {

    const Vec2 = (x = 0, y = 0) => ({ x, y });
    const Vec3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
    const Vec4 = (x = 0, y = 0, z = 0, w = 0) => ({ x, y, z, w });

    const vec2 = {
        add:    (a, b)    => Vec2(a.x + b.x, a.y + b.y),
        sub:    (a, b)    => Vec2(a.x - b.x, a.y - b.y),
        scale:  (a, s)    => Vec2(a.x * s, a.y * s),
        dot:    (a, b)    => a.x * b.x + a.y * b.y,
        len:    (a)       => Math.sqrt(a.x * a.x + a.y * a.y),
        norm:   (a)       => { const l = vec2.len(a) || 1; return Vec2(a.x / l, a.y / l); },
        lerp:   (a, b, t) => Vec2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t),
        dist:   (a, b)    => vec2.len(vec2.sub(a, b)),
        perp:   (a)       => Vec2(-a.y, a.x),
        angle:  (a)       => Math.atan2(a.y, a.x),
        fromAngle: (r)    => Vec2(Math.cos(r), Math.sin(r)),
    };

    const vec3 = {
        add:    (a, b)    => Vec3(a.x + b.x, a.y + b.y, a.z + b.z),
        sub:    (a, b)    => Vec3(a.x - b.x, a.y - b.y, a.z - b.z),
        scale:  (a, s)    => Vec3(a.x * s, a.y * s, a.z * s),
        dot:    (a, b)    => a.x * b.x + a.y * b.y + a.z * b.z,
        cross:  (a, b)    => Vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x),
        len:    (a)       => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z),
        norm:   (a)       => { const l = vec3.len(a) || 1; return Vec3(a.x / l, a.y / l, a.z / l); },
        lerp:   (a, b, t) => Vec3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t),
        dist:   (a, b)    => vec3.len(vec3.sub(a, b)),
    };

    const mat4 = {
        identity: () => [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1,
        ],

        multiply: (a, b) => {
            const out = new Array(16).fill(0);
            for (let r = 0; r < 4; r++)
                for (let c = 0; c < 4; c++)
                    for (let k = 0; k < 4; k++)
                        out[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c];
            return out;
        },

        translate: (x, y, z) => [
            1, 0, 0, x,
            0, 1, 0, y,
            0, 0, 1, z,
            0, 0, 0, 1,
        ],

        scale: (x, y, z) => [
            x, 0, 0, 0,
            0, y, 0, 0,
            0, 0, z, 0,
            0, 0, 0, 1,
        ],

        rotateZ: (r) => {
            const c = Math.cos(r), s = Math.sin(r);
            return [
                c, -s, 0, 0,
                s,  c, 0, 0,
                0,  0, 1, 0,
                0,  0, 0, 1,
            ];
        },

        ortho: (left, right, bottom, top, near, far) => [
            2 / (right - left), 0, 0, -(right + left) / (right - left),
            0, 2 / (top - bottom), 0, -(top + bottom) / (top - bottom),
            0, 0, -2 / (far - near),   -(far + near)  / (far - near),
            0, 0, 0, 1,
        ],

        perspective: (fov, aspect, near, far) => {
            const f = 1.0 / Math.tan(fov / 2);
            return [
                f / aspect, 0, 0, 0,
                0, f, 0, 0,
                0, 0, (far + near) / (near - far), (2 * far * near) / (near - far),
                0, 0, -1, 0,
            ];
        },

        transformVec3: (m, v) => {
            const x = m[0]*v.x + m[1]*v.y + m[2]*v.z  + m[3];
            const y = m[4]*v.x + m[5]*v.y + m[6]*v.z  + m[7];
            const z = m[8]*v.x + m[9]*v.y + m[10]*v.z + m[11];
            return Vec3(x, y, z);
        },
    };

    const transform = {
        make: (x = 0, y = 0, rot = 0, sx = 1, sy = 1) => ({ x, y, rot, sx, sy }),

        toMat4: (t) => mat4.multiply(
            mat4.multiply(
                mat4.translate(t.x, t.y, 0),
                mat4.rotateZ(t.rot)
            ),
            mat4.scale(t.sx, t.sy, 1)
        ),

        lerp: (a, b, t) => ({
            x:   a.x   + (b.x   - a.x)   * t,
            y:   a.y   + (b.y   - a.y)   * t,
            rot: a.rot + (b.rot - a.rot)  * t,
            sx:  a.sx  + (b.sx  - a.sx)  * t,
            sy:  a.sy  + (b.sy  - a.sy)  * t,
        }),
    };

    const rng = {
        float:    (min = 0, max = 1)  => min + Math.random() * (max - min),
        int:      (min, max)          => Math.floor(rng.float(min, max + 1)),
        bool:     (chance = 0.5)      => Math.random() < chance,
        pick:     (arr)               => arr[rng.int(0, arr.length - 1)],
        shuffle:  (arr) => {
            const a = [...arr];
            for (let i = a.length - 1; i > 0; i--) {
                const j = rng.int(0, i);
                [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
        },
    };

    const utils = {
        clamp:   (v, min, max) => Math.max(min, Math.min(max, v)),
        lerp:    (a, b, t)     => a + (b - a) * t,
        map:     (v, a, b, c, d) => c + (v - a) / (b - a) * (d - c),
        deg2rad: (d)           => d * Math.PI / 180,
        rad2deg: (r)           => r * 180 / Math.PI,
        smoothstep: (a, b, t)  => { const x = utils.clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); },
        pingpong:   (t, len)   => len - Math.abs(t % (len * 2) - len),
    };

    return { Vec2, Vec3, Vec4, vec2, vec3, mat4, transform, rng, utils };

})();