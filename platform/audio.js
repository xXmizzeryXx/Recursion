const RecursionAudio = (() => {

    let ctx        = null;
    let masterGain = null;

    const channels = {};
    const buffers  = {};
    let nextChanId = 1;

    function init() {
        ctx        = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = ctx.createGain();
        masterGain.connect(ctx.destination);
        masterGain.gain.value = 1.0;
    }

    function resume() {
        if (ctx && ctx.state === "suspended") ctx.resume();
    }

    function setMasterVolume(v) {
        if (masterGain) masterGain.gain.value = v;
    }

    async function loadBuffer(name, url) {
        const res    = await fetch(url);
        const raw    = await res.arrayBuffer();
        const decoded = await ctx.decodeAudioData(raw);
        buffers[name] = decoded;
        return decoded;
    }

    function loadFromArrayBuffer(name, arrayBuffer) {
        return ctx.decodeAudioData(arrayBuffer).then(decoded => {
            buffers[name] = decoded;
            return decoded;
        });
    }

    function createChannel(name, volume = 1.0) {
        const gain = ctx.createGain();
        gain.gain.value = volume;
        gain.connect(masterGain);
        const id = nextChanId++;
        channels[id] = { name, gain, sources: [] };
        return id;
    }

    function setChannelVolume(id, v) {
        if (channels[id]) channels[id].gain.gain.value = v;
    }

    function play(bufferName, channelId = null, loop = false, volume = 1.0) {
        if (!ctx) return null;
        const buf = buffers[bufferName];
        if (!buf) { console.warn("RecursionAudio: buffer not found:", bufferName); return null; }

        const source = ctx.createBufferSource();
        source.buffer = buf;
        source.loop   = loop;

        const gain = ctx.createGain();
        gain.gain.value = volume;

        const dest = channelId && channels[channelId] ? channels[channelId].gain : masterGain;
        source.connect(gain);
        gain.connect(dest);
        source.start();

        if (channelId && channels[channelId]) {
            channels[channelId].sources.push(source);
            source.onended = () => {
                const ch = channels[channelId];
                if (ch) ch.sources = ch.sources.filter(s => s !== source);
            };
        }

        return source;
    }

    function stop(source) {
        if (source) { try { source.stop(); } catch {} }
    }

    function stopChannel(id) {
        const ch = channels[id];
        if (!ch) return;
        for (const s of ch.sources) { try { s.stop(); } catch {} }
        ch.sources = [];
    }

    function stopAll() {
        for (const id of Object.keys(channels)) stopChannel(Number(id));
    }

    async function stream(url, loop = false, volume = 1.0) {
        resume();
        const audio    = new Audio(url);
        audio.loop     = loop;
        audio.crossOrigin = "anonymous";
        const source   = ctx.createMediaElementSource(audio);
        const gain     = ctx.createGain();
        gain.gain.value = volume;
        source.connect(gain);
        gain.connect(masterGain);
        audio.play();
        return { audio, source, gain };
    }

    function stopStream(handle) {
        if (handle && handle.audio) {
            handle.audio.pause();
            handle.audio.currentTime = 0;
        }
    }

    function tone(freq = 440, type = "sine", duration = 0.5, volume = 0.3) {
        resume();
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type      = type;
        osc.frequency.value = freq;
        gain.gain.value     = volume;
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start();
        osc.stop(ctx.currentTime + duration);
    }

    return {
        init, resume, setMasterVolume,
        loadBuffer, loadFromArrayBuffer,
        createChannel, setChannelVolume,
        play, stop, stopChannel, stopAll,
        stream, stopStream,
        tone,
        get currentTime() { return ctx ? ctx.currentTime : 0; },
        get state()       { return ctx ? ctx.state : "uninitialized"; },
    };

})();